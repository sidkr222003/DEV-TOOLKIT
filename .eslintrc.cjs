module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    // Detect and remove unused imports automatically
    'unused-imports/no-unused-imports': 'error',
    // Warn on unused vars but ignore those prefixed with _
    'unused-imports/no-unused-vars': [
      'warn',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    // Turn off the built‑in TS rule (we use the plugin instead)
    '@typescript-eslint/no-unused-vars': 'off',
  },
};
