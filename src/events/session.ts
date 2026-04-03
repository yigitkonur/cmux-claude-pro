/**
 * Session lifecycle handlers: SessionStart and SessionEnd.
 *
 * SessionStart initializes state, detects git info, sets initial sidebar state.
 * SessionEnd cleans up state and sidebar artifacts.
 */

import type { HandlerContext } from './context.js';
import type { SessionStartInput, SessionEndInput } from './types.js';
import type { V2RpcCall } from '../cmux/v2-emitter.js';
import { V2_COLORS, formatWorkspaceTitle } from '../cmux/v2-emitter.js';
import { STATUS_DISPLAY, formatStatusValue } from '../features/status.js';
import { detectGitInfo } from '../features/git.js';
import { deleteTabTitle } from '../features/tab-title.js';
import { LOG_SOURCE } from '../features/logger.js';
import { AGENT_KEY, META_HOST, META_REMOTE_CWD, STALE_SESSION_MS } from '../constants.js';
import { hostname } from 'node:os';

/**
 * V2 (SSH/TCP) branch for SessionStart.
 */
async function onSessionStartV2(
  event: SessionStartInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, v2, state, config, env } = ctx;

  // Create and populate initial state (same as V1)
  const s = state.createDefault();
  s.sessionId = event.session_id;
  s.workspaceId = env.workspaceId;
  s.surfaceId = env.surfaceId;
  s.socketPath = env.socketPath;
  s.model = event.model ?? null;
  s.sessionStartTime = Date.now();

  if (config.features.gitIntegration && event.cwd) {
    try {
      const gitInfo = detectGitInfo(event.cwd);
      s.gitBranch = gitInfo.branch;
      s.gitDirty = gitInfo.dirty;
    } catch {
      // Git detection is best-effort
    }
  }

  state.write(s);

  const calls: V2RpcCall[] = [
    v2.setTabTitle('Ready'),
    v2.setWorkspaceColor(V2_COLORS.ready),
    v2.clearNotifications(),
    v2.markRead(),
  ];

  if (s.gitBranch) {
    calls.push(v2.setWorkspaceTitle(formatWorkspaceTitle(s.gitBranch, s.gitDirty)));
  }

  socket.fireV2All(calls);

  // Clean up stale state files (background, non-blocking)
  try {
    state.cleanStale(STALE_SESSION_MS);
  } catch {
    // Non-critical
  }
}

/**
 * V2 (SSH/TCP) branch for SessionEnd.
 */
async function onSessionEndV2(
  event: SessionEndInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, v2, state } = ctx;

  const calls: V2RpcCall[] = [
    v2.clearTabTitle(),
    v2.clearWorkspaceColor(),
    v2.clearWorkspaceTitle(),
    v2.clearNotifications(),
    v2.markRead(),
    v2.unpin(),
  ];

  socket.fireV2All(calls);

  try {
    state.delete();
  } catch {
    // Non-critical
  }

  try {
    deleteTabTitle(event.session_id);
  } catch {
    // Non-critical
  }
}

/**
 * Handle SessionStart — initialize the session state and sidebar.
 */
export async function onSessionStart(
  event: SessionStartInput,
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) { return onSessionStartV2(event, ctx); }

  const { socket, cmd, state, config, env } = ctx;

  // Create and populate initial state
  const s = state.createDefault();
  s.sessionId = event.session_id;
  s.workspaceId = env.workspaceId;
  s.surfaceId = env.surfaceId;
  s.socketPath = env.socketPath;
  s.model = event.model ?? null;
  s.sessionStartTime = Date.now();

  // Detect git info if enabled
  if (config.features.gitIntegration && event.cwd) {
    try {
      const gitInfo = detectGitInfo(event.cwd);
      s.gitBranch = gitInfo.branch;
      s.gitDirty = gitInfo.dirty;
    } catch {
      // Git detection is best-effort
    }
  }

  // Write state before sending socket commands
  state.write(s);

  // Build batch of sidebar initialization commands
  const commands: string[] = [];

  // Register agent PID — enables cmux's 30s crash recovery auto-cleanup
  // and suppresses raw OSC terminal notifications for this workspace
  const pid = process.ppid || process.pid;
  commands.push(cmd.setAgentPid(AGENT_KEY, pid));

  // Clear previous state
  commands.push(cmd.clearLog());
  commands.push(cmd.clearNotifications());

  // Set status to Ready
  if (config.features.statusPills) {
    const display = STATUS_DISPLAY.ready;
    commands.push(
      cmd.setStatus(AGENT_KEY, formatStatusValue('ready'), {
        icon: display.icon,
        color: display.color,
        pid,
      }),
    );
  }

  // Report git branch
  if (config.features.gitIntegration && s.gitBranch) {
    commands.push(cmd.reportGitBranch(s.gitBranch, s.gitDirty));
  }

  // Detect SSH / remote session
  const isSSH = !!(process.env['SSH_CONNECTION'] || process.env['SSH_CLIENT'] || process.env['SSH_TTY']);
  const hostName = hostname();

  if (isSSH) {
    // Report remote hostname prominently
    const user = process.env['USER'] || process.env['LOGNAME'] || '';
    const hostLabel = user ? `${user}@${hostName}` : hostName;
    commands.push(
      cmd.reportMeta(META_HOST, `${hostLabel} (ssh)`, { icon: 'network', color: '#F59E0B' }),
    );

    // Report the actual remote cwd
    if (event.cwd) {
      commands.push(
        cmd.reportMeta(META_REMOTE_CWD, event.cwd, { icon: 'folder', color: '#6B7280' }),
      );
    }

    // Log SSH info
    if (config.features.logs) {
      commands.push(
        cmd.log(`SSH session: ${hostLabel}`, { level: 'info', source: LOG_SOURCE }),
      );
    }
  } else {
    // Local session — clear any stale SSH metadata from previous session
    commands.push(cmd.clearMeta(META_HOST));
    commands.push(cmd.clearMeta(META_REMOTE_CWD));
  }

  // Model metadata removed — wastes sidebar space, already visible in Claude Code UI

  // Send all initialization commands
  socket.fireAll(commands);

  // Clean up stale state files from old sessions (background, non-blocking)
  try {
    state.cleanStale(STALE_SESSION_MS);
  } catch {
    // Non-critical
  }
}

/**
 * Handle SessionEnd — clean up state and sidebar.
 */
export async function onSessionEnd(
  event: SessionEndInput,
  ctx: HandlerContext,
): Promise<void> {
  if (ctx.isTcp) { return onSessionEndV2(event, ctx); }

  const { socket, cmd, state, config, env } = ctx;

  const commands: string[] = [];

  // Clear sidebar state (matches official cmux cleanup order)
  commands.push(cmd.clearStatus(AGENT_KEY));
  commands.push(cmd.clearAgentPid(AGENT_KEY));
  commands.push(cmd.clearNotifications());
  commands.push(cmd.clearProgress());

  if (config.features.logs) {
    commands.push(cmd.clearLog());
  }

  // Clear metadata
  commands.push(cmd.clearMeta(META_HOST));
  commands.push(cmd.clearMeta(META_REMOTE_CWD));

  socket.fireAll(commands);

  // Delete state file
  try {
    state.delete();
  } catch {
    // Non-critical
  }

  // Delete tab title file
  try {
    deleteTabTitle(event.session_id);
  } catch {
    // Non-critical
  }
}
