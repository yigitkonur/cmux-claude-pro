/**
 * Miscellaneous lifecycle handlers: PreCompact, PostCompact, TaskCompleted, WorktreeCreate.
 *
 * These are lightweight event handlers that primarily log sidebar entries
 * and update status during context compaction.
 */

import type { CmuxSocket } from '../cmux/socket.js';
import type { CmuxCommands } from '../cmux/commands.js';
import type { CcCmuxConfig } from '../config/types.js';
import { STATUS_DISPLAY, formatStatusValue } from '../features/status.js';
import { LOG_SOURCE } from '../features/logger.js';

/**
 * Handle PreCompact — log compaction start and set status to "compacting".
 */
export async function onPreCompact(
  socket: CmuxSocket,
  cmd: CmuxCommands,
  config: CcCmuxConfig,
): Promise<void> {
  if (config.features.logs) {
    try {
      socket.fire(
        cmd.log('Compacting context...', {
          level: 'progress',
          source: LOG_SOURCE,
        }),
      );
    } catch {
      // Non-critical
    }
  }

  if (config.features.statusPills) {
    const display = STATUS_DISPLAY.compacting;
    try {
      socket.fire(
        cmd.setStatus('claude_code', formatStatusValue('compacting'), {
          icon: display.icon,
          color: display.color,
        }),
      );
    } catch {
      // Non-critical
    }
  }
}

/**
 * Handle PostCompact — log compaction complete and revert status to working.
 */
export async function onPostCompact(
  socket: CmuxSocket,
  cmd: CmuxCommands,
  config: CcCmuxConfig,
): Promise<void> {
  if (config.features.logs) {
    try {
      socket.fire(
        cmd.log('Context compacted', {
          level: 'success',
          source: LOG_SOURCE,
        }),
      );
    } catch {
      // Non-critical
    }
  }

  // Revert status back to working (compaction happens mid-turn)
  if (config.features.statusPills) {
    const display = STATUS_DISPLAY.working;
    try {
      socket.fire(
        cmd.setStatus('claude_code', formatStatusValue('working'), {
          icon: display.icon,
          color: display.color,
        }),
      );
    } catch {
      // Non-critical
    }
  }
}

/**
 * Handle TaskCompleted — log task completion.
 */
export async function onTaskCompleted(
  event: { session_id: string; [key: string]: unknown },
  socket: CmuxSocket,
  cmd: CmuxCommands,
  config: CcCmuxConfig,
): Promise<void> {
  if (!config.features.logs) return;

  try {
    socket.fire(
      cmd.log('Task completed', {
        level: 'success',
        source: LOG_SOURCE,
      }),
    );
  } catch {
    // Non-critical
  }
}

/**
 * Handle WorktreeCreate — log worktree creation.
 */
export async function onWorktreeCreate(
  event: { session_id: string; path?: string; branch?: string; [key: string]: unknown },
  socket: CmuxSocket,
  cmd: CmuxCommands,
  config: CcCmuxConfig,
): Promise<void> {
  if (!config.features.logs) return;

  try {
    socket.fire(
      cmd.log('Worktree created', {
        level: 'info',
        source: LOG_SOURCE,
      }),
    );
  } catch {
    // Non-critical
  }
}
