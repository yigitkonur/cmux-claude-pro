/** Centralized constants — single source of truth for magic strings and numbers. */

// Status key and notification title
export const AGENT_KEY = 'claude_code';
export const NOTIFICATION_TITLE = 'Claude Code';

// Metadata keys used in session.ts for SSH detection
export const META_HOST = 'host';
export const META_REMOTE_CWD = 'remote_cwd';

// Limits
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TURN_HISTORY_MAX = 5;
export const TOOL_HISTORY_MAX = 15;
export const RESPONSE_TRUNCATE = 1000;
