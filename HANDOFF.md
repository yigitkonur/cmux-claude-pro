# cc-cmux — Developer Handoff Document

> Last updated: 2026-04-03

---

## What Is This?

**cc-cmux** is a TypeScript/Node.js integration layer that wires Claude Code's 16 lifecycle hook events into the [cmux](https://cmux.dev) terminal multiplexer's sidebar. Every time Claude reads a file, edits code, runs a command, spawns a subagent, or finishes a response, this handler pushes real-time UI updates to the cmux sidebar — status pills, progress bars, activity logs, desktop notifications, and git metadata.

**Key design philosophy:** No daemon. No background process. No runtime dependencies. The compiled handler (`~45KB`) is invoked once per hook event, talks to cmux over a Unix socket (~8ms), writes atomic state to `/tmp`, and exits 0. It never blocks or crashes Claude Code.

---

## Quick Start (For Development)

```bash
# All builds run on the Mac mini — never build locally
make up        # sync + build on mini (~7s incremental)
make test      # run tests on mini
make dev       # start dev server on mini (watch mode)
make info      # show detected config
```

**Prerequisites:** Node.js 20+, cmux installed, Claude Code installed.

**Install after build:**
```bash
bash install.sh   # copies handler to ~/.cc-cmux/, merges hooks into settings.json
```

---

## Architecture Overview

```
Claude Code Hook Event
    │  stdin JSON: {"hook_event_name": "PreToolUse", "tool_name": "Edit", ...}
    ▼
src/handler.ts ─── SINGLE ENTRY POINT ───────────────────────────
    │
    ├── src/util/env.ts          Resolve cmux socket (local / SSH / ET)
    ├── src/config/loader.ts     Load config (3-tier: cache → user → defaults)
    ├── src/state/manager.ts     Atomic state at /tmp/cc-cmux/<session>.json
    ├── src/cmux/commands.ts     Build typed command strings
    ├── src/cmux/socket.ts       fire() / send() via Unix socket
    │
    ├── src/events/
    │   ├── session.ts           SessionStart, SessionEnd
    │   ├── flow.ts              UserPromptSubmit, Stop, StopFailure
    │   ├── tools.ts             PreToolUse, PostToolUse, PostToolUseFailure  ← HOT PATH
    │   ├── agents.ts            SubagentStart, SubagentStop
    │   ├── lifecycle.ts         PreCompact, PostCompact, TaskCompleted, WorktreeCreate
    │   └── notifications.ts     Notification, PermissionRequest
    │
    └── src/features/
        ├── status.ts            7-state priority machine
        ├── logger.ts            Per-tool log formatting
        ├── git.ts               Branch/dirty detection
        ├── agents.ts            Visible pane spawning + Agent interception
        └── tab-title.ts         AI tab title generation (detached worker)
```

### Execution Flow (every invocation)

1. **Guard** — exit immediately if not inside cmux (`isCmuxAvailable()`)
2. **Read stdin** — JSON event from Claude Code (500ms timeout)
3. **Construct dependencies** — socket, commands, state manager, config
4. **Dispatch** — `switch` on `hook_event_name` → call handler function
5. **Flush** — 50ms grace period for fire-and-forget socket writes
6. **Exit 0** — always, even on errors (global `uncaughtException` handler)

---

## Directory Structure

```
├── bin/
│   ├── cc-cmux.mjs              CLI entry (setup/status/uninstall/test/config)
│   └── cmux-ssh.sh              SSH wrapper for remote sessions
├── src/
│   ├── handler.ts               Main entry: stdin → dispatch → socket commands
│   ├── cmux/
│   │   ├── socket.ts            CmuxSocket (send/fire/fireAll, 1s timeout)
│   │   └── commands.ts          Typed builders for 18 cmux primitives
│   ├── config/
│   │   ├── types.ts             CcCmuxConfig interface
│   │   ├── loader.ts            3-tier loading with cache invalidation
│   │   └── defaults.ts          DEFAULT_CONFIG
│   ├── state/
│   │   ├── types.ts             SessionState, StatusPhase, SpawnedPane
│   │   ├── manager.ts           Atomic state with mkdir-based advisory locking
│   │   └── progress.ts          Adaptive n/(n+K) progress algorithm
│   ├── events/
│   │   ├── types.ts             16-member discriminated union (AnyHookEventInput)
│   │   ├── session.ts           SessionStart / SessionEnd
│   │   ├── tools.ts             PreToolUse / PostToolUse / PostToolUseFailure
│   │   ├── flow.ts              UserPromptSubmit / Stop / StopFailure
│   │   ├── agents.ts            SubagentStart / SubagentStop
│   │   ├── lifecycle.ts         PreCompact / PostCompact / TaskCompleted / WorktreeCreate
│   │   └── notifications.ts     Notification / PermissionRequest
│   ├── features/
│   │   ├── status.ts            Priority state machine (7 phases)
│   │   ├── logger.ts            Tool-specific log formatting
│   │   ├── git.ts               Git branch/dirty/PR URL detection
│   │   ├── tab-title.ts         AI tab title via detached worker
│   │   └── agents.ts            Visible agent pane spawning
│   ├── installer/
│   │   ├── index.ts             Setup/status/uninstall/test orchestration
│   │   ├── detect.ts            Environment detection (cmux, claude, node)
│   │   ├── prompts.ts           Interactive TUI (@clack/prompts)
│   │   ├── hooks-gen.ts         Generate 16 hook entries for settings.json
│   │   ├── merge.ts             Safe merge into settings.json (preserves existing)
│   │   └── verify.ts            Post-install health check
│   ├── util/
│   │   ├── env.ts               cmux availability, SSH forwarding detection
│   │   ├── stdin.ts             Stdin reader with timeout
│   │   └── tool-format.ts       Tool name formatting
│   └── tab-title-worker.ts      Detached worker for AI tab title generation
├── dist/                         Build output (tsup)
│   ├── handler.cjs              ~45KB bundled handler
│   ├── tab-title-worker.cjs     Background worker
│   └── installer.mjs            ESM CLI
├── tsup.config.ts               3 build targets
├── install.sh                   Post-build installation
├── remote-setup.sh              SSH/ET remote setup
├── test-demo.md                 Interactive test script
└── Makefile → universal-remote-make.mk
```

---

## Core Concepts

### 1. The 16 Hook Events

Claude Code fires these hooks at specific lifecycle points. The handler registers for all 16:

| Hook | When | What cc-cmux does |
|------|------|--------------------|
| `SessionStart` | Claude session opens | Init state, detect git, set Ready pill, register PID |
| `SessionEnd` | Claude session closes | Clear all sidebar state, delete state file |
| `UserPromptSubmit` | User sends a prompt | Set Thinking pill, reset progress, clear notifications |
| `PreToolUse` | Before tool executes | Increment tool count, update progress, set Working pill |
| `PostToolUse` | After tool completes | Log formatted tool result to sidebar |
| `PostToolUseFailure` | Tool fails | Log warning |
| `Stop` | Claude finishes response | Set Done pill, progress 100%, desktop notification |
| `StopFailure` | Response fails | Set Error pill, error notification |
| `SubagentStart` | Subagent spawns | Increment count, log, update status with agent count |
| `SubagentStop` | Subagent completes | Decrement count, log |
| `Notification` | Claude sends notification | Forward to desktop |
| `PermissionRequest` | Tool needs permission | Set Waiting pill, notify |
| `PreCompact` | Context compaction starts | Save status, set Compacting pill |
| `PostCompact` | Context compaction ends | Restore saved status |
| `TaskCompleted` | Task finishes | Log with success level |
| `WorktreeCreate` | Git worktree created | Log |

### 2. Status Priority System

7 states with numeric priority. Higher priority wins — prevents stale/lower events from overwriting important states:

```
error (100) > waiting (90) > compacting (70) > working (50) > thinking (40) > done (30) > ready (10)
```

Special case: `working → working` always passes through so tool labels update in real-time.

Defined in `src/features/status.ts` with display config (SF Symbols icon + hex color per phase).

### 3. Adaptive Progress Algorithm

`src/state/progress.ts` uses `n/(n+K)` asymptotic formula:
- `n` = tools used this turn
- `K` = 10 (default), or `avg(last 3 turns) * 0.8` if history exists
- Caps at 0.95 — never shows 100% until `Stop` fires

This creates a progress bar that grows quickly early and slows as the response gets longer, naturally adapting to the user's session patterns.

### 4. State Management

Per-session state at `/tmp/cc-cmux/<session-id>.json`:
- **Locking:** POSIX `mkdir` atomicity (100ms timeout, stale lock detection at 5s)
- **Writes:** temp file + `renameSync` (atomic on same filesystem)
- **Access pattern:** `state.withState(s => { /* mutate s */ })` — lock, read, mutate, write, unlock
- **Cleanup:** stale files (>24h) cleaned on `SessionStart`

### 5. cmux Socket Protocol

One command per connection over Unix domain socket. Each command is a newline-terminated text string:

```
set_status "claude_code" "Working: Edit foo.ts" --icon=hammer.fill --color=#4C8DFF --tab=ws123
set_progress 0.75 --label="5 tools" --tab=ws123
log --level=info --source=claude --tab=ws123 -- "Edit: src/handler.ts"
notify_target ws123 surface456 "Claude|Done|Task complete"
```

All commands are scoped with `--tab=<workspaceId>`. The `CmuxCommands` class builds these strings; `CmuxSocket` sends them.

### 6. Configuration (3-tier)

1. **Cache** → `/tmp/cc-cmux/config.cache.json` (invalidated on config file change)
2. **User config** → `~/.cc-cmux/config.json` (partial, deep-merged over defaults)
3. **Defaults** → compiled in `src/config/defaults.ts`

Key feature flags (all on by default except `tabTitles` and `visibleAgentPanes`):
```
statusPills, progress, logs, notifications, tabTitles*, gitIntegration,
subagentTracking, visibleAgentPanes*    (* = opt-in)
```

### 7. SSH Remote Sessions

The handler works over SSH by forwarding the cmux socket:

1. Local: symlink cmux socket → `/tmp/cmux-local.sock` (space-free path)
2. SSH config: `RemoteForward /tmp/cmux-fwd.sock /tmp/cmux-local.sock`
3. SSH config: `SendEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID`
4. Remote handler detects forwarded socket in `src/util/env.ts`
5. Commands flow: remote handler → forwarded socket → local cmux daemon

---

## Key Types

### SessionState (`src/state/types.ts`)
```typescript
interface SessionState {
  sessionId: string
  workspaceId: string
  surfaceId: string
  socketPath: string
  currentStatus: StatusPhase        // 'ready' | 'thinking' | 'working' | etc.
  toolUseCount: number              // tools used this turn
  turnToolCounts: number[]          // last 5 turns (for adaptive K)
  activeSubagents: number
  totalSubagentsSpawned: number
  spawnedPanes: SpawnedPane[]       // visible agent panes
  gitBranch: string | null
  gitDirty: boolean
  currentTabTitle: string | null
  model: string | null
  preCompactStatus: StatusPhase | null  // saved before compaction
  isInTurn: boolean
  turnNumber: number
  toolHistory: ToolHistoryEntry[]   // last 15 (for AI tab titles)
  // ...timestamps
}
```

### AnyHookEventInput (`src/events/types.ts`)
Discriminated union on `hook_event_name` with 16 members. All share:
```typescript
interface HookEventInput {
  session_id: string
  transcript_path: string
  cwd: string
  hook_event_name: string
  permission_mode: string
}
```

Each event extends with specific fields (e.g., `PreToolUseInput` adds `tool_name`, `tool_input`, `tool_use_id`).

### CcCmuxConfig (`src/config/types.ts`)
```typescript
interface CcCmuxConfig {
  features: { statusPills, progress, logs, notifications, tabTitles, gitIntegration, subagentTracking, visibleAgentPanes: boolean }
  notifications: { onStop, onError, onPermission: boolean }
  tabTitle: { style: 'ai' | 'directory' | 'branch' }
  visibleAgents: { readOnlyPassthrough: string[], splitDirection, autoClose, notifyOnComplete }
}
```

---

## Error Handling Philosophy

**Rule: never crash Claude Code.** Implemented through layered swallowing:

1. Global `uncaughtException` / `unhandledRejection` → exit 0
2. Entire dispatch wrapped in try/catch → swallow
3. Every socket/state/exec call → individual try/catch → swallow
4. Socket errors → resolve to empty string
5. Lock timeout → force-break and proceed
6. Config load failure → fall through to next tier

No typed error hierarchy. Errors are never logged to stderr. If something fails, the sidebar just doesn't update — Claude Code continues unaffected.

---

## Build System

**tsup** compiles three bundles:
- `handler.cjs` — CJS, all deps inlined, node shebang banner
- `tab-title-worker.cjs` — CJS, separate entry
- `installer.mjs` — ESM, CLI

**Dependencies** (all dev-only):
- `tsup` + `typescript` — build
- `@clack/prompts` + `picocolors` — installer TUI
- `@types/node` — types

**Zero runtime dependencies.** The handler uses only Node builtins (`net`, `fs`, `path`, `child_process`).

---

## Feature-to-Event Mapping

When features are disabled, the installer only registers the hooks that enabled features need:

| Feature | Required Hook Events |
|---------|---------------------|
| statusPills | SessionStart, UserPromptSubmit, Stop, StopFailure, SessionEnd |
| progress | PreToolUse, Stop |
| logs | PostToolUse, PostToolUseFailure, SubagentStart/Stop, Pre/PostCompact, TaskCompleted, WorktreeCreate |
| notifications | Stop, StopFailure, PermissionRequest, Notification |
| tabTitles | Stop, UserPromptSubmit, SessionStart |
| gitIntegration | SessionStart |
| subagentTracking | SubagentStart, SubagentStop |
| visibleAgentPanes | PreToolUse (with `matcher: "Agent"`) |

---

## Agent Interception (Advanced)

When `visibleAgentPanes` is enabled, `PreToolUse` for `Agent` tools can be intercepted:
1. Handler detects it's an execution agent (not read-only like Explore/Plan)
2. Creates a new cmux pane via `cmux surface split`
3. Writes a launcher script and sends it to the pane
4. Outputs `{"decision":"block","reason":"..."}` to stdout
5. Claude Code sees the block decision and skips its own agent execution

Read-only agent types pass through without interception.

---

## Git History Summary

- **22 commits**, single contributor (Lars Kappert), all on `main`
- **Recent focus (last 2 weeks):** stabilization — SSH protocol fixes, type safety improvements, dead code removal, status leak fixes
- **Major milestones:**
  - Core handler with 16 events, progress, status, logging
  - SSH/remote session support
  - Visible agent pane interception
  - Installer TUI with safe settings.json merging

---

## Common Development Tasks

### Adding a new hook event
1. Add the input type to `src/events/types.ts` (extend `HookEventInput`)
2. Add it to the `AnyHookEventInput` union
3. Create handler function in the appropriate `src/events/*.ts` file
4. Add the `case` to the dispatch switch in `src/handler.ts`
5. Map it to features in `src/installer/hooks-gen.ts`

### Adding a new sidebar command
1. Add the method to `src/cmux/commands.ts` (returns a string)
2. Call it from event handlers, pass result to `socket.fire()`

### Adding a new feature flag
1. Add to `CcCmuxConfig.features` in `src/config/types.ts`
2. Add default in `src/config/defaults.ts`
3. Map to required events in `src/installer/hooks-gen.ts`
4. Check `config.features.yourFlag` in handlers

### Adding new state fields
1. Add to `SessionState` in `src/state/types.ts`
2. Initialize in `StateManager.createDefault()` in `src/state/manager.ts`
3. Access via `state.withState(s => { s.yourField = ... })`

### Debugging
- State files: `cat /tmp/cc-cmux/*.json`
- Config cache: `cat /tmp/cc-cmux/config.cache.json`
- Test handler manually: `echo '{"hook_event_name":"SessionStart","session_id":"test",...}' | node dist/handler.cjs`
- The handler never logs to stderr — add `console.error()` temporarily if needed

---

## Runtime File Locations

| File | Purpose |
|------|---------|
| `~/.cc-cmux/handler.cjs` | Installed handler binary |
| `~/.cc-cmux/tab-title-worker.cjs` | Installed title worker |
| `~/.cc-cmux/config.json` | User configuration |
| `~/.claude/settings.json` | Claude Code settings (hooks registered here) |
| `/tmp/cc-cmux/<session-id>.json` | Per-session state |
| `/tmp/cc-cmux/<session-id>.lock/` | Advisory lock directory |
| `/tmp/cc-cmux/<session-id>.title` | Saved tab title |
| `/tmp/cc-cmux/<session-id>.history.json` | Tool history for AI titles |
| `/tmp/cc-cmux/config.cache.json` | Config cache |
| `/tmp/cmux-local.sock` | Local socket symlink (for SSH forwarding) |
| `/tmp/cmux-fwd.sock` | Forwarded socket (on remote machines) |

---

## Gotchas & Non-Obvious Decisions

1. **One connection per command.** cmux's socket protocol doesn't support pipelining. `fireAll()` opens N parallel connections, not one batched connection.

2. **Notification → no status change.** `onNotification` deliberately does NOT set "Needs input" status. Subagent completion notifications were causing false stalls (fixed in a1b8737).

3. **PreCompact saves status.** Without this, compaction would leave the sidebar stuck in "Compacting" because `PostCompact` wouldn't know what to restore to.

4. **Progress never hits 100%.** Capped at 0.95 until `Stop` explicitly sends 1.0. Prevents premature "complete" display.

5. **Handler always exits 0.** Even on catastrophic failure. The alternative — crashing Claude Code's hook system — is strictly worse than a missing sidebar update.

6. **mkdir-based locking.** Not `flock()`, because `mkdir` is atomic on all POSIX systems and works on NFS. Stale locks are force-broken after 5 seconds.

7. **Config cache uses mtime comparison.** If you edit `~/.cc-cmux/config.json`, the next hook invocation invalidates the cache automatically.

8. **cmux built-in hooks are disabled.** The installer runs `defaults write com.cmuxterm.app claudeCodeHooksEnabled -bool false` because cmux's built-in 6-hook integration conflicts with cc-cmux's 16-hook system (same `claude_code` status key).

9. **Tab title worker is fully detached.** Spawned with `child.unref()`, clears `CLAUDECODE` env var to prevent hook recursion when calling `claude -p`.

10. **SSH workspace targeting.** SSH `SendEnv` forwards `CMUX_WORKSPACE_ID` per-connection so commands hit the correct tab, not whatever tab happens to be focused.
