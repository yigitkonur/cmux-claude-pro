/**
 * Subagent lifecycle handlers: SubagentStart and SubagentStop.
 *
 * These track the number of active subagents and update the sidebar
 * status to reflect agent activity.
 */

import type { SubagentStartInput, SubagentStopInput } from './types.js';
import type { HandlerContext } from './context.js';
import { fireStatus } from '../cmux/helpers.js';
import { AGENT_KEY } from '../constants.js';
import { LOG_SOURCE } from '../features/logger.js';

/**
 * Handle SubagentStart — increment agent count and update sidebar.
 */
export async function onSubagentStart(
  event: SubagentStartInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;

  if (!config.features.subagentTracking) return;

  const agentType = event.agent_type ?? 'agent';

  state.withState((s) => {
    s.activeSubagents++;
    s.totalSubagentsSpawned++;
  });

  // Log the agent spawn
  if (config.features.logs) {
    socket.fire(
      cmd.log(`Agent spawned: ${agentType}`, {
        level: 'info',
        source: LOG_SOURCE,
      }),
    );
  }

  // Update status with agent count if currently working
  if (config.features.statusPills) {
    const s = state.read();
    if (s.currentStatus === 'working') {
      fireStatus(socket, cmd, 'working', undefined, s.activeSubagents);
    }
  }
}

/**
 * Handle SubagentStop — decrement agent count and log completion.
 */
export async function onSubagentStop(
  event: SubagentStopInput,
  ctx: HandlerContext,
): Promise<void> {
  const { socket, cmd, state, config } = ctx;

  if (!config.features.subagentTracking) return;

  const agentType = event.agent_type ?? 'agent';

  state.withState((s) => {
    s.activeSubagents = Math.max(0, s.activeSubagents - 1);
  });

  // Log agent completion (info level, not success — avoids confusion with main "Done")
  if (config.features.logs) {
    socket.fire(
      cmd.log(`Subagent done: ${agentType}`, {
        level: 'info',
        source: LOG_SOURCE,
      }),
    );
  }
}
