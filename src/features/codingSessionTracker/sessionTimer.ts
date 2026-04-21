import * as vscode from "vscode";

export interface SessionRecord {
  id: string;
  date: string;
  activeTime: number;
  totalTime: number;
  maxStreak: number;
}

export interface LiveSessionState {
  session: SessionRecord;
  isIdle: boolean;
  isTracking: boolean;
  efficiency: number;
}

type SessionStateListener = (state: LiveSessionState) => void;

const sessionStateListeners = new Set<SessionStateListener>();
let latestLiveState: LiveSessionState | undefined;
let sessionControls:
  | {
      startTracking: () => void;
      stopTracking: () => void;
      toggleTracking: () => boolean;
      isTracking: () => boolean;
    }
  | undefined;

function publishSessionState(state: LiveSessionState) {
  latestLiveState = state;
  for (const listener of sessionStateListeners) {
    listener(state);
  }
}

export function onSessionStateChange(listener: SessionStateListener): vscode.Disposable {
  sessionStateListeners.add(listener);
  if (latestLiveState) {
    listener(latestLiveState);
  }
  return new vscode.Disposable(() => {
    sessionStateListeners.delete(listener);
  });
}

export function getCurrentSessionRecord(): SessionRecord | undefined {
  return latestLiveState?.session;
}

export function isSessionTrackingActive(): boolean {
  return latestLiveState?.isTracking ?? true;
}

export function startSessionTracking() {
  sessionControls?.startTracking();
}

export function stopSessionTracking() {
  sessionControls?.stopTracking();
}

export function toggleSessionTracking(): boolean {
  return sessionControls?.toggleTracking() ?? true;
}

/**
 * Handles the logic for tracking active coding sessions, focus streaks, 
 * and healthy work habits. It manages the status bar UI and persists data.
 */
export function registerSessionTimer(context: vscode.ExtensionContext) {
  // Session Metrics (In-Memory)
  let activeTime = 0;      // Total seconds spent actively coding
  let totalTime = 0;       // Total seconds since extension activation
  let streakSeconds = 0;   // Continuous active seconds for the current streak
  let maxStreakSeconds = 0; // The highest recorded streak in the current session
  
  // State Management
  let lastActivity = Date.now(); // Timestamp of the last code event
  let isIdle = false;            // Current activity state (active vs. idle)
  let needsBreak = false;        // Whether the user has exceeded their focus interval
  let isTracking = true;
  let autoPausedByFocusLoss = false;
  let tickCount = 0;
  
  const sessionStartTime = new Date();
  const sessionId = `session_${Date.now()}`; // Unique ID for persistence
  const idleThreshold = 60000;              // 60-second grace period for idle detection

  // Status Bar UI Setup
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "devToolkit.showSessionMetrics";
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getEfficiencyBar = (efficiency: number) => {
    const totalBlocks = 10;
    const filledBlocks = Math.max(0, Math.min(10, Math.round((efficiency / 100) * totalBlocks)));
    return "█".repeat(filledBlocks) + "░".repeat(totalBlocks - filledBlocks);
  };

  const saveCurrentSession = () => {
    const history = context.globalState.get<SessionRecord[]>("devToolkit.sessionHistory", []);
    const existingIndex = history.findIndex(s => s.id === sessionId);
    
    const record: SessionRecord = {
      id: sessionId,
      date: sessionStartTime.toISOString(),
      activeTime,
      totalTime,
      maxStreak: maxStreakSeconds
    };

    if (existingIndex >= 0) {
      history[existingIndex] = record;
    } else {
      history.push(record);
      // Keep only last 30 sessions to prevent bloat
      if (history.length > 30) history.shift();
    }
    
    context.globalState.update("devToolkit.sessionHistory", history);
  };

  const buildLiveState = (): LiveSessionState => {
    const efficiency = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 100;
    return {
      session: {
        id: sessionId,
        date: sessionStartTime.toISOString(),
        activeTime,
        totalTime,
        maxStreak: maxStreakSeconds
      },
      isIdle,
      isTracking,
      efficiency
    };
  };

  const pushLiveUpdate = () => {
    publishSessionState(buildLiveState());
  };

  const updateStatusBar = () => {
    if (!isTracking) {
      statusBarItem.text = `$(debug-pause) ${formatTime(activeTime)}`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBarItem.tooltip = "Session tracking paused. Click to view details.";
      return;
    }

    // Premium Aesthetic Icon Logic
    let icon = "$(zap)";
    if (isIdle) {
      icon = "$(clock)";
    } else if (streakSeconds > 1200) {
      icon = "$(flame)";
    } else {
      icon = "$(zap)"; // Static, professional lightning bolt
    }

    statusBarItem.text = `${icon} ${formatTime(activeTime)}`;
    
    // Reactive Background Colors for "Integrated" feel
    if (isIdle) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (needsBreak) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBarItem.text = `$(coffee) ${formatTime(activeTime)}`; // Break icon
    } else {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.remoteBackground");
    }

    const efficiency = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 100;
    const tooltipMd = new vscode.MarkdownString();
    
    tooltipMd.appendMarkdown(`### 🚀 Focus Dashboard\n\n`);
    tooltipMd.appendMarkdown(`---\n\n`);
    tooltipMd.appendMarkdown(`⌚ **Session Start:** ${sessionStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n`);
    tooltipMd.appendMarkdown(`🔥 **Current Streak:** ${formatTime(streakSeconds)}\n\n`);
    tooltipMd.appendMarkdown(`🏆 **Best Streak:** ${formatTime(maxStreakSeconds)}\n\n`);
    tooltipMd.appendMarkdown(`---\n\n`);
    tooltipMd.appendMarkdown(`**Focus Efficiency:** \`${getEfficiencyBar(efficiency)}\` ${efficiency}%\n\n`);
    tooltipMd.appendMarkdown(`📊 **Active:** ${formatTime(activeTime)} / **Total:** ${formatTime(totalTime)}\n\n`);
    tooltipMd.appendMarkdown(`---\n\n`);
    tooltipMd.appendMarkdown(`$(info) Click for full session report`);
    
    tooltipMd.isTrusted = true;
    statusBarItem.tooltip = tooltipMd;
  };

  const recordActivity = () => {
    if (!isTracking) {
      return;
    }
    lastActivity = Date.now();
    isIdle = false;
  };

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(recordActivity));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(recordActivity));
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((windowState) => {
      if (!windowState.focused && isTracking) {
        autoPausedByFocusLoss = true;
        isTracking = false;
        isIdle = true;
        updateStatusBar();
        pushLiveUpdate();
      } else if (windowState.focused && autoPausedByFocusLoss) {
        autoPausedByFocusLoss = false;
        isTracking = true;
        lastActivity = Date.now();
        isIdle = false;
        updateStatusBar();
        pushLiveUpdate();
      }
    })
  );

  const showMetricsCommand = vscode.commands.registerCommand("devToolkit.showSessionMetrics", () => {
    const efficiency = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 100;
    const message = [
      `🚀 Session Focus Report`,
      `⌚ Started: ${sessionStartTime.toLocaleTimeString()}`,
      `👨‍💻 Total Coding Time: ${formatTime(activeTime)}`,
      `🔥 Current Streak: ${formatTime(streakSeconds)}`,
      `🏆 Best Streak: ${formatTime(maxStreakSeconds)}`,
      `📊 Efficiency: ${efficiency}%`,
      `Keep up the great work! Remember to take breaks to stay productive. ☘️`
    ].join("\n\n");
    vscode.window.showInformationMessage(message, { modal: true });
  });
  context.subscriptions.push(showMetricsCommand);

  const setTrackingState = (nextState: boolean) => {
    isTracking = nextState;
    if (nextState) {
      autoPausedByFocusLoss = false;
      lastActivity = Date.now();
      isIdle = false;
    } else {
      isIdle = true;
      needsBreak = false;
    }
    updateStatusBar();
    pushLiveUpdate();
  };

  const toggleTrackingCommand = vscode.commands.registerCommand("devToolkit.toggleSessionTracking", () => {
    setTrackingState(!isTracking);
    const message = isTracking ? "Session tracker resumed." : "Session tracker paused.";
    vscode.window.setStatusBarMessage(message, 1500);
    return isTracking;
  });
  context.subscriptions.push(toggleTrackingCommand);

  sessionControls = {
    startTracking: () => setTrackingState(true),
    stopTracking: () => setTrackingState(false),
    toggleTracking: () => {
      setTrackingState(!isTracking);
      return isTracking;
    },
    isTracking: () => isTracking
  };

  updateStatusBar();
  pushLiveUpdate();
  statusBarItem.show();

  const interval = setInterval(() => {
    tickCount++;

    if (!isTracking) {
      updateStatusBar();
      pushLiveUpdate();
      if (tickCount % 15 === 0) {
        saveCurrentSession();
      }
      return;
    }

    // Fetch latest user configuration
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const idleDetectionEnabled = config.get<boolean>("idleDetection", true);
    const breakInterval = config.get<number>("breakReminderInterval", 45);

    const currentTime = Date.now();
    totalTime++; // Increment total session lifetime (seconds)
    
    // Evaluate activity state (Active if detection is off OR if event occurred within threshold)
    const wasActive = !idleDetectionEnabled || (currentTime - lastActivity) < idleThreshold;
    
    if (wasActive) {
      activeTime++;
      streakSeconds++;
      isIdle = false;
      if (streakSeconds > maxStreakSeconds) {
        maxStreakSeconds = streakSeconds;
      }
      
      // Healthy Habit: Break Reminder Control
      // Triggered when current focus streak reaches the configured interval
      if (streakSeconds > 0 && streakSeconds % (breakInterval * 60) === 0) {
        needsBreak = true;
        vscode.window.showInformationMessage(
          `🕒 You've been focused for ${breakInterval} minutes! Time to take a quick break to recharge your energy.`,
          "I'll take a break", "Remind me later"
        ).then(selection => {
            if (selection === "I'll take a break") {
                streakSeconds = 0; // Incentivize break by resetting streak
                needsBreak = false;
            }
        });
      }
    } else {
      isIdle = true;
      streakSeconds = 0; // Reset streak on idle
      needsBreak = false;
    }
    
    updateStatusBar();
    pushLiveUpdate();

    // Persist regularly so the sidebar graph stays close to real-time.
    if (tickCount % 15 === 0) {
      saveCurrentSession();
    }
  }, 1000);

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push({
    dispose: () => {
      clearInterval(interval);
      saveCurrentSession(); // Final save on disposal
      sessionControls = undefined;
    }
  });
}
