# cmux-claude-pro

the definitive claude code + cmux integration. real-time status pills, progress bars, sidebar logs, desktop notifications, git integration, subagent tracking — all wired up through 16 claude code hooks and cmux's unix socket.

built by studying how [cmux's core team](https://github.com/manaflow-ai/cmux) does their official claude integration, then going way further.

![status](https://img.shields.io/badge/status-production--ready-brightgreen) ![hooks](https://img.shields.io/badge/hooks-16%20events-blue) ![latency](https://img.shields.io/badge/socket%20latency-~8ms-yellow) ![node](https://img.shields.io/badge/node-20%2B-green) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

## demo

<!-- TODO: replace with actual video -->
https://github.com/user-attachments/assets/placeholder-demo-video

> paste the [test prompt](#try-it-yourself) into a fresh claude code session and watch the sidebar light up.

## the sidebar, explained

here's every state you'll see while claude works:

### status pill (top of sidebar)

| state | icon | color | when it appears |
|---|---|---|---|
| `Ready` | checkmark.circle | green | session started, waiting for input |
| `Thinking...` | brain | gold | you submitted a prompt, claude is processing |
| `Working: Read: handler.ts` | hammer.fill | blue | claude is reading a file |
| `Working: Edit: config.ts` | hammer.fill | blue | claude is editing a file |
| `Working: Bash: npm test` | hammer.fill | blue | claude is running a command |
| `Working: Grep: "TODO"` | hammer.fill | blue | claude is searching code |
| `Working: Glob: **/*.ts` | hammer.fill | blue | claude is finding files |
| `Working (2 agents): ...` | hammer.fill | blue | subagents are active |
| `Waiting: Bash` | hand.raised.fill | orange | permission requested |
| `Needs input` | bell.fill | blue | claude sent a notification |
| `Done` | checkmark.seal | green | response complete |
| `Error` | xmark.circle | red | response failed |
| `Compacting...` | arrow.triangle.2.circlepath | purple | context window being compacted |

### progress bar

adaptive estimation using `n/(n+K)` where K learns from your session history:

```
1 tool  → ████░░░░░░░░░░░░░░░░  0.09
3 tools → ██████████░░░░░░░░░░  0.23
5 tools → ████████████░░░░░░░░  0.33
8 tools → ██████████████░░░░░░  0.44
done    → ████████████████████  1.00 Complete
```

never hits 100% until claude actually finishes. caps at 0.95 during work.

### sidebar log entries

every tool use gets a formatted log entry:

```
[claude] [info]    Read: src/handler.ts
[claude] [info]    Edit: features/status.ts
[claude] [info]    Bash: `npm test -- --coverage`
[claude] [info]    Grep: "setStatus" → 10 matches
[claude] [info]    Glob: **/*.ts → 5 files
[claude] [info]    Agent spawned: Explore
[claude] [success] Agent done: Explore
[claude] [success] Task completed
[claude] [warning] FAIL Read: nonexistent-file.ts
[claude] [progress] Compacting context...
[claude] [success] Context compacted
```

### desktop notifications

targeted to the correct workspace tab via `notify_target`:

| trigger | notification |
|---|---|
| claude finishes | "Claude Code / Done / Fixed the auth bug by..." |
| error occurs | "Claude Code / Error / Response failed" |
| permission needed | "Claude Code / Permission Required / Tool: Bash" |

### metadata

| element | source |
|---|---|
| model name | `claude-opus-4-6` via `report_meta` |
| git branch | `main` via `report_git_branch` (+ dirty indicator) |
| working directory | shown by cmux natively |

## all 16 hook events

every claude code lifecycle event we handle:

| hook event | what fires it | what we do |
|---|---|---|
| `SessionStart` | session begins | set Ready, register PID, detect git, report model, clear stale state |
| `SessionEnd` | session exits | clear all sidebar state, delete state file |
| `UserPromptSubmit` | you hit enter | set Thinking, clear progress, clear notifications |
| `PreToolUse` | before any tool runs | set Working with tool name, increment progress bar |
| `PostToolUse` | after tool succeeds | log tool result to sidebar, update tool history |
| `PostToolUseFailure` | after tool fails | log warning with error details |
| `PermissionRequest` | claude needs approval | set Waiting, send desktop notification |
| `Stop` | claude finishes responding | set Done, complete progress, send notification |
| `StopFailure` | API error | set Error, send error notification |
| `SubagentStart` | agent spawned | log spawn, show agent count in status |
| `SubagentStop` | agent finishes | log completion, decrement count |
| `Notification` | claude sends notification | forward to desktop, set Needs Input |
| `PreCompact` | context compaction starts | log "Compacting...", set Compacting status |
| `PostCompact` | compaction finishes | log "Compacted", revert to Working |
| `TaskCompleted` | task marked done | log success |
| `WorktreeCreate` | git worktree created | log worktree info |

## vs the built-in integration

cmux ships with its own claude code integration. this replaces it completely:

| feature | cmux built-in | cmux-claude-pro |
|---|---|---|
| status states | 3 (Running, Idle, Needs input) | **7** (Ready, Thinking, Working, Waiting, Done, Error, Compacting) |
| tool names in status | opt-in UserDefault | always on — "Working: Edit: foo.ts" |
| progress bar | no | **yes** — adaptive algorithm |
| sidebar logs | no | **yes** — per-tool formatted |
| git integration | no | **yes** — branch + dirty state |
| subagent tracking | no | **yes** — count + spawn/done logs |
| task completion | no | **yes** |
| compaction visibility | no | **yes** |
| crash recovery | yes (PID polling) | yes (same `set_agent_pid` mechanism) |
| targeted notifications | yes (`notify_target`) | yes (same mechanism) |
| notification cleanup | yes (`clear_notifications`) | yes (same mechanism) |
| transport | CLI binary (~30ms) | **unix socket (~8ms)** |

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

# 4. add hooks to your settings (see below)

# 5. restart claude code
```

### disable cmux's built-in claude integration

**this step is required.** cmux-claude-pro takes over the `claude_code` status namespace. if you leave the built-in integration on, you'll see two systems fighting over the same status pill.

1. open **cmux Settings** (Cmd+,)
2. go to **Automation**
3. find **"Claude Code Integration"**
4. **turn it off**

## hook configuration

add these hooks to your `~/.claude/settings.json` inside the `"hooks"` key. if you already have hooks, these get appended — your existing hooks are preserved.

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

restart claude code after adding hooks.

## try it yourself

paste this into a fresh claude code session to see every feature in action. each step pauses so you can watch the sidebar update in real time.

```
run this test script step by step. after each step, wait 2 seconds before
proceeding to the next. announce each step number before executing it.

step 1 — READ
read the file package.json (first 5 lines only)

step 2 — GREP
search for "export" in the src/ directory and show count

step 3 — GLOB
find all .ts files in src/features/

step 4 — WRITE
create a file /tmp/cc-cmux-test.txt with content "cmux-claude-pro works"

step 5 — BASH
run: echo "hello from cmux-claude-pro"

step 6 — BASH with output
run: ls -la dist/

step 7 — READ FAILURE
try to read /tmp/this-file-does-not-exist-12345.txt

step 8 — TASK
create a task called "sidebar test" and immediately complete it

step 9 — SUBAGENT
use an Explore agent to count lines in src/handler.ts

step 10 — MULTI-TOOL
read these 3 files in parallel (first 3 lines each):
- src/features/status.ts
- src/features/logger.ts
- src/features/git.ts

step 11 — DONE
print "test complete — all sidebar features verified"
```

### what you'll see

| step | status pill | progress | sidebar log | notification |
|---|---|---|---|---|
| start | `Ready` (green) | — | — | — |
| prompt | `Thinking...` (gold) | cleared | — | — |
| 1 | `Working: Read: package.json` | `0.09 1 tool` | `Read: package.json` | — |
| 2 | `Working: Grep: "export"` | `0.17 2 tools` | `Grep: "export" → N matches` | — |
| 3 | `Working: Glob: **/*.ts` | `0.23 3 tools` | `Glob: **/*.ts` | — |
| 4 | `Working: Write: cc-cmux-test.txt` | `0.29 4 tools` | `Write: cc-cmux-test.txt` | — |
| 5 | `Working: Bash: echo "hello...` | `0.33 5 tools` | `Bash: \`echo "hello...\`` | — |
| 6 | `Working: Bash: ls -la dist/` | `0.38 6 tools` | `Bash: \`ls -la dist/\`` | — |
| 7 | `Working: Read: this-file...` | `0.41 7 tools` | `⚠ FAIL Read: this-file...` | — |
| 8 | `Working: TaskCreate` | `0.47 8-9 tools` | `TaskCreate` + `Task completed` | — |
| 9 | `Working (1 agent): ...` | `0.50 10 tools` | `Agent spawned: Explore` → `Agent done` | — |
| 10 | `Working: Read: ...` | `0.57 13 tools` | 3x `Read: ...` entries | — |
| 11 | `Done` (green) | `1.00 Complete` | — | "Done — test complete..." |

## configuration

`~/.cc-cmux/config.json` — all features individually toggleable:

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

## ssh / remote machines

the same hooks work on both local and remote machines. no separate config needed.

- **local (cmux running):** full sidebar integration
- **remote (no cmux):** handler checks for `CMUX_SOCKET_PATH` + `CMUX_WORKSPACE_ID`, finds neither, exits 0 silently. zero overhead.

```bash
# deploy to remote
scp ~/.cc-cmux/handler.cjs ~/.cc-cmux/tab-title-worker.cjs ~/.cc-cmux/config.json remote:~/.cc-cmux/
```

## how it works

a single 45KB node.js handler (`handler.cjs`) gets invoked for every hook event. reads JSON from stdin, updates cmux's sidebar via direct unix socket (~8ms per call), manages state atomically in `/tmp/cc-cmux/`.

no daemon. no background process. no runtime dependencies. just node builtins.

```
claude code hook event
    → stdin JSON
    → handler.cjs (route by hook_event_name)
    → unix socket → cmux sidebar
    → atomic state file write
    → exit 0 (always)
```

## cmux primitives used

same socket protocol as the official integration, plus 6 extras:

| primitive | official cmux | cmux-claude-pro | what it does |
|---|---|---|---|
| `set_status` | yes | yes | status pill with icon + color |
| `clear_status` | yes | yes | cleanup |
| `set_agent_pid` | yes | yes | crash recovery — 30s PID polling |
| `clear_agent_pid` | yes | yes | cleanup |
| `notify_target` | yes | yes | workspace-targeted desktop notifications |
| `clear_notifications` | yes | yes | clear stale notifications on new prompt |
| `set_progress` | — | **yes** | progress bar |
| `clear_progress` | — | **yes** | cleanup |
| `log` | — | **yes** | sidebar activity feed |
| `clear_log` | — | **yes** | cleanup |
| `report_git_branch` | — | **yes** | git branch in sidebar |
| `report_meta` | — | **yes** | model metadata |

## architecture

```
~/.cc-cmux/
├── handler.cjs          # 45KB compiled handler (16 events)
├── tab-title-worker.cjs # background AI tab title generator
└── config.json          # feature toggles

/tmp/cc-cmux/
└── <session-id>.json    # per-session state (atomic r/w, mkdir lock)
```

source layout:

```
src/
├── handler.ts           # entry: stdin → route → dispatch → exit 0
├── cmux/
│   ├── socket.ts        # unix socket client (send/fire/sendBatch)
│   └── commands.ts      # typed builders for 12 cmux primitives
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

## prior art

studied and borrowed patterns from:
- [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) — official integration (PID tracking, `notify_target`, `clear_notifications`)
- [tslateman/cmux-claude-code](https://github.com/tslateman/cmux-claude-code) — first community plugin (self-healing panel recovery, `n/(n+10)` progress)
- [STRML/cc-tab-titles](https://github.com/STRML/cc-tab-titles) — AI tab titles (tab ownership, backgrounded haiku calls)
- [Attamusc/opencode-cmux](https://github.com/Attamusc/opencode-cmux) — gold standard for opencode (state machine, dual transport)
- [Th3Sp3ct3R/cmux-claude-agents](https://github.com/Th3Sp3ct3R/cmux-claude-agents) — visible agent panes (PreToolUse interception)

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

## troubleshooting

| symptom | cause | fix |
|---|---|---|
| no sidebar panel | cmux not active | check `echo $CMUX_SOCKET_PATH` |
| two status pills | built-in integration still on | cmux Settings → Automation → OFF |
| `PostToolUse:X hook error` | broken old hook in settings.json | remove non-cc-cmux PostToolUse entries |
| no progress bar | feature disabled | `~/.cc-cmux/config.json` → `features.progress: true` |
| no notifications | feature disabled | `~/.cc-cmux/config.json` → `features.notifications: true` |
| handler crashes | node too old | need Node.js 20+ |
| sidebar doesn't update | stale handler | restart claude code to reload hooks |

## license

MIT
