import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const ENV_FILE = '/tmp/cmux-fwd.env';
const FWD_SOCK = '/tmp/cmux-fwd.sock';

/**
 * Query the cmux socket for a value via socat.
 */
function querySocket(socketPath: string, command: string, timeoutMs = 500): string {
  try {
    const { execSync } = require('node:child_process');
    return execSync(
      `echo '${command}' | socat - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: timeoutMs },
    ).trim();
  } catch {
    return '';
  }
}

/**
 * Load cmux env for SSH/remote sessions.
 *
 * The handler auto-detects the forwarded socket at /tmp/cmux-fwd.sock
 * and reads workspace/surface IDs from /tmp/cmux-fwd.env (written by
 * the local machine's .() function or cmux-ssh wrapper).
 *
 * If the env file doesn't exist, falls back to querying current_workspace
 * from the socket. This targets whichever workspace is focused — not
 * ideal but better than nothing.
 */
function loadForwardedEnv(): void {
  // Already have env vars — local cmux session, nothing to do
  if (process.env['CMUX_SOCKET_PATH'] && process.env['CMUX_WORKSPACE_ID']) {
    return;
  }

  // Check for forwarded socket
  if (!existsSync(FWD_SOCK)) {
    return;
  }

  process.env['CMUX_SOCKET_PATH'] = FWD_SOCK;

  // Load env file (contains workspace/surface IDs written by local machine)
  if (existsSync(ENV_FILE)) {
    try {
      const content = readFileSync(ENV_FILE, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^export\s+(\w+)=(.+)$/);
        if (match) {
          const [, key, value] = match;
          if (value && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    } catch {}
  }

  // Validate workspace ID exists in cmux
  if (process.env['CMUX_WORKSPACE_ID']) {
    const check = querySocket(FWD_SOCK, `sidebar_state --tab=${process.env['CMUX_WORKSPACE_ID']}`);
    if (check.startsWith('ERROR') || check.includes('Tab not found')) {
      // Stale — clear it so we fall through to discovery
      delete process.env['CMUX_WORKSPACE_ID'];
    }
  }

  // Last resort: query current_workspace (returns focused workspace)
  if (!process.env['CMUX_WORKSPACE_ID']) {
    const wid = querySocket(FWD_SOCK, 'current_workspace');
    if (wid && !wid.startsWith('ERROR')) {
      process.env['CMUX_WORKSPACE_ID'] = wid;
    }
  }
}

// Load on module import
loadForwardedEnv();

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
