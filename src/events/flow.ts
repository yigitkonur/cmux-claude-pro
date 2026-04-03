/**
 * Conversation flow handlers: UserPromptSubmit, Stop, StopFailure.
 *
 * These track the turn lifecycle — when the user sends a prompt,
 * when Claude finishes responding, and when it fails.
 */

import type { HandlerContext } from './context.js';
import type { UserPromptSubmitInput, StopInput, StopFailureInput } from './types.js';
import { LOG_SOURCE } from '../features/logger.js';
import { spawnTabTitleWorker, restoreTabTitle } from '../features/tab-title.js';
import { CMUX_BIN } from '../util/env.js';
import { statusCmd, notifyIfUnfocused } from '../cmux/helpers.js';
import { TURN_HISTORY_MAX } from '../constants.js';

/**
 * Handle UserPromptSubmit — transition to "Thinking" status, reset tool count.
 */
export async function onUserPromptSubmit(
  event: UserPromptSubmitInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config, env } = ctx;

  state.withState((s) => {
    // Save previous turn's tool count to history (keep last TURN_HISTORY_MAX)
    if (s.toolUseCount > 0) {
      s.turnToolCounts.push(s.toolUseCount);
      if (s.turnToolCounts.length > TURN_HISTORY_MAX) {
        s.turnToolCounts = s.turnToolCounts.slice(-TURN_HISTORY_MAX);
      }
    }

    // Reset for new turn
    s.toolUseCount = 0;
    s.currentStatus = 'thinking';
    s.isInTurn = true;
    s.turnNumber++;
    s.turnStartTime = Date.now();
  });

  const commands: string[] = [];

  // Clear stale notifications from previous turn (matches official cmux behavior)
  commands.push(cmd.clearNotifications());

  // Mark notifications as read
  commands.push(cmd.markRead());

  // Always set status to Thinking — clears any stuck "Needs input" / "Waiting"
  commands.push(statusCmd(cmd, 'thinking'));

  // Clear progress for fresh start
  if (config.features.progress) {
    commands.push(cmd.clearProgress());
  }

  if (commands.length > 0) {
    socket.fireAll(commands);
  }

  // Restore tab title after a short delay (background, non-blocking)
  if (config.features.tabTitles) {
    try {
      restoreTabTitle(event.session_id, '', CMUX_BIN);
    } catch {
      // Non-critical
    }
  }
}

/**
 * Handle Stop — transition to "Done", notify, and optionally generate AI tab title.
 */
export async function onStop(
  event: StopInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config, env } = ctx;

  const s = state.read();

  // Update state
  state.withState((st) => {
    st.currentStatus = 'done';
    st.isInTurn = false;
  });

  const commands: string[] = [];

  // Always clear notifications and set Done — prevents "Needs input" from sticking
  commands.push(cmd.clearNotifications());

  // Always set status to Done (not gated by statusPills — this is a cleanup)
  commands.push(statusCmd(cmd, 'done'));

  // Set progress to 100%
  if (config.features.progress) {
    commands.push(cmd.setProgress(1.0, 'Complete'));
  }

  socket.fireAll(commands);

  // Send targeted desktop notification if configured (like official cmux hooks)
  if (config.features.notifications && config.notifications.onStop) {
    const lastMsg = (event.last_assistant_message || 'Response complete').slice(0, 100);
    await notifyIfUnfocused(socket, cmd, env, 'Done', lastMsg);
  }

  // Spawn AI tab title worker if enabled
  if (config.features.tabTitles && config.tabTitle.style === 'ai') {
    try {
      spawnTabTitleWorker(
        event.session_id,
        env.surfaceId,
        env.socketPath,
        s.toolHistory,
      );
    } catch {
      // Non-critical
    }
  }

  // Progress stays at 100% "Complete" until the next UserPromptSubmit clears it.
  // Previously tried to clear after 3s via a detached child process, but the
  // parent exits in 50ms so the callback never fires. The 100% "Complete" state
  // is not harmful — it correctly shows the turn is done.
}

/**
 * Handle StopFailure — transition to "Error" status and notify.
 */
export async function onStopFailure(
  event: StopFailureInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config, env } = ctx;

  state.withState((s) => {
    s.currentStatus = 'error';
    s.isInTurn = false;
  });

  const commands: string[] = [];

  // Set status to Error
  if (config.features.statusPills) {
    commands.push(statusCmd(cmd, 'error'));
  }

  if (commands.length > 0) {
    socket.fireAll(commands);
  }

  // Send targeted error notification if configured
  if (config.features.notifications && config.notifications.onError) {
    await notifyIfUnfocused(socket, cmd, env, 'Error', 'Response failed');
  }
}
