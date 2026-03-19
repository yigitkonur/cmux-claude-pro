import { basename } from 'node:path';

/**
 * Format a tool name + input into a concise human-readable label
 * for display in the cmux sidebar.
 */
export function formatToolLabel(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'Edit':
    case 'Write': {
      const filePath = toolInput['file_path'];
      if (typeof filePath === 'string') {
        return `${toolName}: ${basename(filePath)}`;
      }
      return toolName;
    }

    case 'Bash': {
      const command = toolInput['command'];
      if (typeof command === 'string') {
        const trimmed = command.trim();
        const label = trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed;
        return `Bash: ${label}`;
      }
      return 'Bash';
    }

    case 'Read': {
      const filePath = toolInput['file_path'];
      if (typeof filePath === 'string') {
        return `Read: ${basename(filePath)}`;
      }
      return 'Read';
    }

    case 'Grep': {
      const pattern = toolInput['pattern'];
      if (typeof pattern === 'string') {
        const trimmed = pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern;
        return `Grep: ${trimmed}`;
      }
      return 'Grep';
    }

    case 'Glob': {
      const pattern = toolInput['pattern'];
      if (typeof pattern === 'string') {
        const trimmed = pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern;
        return `Glob: ${trimmed}`;
      }
      return 'Glob';
    }

    case 'Agent': {
      const agentType = toolInput['type'] ?? toolInput['agent_type'];
      if (typeof agentType === 'string') {
        return `Agent: ${agentType}`;
      }
      return 'Agent';
    }

    default: {
      // MCP tools: mcp__server__tool -> "MCP: tool"
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        const mcpTool = parts.length >= 3 ? parts[parts.length - 1] : toolName;
        return `MCP: ${mcpTool}`;
      }
      return toolName;
    }
  }
}
