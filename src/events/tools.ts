/**
 * Tool lifecycle handlers: PreToolUse, PostToolUse, PostToolUseFailure.
 *
 * PreToolUse is the hot path — must be minimal (fire-and-forget).
 * It can also intercept Agent tool calls to redirect them to visible panes.
 *
 * PostToolUse logs the tool result and updates state.
 * PostToolUseFailure logs the error.
 */

import type { CmuxSocket } from '../cmux/socket.js';
import type { CmuxCommands } from '../cmux/commands.js';
import type { StateManager } from '../state/manager.js';
import type { CcCmuxConfig } from '../config/types.js';
import type { CmuxEnv } from '../util/env.js';
import type { PreToolUseInput, PostToolUseInput, PostToolUseFailureInput } from './types.js';
import { formatToolLabel } from '../util/tool-format.js';
import { STATUS_DISPLAY, resolveStatus, formatStatusValue } from '../features/status.js';
import { formatToolLog, getLogLevel, LOG_SOURCE } from '../features/logger.js';
import { calculateProgress, formatProgressLabel } from '../state/progress.js';
import { isReadOnlyAgent, spawnAgentPane, getNextDirection } from '../features/agents.js';
import { detectGitInfo, isGitCommand } from '../features/git.js';
import { CMUX_BIN } from '../util/env.js';

/**
 * Handle PreToolUse — update status to "working" and set progress.
 *
 * Special case: If the tool is "Agent" and visibleAgentPanes is enabled
 * and the agent is NOT read-only, block the call and spawn a visible pane.
 */
export async function onPreToolUse(
  event: PreToolUseInput,
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
  env: CmuxEnv,
): Promise<void> {
  const { tool_name: toolName, tool_input: toolInput } = event;

  // ---- Agent interception ----
  if (
    toolName === 'Agent' &&
    config.features.visibleAgentPanes
  ) {
    const agentType = (toolInput['type'] as string) ??
      (toolInput['agent_type'] as string) ?? 'agent';
    const prompt = (toolInput['prompt'] as string) ??
      (toolInput['description'] as string) ?? '';

    // Only intercept execution agents, not read-only ones
    if (!isReadOnlyAgent(agentType)) {
      // Determine split direction
      const s = state.read();
      const direction = getNextDirection(
        s.spawnedPanes.length,
        config.visibleAgents.splitDirection,
      );

      // Spawn the visible pane
      const result = spawnAgentPane(
        CMUX_BIN,
        agentType,
        prompt,
        env.surfaceId,
        direction,
      );

      if (result) {
        // Record the spawned pane in state
        state.withState((st) => {
          st.spawnedPanes.push({
            surfaceRef: result.surfaceRef,
            agentType,
            prompt,
            startTime: Date.now(),
          });
        });

        // Log the spawn
        if (config.features.logs) {
          socket.fire(
            cmd.log(`Agent spawned in pane: ${agentType}`, {
              level: 'info',
              source: LOG_SOURCE,
            }),
          );
        }
      }

      // Output blocking JSON to stdout — this tells Claude Code to block the agent tool
      const blockResponse = JSON.stringify({
        decision: 'block',
        reason: `Agent redirected to visible cmux pane. Spawning ${agentType}...`,
      });
      process.stdout.write(blockResponse);
      return;
    }
  }

  // ---- Normal tool: update status and progress ----
  // Clear stale notifications when Claude starts working again (matches official cmux)
  socket.fire(cmd.clearNotifications());

  const label = formatToolLabel(toolName, toolInput as Record<string, unknown>);

  state.withState((s) => {
    s.toolUseCount++;
    const resolved = resolveStatus(s.currentStatus, 'working');
    s.currentStatus = resolved;

    // Fire-and-forget: no await — speed is critical on PreToolUse
    if (config.features.statusPills) {
      const display = STATUS_DISPLAY.working;
      const statusValue = formatStatusValue(
        'working',
        label,
        s.activeSubagents > 0 ? s.activeSubagents : undefined,
      );
      socket.fire(cmd.setStatus('claude_code', statusValue, {
        icon: display.icon,
        color: display.color,
      }));
    }

    if (config.features.progress) {
      const progress = calculateProgress(s.toolUseCount, s.turnToolCounts);
      const progressLabel = formatProgressLabel(s.toolUseCount);
      socket.fire(cmd.setProgress(progress, progressLabel));
    }
  });
}

/**
 * Handle PostToolUse — log the tool result and update tool history.
 */
export async function onPostToolUse(
  event: PostToolUseInput,
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
): Promise<void> {
  const { tool_name: toolName, tool_input: toolInput } = event;

  // Safely extract tool_response — it can be enormous (image blobs, large JSON).
  // Truncate to prevent socket command overflow and state file bloat.
  let toolResponse: unknown = undefined;
  try {
    const raw = event.tool_response;
    if (raw == null) {
      toolResponse = undefined;
    } else if (typeof raw === 'string') {
      toolResponse = raw.length > 2000 ? raw.slice(0, 2000) : raw;
    } else if (typeof raw === 'object') {
      // Stringify and truncate large objects (TaskCreate/TaskUpdate responses, etc.)
      const s = JSON.stringify(raw);
      toolResponse = s.length > 2000 ? s.slice(0, 2000) : raw;
    } else {
      toolResponse = raw;
    }
  } catch {
    toolResponse = undefined;
  }

  // Log the tool result
  if (config.features.logs) {
    try {
      const logMsg = formatToolLog(
        toolName,
        toolInput as Record<string, unknown>,
        toolResponse,
      );
      const level = getLogLevel(toolName, false);
      socket.fire(cmd.log(logMsg, {
        level: level as 'info' | 'success' | 'warning' | 'error',
        source: LOG_SOURCE,
      }));
    } catch {
      // Non-critical — log what we can
      try {
        socket.fire(cmd.log(toolName, { level: 'info', source: LOG_SOURCE }));
      } catch {}
    }
  }

  // Update tool history in state
  try {
    state.withState((s) => {
      const summary = formatToolLog(
        toolName,
        toolInput as Record<string, unknown>,
      );
      s.toolHistory.push({
        toolName,
        summary,
        timestamp: Date.now(),
      });
      if (s.toolHistory.length > 15) {
        s.toolHistory = s.toolHistory.slice(-15);
      }
    });
  } catch {
    // State update is best-effort
  }

  // If this was a bash command involving git, refresh git state
  if (config.features.gitIntegration && toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command === 'string' && isGitCommand(command)) {
      try {
        const gitInfo = detectGitInfo(event.cwd);
        state.withState((s) => {
          s.gitBranch = gitInfo.branch;
          s.gitDirty = gitInfo.dirty;
        });
        if (gitInfo.branch) {
          socket.fire(cmd.reportGitBranch(gitInfo.branch, gitInfo.dirty));
        }
      } catch {
        // Non-critical
      }
    }
  }
}

/**
 * Handle PostToolUseFailure — log the error with warning level.
 */
export async function onPostToolUseFailure(
  event: PostToolUseFailureInput,
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
): Promise<void> {
  if (!config.features.logs) return;

  const { tool_name: toolName, tool_input: toolInput, error } = event;
  const logMsg = formatToolLog(
    toolName,
    toolInput as Record<string, unknown>,
  );
  const errorSuffix = error ? ` (${error.slice(0, 60)})` : '';

  try {
    socket.fire(
      cmd.log(`FAIL ${logMsg}${errorSuffix}`, {
        level: 'warning',
        source: LOG_SOURCE,
      }),
    );
  } catch {
    // Non-critical
  }
}
