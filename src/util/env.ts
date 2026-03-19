import { readFileSync, existsSync } from 'node:fs';

const FWD_SOCK = '/tmp/cmux-fwd.sock';

/**
 * Query the cmux socket synchronously via socat.
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
 * For SSH: the socket is forwarded to /tmp/cmux-fwd.sock.
 * We query current_workspace directly — this always returns the
 * focused workspace, which is the SSH tab when the user is looking at it.
 *
 * The env file is NOT used for workspace ID because it goes stale
 * every time you open a new tab or switch workspaces.
 */
function loadForwardedEnv(): void {
  // Already have both env vars — local cmux session
  if (process.env['CMUX_SOCKET_PATH'] && process.env['CMUX_WORKSPACE_ID']) {
    return;
  }

  // Check for forwarded socket
  if (!existsSync(FWD_SOCK)) {
    return;
  }

  // Verify socket is alive
  const pong = querySocket(FWD_SOCK, 'ping');
  if (pong !== 'PONG') {
    return;
  }

  process.env['CMUX_SOCKET_PATH'] = FWD_SOCK;

  // Always query current_workspace — it's the only reliable source
  const wid = querySocket(FWD_SOCK, 'current_workspace');
  if (wid && !wid.startsWith('ERROR')) {
    process.env['CMUX_WORKSPACE_ID'] = wid;
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
