/**
 * Miscellaneous lifecycle handlers: PreCompact, PostCompact, TaskCompleted, WorktreeCreate.
 *
 * These are lightweight event handlers that primarily log sidebar entries
 * and update status during context compaction.
 */

import type { PreCompactInput, PostCompactInput, TaskCompletedInput, WorktreeCreateInput } from './types.js';
import type { HandlerContext } from './context.js';
import type { StatusPhase } from '../state/types.js';
import { fireStatus } from '../cmux/helpers.js';
import { AGENT_KEY } from '../constants.js';
import { STATUS_DISPLAY } from '../features/status.js';
import { LOG_SOURCE } from '../features/logger.js';

/**
 * Handle PreCompact — log compaction start, save current status, set "compacting".
 */
export async function onPreCompact(
  event: PreCompactInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;

  if (config.features.logs) {
    socket.fire(
      cmd.log('Compacting context...', {
        level: 'progress',
        source: LOG_SOURCE,
      }),
    );
  }

  // Save current status before overwriting with 'compacting'
  state.withState((s) => {
    s.preCompactStatus = s.currentStatus;
  });

  if (config.features.statusPills) {
    fireStatus(socket, cmd, 'compacting');
  }
}

/**
 * Handle PostCompact — log compaction complete, restore previous status.
 *
 * Previously always reverted to 'working', which overwrote 'done' (priority 30)
 * when compaction happened between turns or from subagent activity.
 */
export async function onPostCompact(
  event: PostCompactInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;

  if (config.features.logs) {
    socket.fire(
      cmd.log('Context compacted', {
        level: 'success',
        source: LOG_SOURCE,
      }),
    );
  }

  // Restore the status that was active before compaction
  const s = state.read();
  const restoreTo: StatusPhase = s.preCompactStatus && s.preCompactStatus in STATUS_DISPLAY
    ? s.preCompactStatus
    : (s.isInTurn ? 'working' : 'done');

  // Clear saved pre-compact status
  state.withState((st) => {
    st.preCompactStatus = null;
    st.currentStatus = restoreTo;
  });

  if (config.features.statusPills) {
    fireStatus(socket, cmd, restoreTo);
  }
}

/**
 * Handle TaskCompleted — log subagent task completion.
 * This fires when a subagent task completes, NOT when the main session finishes.
 * Uses 'info' level (not 'success') to avoid confusion with main session "Done".
 */
export async function onTaskCompleted(
  event: TaskCompletedInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, config } = ctx;

  if (!config.features.logs) return;

  socket.fire(
    cmd.log('Subagent task completed', {
      level: 'info',
      source: LOG_SOURCE,
    }),
  );
}

/**
 * Handle WorktreeCreate — log worktree creation.
 */
export async function onWorktreeCreate(
  event: WorktreeCreateInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, config } = ctx;

  if (!config.features.logs) return;

  socket.fire(
    cmd.log('Worktree created', {
      level: 'info',
      source: LOG_SOURCE,
    }),
  );
}
