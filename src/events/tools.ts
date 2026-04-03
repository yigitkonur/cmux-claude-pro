/**
 * Tool lifecycle handlers: PreToolUse, PostToolUse, PostToolUseFailure.
 *
 * PreToolUse is the hot path — must be minimal (fire-and-forget).
 * It can also intercept Agent tool calls to redirect them to visible panes.
 *
 * PostToolUse logs the tool result and updates state.
 * PostToolUseFailure logs the error.
 */

import type { HandlerContext } from './context.js';
import type { PreToolUseInput, PostToolUseInput, PostToolUseFailureInput } from './types.js';
import type { V2RpcCall } from '../cmux/v2-emitter.js';
import { V2_COLORS, formatWorkspaceTitle } from '../cmux/v2-emitter.js';
import { formatToolLabel } from '../util/tool-format.js';
import { resolveStatus, formatStatusValue } from '../features/status.js';
import { formatToolLog, getLogLevel, LOG_SOURCE } from '../features/logger.js';
import { calculateProgress, formatProgressLabel } from '../state/progress.js';
import { isReadOnlyAgent, spawnAgentPane, getNextDirection } from '../features/agents.js';
import { detectGitInfo, isGitCommand } from '../features/git.js';
import { CMUX_BIN } from '../util/env.js';
import { fireStatus } from '../cmux/helpers.js';
import { TOOL_HISTORY_MAX, RESPONSE_TRUNCATE } from '../constants.js';

// ---- V2 SSH branches ----

async function onPreToolUseV2(
  event: PreToolUseInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, v2, state, config } = ctx;
  const { tool_name: toolName, tool_input: toolInput } = event;

  // Skip agent interception over SSH (no visible panes)
  // Clear notifications
  socket.fireV2(v2.clearNotifications());

  const label = formatToolLabel(toolName, toolInput as Record<string, unknown>);

  state.withState((s) => {
    s.toolUseCount++;
    const wasThinking = s.currentStatus === 'thinking';
    s.currentStatus = 'working';

    const calls: V2RpcCall[] = [
      v2.setTabTitle(formatStatusValue('working', label, s.activeSubagents > 0 ? s.activeSubagents : undefined)),
    ];

    // Color only on thinking→working transition
    if (wasThinking) calls.push(v2.setWorkspaceColor(V2_COLORS.working));

    // Workspace title: "main* | 5 tools 33%"
    if (config.features.progress) {
      const progress = calculateProgress(s.toolUseCount, s.turnToolCounts);
      calls.push(v2.setWorkspaceTitle(formatWorkspaceTitle(s.gitBranch, s.gitDirty, s.toolUseCount, progress)));
    }

    socket.fireV2All(calls);
  });
}

async function onPostToolUseV2(
  event: PostToolUseInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, v2, state, config } = ctx;
  const { tool_name: toolName, tool_input: toolInput } = event;

  // No logging over SSH. Only action: refresh git branch if git command detected.
  if (config.features.gitIntegration && toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command === 'string' && isGitCommand(command)) {
      try {
        const gitInfo = detectGitInfo(event.cwd);
        state.withState((s) => {
          s.gitBranch = gitInfo.branch;
          s.gitDirty = gitInfo.dirty;
        });
        const s = state.read();
        if (gitInfo.branch) {
          const progress = calculateProgress(s.toolUseCount, s.turnToolCounts);
          socket.fireV2(v2.setWorkspaceTitle(formatWorkspaceTitle(gitInfo.branch, gitInfo.dirty, s.toolUseCount, progress)));
        }
      } catch {}
    }
  }

  // Also update tool history (same as V1 path)
  try {
    state.withState((s) => {
      s.toolHistory.push({
        toolName,
        summary: formatToolLog(toolName, toolInput as Record<string, unknown>),
        timestamp: Date.now(),
      });
      if (s.toolHistory.length > TOOL_HISTORY_MAX) {
        s.toolHistory = s.toolHistory.slice(-TOOL_HISTORY_MAX);
      }
    });
  } catch {}
}

async function onPostToolUseFailureV2(
  _event: PostToolUseFailureInput,
  _ctx: HandlerContext,
): Promise<void> {
  // Nothing to do over SSH (log-only event)
  return;
}

// ---- V1 handlers ----

/**
 * Handle PreToolUse — update status to "working" and set progress.
 *
 * Special case: If the tool is "Agent" and visibleAgentPanes is enabled
 * and the agent is NOT read-only, block the call and spawn a visible pane.
 */
export async function onPreToolUse(
  event: PreToolUseInput,
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) { return onPreToolUseV2(event, ctx); }

  const { socket, cmd, state, config, env } = ctx;
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
        s.model,
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
      fireStatus(socket, cmd, 'working', label, s.activeSubagents > 0 ? s.activeSubagents : undefined);
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
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) { return onPostToolUseV2(event, ctx); }

  const { socket, cmd, state, config, env } = ctx;
  const { tool_name: toolName, tool_input: toolInput } = event;

  // Safely handle tool_response — can be enormous (image blobs, large JSON, circular refs).
  // We only need it for log formatting (match counts, exit codes), so keep it minimal.
  let toolResponse: unknown = undefined;
  try {
    const raw = event.tool_response;
    if (raw == null) {
      toolResponse = undefined;
    } else if (typeof raw === 'string') {
      toolResponse = { content: raw.length > RESPONSE_TRUNCATE ? raw.slice(0, RESPONSE_TRUNCATE) : raw };
    } else if (typeof raw === 'object') {
      // Extract only the fields we actually use in formatToolLog helpers
      const r = raw as Record<string, unknown>;
      toolResponse = {
        content: typeof r['content'] === 'string' ? r['content'].slice(0, RESPONSE_TRUNCATE) : undefined,
        exitCode: r['exitCode'] ?? r['exit_code'],
        matchCount: r['matchCount'] ?? r['match_count'],
        fileCount: r['fileCount'] ?? r['file_count'],
        files: Array.isArray(r['files']) ? r['files'].length : undefined,
      };
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
      if (s.toolHistory.length > TOOL_HISTORY_MAX) {
        s.toolHistory = s.toolHistory.slice(-TOOL_HISTORY_MAX);
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
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) { return onPostToolUseFailureV2(event, ctx); }

  const { socket, cmd, state, config, env } = ctx;
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
