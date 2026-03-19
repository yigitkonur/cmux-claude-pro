# cmux-claude-pro — interactive test script

paste this entire prompt into a fresh claude code session to see every sidebar feature in action. each step has a 2-second pause so you can watch the sidebar update.

> **prerequisite:** cmux-claude-pro installed, cmux's built-in claude integration disabled, claude code restarted.

---

## paste this into claude code:

```
run this test script step by step. after each step, wait 2 seconds before proceeding to the next. announce each step number before executing it. do NOT skip any step.

step 1 — READ (sidebar shows "Working: Read: package.json" + log entry)
read the file /Users/yigitkonur/dev/cc-cmux/package.json (first 5 lines only)

step 2 — GREP (sidebar shows "Working: Grep: setStatus" + match count in log)
search for the pattern "setStatus" in /Users/yigitkonur/dev/cc-cmux/src/ and show count

step 3 — GLOB (sidebar shows "Working: Glob: **/*.ts" + file count)
find all .ts files in /Users/yigitkonur/dev/cc-cmux/src/features/

step 4 — EDIT (sidebar shows "Working: Edit: test-output.txt")
create a file /tmp/cc-cmux-test-output.txt with the content "cmux-claude-pro test passed"

step 5 — BASH (sidebar shows "Working: Bash: echo..." + command in log)
run: echo "hello from cmux-claude-pro test suite"

step 6 — BASH with output (sidebar shows bash command + log)
run: ls -la /Users/yigitkonur/dev/cc-cmux/dist/

step 7 — READ FAILURE (sidebar shows "⚠ FAIL Read:" warning in log)
try to read /tmp/this-file-absolutely-does-not-exist-12345.txt

step 8 — TASK CREATE + COMPLETE (sidebar shows "TaskCreate" then "Task completed")
create a task called "Demo task for sidebar test" and immediately mark it as completed

step 9 — SUBAGENT (sidebar shows "Working (1 agent)" + "Agent spawned/done" in log)
use an Explore agent to count how many lines are in /Users/yigitkonur/dev/cc-cmux/src/handler.ts

step 10 — MULTI-TOOL BURST (sidebar progress bar jumps, multiple log entries)
read these 3 files in parallel:
- /Users/yigitkonur/dev/cc-cmux/src/features/status.ts (first 3 lines)
- /Users/yigitkonur/dev/cc-cmux/src/features/logger.ts (first 3 lines)
- /Users/yigitkonur/dev/cc-cmux/src/features/git.ts (first 3 lines)

step 11 — FINAL SUMMARY
print a table showing all the sidebar features that were demonstrated:
| feature | step | what appeared in sidebar |
and say "test complete — all cmux-claude-pro features verified"
```

---

## what to watch for

### status pill (top of sidebar panel)

| step | expected status | icon | color |
|---|---|---|---|
| session start | `Ready` | checkmark.circle | green |
| any prompt | `Thinking...` | brain | gold |
| steps 1-10 | `Working: <tool>: <detail>` | hammer.fill | blue |
| step 9 | `Working (1 agent): ...` | hammer.fill | blue |
| after step 11 | `Done` | checkmark.seal | green |

### progress bar (below status)

| when | expected |
|---|---|
| after step 1 | `0.09 — 1 tool` |
| after step 5 | `0.33 — 5 tools` |
| after step 10 | ~`0.57 — 13 tools` |
| after step 11 (done) | `1.00 — Complete` (full bar) |

### sidebar log entries (scrollable list)

| step | expected log entry |
|---|---|
| 1 | `[claude] [info] Read: cc-cmux/package.json` |
| 2 | `[claude] [info] Grep: "setStatus" → N matches` |
| 3 | `[claude] [info] Glob: **/*.ts` |
| 4 | `[claude] [info] Write: cc-cmux-test-output.txt` |
| 5 | `[claude] [info] Bash: \`echo "hello from...` |
| 6 | `[claude] [info] Bash: \`ls -la /Users/...` |
| 7 | `[claude] [warning] FAIL Read: this-file-abs...` |
| 8 | `[claude] [info] TaskCreate` + `[claude] [success] Task completed` |
| 9 | `[claude] [info] Agent spawned: Explore` + `[claude] [success] Agent done: Explore` |
| 10 | 3x `[claude] [info] Read: ...` entries |

### desktop notification

| when | expected |
|---|---|
| after step 11 completes | macOS notification: "Claude Code / Done / test complete — all cmux-claude-pro features verified" |

### metadata (bottom of sidebar)

| element | expected |
|---|---|
| model | `claude-opus-4-6` (or whatever model is active) |
| git branch | `main` (if in a git repo) |
| directory | `~/dev/claude-code` |

---

## troubleshooting

| symptom | cause | fix |
|---|---|---|
| no sidebar panel at all | cmux integration not active | check `CMUX_SOCKET_PATH` is set |
| two status pills | built-in cmux integration still on | disable in cmux Settings → Automation |
| `PostToolUse:X hook error` in terminal | broken old hook in settings.json | remove non-cc-cmux entries from PostToolUse |
| no progress bar | progress feature disabled | check `~/.cc-cmux/config.json` → `features.progress: true` |
| no log entries | logs feature disabled | check `~/.cc-cmux/config.json` → `features.logs: true` |
| no notifications | notifications disabled | check `~/.cc-cmux/config.json` → `features.notifications: true` |
| handler crashes | node version too old | need Node.js 20+ (`node --version`) |
| sidebar doesn't update | stale handler from old session | restart claude code to reload hooks |
