/**
 * Sidebar log formatting — translates tool calls and responses into
 * concise, human-readable log entries for the cmux sidebar.
 */

import { basename } from 'node:path';

/** Source identifier for all Claude Code log entries */
export const LOG_SOURCE = 'claude';

/**
 * Format a tool call + optional response into a single log line.
 *
 * Each tool type has its own formatting to surface the most useful info:
 *   Edit/Write: file path
 *   Bash: command (truncated) + exit code
 *   Read: file path
 *   Grep: pattern + match count
 *   Glob: pattern + file count
 *   Agent: type + description
 *   MCP: tool name
 */
export function formatToolLog(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse?: unknown,
): string {
  try {
    switch (toolName) {
      case 'Edit':
      case 'Write': {
        const filePath = toolInput['file_path'];
        if (typeof filePath === 'string') {
          return `${toolName}: ${shortenPath(filePath)}`;
        }
        return toolName;
      }

      case 'Bash': {
        const command = toolInput['command'];
        if (typeof command !== 'string') return 'Bash';
        const truncated = truncate(command.trim(), 40);
        const exitCode = extractExitCode(toolResponse);
        if (exitCode !== null) {
          return `Bash: \`${truncated}\` → exit ${exitCode}`;
        }
        return `Bash: \`${truncated}\``;
      }

      case 'Read': {
        const filePath = toolInput['file_path'];
        if (typeof filePath === 'string') {
          return `Read: ${shortenPath(filePath)}`;
        }
        return 'Read';
      }

      case 'Grep': {
        const pattern = toolInput['pattern'];
        const patternStr = typeof pattern === 'string' ? `"${truncate(pattern, 25)}"` : '';
        const matchCount = extractMatchCount(toolResponse);
        if (matchCount !== null && patternStr) {
          return `Grep: ${patternStr} → ${matchCount} matches`;
        }
        return patternStr ? `Grep: ${patternStr}` : 'Grep';
      }

      case 'Glob': {
        const pattern = toolInput['pattern'];
        const patternStr = typeof pattern === 'string' ? truncate(pattern, 25) : '';
        const fileCount = extractFileCount(toolResponse);
        if (fileCount !== null && patternStr) {
          return `Glob: ${patternStr} → ${fileCount} files`;
        }
        return patternStr ? `Glob: ${patternStr}` : 'Glob';
      }

      case 'Agent': {
        const agentType = (toolInput['type'] ?? toolInput['agent_type']) as string | undefined;
        const desc = toolInput['description'] as string | undefined;
        if (agentType && desc) {
          return `Agent: ${agentType} — ${truncate(desc, 40)}`;
        }
        if (agentType) {
          return `Agent: ${agentType}`;
        }
        return 'Agent';
      }

      default: {
        if (toolName.startsWith('mcp__')) {
          const parts = toolName.split('__');
          const mcpTool = parts.length >= 3 ? parts[parts.length - 1] : toolName;
          return `MCP: ${mcpTool}`;
        }
        return toolName;
      }
    }
  } catch {
    return toolName;
  }
}

/**
 * Determine the log level for a tool event.
 *   - 'warning' for failures
 *   - 'success' for TaskCompleted
 *   - 'info' for everything else
 */
export function getLogLevel(toolName: string, isFailure: boolean): string {
  if (isFailure) return 'warning';
  if (toolName === 'TaskCompleted') return 'success';
  return 'info';
}

// ---- Helpers ----

function shortenPath(filePath: string): string {
  if (!filePath) return '(unknown)';
  // Show last 2 segments for context: "src/handler.ts"
  const parts = filePath.split('/');
  if (parts.length <= 2) return filePath;
  return parts.slice(-2).join('/');
}

function truncate(str: string, maxLen: number): string {
  const cleaned = str.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + '\u2026';
}

function extractExitCode(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const resp = response as Record<string, unknown>;
  if (typeof resp['exitCode'] === 'number') return resp['exitCode'];
  if (typeof resp['exit_code'] === 'number') return resp['exit_code'];
  // Try to extract from string content
  if (typeof resp['content'] === 'string') {
    const match = resp['content'].match(/exit code[:\s]*(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function extractMatchCount(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const resp = response as Record<string, unknown>;
  if (typeof resp['matchCount'] === 'number') return resp['matchCount'];
  if (typeof resp['match_count'] === 'number') return resp['match_count'];
  // Try to count from result lines
  if (typeof resp['content'] === 'string') {
    const lines = resp['content'].split('\n').filter((l: string) => l.trim());
    if (lines.length > 0) return lines.length;
  }
  return null;
}

function extractFileCount(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const resp = response as Record<string, unknown>;
  if (typeof resp['fileCount'] === 'number') return resp['fileCount'];
  if (typeof resp['file_count'] === 'number') return resp['file_count'];
  if (Array.isArray(resp['files'])) return resp['files'].length;
  if (typeof resp['content'] === 'string') {
    const lines = resp['content'].split('\n').filter((l: string) => l.trim());
    if (lines.length > 0) return lines.length;
  }
  return null;
}
