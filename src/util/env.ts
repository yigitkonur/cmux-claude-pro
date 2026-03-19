import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';

const ENV_FILE = '/tmp/cmux-fwd.env';
const FWD_SOCK = '/tmp/cmux-fwd.sock';

/**
 * Query the cmux socket synchronously for a value.
 * Used to auto-discover workspace ID when env file is missing or stale.
 */
function querySocket(socketPath: string, command: string, timeoutMs = 500): string {
  try {
    const { execSync } = require('node:child_process');
    const result = execSync(
      `echo '${command}' | socat - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: timeoutMs },
    );
    return result.trim();
  } catch {
    return '';
  }
}

/**
 * Load cmux env for SSH/remote sessions.
 *
 * Priority:
 * 1. Env vars already set (local cmux session) → use them
 * 2. Forwarded socket + env file → load from file
 * 3. Forwarded socket + no env file → query socket for current_workspace
 * 4. Nothing available → handler will no-op
 */
function loadForwardedEnv(): void {
  // Already have env vars — local cmux session
  if (process.env['CMUX_SOCKET_PATH'] && process.env['CMUX_WORKSPACE_ID']) {
    return;
  }

  // Check for forwarded socket (SSH remote scenario)
  if (!existsSync(FWD_SOCK)) {
    return;
  }

  // Set socket path
  process.env['CMUX_SOCKET_PATH'] = FWD_SOCK;

  // Try env file first
  if (existsSync(ENV_FILE)) {
    try {
      const content = readFileSync(ENV_FILE, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^export\s+(\w+)=(.+)$/);
        if (match) {
          const [, key, value] = match;
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    } catch {
      // Best effort
    }
  }

  // If we still don't have a workspace ID, query the socket
  if (!process.env['CMUX_WORKSPACE_ID']) {
    const wid = querySocket(FWD_SOCK, 'current_workspace');
    if (wid && !wid.startsWith('ERROR')) {
      process.env['CMUX_WORKSPACE_ID'] = wid;
      // Persist for next invocation (avoids repeated socket queries)
      try {
        writeFileSync(ENV_FILE,
          `export CMUX_WORKSPACE_ID=${wid}\nexport CMUX_SURFACE_ID=${process.env['CMUX_SURFACE_ID'] || ''}\n`
        );
      } catch {}
    }
  }

  // Validate: check that the workspace ID is recognized by cmux
  if (process.env['CMUX_WORKSPACE_ID']) {
    const check = querySocket(FWD_SOCK, `sidebar_state --tab=${process.env['CMUX_WORKSPACE_ID']}`);
    if (check.startsWith('ERROR') || check.includes('Tab not found')) {
      // Stale workspace ID — fall back to current_workspace
      const wid = querySocket(FWD_SOCK, 'current_workspace');
      if (wid && !wid.startsWith('ERROR')) {
        process.env['CMUX_WORKSPACE_ID'] = wid;
        try {
          writeFileSync(ENV_FILE,
            `export CMUX_WORKSPACE_ID=${wid}\nexport CMUX_SURFACE_ID=${process.env['CMUX_SURFACE_ID'] || ''}\n`
          );
        } catch {}
      }
    }
  }
}

// Load on module import
loadForwardedEnv();

/**
 * Check whether cmux is reachable.
 */
export function isCmuxAvailable(): boolean {
  return !!(process.env['CMUX_SOCKET_PATH'] && process.env['CMUX_WORKSPACE_ID']);
}

export interface CmuxEnv {
  socketPath: string;
  workspaceId: string;
  surfaceId: string;
}

export function getCmuxEnv(): CmuxEnv {
  return {
    socketPath: process.env['CMUX_SOCKET_PATH'] ?? '',
    workspaceId: process.env['CMUX_WORKSPACE_ID'] ?? '',
    surfaceId: process.env['CMUX_SURFACE_ID'] ?? '',
  };
}

export const CMUX_BIN: string = process.env['CMUX_BIN'] ?? 'cmux';
