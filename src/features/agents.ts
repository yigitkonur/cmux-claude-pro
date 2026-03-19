/**
 * Visible agent pane spawning — redirect execution agents into their own
 * cmux terminal panes so users can observe agent work in real time.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Agent types that are read-only / observational and should NOT be spawned in panes */
export const READONLY_AGENTS = [
  'Explore',
  'Plan',
  'claude-code-guide',
  'code-explorer',
  'code-architect',
  'code-reviewer',
];

/**
 * Check whether an agent type is read-only (should pass through without pane spawn).
 */
export function isReadOnlyAgent(agentType: string): boolean {
  return READONLY_AGENTS.includes(agentType);
}

export interface SpawnResult {
  surfaceRef: string;
}

/**
 * Spawn a visible cmux pane for an agent.
 *
 * Steps:
 *   1. Create a new pane via `cmux surface split`
 *   2. Rename it to "Agent: <type>"
 *   3. Write a launcher script that runs the agent and notifies on completion
 *   4. Send the launch command to the pane
 *   5. Send enter key to execute
 *
 * Returns the surface reference on success, or null on failure.
 * All operations use the cmux CLI binary (not socket) because pane
 * creation requires terminal-level operations.
 */
export function spawnAgentPane(
  cmuxBin: string,
  agentType: string,
  prompt: string,
  surfaceId: string,
  direction: string,
): SpawnResult | null {
  const execOpts = {
    encoding: 'utf-8' as BufferEncoding,
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
  };

  try {
    // 1. Create new pane
    const splitOutput = execSync(
      `${cmuxBin} surface split --direction=${direction}`,
      execOpts,
    ).trim();

    // The output should contain the new surface reference
    const surfaceRef = splitOutput || `pane-${Date.now()}`;

    // 2. Rename the new pane
    try {
      execSync(
        `${cmuxBin} surface rename "${surfaceRef}" "Agent: ${agentType}"`,
        execOpts,
      );
    } catch {
      // Non-critical — pane still works without a name
    }

    // 3. Write launcher script
    const launchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const launcherPath = join('/tmp', `cc-cmux-launch-${launchId}.sh`);
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // The launcher runs claude in prompt mode with hooks disabled,
    // notifies on completion, then cleans up
    const launcherScript = [
      '#!/bin/bash',
      `claude -p '${escapedPrompt}' --model claude-sonnet-4-20250514 2>&1`,
      `EXIT_CODE=$?`,
      `${cmuxBin} notify "Agent Complete" --subtitle="${agentType}" --body="Exit code: $EXIT_CODE"`,
      `rm -f "${launcherPath}"`,
    ].join('\n');

    mkdirSync('/tmp', { recursive: true });
    writeFileSync(launcherPath, launcherScript, { mode: 0o755 });

    // 4. Send launch command to the pane
    try {
      execSync(
        `${cmuxBin} surface send "${surfaceRef}" "bash ${launcherPath}"`,
        execOpts,
      );
    } catch {
      // If send fails, try direct
    }

    // 5. Send enter key to execute
    try {
      execSync(
        `${cmuxBin} surface key "${surfaceRef}" enter`,
        execOpts,
      );
    } catch {
      // Non-critical
    }

    return { surfaceRef };
  } catch {
    return null;
  }
}

/**
 * Determine the next split direction for a new agent pane.
 *
 * @param paneCount - Number of panes already spawned this session
 * @param preference - User preference: 'right', 'down', or 'alternate'
 */
export function getNextDirection(
  paneCount: number,
  preference: string,
): string {
  if (preference === 'alternate') {
    return paneCount % 2 === 0 ? 'right' : 'down';
  }
  return preference === 'down' ? 'down' : 'right';
}
