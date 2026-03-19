/**
 * Check whether cmux environment variables are present,
 * indicating we are running inside a cmux-managed terminal.
 */
export function isCmuxAvailable(): boolean {
  return !!(process.env['CMUX_SOCKET_PATH'] && process.env['CMUX_WORKSPACE_ID']);
}

export interface CmuxEnv {
  socketPath: string;
  workspaceId: string;
  surfaceId: string;
}

/**
 * Read cmux environment variables.
 * Returns empty strings for missing values — callers should
 * check `isCmuxAvailable()` first.
 */
export function getCmuxEnv(): CmuxEnv {
  return {
    socketPath: process.env['CMUX_SOCKET_PATH'] ?? '',
    workspaceId: process.env['CMUX_WORKSPACE_ID'] ?? '',
    surfaceId: process.env['CMUX_SURFACE_ID'] ?? '',
  };
}

/**
 * Path to the cmux CLI binary.
 * Defaults to 'cmux' (expects it on PATH).
 */
export const CMUX_BIN: string = process.env['CMUX_BIN'] ?? 'cmux';
