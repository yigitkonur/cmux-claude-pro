/**
 * Tab title management — save/load/restore tab titles and spawn the
 * background AI title generation worker.
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import type { ToolHistoryEntry } from '../state/types.js';

const TITLE_DIR = '/tmp/cc-cmux';

function titlePath(sessionId: string): string {
  return join(TITLE_DIR, `${sessionId}.title`);
}

/**
 * Persist the current tab title so it can be restored after cmux operations.
 */
export function saveTabTitle(sessionId: string, title: string): void {
  try {
    mkdirSync(TITLE_DIR, { recursive: true });
    writeFileSync(titlePath(sessionId), title, 'utf-8');
  } catch {
    // Non-critical
  }
}

/**
 * Load a previously saved tab title. Returns null if not found.
 */
export function loadTabTitle(sessionId: string): string | null {
  try {
    return readFileSync(titlePath(sessionId), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Delete the saved tab title file.
 */
export function deleteTabTitle(sessionId: string): void {
  try {
    unlinkSync(titlePath(sessionId));
  } catch {
    // Ignore — file may not exist
  }
}

/**
 * Spawn the tab-title-worker as a fully detached background process.
 * The worker uses AI to generate a concise title from the tool history
 * and then updates the cmux tab title via CLI.
 *
 * This must be detached so the main handler can exit immediately.
 */
export function spawnTabTitleWorker(
  sessionId: string,
  surfaceId: string,
  socketPath: string,
  toolHistory: ToolHistoryEntry[],
): void {
  try {
    // Write tool history to a temp file for the worker to read
    const historyFile = join(TITLE_DIR, `${sessionId}.history.json`);
    mkdirSync(TITLE_DIR, { recursive: true });
    writeFileSync(historyFile, JSON.stringify(toolHistory), 'utf-8');

    // Resolve the worker script path — bundled as tab-title-worker.cjs next to handler.cjs
    const workerPath = join(__dirname, 'tab-title-worker.cjs');

    const child = spawn(
      process.execPath,
      [workerPath, sessionId, surfaceId, socketPath],
      {
        stdio: 'ignore',
        detached: true,
        env: {
          ...process.env,
          // Prevent recursive hook invocation when the worker calls claude
          CLAUDECODE: '',
          CLAUDE_CODE_ENTRYPOINT: '',
        },
      },
    );

    // Unref so the parent can exit immediately
    child.unref();
  } catch {
    // Non-critical — title generation is best-effort
  }
}

/**
 * Restore a previously saved tab title via the cmux CLI.
 * Runs after a 500ms delay in the background so it doesn't block.
 */
export function restoreTabTitle(
  sessionId: string,
  surfaceId: string,
  cmuxBin: string,
): void {
  try {
    const title = loadTabTitle(sessionId);
    if (!title) return;

    // Background: delay 500ms then restore
    const child = spawn(
      '/bin/sh',
      ['-c', `sleep 0.5 && ${cmuxBin} surface rename "${surfaceId}" "${title.replace(/"/g, '\\"')}"`],
      {
        stdio: 'ignore',
        detached: true,
      },
    );
    child.unref();
  } catch {
    // Non-critical
  }
}
