/**
 * Conversation flow handlers: UserPromptSubmit, Stop, StopFailure.
 *
 * These track the turn lifecycle — when the user sends a prompt,
 * when Claude finishes responding, and when it fails.
 */

import type { CmuxSocket } from '../cmux/socket.js';
import type { CmuxCommands } from '../cmux/commands.js';
import type { StateManager } from '../state/manager.js';
import type { CcCmuxConfig } from '../config/types.js';
import type { CmuxEnv } from '../util/env.js';
import type { UserPromptSubmitInput, StopInput, StopFailureInput } from './types.js';
import { STATUS_DISPLAY, formatStatusValue } from '../features/status.js';
import { LOG_SOURCE } from '../features/logger.js';
import { spawnTabTitleWorker, restoreTabTitle } from '../features/tab-title.js';
import { CMUX_BIN } from '../util/env.js';

/**
 * Handle UserPromptSubmit — transition to "Thinking" status, reset tool count.
 */
export async function onUserPromptSubmit(
  event: UserPromptSubmitInput,
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
): Promise<void> {
  state.withState((s) => {
    // Save previous turn's tool count to history (keep last 5)
    if (s.toolUseCount > 0) {
      s.turnToolCounts.push(s.toolUseCount);
      if (s.turnToolCounts.length > 5) {
        s.turnToolCounts = s.turnToolCounts.slice(-5);
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

  // Always set status to Thinking — clears any stuck "Needs input" / "Waiting"
  const display = STATUS_DISPLAY.thinking;
  commands.push(
    cmd.setStatus('claude_code', formatStatusValue('thinking'), {
      icon: display.icon,
      color: display.color,
    }),
  );

  // Clear progress for fresh start
  if (config.features.progress) {
    commands.push(cmd.clearProgress());
  }

  if (commands.length > 0) {
    try {
      socket.fireAll(commands);
    } catch {
      // Non-critical
    }
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
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
  env: CmuxEnv,
): Promise<void> {
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
  const display = STATUS_DISPLAY.done;
  commands.push(
    cmd.setStatus('claude_code', formatStatusValue('done'), {
      icon: display.icon,
      color: display.color,
    }),
  );

  // Set progress to 100%
  if (config.features.progress) {
    commands.push(cmd.setProgress(1.0, 'Complete'));
  }

  try {
    socket.fireAll(commands);
  } catch {
    // Non-critical
  }

  // Send targeted desktop notification if configured (like official cmux hooks)
  if (config.features.notifications && config.notifications.onStop) {
    const lastMsg = (event.last_assistant_message || 'Response complete').slice(0, 100);
    try {
      socket.fire(cmd.notifyTarget(env.workspaceId, env.surfaceId, 'Claude Code', 'Done', lastMsg));
    } catch {
      // Non-critical
    }
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
  socket: CmuxSocket,
  cmd: CmuxCommands,
  state: StateManager,
  config: CcCmuxConfig,
  env: CmuxEnv,
): Promise<void> {
  state.withState((s) => {
    s.currentStatus = 'error';
    s.isInTurn = false;
  });

  const commands: string[] = [];

  // Set status to Error
  if (config.features.statusPills) {
    const display = STATUS_DISPLAY.error;
    commands.push(
      cmd.setStatus('claude_code', formatStatusValue('error'), {
        icon: display.icon,
        color: display.color,
      }),
    );
  }

  if (commands.length > 0) {
    try {
      socket.fireAll(commands);
    } catch {
      // Non-critical
    }
  }

  // Send targeted error notification if configured
  if (config.features.notifications && config.notifications.onError) {
    try {
      socket.fire(cmd.notifyTarget(env.workspaceId, env.surfaceId, 'Claude Code', 'Error', 'Response failed'));
    } catch {
      // Non-critical
    }
  }
}
