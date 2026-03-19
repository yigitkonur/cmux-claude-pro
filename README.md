# cmux-claude-pro

the definitive claude code + cmux integration. status pills, progress bars, sidebar logs, desktop notifications, git integration, subagent tracking — all wired up through claude code hooks and cmux's unix socket.

built by studying how [cmux's core team](https://github.com/manaflow-ai/cmux) does it, then going further.

![status](https://img.shields.io/badge/status-production--ready-brightgreen) ![hooks](https://img.shields.io/badge/hooks-16%20events-blue) ![latency](https://img.shields.io/badge/socket%20latency-~8ms-yellow)

## what it does

when you run claude code inside cmux, this tool gives you real-time visibility in the sidebar:

```
Ready                              → session started
Thinking...                        → prompt submitted, claude is processing
Working: Edit: src/handler.ts      → tool executing with file/command context
Working: Bash: npm test            → shows what bash command is running
Working (3 agents)                 → subagent count when agents are active
Waiting: Bash                      → permission requested
Done                               → response complete
Error                              → response failed
Compacting...                      → context window being compacted
```

plus:
- **progress bar** — adaptive `n/(n+K)` estimation that learns from your session history
- **sidebar logs** — every tool use logged: `[claude] [info] Edit: src/auth.ts`
- **desktop notifications** — targeted to the right workspace tab (done, error, permission)
- **git integration** — branch + dirty state in sidebar via `report_git_branch`
- **subagent tracking** — spawn/completion logged, count shown in status
- **crash recovery** — registers agent PID so cmux auto-clears on crashes
- **compaction/task visibility** — PreCompact, PostCompact, TaskCompleted events

## how it works

a single 45KB node.js handler (`handler.cjs`) gets invoked by claude code for 16 hook events. it reads the event JSON from stdin, updates cmux's sidebar via direct unix socket communication (~8ms per call), and manages state atomically in `/tmp/cc-cmux/`.

no daemon. no background process. no external dependencies. just node builtins.

```
claude code hook event
    → stdin JSON
    → handler.cjs (route by hook_event_name)
    → unix socket → cmux sidebar
    → atomic state file write
    → exit 0
```

## vs the built-in integration

cmux ships with its own claude code integration (3 status states, basic notifications). this replaces it completely:

| feature | cmux built-in | cmux-claude-pro |
|---|---|---|
| status states | 3 (Running, Idle, Needs input) | 7 (Ready, Thinking, Working, Waiting, Done, Error, Compacting) |
| tool names in status | opt-in via UserDefault | always on ("Working: Edit: foo.ts") |
| progress bar | no | yes, adaptive algorithm |
| sidebar logs | no | yes, per-tool formatted |
| git integration | no | yes, branch + dirty state |
| subagent tracking | no | yes, count + spawn/done logs |
| compaction visibility | no | yes |
| task completion | no | yes |
| crash recovery | yes (PID polling) | yes (same mechanism via `set_agent_pid`) |
| targeted notifications | yes (`notify_target`) | yes (same mechanism) |
| notification cleanup | yes (`clear_notifications`) | yes (same mechanism) |
| transport | CLI binary (~30ms) | unix socket (~8ms) |

## install

### one-liner

```bash
git clone https://github.com/yigitkonur/cmux-claude-pro.git ~/.cmux-claude-pro \
  && cd ~/.cmux-claude-pro \
  && npm install && npm run build \
  && bash install.sh
```

### step by step

```bash
# 1. clone
git clone https://github.com/yigitkonur/cmux-claude-pro.git
cd cmux-claude-pro

# 2. build (needs node 20+)
npm install
npm run build

# 3. install handler to ~/.cc-cmux/
bash install.sh

# 4. add hooks to claude code settings
# (see "hook configuration" section below)
```

### important: disable cmux's built-in claude integration

since cmux-claude-pro takes over the `claude_code` status namespace, you need to disable the built-in integration to avoid conflicts:

1. open **cmux Settings** (Cmd+,)
2. go to **Automation**
3. find **"Claude Code Integration"**
4. **turn it off**

if you skip this step, you'll see two systems fighting over the same status pill. not a great look.

## hook configuration

add these hooks to your `~/.claude/settings.json` (inside the `"hooks"` key):

```json
{
  "hooks": {
    "SessionStart": [{"description": "cc-cmux: initialize sidebar, detect git, report model", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "SessionEnd": [{"description": "cc-cmux: clean up sidebar state", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 5}]}],
    "UserPromptSubmit": [{"description": "cc-cmux: set thinking status, reset progress", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PreToolUse": [{"description": "cc-cmux: update status and progress bar", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PostToolUse": [{"description": "cc-cmux: log tool results to sidebar", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PostToolUseFailure": [{"description": "cc-cmux: log tool errors to sidebar", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PermissionRequest": [{"description": "cc-cmux: set waiting status, notify on permission", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "Stop": [{"description": "cc-cmux: set done status, complete progress, notify", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "StopFailure": [{"description": "cc-cmux: set error status, notify on failure", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "Notification": [{"description": "cc-cmux: forward notifications to desktop", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "SubagentStart": [{"description": "cc-cmux: track agent spawn in sidebar", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "SubagentStop": [{"description": "cc-cmux: track agent completion in sidebar", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PreCompact": [{"description": "cc-cmux: log compaction start", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "PostCompact": [{"description": "cc-cmux: log compaction complete", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "TaskCompleted": [{"description": "cc-cmux: log task completion", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}],
    "WorktreeCreate": [{"description": "cc-cmux: log worktree creation", "hooks": [{"type": "command", "command": "node ~/.cc-cmux/handler.cjs", "timeout": 10}]}]
  }
}
```

existing hooks are preserved — cc-cmux entries are appended alongside your own.

restart claude code after adding hooks.

## configuration

the handler reads `~/.cc-cmux/config.json` for feature toggles:

```json
{
  "features": {
    "statusPills": true,
    "progress": true,
    "logs": true,
    "notifications": true,
    "tabTitles": false,
    "gitIntegration": true,
    "subagentTracking": true,
    "visibleAgentPanes": false
  },
  "notifications": {
    "onStop": true,
    "onError": true,
    "onPermission": true
  },
  "tabTitle": {
    "style": "directory"
  }
}
```

all features are individually toggleable. `tabTitles` and `visibleAgentPanes` are opt-in.

## ssh / remote machines

the same `settings.json` hooks work on both local and remote machines:

- **local (cmux running):** full sidebar integration
- **remote (no cmux):** handler checks for `CMUX_SOCKET_PATH` + `CMUX_WORKSPACE_ID`, finds neither, exits 0 silently. zero overhead.

```bash
# deploy to remote
scp -r ~/.cc-cmux/ remote:~/.cc-cmux/
```

no need for separate settings per machine.

## architecture

```
~/.cc-cmux/
├── handler.cjs          # 45KB compiled handler (all 16 events)
├── tab-title-worker.cjs # background AI tab title generator
└── config.json          # feature toggles

/tmp/cc-cmux/
├── <session-id>.json    # per-session state (atomic r/w, mkdir lock)
└── config.cache.json    # cached config for fast loading
```

**source layout** (for contributors):

```
src/
├── handler.ts           # entry: stdin → route → dispatch → exit 0
├── cmux/
│   ├── socket.ts        # unix socket client (send/fire/sendBatch)
│   └── commands.ts      # typed builders for cmux protocol
├── state/
│   ├── manager.ts       # atomic file state with mkdir locking
│   ├── types.ts         # SessionState, StatusPhase
│   └── progress.ts      # adaptive n/(n+K) algorithm
├── events/
│   ├── session.ts       # SessionStart, SessionEnd
│   ├── tools.ts         # PreToolUse, PostToolUse, PostToolUseFailure
│   ├── flow.ts          # UserPromptSubmit, Stop, StopFailure
│   ├── agents.ts        # SubagentStart, SubagentStop
│   ├── lifecycle.ts     # PreCompact, PostCompact, TaskCompleted, WorktreeCreate
│   └── notifications.ts # Notification, PermissionRequest
├── features/
│   ├── status.ts        # 7-state priority system
│   ├── logger.ts        # per-tool log formatting
│   ├── tab-title.ts     # AI title generation + ownership
│   ├── git.ts           # branch detection, PR extraction
│   └── agents.ts        # visible agent pane spawning
├── config/              # types, loader, defaults
├── installer/           # TUI setup wizard (@clack/prompts)
└── util/                # env detection, stdin reader, tool formatting
```

## cmux primitives used

we use the same socket protocol as cmux's official integration, plus extras:

| primitive | official | cmux-claude-pro | purpose |
|---|---|---|---|
| `set_status` | yes | yes | status pill with icon + color |
| `clear_status` | yes | yes | cleanup |
| `set_agent_pid` | yes | yes | crash recovery (30s PID polling) |
| `clear_agent_pid` | yes | yes | cleanup |
| `notify_target` | yes | yes | workspace-targeted notifications |
| `clear_notifications` | yes | yes | clear stale notifications |
| `set_progress` | no | **yes** | progress bar |
| `clear_progress` | no | **yes** | cleanup |
| `log` | no | **yes** | sidebar activity feed |
| `clear_log` | no | **yes** | cleanup |
| `report_git_branch` | no | **yes** | git branch in sidebar |
| `report_meta` | no | **yes** | model metadata |

## prior art & credits

studied and borrowed patterns from:
- [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) — official cmux integration (status states, PID tracking, notify_target)
- [tslateman/cmux-claude-code](https://github.com/tslateman/cmux-claude-code) — first community plugin (self-healing panel recovery, logarithmic progress)
- [STRML/cc-tab-titles](https://github.com/STRML/cc-tab-titles) — AI tab title generation (tab ownership system, backgrounded haiku calls)
- [Attamusc/opencode-cmux](https://github.com/Attamusc/opencode-cmux) — gold standard for opencode (state machine architecture, dual transport)
- [Th3Sp3ct3R/cmux-claude-agents](https://github.com/Th3Sp3ct3R/cmux-claude-agents) — visible agent panes (PreToolUse interception, pane spawning)

## uninstall

```bash
# remove hooks from settings.json (keeps your other hooks)
python3 -c "
import json, os
p = os.path.expanduser('~/.claude/settings.json')
s = json.load(open(p))
for event in list(s.get('hooks', {})):
    s['hooks'][event] = [e for e in s['hooks'][event] if not e.get('description','').startswith('cc-cmux:')]
    if not s['hooks'][event]: del s['hooks'][event]
json.dump(s, open(p, 'w'), indent=2)
print('removed cc-cmux hooks')
"

# remove handler files
rm -rf ~/.cc-cmux/

# re-enable cmux's built-in integration if you want
# cmux Settings → Automation → Claude Code Integration → ON
```

## license

MIT
