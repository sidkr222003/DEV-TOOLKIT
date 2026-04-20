# 🚀 Coding Session Tracker

A professional-grade productivity engine and focus telemetry system for the Dev Toolkit extension. This module turns VS Code into a proactive companion that monitors development activity, tracks high-performance streaks, and incentivizes healthy deep-work habits.

## 📖 Table of Contents
- [Overview](#overview)
- [Module Architecture](#module-architecture)
- [Core Features](#core-features)
  - [Live Focus Telemetry (HUD)](#live-focus-telemetry-hud)
  - [Sidebar Productivity Dashboard](#sidebar-productivity-dashboard)
  - [Intelligent Idle Detection](#intelligent-idle-detection)
  - [Deep Work Health Nudges](#deep-work-health-nudges)
- [Technical Deep-Dive](#technical-deep-dive)
  - [The Heartbeat Engine](#the-heartbeat-engine)
  - [Persistence & Data Integrity](#persistence--data-integrity)
  - [Webview Communication Bridge](#webview-communication-bridge)
- [Configuration](#configuration)
- [Contributing to this Module](#contributing-to-this-module)

---

## 🔍 Overview
The **Coding Session Tracker** is designed for developers who value "Deep Work." Unlike simple timers, this module distinguishes between having the editor open and being "In the Flow." It provides data-driven insights into your productivity patterns while ensuring you maintain a sustainable pace through integrated wellness reminders.

## 🏛 Module Architecture
The feature is architected as a decoupled system to ensure performance and separation of concerns:

- **Logic Controller (`sessionTimer.ts`)**: The "Brain" of the operation. It handles the state machine, event listeners, and status bar orchestration.
- **Persistence Layer**: Leverages VS Code's `globalState (Memento)` to synchronize focus metrics across application restarts.
- **UI View Provider (`sessionTrackerView.ts`)**: Manages the lifecycle of the sidebar webview and handles the IPC (Inter-Process Communication) bridge.
- **Sandboxed UI**: A modern dashboard built using Vanilla Web standards (HTML/CSS/JS) to maintain a zero-dependency footprint.

---

## ✨ Core Features

### 📡 Live Focus Telemetry (HUD)
The system project real-time focus stats directly into the VS Code Status Bar.
- **Adaptive Iconography**: 
  - ⚡ `$(zap)`: Active coding detected.
  - 🕒 `$(clock)`: Idle state (after 60 seconds of inactivity).
  - 🔥 `$(flame)`: Momentum reached (20+ minutes of continuous focus).
  - ☕ `$(coffee)`: Rest state (active during break nudges).
- **HUD Tooltip**: Hovering over the timer reveals a Markdown-powered dashboard.
  - **Efficiency Metric**: Visualized via a `[████████░░]` progress bar.
  - **Streak Analytics**: Real-time tracking of current vs. all-time best streaks.
- **Reactive Backgrounds**: The tracker uses `statusBarItem.remoteBackground` to appear as an integral, colored part of the status bar.

### 📊 Sidebar Productivity Dashboard
A visual analytics suite for long-term productivity tracking.
- **Performance Distribution**: A 14-day rolling bar chart visualizing "Active Focus Time" vs. "Total Session Time."
- **Interactive Segments**: Click any bar to load historical data for that session into the "Session Detail" inspector.
- **Consistency Palette**: Uses a curated **Green / Light Green** palette that adapts to both Light and Dark VS Code themes.

### 🧠 Intelligent Idle Detection
- **Signal Triggers**: Monitors `onDidChangeTextDocument` (typing) and `onDidChangeActiveTextEditor` (context switching).
- **Grace Period**: Implements a 60-second buffer. If the system doesn't receive a signal within this window, the session is marked as "Idle," and streaks are preserved until the next heartbeat.

---

## 🛠 Technical Deep-Dive

### The Heartbeat Engine
The tracker runs on a 1000ms heartbeat interval. Every tick, the engine:
1. Reconciles the `lastActivity` timestamp against the current time.
2. Evaluates the `isActive` state based on `idleDetection` settings.
3. Updates in-memory counters (`activeTime`, `streakSeconds`).
4. Persists a snapshot to `globalState` every 60 ticks to prevent data loss.

### Persistence & Data Integrity
Data is stored as an array of `SessionRecord` objects.
```typescript
interface SessionRecord {
  id: string;      // Unique session identifier
  date: string;    // ISO timestamp of start
  activeTime: number; // Cumulative focus seconds
  totalTime: number;  // Total elapsed seconds
  maxStreak: number;  // Peak focus streak in seconds
}
```
The system maintains a circular buffer of the last **30 sessions** to ensure the `globalState` remains lightweight.

### Webview Communication Bridge
The Sidebar UI communicates with the Extension Host via the `postMessage` API:
- **`requestData`**: Sent by the Webview on initialization to pull history.
- **`history`**: Sent by the Extension Host with the serialized `SessionRecord[]` array.
- **`clearHistory`**: Triggered by the UI, spawning a native VS Code confirmation modal.

---

## ⚙️ Configuration
| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `devToolkit.sessionTracker.idleDetection` | Boolean | `true` | Pauses timer automatically during inactivity. |
| `devToolkit.sessionTracker.breakReminderInterval` | Number | `45` | Continuous focus time (mins) before break nudge. |

---

