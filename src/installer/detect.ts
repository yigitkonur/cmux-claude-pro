/**
 * Environment detection — cmux, Claude Code, and Node.js.
 *
 * Probes the runtime environment to determine whether cc-cmux can
 * function and reports what is already configured.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CmuxDetection {
  available: boolean;
  version: string | null;
  socketPath: string | null;
  socketOk: boolean;
  latencyMs: number | null;
}

export interface ClaudeDetection {
  settingsPath: string;
  settingsExists: boolean;
  existingHooks: string[];
}

export interface NodeDetection {
  version: string;
  path: string;
}

// ---------------------------------------------------------------------------
// cmux detection
// ---------------------------------------------------------------------------

export function detectCmux(): CmuxDetection {
  const result: CmuxDetection = {
    available: false,
    version: null,
    socketPath: null,
    socketOk: false,
    latencyMs: null,
  };

  // Check socket path from environment
  const socketFromEnv = process.env['CMUX_SOCKET_PATH'] ?? null;

  // Also check default path
  const defaultSocket = join(
    homedir(),
    'Library',
    'Application Support',
    'cmux',
    'cmux.sock',
  );

  result.socketPath = socketFromEnv ?? (existsSync(defaultSocket) ? defaultSocket : null);

  // Try to get cmux version
  try {
    const version = execSync('cmux version 2>/dev/null || /Applications/cmux.app/Contents/Resources/bin/cmux version 2>/dev/null', {
      timeout: 3000,
      encoding: 'utf-8',
    }).trim();
    if (version) {
      result.version = version;
      result.available = true;
    }
  } catch {
    // cmux binary not found
  }

  // If no version but socket exists, still mark as available
  if (!result.available && result.socketPath && existsSync(result.socketPath)) {
    result.available = true;
  }

  // Ping socket to measure latency
  if (result.socketPath && existsSync(result.socketPath)) {
    try {
      const start = performance.now();
      const socatBin = existsSync('/opt/homebrew/bin/socat')
        ? '/opt/homebrew/bin/socat'
        : 'socat';
      execSync(
        `echo 'ping' | ${socatBin} -T1 - UNIX-CONNECT:"${result.socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      );
      const elapsed = performance.now() - start;
      result.socketOk = true;
      result.latencyMs = Math.round(elapsed * 100) / 100;
    } catch {
      // Socket not responding
      result.socketOk = false;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Claude Code detection
// ---------------------------------------------------------------------------

export function detectClaude(): ClaudeDetection {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const settingsExists = existsSync(settingsPath);
  const existingHooks: string[] = [];

  if (settingsExists) {
    try {
      const raw = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw);
      if (settings.hooks && typeof settings.hooks === 'object') {
        for (const eventName of Object.keys(settings.hooks)) {
          existingHooks.push(eventName);
        }
      }
    } catch {
      // Settings file is corrupt or unreadable
    }
  }

  return { settingsPath, settingsExists, existingHooks };
}

// ---------------------------------------------------------------------------
// Node.js detection
// ---------------------------------------------------------------------------

export function detectNode(): NodeDetection {
  return {
    version: process.version,
    path: process.execPath,
  };
}
