/**
 * Notification and permission request handlers.
 *
 * Notification: Forward Claude Code notifications to cmux desktop notifications.
 * PermissionRequest: Update status to "Waiting" and optionally notify.
 */

import type { NotificationInput, PermissionRequestInput } from './types.js';
import type { HandlerContext } from './context.js';
import { fireStatus, notifyIfUnfocused } from '../cmux/helpers.js';
import { AGENT_KEY, NOTIFICATION_TITLE } from '../constants.js';
import { LOG_SOURCE } from '../features/logger.js';

/**
 * Handle Notification — forward to cmux desktop notification.
 * Uses notifyIfUnfocused for workspace-specific delivery (like official cmux hooks).
 *
 * IMPORTANT: This handler NEVER changes the sidebar status pill.
 * Only PermissionRequest should set "Waiting" / "Needs input" status.
 * Notifications fire for many reasons (subagent completions, informational
 * messages) and keyword-matching them caused false "Needs input" stalls.
 */
export async function onNotification(
  event: NotificationInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, config, env } = ctx;

  if (!config.features.notifications) return;

  const title = event.title ?? NOTIFICATION_TITLE;
  const message = event.message ?? '';

  await notifyIfUnfocused(socket, cmd, env, '', message);
}

/**
 * Handle PermissionRequest — set status to "Waiting" and optionally
 * send a desktop notification to alert the user.
 */
export async function onPermissionRequest(
  event: PermissionRequestInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config, env } = ctx;

  const toolName = event.tool_name ?? 'unknown';

  // Update state
  state.withState((s) => {
    s.currentStatus = 'waiting';
  });

  // Set status to Waiting
  if (config.features.statusPills) {
    fireStatus(socket, cmd, 'waiting', toolName);
  }

  // Mark tab as unread so the user sees the permission request
  socket.fire(cmd.markUnread());

  // Log permission request
  if (config.features.logs) {
    socket.fire(
      cmd.log(`Permission requested: ${toolName}`, {
        level: 'warning',
        source: LOG_SOURCE,
      }),
    );
  }

  // Send targeted desktop notification if configured
  if (config.features.notifications && config.notifications.onPermission) {
    await notifyIfUnfocused(socket, cmd, env, 'Permission Required', `Tool: ${toolName}`);
  }
}
