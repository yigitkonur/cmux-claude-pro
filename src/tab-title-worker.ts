/**
 * Tab title worker — standalone background process that generates an AI-powered
 * tab title from the session's tool history.
 *
 * This is a SEPARATE entry point from handler.ts. It is spawned as a detached
 * child process by the Stop handler so the main handler can exit immediately.
 *
 * Usage: node tab-title-worker.cjs <sessionId> <surfaceId> <socketPath>
 *
 * Steps:
 *   1. Read tool history from /tmp/cc-cmux/<sessionId>.history.json
 *   2. Build a context string from the last 10 tool entries
 *   3. Call `claude -p` with haiku model to generate a 3-5 word title
 *   4. If valid, rename the cmux tab via CLI
 *   5. Save the title for later restoration
 *
 * All operations are wrapped in try/catch. Exits 0 always.
 * Environment variables CLAUDECODE and CLAUDE_CODE_ENTRYPOINT are cleared
 * by the spawning parent to prevent hook recursion.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ToolHistoryEntry } from './state/types.js';

const TITLE_DIR = '/tmp/cc-cmux';
const CMUX_BIN = process.env['CMUX_BIN'] ?? 'cmux';

async function main(): Promise<void> {
  const [sessionId, surfaceId, socketPath] = process.argv.slice(2);

  if (!sessionId || !surfaceId) {
    process.exit(0);
  }

  // 1. Read tool history
  let toolHistory: ToolHistoryEntry[] = [];
  try {
    const historyFile = join(TITLE_DIR, `${sessionId}.history.json`);
    const raw = readFileSync(historyFile, 'utf-8');
    toolHistory = JSON.parse(raw) as ToolHistoryEntry[];
    // Clean up the history file
    try {
      unlinkSync(historyFile);
    } catch {
      // Ignore
    }
  } catch {
    // No history available — exit
    process.exit(0);
  }

  if (toolHistory.length === 0) {
    process.exit(0);
  }

  // 2. Build context from last 10 entries
  const recentHistory = toolHistory.slice(-10);
  const context = recentHistory
    .map((entry) => entry.summary)
    .join('\n');

  if (!context.trim()) {
    process.exit(0);
  }

  // 3. Call claude to generate a title
  let title: string | null = null;
  try {
    const escapedContext = context
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/\n/g, '\\n');

    const prompt = `In 3-5 words, summarize this coding session. Return ONLY the title, no quotes, no punctuation, no explanation:\\n\\n${escapedContext}`;

    // Call claude with hooks disabled and haiku model for speed
    const result = execSync(
      `claude -p '${prompt}' --model claude-haiku-4-5-20251001`,
      {
        encoding: 'utf-8',
        timeout: 15000,
        env: {
          ...process.env,
          // Prevent hook recursion
          CLAUDECODE: '',
          CLAUDE_CODE_ENTRYPOINT: '',
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );

    const candidate = result.trim();

    // Validate: non-empty, under 40 chars, no obvious garbage
    if (candidate && candidate.length > 0 && candidate.length < 40) {
      title = candidate;
    }
  } catch {
    // AI title generation failed — exit gracefully
    process.exit(0);
  }

  if (!title) {
    process.exit(0);
  }

  // 4. Rename the cmux tab
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    execSync(
      `${CMUX_BIN} surface rename "${surfaceId}" "${escapedTitle}"`,
      {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
  } catch {
    // Rename failed — still save the title for later restoration
  }

  // 5. Save title for later restoration
  try {
    mkdirSync(TITLE_DIR, { recursive: true });
    writeFileSync(join(TITLE_DIR, `${sessionId}.title`), title, 'utf-8');
  } catch {
    // Non-critical
  }
}

main().catch(() => {
  process.exit(0);
});
