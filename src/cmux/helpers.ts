/**
 * Sidebar command helpers — eliminates duplicated status update and
 * notification patterns across event handlers.
 */

import type { CmuxSocket } from './socket.js';
import type { CmuxCommands } from './commands.js';
import type { CmuxEnv } from '../util/env.js';
import type { StatusPhase } from '../state/types.js';
import { STATUS_DISPLAY, formatStatusValue } from '../features/status.js';
import { AGENT_KEY, NOTIFICATION_TITLE } from '../constants.js';

/** Fire a status update immediately (fire-and-forget). */
export function fireStatus(
  socket: CmuxSocket,
  cmd: CmuxCommands,
  phase: StatusPhase,
  detail?: string,
  agentCount?: number,
): void {
  const d = STATUS_DISPLAY[phase];
  socket.fire(cmd.setStatus(AGENT_KEY, formatStatusValue(phase, detail, agentCount), {
    icon: d.icon,
    color: d.color,
  }));
}

/** Build a status command string for batching into fireAll(). */
export function statusCmd(
  cmd: CmuxCommands,
  phase: StatusPhase,
  detail?: string,
  agentCount?: number,
): string {
  const d = STATUS_DISPLAY[phase];
  return cmd.setStatus(AGENT_KEY, formatStatusValue(phase, detail, agentCount), {
    icon: d.icon,
    color: d.color,
  });
}

/** Send notification only when the user is NOT focused on this workspace. */
export async function notifyIfUnfocused(
  socket: CmuxSocket,
  cmd: CmuxCommands,
  env: CmuxEnv,
  subtitle: string,
  body: string,
): Promise<void> {
  const focused = await socket.isFocused(env.workspaceId);
  if (!focused) {
    socket.fire(cmd.notifyTarget(env.workspaceId, env.surfaceId, NOTIFICATION_TITLE, subtitle, body));
  }
}
