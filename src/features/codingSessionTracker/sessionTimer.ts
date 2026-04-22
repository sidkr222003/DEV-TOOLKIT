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

export function getLiveEfficiency(): number {
  return latestLiveState?.efficiency ?? 100;
}

export function getLiveIsIdle(): boolean {
  return latestLiveState?.isIdle ?? false;
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
    const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
    const dailyGoalSec = config.get<number>("dailyGoalMinutes", 120) * 60;
    const flowThresholdSec = config.get<number>("flowStateThresholdMinutes", 25) * 60;
    const statusBarFormat = config.get<string>("statusBarFormat", "timeAndStreak");
    const notifBreakReminders = config.get<Record<string, boolean>>("notifications", {})?.breakReminders !== false;

    if (!isTracking) {
      statusBarItem.text = `$(debug-pause) ${formatTime(activeTime)}`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBarItem.tooltip = "Session tracking paused. Click to view details.";
      return;
    }

    const isFlowState = streakSeconds >= flowThresholdSec;
    const isGoalReached = activeTime >= dailyGoalSec;

    // Determine icon
    let icon = "$(pulse)";
    if (isIdle) icon = "$(clock)";
    else if (needsBreak) icon = "$(coffee)";
    else if (isFlowState) icon = "$(zap)";

    // Build text based on format setting
    if (statusBarFormat === "iconOnly") {
      statusBarItem.text = icon;
    } else {
      let suffix = "";
      if (statusBarFormat === "timeAndStreak") {
        const streak = currentDayStreak_internal();
        if (streak > 1) suffix = `  $(flame) ${streak}d`;
      } else if (statusBarFormat === "timeAndLanguage") {
        const lang = vscode.window.activeTextEditor?.document.languageId ?? "";
        if (lang) suffix = `  ${lang}`;
      }
      statusBarItem.text = `${icon} ${formatTime(activeTime)}${suffix}`;
    }

    // Background: break > goal > flow > idle > default
    if (isIdle) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (needsBreak && notifBreakReminders) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else if (isGoalReached) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
    } else if (isFlowState) {
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.remoteBackground");
    } else {
      statusBarItem.backgroundColor = undefined;
    }

    // Tooltip
    const efficiency = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 100;
    const goalPct = Math.min(100, Math.round((activeTime / dailyGoalSec) * 100));
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### $(pulse) Focus Dashboard\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`$(clock) **Session Start:** ${sessionStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n`);
    md.appendMarkdown(`$(flame) **Current Streak:** ${formatTime(streakSeconds)}\n\n`);
    md.appendMarkdown(`$(trophy) **Best Streak:** ${formatTime(maxStreakSeconds)}\n\n`);
    md.appendMarkdown(`$(zap) **Flow State:** ${isFlowState ? 'Active' : `${formatTime(streakSeconds)} / ${formatTime(flowThresholdSec)}`}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`**Efficiency:** \`${getEfficiencyBar(efficiency)}\` ${efficiency}%\n\n`);
    md.appendMarkdown(`$(graph) **Active:** ${formatTime(activeTime)} / **Total:** ${formatTime(totalTime)}\n\n`);
    md.appendMarkdown(`$(target) **Daily Goal:** ${isGoalReached ? '$(check) Reached!' : `${goalPct}%`}\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`$(info) Click for full session report`);
    md.isTrusted = true;
    statusBarItem.tooltip = md;
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
      `Session Focus Report`,
      `Started: ${sessionStartTime.toLocaleTimeString()}`,
      `Total Coding Time: ${formatTime(activeTime)}`,
      `Current Streak: ${formatTime(streakSeconds)}`,
      `Best Streak: ${formatTime(maxStreakSeconds)}`,
      `Efficiency: ${efficiency}%`,
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

  function currentDayStreak_internal(): number {
    const history = context.globalState.get<Array<{ date: string }>>(
      "devToolkit.sessionHistory", []
    );
    const uniqueDays = [...new Set(history.map(s => new Date(s.date).toDateString()))]
      .map(d => new Date(d).getTime())
      .sort((a, b) => b - a);
    if (!uniqueDays.length) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let count = 0;
    let checkMs = today.getTime();
    for (const dayMs of uniqueDays) {
      const ds = new Date(dayMs); ds.setHours(0, 0, 0, 0);
      const diffDays = (checkMs - ds.getTime()) / 86400000;
      if (diffDays < 1.5) { count++; checkMs = ds.getTime() - 1; }
      else break;
    }
    return count;
  }

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
    const idleThresholdMin = config.get<number>("idleThresholdMinutes", 2);
    const idleThreshold = idleThresholdMin * 60 * 1000;
    const breakInterval = config.get<number>("breakReminderInterval", 45);
    const flowThresholdSeconds = config.get<number>("flowStateThresholdMinutes", 25) * 60;
    const dailyGoalSec = config.get<number>("dailyGoalMinutes", 120) * 60;
    const statusBarFormat = config.get<string>("statusBarFormat", "timeAndStreak");
    const notifGoalReached = config.get<Record<string, boolean>>("notifications", {})?.goalReminders !== false;
    const notifBreakReminders = config.get<Record<string, boolean>>("notifications", {})?.breakReminders !== false;

    const currentTime = Date.now();
    totalTime++; // Increment total session lifetime (seconds)

    // Evaluate activity state (Active if detection is off OR if event occurred within threshold)
    const wasActive = !idleDetectionEnabled || (currentTime - lastActivity) < idleThreshold;

    if (wasActive) {
      activeTime++;
      if (activeTime === dailyGoalSec && notifGoalReached) {
        const goalMin = Math.round(dailyGoalSec / 60);
        vscode.window.showInformationMessage(
          `$(target) Daily goal reached! You've coded ${goalMin} minutes today.`,
          "Nice!"
        );
      }
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
