import * as vscode from "vscode";
import { createLogger } from "../utils/logger";

const logger = createLogger("Dev Toolkit");

type SymbolDefinition = {
  name: string;
  kind: vscode.SymbolKind;
  codeLensRange: vscode.Range;
  symbolRange: vscode.Range;
  identifierPosition: vscode.Position;
  detail?: string;
  containerName?: string;
  isTopLevel: boolean;
  isExported?: boolean;
  declarationText?: string;
  nestingDepth: number;
  parentKind?: vscode.SymbolKind;
};

const supportedLanguages: vscode.DocumentSelector = [
  { scheme: "file", language: "javascript" },
  { scheme: "file", language: "javascriptreact" },
  { scheme: "file", language: "typescript" },
  { scheme: "file", language: "typescriptreact" },
];

// Cache for symbol definitions with document version tracking
const symbolCache = new Map<string, { version: number; definitions: SymbolDefinition[] }>();
// Optional: cache reference counts to avoid repeated lookups
const refCountCache = new Map<string, number>();

export function registerFunctionReferences(context: vscode.ExtensionContext) {
  const codeLensChangeEmitter = new vscode.EventEmitter<void>();

  const codeLensProvider = vscode.languages.registerCodeLensProvider(supportedLanguages, {
    onDidChangeCodeLenses: codeLensChangeEmitter.event,
    
    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
      const definitions = await parseSymbolDefinitions(document);
      
      const codeLenses: vscode.CodeLens[] = [];
      for (const definition of definitions) {
        if (!shouldShowCodeLens(definition)) continue;
        
        const referenceCount = await countReferences(
          document.uri, 
          definition.identifierPosition,
          definition.symbolRange,
          definition.name
        );
        
        const title = referenceCount >= 0 
          ? `$(references) ${referenceCount} reference${referenceCount !== 1 ? 's' : ''}` 
          : `$(references) References`;
          
        codeLenses.push(new vscode.CodeLens(definition.codeLensRange, {
          title,
          command: "devToolkit.showFunctionReferences",
          arguments: [document.uri, definition.identifierPosition, definition.name]
        }));
      }
      return codeLenses;
    }
  });

  const hoverProvider = vscode.languages.registerHoverProvider(supportedLanguages, {
    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
      const definitions = await parseSymbolDefinitions(document);
      const definition = definitions.find((item) => item.symbolRange.contains(position));
      
      if (!definition || !shouldShowHover(definition)) {
        return undefined;
      }

      const references = await fetchReferences(document.uri, definition.identifierPosition);
      if (!references) return undefined;

      const externalRefs = references.filter((location) => {
        const isSameFile = location.uri.toString() === document.uri.toString();
        const isSameRange = location.range.isEqual(definition.symbolRange);
        return !(isSameFile && isSameRange);
      });

      const markdown = await buildHoverMarkdown(definition, externalRefs, document.uri);
      return new vscode.Hover([markdown], definition.symbolRange);
    }
  });

  const showReferencesCommand = vscode.commands.registerCommand(
    "devToolkit.showFunctionReferences",
    async (
      uri: vscode.Uri | string,
      position: vscode.Position | { line: number; character: number },
      symbolName: string
    ) => {
      try {
        const uriObject = typeof uri === "string" ? vscode.Uri.parse(uri) : uri;
        const positionObject = position instanceof vscode.Position
          ? position
          : new vscode.Position(position.line, position.character);

        let references = await fetchReferences(uriObject, positionObject);
        
        if (!references || references.length === 0) {
          // Fallback for symbols without language server reference support
          references = await findReferencesByTextSearch(uriObject, symbolName);
        }
        
        if (!references || references.length === 0) {
          vscode.window.showInformationMessage(`No references found for "${symbolName}".`);
          return;
        }

        const filteredRefs = references.filter((location) => {
          return !(location.uri.toString() === uriObject.toString() && location.range.start.isEqual(positionObject));
        });

        await vscode.commands.executeCommand(
          "editor.action.showReferences", 
          uriObject, 
          positionObject, 
          filteredRefs
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("ShowReferences", message);
        vscode.window.showErrorMessage(`Unable to show references: ${message}`);
      }
    }
  );

  context.subscriptions.push(
    codeLensProvider, 
    hoverProvider, 
    showReferencesCommand, 
    codeLensChangeEmitter
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (symbolCache.has(event.document.uri.toString())) {
        symbolCache.delete(event.document.uri.toString());
        codeLensChangeEmitter.fire();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      symbolCache.delete(document.uri.toString());
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (symbolCache.has(document.uri.toString())) {
        symbolCache.delete(document.uri.toString());
        codeLensChangeEmitter.fire();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("devToolkit.refreshReferences", () => {
      symbolCache.clear();
      refCountCache.clear();
      codeLensChangeEmitter.fire();
      vscode.window.showInformationMessage("$(check) Reference data refreshed.");
    })
  );
}

async function parseSymbolDefinitions(document: vscode.TextDocument): Promise<SymbolDefinition[]> {
  const cacheKey = document.uri.toString();
  const cached = symbolCache.get(cacheKey);
  
  if (cached && cached.version === document.version) {
    return cached.definitions;
  }

  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );

    if (!symbols) return [];

    const definitions: SymbolDefinition[] = [];
    flattenSymbols(symbols, definitions, document);
    
    symbolCache.set(cacheKey, {
      version: document.version,
      definitions
    });
    
    return definitions;
  } catch (error) {
    logger.warn("ParseSymbolDefinitions", error instanceof Error ? error.message : String(error));
    return [];
  }
}

function flattenSymbols(
  symbols: vscode.DocumentSymbol[], 
  output: SymbolDefinition[], 
  document: vscode.TextDocument,
  containerName?: string,
  depth = 0,
  parentKind?: vscode.SymbolKind
): void {
  for (const symbol of symbols) {
    if (isRelevantSymbol(symbol.kind)) {
      const name = symbol.name;
      const symbolRange = symbol.selectionRange;
      const codeLensRange = new vscode.Range(symbolRange.start.line, 0, symbolRange.start.line, 0);
      
      const isTopLevel = depth === 0;
      const declarationText = document.getText(symbol.range);
      const isExported = symbol.detail?.includes('export') || 
                        symbol.detail?.includes('public') ||
                        declarationText.includes('export ') ||
                        declarationText.includes('export default');
      
      output.push({
        name,
        kind: symbol.kind,
        codeLensRange,
        symbolRange,
        identifierPosition: symbolRange.start,
        detail: symbol.detail,
        containerName,
        isTopLevel,
        isExported,
        declarationText,
        nestingDepth: depth,
        parentKind
      });
    }
    
    if (symbol.children?.length) {
      flattenSymbols(symbol.children, output, document, symbol.name, depth + 1, symbol.kind);
    }
  }
}

function isMeaningfulName(name: string, kind: vscode.SymbolKind): boolean {
  const noisePatterns = [
    /^[ij]$/, /^[a-z]$/, /^temp\d*$/i, /^tmp\d*$/i, /^_\w+$/, 
    /^result\d*$/i, /^data\d*$/i, /^item\d*$/i, /^val\d*$/i, /^arg\d*$/i
  ];
  
  if (noisePatterns.some(p => p.test(name))) return false;
  
  if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method].includes(kind)) {
    const meaningfulFuncPatterns = /async|await|fetch|load|save|update|delete|create|build|init|start|run|handle|process|render|connect|disconnect|validate|parse|format|transform|convert|map|filter|reduce|find|search/i;
    return meaningfulFuncPatterns.test(name) || name.length >= 4;
  }
  
  if (kind === vscode.SymbolKind.Constant) {
    return /^[A-Z][A-Z0-9_]*$/.test(name) || name.length >= 5;
  }
  
  if (kind === vscode.SymbolKind.Variable) {
    const configPatterns = /config|settings|options|env|client|api|db|store|cache|router|middleware|service|controller|manager/i;
    return configPatterns.test(name) || (name.includes('_') && name.length >= 6) || (/[a-z][A-Z]/.test(name) && name.length >= 6);
  }
  
  if ([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum].includes(kind)) {
    return /^[A-Z]/.test(name) && name.length >= 3;
  }
  
  if (kind === vscode.SymbolKind.Property) {
    return !name.startsWith('_') && name.length >= 3;
  }
  
  return name.length >= 4;
}

function isConstantLike(definition: SymbolDefinition): boolean {
  if (definition.kind === vscode.SymbolKind.Constant) return true;
  return definition.kind === vscode.SymbolKind.Variable &&
    /\bconst\b/.test(definition.declarationText ?? "");
}

function shouldShowCodeLens(definition: SymbolDefinition): boolean {
  const { kind, name, isTopLevel, isExported, nestingDepth, parentKind } = definition;
  const isExportedBool = Boolean(isExported);
  
  if ((kind === vscode.SymbolKind.Property || kind === vscode.SymbolKind.Field) && 
      (parentKind === vscode.SymbolKind.Interface || parentKind === vscode.SymbolKind.Struct)) {
    return false;
  }
  
  if (isExportedBool) return true;
  
  if (isTopLevel && [
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Enum,
  ].includes(kind)) return true;
  
  if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method].includes(kind)) {
    if (isTopLevel) return isMeaningfulName(name, kind);
    return isMeaningfulName(name, kind) && nestingDepth <= 3;
  }
  
  if (isConstantLike(definition)) {
    return isTopLevel || isMeaningfulName(name, vscode.SymbolKind.Constant);
  }
  
  if (kind === vscode.SymbolKind.Variable) {
    return isMeaningfulName(name, kind) && (isTopLevel || nestingDepth <= 2);
  }
  
  if (kind === vscode.SymbolKind.Property) {
    if (parentKind === vscode.SymbolKind.Class) return isMeaningfulName(name, kind);
    return false;
  }
  
  if (kind === vscode.SymbolKind.Constructor) return true;
  
  return false;
}

function shouldShowHover(definition: SymbolDefinition): boolean {
  return shouldShowCodeLens(definition);
}

function isRelevantSymbol(kind: vscode.SymbolKind): boolean {
  return [
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Constructor,
    vscode.SymbolKind.Variable,
    vscode.SymbolKind.Constant,
    vscode.SymbolKind.Property,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Enum,
    vscode.SymbolKind.TypeParameter,
  ].includes(kind);
}

async function fetchReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[] | undefined> {
  try {
    return await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider", 
      uri, 
      position
    );
  } catch (error) {
    logger.warn("FetchReferences", error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

/**
 * Fallback text search with strict matching, comment filtering & deduplication
 */
async function findReferencesByTextSearch(uri: vscode.Uri, symbolName: string, definitionRange?: vscode.Range): Promise<vscode.Location[]> {
  const results: vscode.Location[] = [];
  const seen = new Set<string>();
  
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    
    // Strict word boundaries: must not be preceded/followed by identifier characters
    const regex = new RegExp(`(?<![a-zA-Z0-9_])${escapeRegex(symbolName)}(?![a-zA-Z0-9_])`, 'g');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const locKey = `${startPos.line}:${startPos.character}`;
      
      // Skip duplicates
      if (seen.has(locKey)) continue;
      seen.add(locKey);
      
      // Skip exact definition match
      if (definitionRange && startPos.isEqual(definitionRange.start) && endPos.isEqual(definitionRange.end)) continue;
      
      // Basic heuristic: skip lines that are clearly comments or strings
      const lineText = document.lineAt(startPos.line).text.trim();
      if (/^(\/\/|\/\*|\*|\/\*\*|``|""|'')/.test(lineText)) continue;
      
      results.push(new vscode.Location(uri, new vscode.Range(startPos, endPos)));
    }
  } catch (error) {
    logger.warn("FindReferencesByTextSearch", error instanceof Error ? error.message : String(error));
  }
  
  return results;
}

async function countReferences(
  uri: vscode.Uri, 
  position: vscode.Position, 
  symbolRange: vscode.Range,
  symbolName: string
): Promise<number> {
  const cacheKey = `${uri.toString()}:${symbolName}:${symbolRange.start.line}:${symbolRange.start.character}`;
  if (refCountCache.has(cacheKey)) return refCountCache.get(cacheKey)!;

  let references = await fetchReferences(uri, position);
  
  // Fallback only if provider returns empty/undefined
  if (!references || references.length === 0) {
    references = await findReferencesByTextSearch(uri, symbolName, symbolRange);
  }
  
  if (!references) {
    refCountCache.set(cacheKey, -1);
    return -1;
  }

  const count = references.filter(location => {
    if (location.uri.toString() !== uri.toString()) return true;
    // Exclude definition range or overlapping ranges
    return !location.range.intersection(symbolRange);
  }).length;

  refCountCache.set(cacheKey, count);
  return count;
}

async function buildHoverMarkdown(
  definition: SymbolDefinition,
  references: vscode.Location[],
  currentUri: vscode.Uri
): Promise<vscode.MarkdownString> {
  const markdown = new vscode.MarkdownString();
  // ✅ CRITICAL: Enables $(codicon) rendering
  markdown.supportThemeIcons = true;
  markdown.isTrusted = true;
  
  const kindIcon = getSymbolKindIcon(definition.kind);
  const container = definition.containerName 
    ? ` in \`${definition.containerName}\`` 
    : '';
  const nesting = definition.nestingDepth > 0 && definition.parentKind !== vscode.SymbolKind.Interface
    ? ` _(${definition.nestingDepth}x nested)_` 
    : '';
  
  markdown.appendMarkdown(`### ${kindIcon} \`${definition.name}\`${container}${nesting}\n\n`);
  
  if (definition.declarationText) {
    const preview = definition.declarationText.split('\n')[0].trim();
    if (preview && !preview.includes(definition.name + '(')) {
      markdown.appendMarkdown(`\`\`\`typescript\n${preview}\n\`\`\`\n\n`);
    }
  } else if (definition.detail) {
    markdown.appendMarkdown(`*${escapeMarkdown(definition.detail)}*\n\n`);
  }

  const count = references.length;
  const refIcon = count > 0 ? "$(references)" : "$(debug-disconnect)";
  markdown.appendMarkdown(`**${refIcon} ${count} reference${count !== 1 ? 's' : ''}**\n\n`);

  if (count === 0) {
    markdown.appendMarkdown("*No external references found.*");
    addViewAllReferencesLink(markdown, currentUri, definition);
    return markdown;
  }

  const refsByFile = groupReferencesByFile(references);
  const displayedFiles = Array.from(refsByFile.entries()).slice(0, 5);

  for (const [filePath, fileRefs] of displayedFiles) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const fileIcon = getFileIcon(filePath);
    
    markdown.appendMarkdown(`#### ${fileIcon} \`${fileName}\` (${fileRefs.length})\n`);
    
    const previewRefs = fileRefs.slice(0, 3);
    for (const location of previewRefs) {
      const lineNum = location.range.start.line + 1;
      const preview = await getReferencePreview(location);
      
      const selection = {
        start: { line: location.range.start.line, character: location.range.start.character },
        end: { line: location.range.end.line, character: location.range.end.character }
      };
      
      const commandArgs = encodeURIComponent(JSON.stringify([
        location.uri.toString(),
        { selection: selection, preserveFocus: true }
      ]));
      
      const linkText = `\`${fileName}:${lineNum}\``;
      const linkUrl = `command:vscode.open?${commandArgs}`;
      
      markdown.appendMarkdown(`- $(location) [${linkText}](${linkUrl}) — \`${escapeMarkdown(preview)}\`\n`);
    }
    
    if (fileRefs.length > 3) {
      markdown.appendMarkdown(`- _…and ${fileRefs.length - 3} more in this file_\n`);
    }
    markdown.appendMarkdown("\n");
  }

  if (refsByFile.size > 5) {
    markdown.appendMarkdown(`> _Showing 5 of ${refsByFile.size} files. Use "Find All References" for complete list._\n\n`);
  }

  addViewAllReferencesLink(markdown, currentUri, definition);
  
  return markdown;
}

function addViewAllReferencesLink(
  markdown: vscode.MarkdownString,
  currentUri: vscode.Uri,
  definition: SymbolDefinition
): void {
  const args = encodeURIComponent(JSON.stringify([
    currentUri.toString(),
    { line: definition.identifierPosition.line, character: definition.identifierPosition.character },
    definition.name
  ]));
  markdown.appendMarkdown(`\n\n[$(search) View All References](command:devToolkit.showFunctionReferences?${args})`);
}

function groupReferencesByFile(references: vscode.Location[]): Map<string, vscode.Location[]> {
  const grouped = new Map<string, vscode.Location[]>();
  
  for (const ref of references) {
    const filePath = ref.uri.fsPath || ref.uri.toString();
    if (!grouped.has(filePath)) grouped.set(filePath, []);
    grouped.get(filePath)!.push(ref);
  }
  
  return grouped;
}

async function getReferencePreview(location: vscode.Location): Promise<string> {
  try {
    const document = await vscode.workspace.openTextDocument(location.uri);
    const line = document.lineAt(location.range.start.line).text.trim();
    return line.length > 100 ? line.substring(0, 97) + "..." : line;
  } catch {
    return "Unable to load preview";
  }
}

function getSymbolKindIcon(kind: vscode.SymbolKind): string {
  const codicons: Record<vscode.SymbolKind, string> = {
    [vscode.SymbolKind.File]: "$(file)",
    [vscode.SymbolKind.Module]: "$(package)",
    [vscode.SymbolKind.Namespace]: "$(symbol-namespace)",
    [vscode.SymbolKind.Package]: "$(package)",
    [vscode.SymbolKind.Class]: "$(symbol-class)",
    [vscode.SymbolKind.Method]: "$(symbol-method)",
    [vscode.SymbolKind.Property]: "$(symbol-property)",
    [vscode.SymbolKind.Field]: "$(symbol-field)",
    [vscode.SymbolKind.Constructor]: "$(symbol-constructor)",
    [vscode.SymbolKind.Enum]: "$(symbol-enum)",
    [vscode.SymbolKind.Interface]: "$(symbol-interface)",
    [vscode.SymbolKind.Function]: "$(symbol-function)",
    [vscode.SymbolKind.Variable]: "$(symbol-variable)",
    [vscode.SymbolKind.Constant]: "$(symbol-constant)",
    [vscode.SymbolKind.String]: "$(symbol-string)",
    [vscode.SymbolKind.Number]: "$(symbol-number)",
    [vscode.SymbolKind.Boolean]: "$(symbol-boolean)",
    [vscode.SymbolKind.Array]: "$(symbol-array)",
    [vscode.SymbolKind.Object]: "$(symbol-object)",
    [vscode.SymbolKind.Key]: "$(symbol-key)",
    [vscode.SymbolKind.Null]: "$(symbol-null)",
    [vscode.SymbolKind.EnumMember]: "$(symbol-enum-member)",
    [vscode.SymbolKind.Struct]: "$(symbol-struct)",
    [vscode.SymbolKind.Event]: "$(symbol-event)",
    [vscode.SymbolKind.Operator]: "$(symbol-operator)",
    [vscode.SymbolKind.TypeParameter]: "$(symbol-type-parameter)",
  };
  return codicons[kind] || "$(symbol-misc)";
}

/**
 * Updated file icons as requested
 */
function getFileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'ts': "$(symbol-file-ts)",
    'tsx': "$(symbol-file-tsx)",
    'js': "$(symbol-file-js)",
    'jsx': "$(symbol-file-jsx)",
    'json': "$(json)",
    'md': "$(markdown)",
    'css': "$(symbol-file-css)",
    'scss': "$(symbol-file-scss)",
    'html': "$(html)",
  };
  return iconMap[ext || ''] || "$(file)";
}

/**
 * Escape markdown special characters (parentheses intentionally NOT escaped)
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/\-/g, "\\-")
    .replace(/\./g, "\\.")
    .replace(/\!/g, "\\!");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}