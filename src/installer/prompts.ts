/**
 * Interactive TUI prompts using @clack/prompts.
 *
 * Guides the user through feature selection, notification preferences,
 * tab title style, and installation target.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { CmuxDetection, ClaudeDetection, NodeDetection } from './detect.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallerChoices {
  features: string[];
  notifications: { onStop: boolean; onError: boolean; onPermission: boolean };
  tabTitleStyle: 'ai' | 'directory' | 'branch';
  installTarget: 'global' | 'project' | 'project-local';
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Detection display
// ---------------------------------------------------------------------------

function showDetection(
  cmux: CmuxDetection,
  claude: ClaudeDetection,
  node: NodeDetection,
): void {
  const lines: string[] = [];

  // cmux
  if (cmux.available) {
    const version = cmux.version ? ` ${pc.dim(`(${cmux.version})`)}` : '';
    lines.push(`${pc.green('\u2713')} cmux${version}`);
    if (cmux.socketOk) {
      const latency = cmux.latencyMs != null ? ` ${pc.dim(`${cmux.latencyMs}ms`)}` : '';
      lines.push(`  ${pc.green('\u2713')} Socket connected${latency}`);
    } else {
      lines.push(`  ${pc.yellow('\u25CB')} Socket not responding`);
    }
  } else {
    lines.push(`${pc.red('\u2717')} cmux not found`);
  }

  // Claude Code settings
  if (claude.settingsExists) {
    lines.push(`${pc.green('\u2713')} settings.json found`);
    if (claude.existingHooks.length > 0) {
      lines.push(`  ${pc.dim(`Existing hooks: ${claude.existingHooks.join(', ')}`)}`);
    }
  } else {
    lines.push(`${pc.yellow('\u25CB')} settings.json not found (will create)`);
  }

  // Node
  lines.push(`${pc.green('\u2713')} Node.js ${node.version}`);

  p.note(lines.join('\n'), 'Environment');
}

// ---------------------------------------------------------------------------
// Interactive flow
// ---------------------------------------------------------------------------

export async function runPrompts(
  cmux: CmuxDetection,
  claude: ClaudeDetection,
  node: NodeDetection,
): Promise<InstallerChoices> {
  // Show detection results
  showDetection(cmux, claude, node);

  // Bail if cmux is not available
  if (!cmux.available) {
    p.cancel('cmux is required. Install cmux first: https://cmux.dev');
    process.exit(1);
  }

  // Feature selection
  const features = await p.multiselect({
    message: 'Which features would you like to enable?',
    options: [
      {
        value: 'statusPills',
        label: 'Status pills',
        hint: 'Ready / Thinking / Working / Done in sidebar',
      },
      {
        value: 'progress',
        label: 'Progress bar',
        hint: 'Tool count progress indicator',
      },
      {
        value: 'logs',
        label: 'Sidebar logs',
        hint: 'Tool usage, errors, agents in sidebar',
      },
      {
        value: 'notifications',
        label: 'Desktop notifications',
        hint: 'Notify on stop, error, permission',
      },
      {
        value: 'tabTitles',
        label: 'AI tab titles',
        hint: 'Generate smart tab titles from context',
      },
      {
        value: 'gitIntegration',
        label: 'Git integration',
        hint: 'Show branch and dirty state in sidebar',
      },
      {
        value: 'subagentTracking',
        label: 'Subagent tracking',
        hint: 'Track and display subagent activity',
      },
      {
        value: 'visibleAgentPanes',
        label: 'Visible agent panes',
        hint: 'Spawn execution agents in visible tmux panes',
      },
    ],
    initialValues: ['statusPills', 'progress', 'logs', 'notifications'],
    required: true,
  });

  if (p.isCancel(features)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Notification preferences (if notifications enabled)
  let notifications = { onStop: true, onError: true, onPermission: true };
  if ((features as string[]).includes('notifications')) {
    const notifChoices = await p.multiselect({
      message: 'When should notifications fire?',
      options: [
        { value: 'onStop', label: 'On stop', hint: 'When Claude finishes a response' },
        { value: 'onError', label: 'On error', hint: 'When Claude encounters an error' },
        { value: 'onPermission', label: 'On permission request', hint: 'When a tool needs approval' },
      ],
      initialValues: ['onStop', 'onError', 'onPermission'],
      required: false,
    });

    if (p.isCancel(notifChoices)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const chosen = notifChoices as string[];
    notifications = {
      onStop: chosen.includes('onStop'),
      onError: chosen.includes('onError'),
      onPermission: chosen.includes('onPermission'),
    };
  }

  // Tab title style (if tab titles enabled)
  let tabTitleStyle: 'ai' | 'directory' | 'branch' = 'directory';
  if ((features as string[]).includes('tabTitles')) {
    const style = await p.select({
      message: 'Tab title style?',
      options: [
        { value: 'ai' as const, label: 'AI-generated', hint: 'Uses Claude to generate a concise title' },
        { value: 'directory' as const, label: 'Directory name', hint: 'Uses the working directory name' },
        { value: 'branch' as const, label: 'Git branch', hint: 'Uses the current git branch name' },
      ],
      initialValue: 'ai' as const,
    });

    if (p.isCancel(style)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    tabTitleStyle = style;
  }

  // Visible agent panes explanation
  if ((features as string[]).includes('visibleAgentPanes')) {
    p.note(
      [
        'Visible agent panes redirect execution-type Agent tool calls',
        'into separate tmux panes so you can watch agents work in real time.',
        '',
        'Read-only agents (Explore, Plan) pass through normally.',
        'Execution agents get their own split pane.',
      ].join('\n'),
      'Visible Agent Panes',
    );
  }

  // Install target
  const installTarget = await p.select({
    message: 'Where should hooks be registered?',
    options: [
      {
        value: 'global' as const,
        label: '~/.claude/settings.json',
        hint: 'Global - active for all projects',
      },
      {
        value: 'project' as const,
        label: '.claude/settings.json',
        hint: 'Project - committed to repo',
      },
      {
        value: 'project-local' as const,
        label: '.claude/settings.local.json',
        hint: 'Project local - gitignored',
      },
    ],
    initialValue: 'global' as const,
  });

  if (p.isCancel(installTarget)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Summary and confirmation
  const featureList = (features as string[])
    .map((f) => `  ${pc.green('\u2713')} ${f}`)
    .join('\n');

  const targetLabel =
    installTarget === 'global'
      ? '~/.claude/settings.json'
      : installTarget === 'project'
        ? '.claude/settings.json'
        : '.claude/settings.local.json';

  p.note(
    `${pc.bold('Features:')}\n${featureList}\n\n${pc.bold('Target:')} ${targetLabel}`,
    'Summary',
  );

  const confirmed = await p.confirm({
    message: 'Apply this configuration?',
    initialValue: true,
  });

  if (p.isCancel(confirmed)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  return {
    features: features as string[],
    notifications,
    tabTitleStyle,
    installTarget,
    confirmed: confirmed as boolean,
  };
}
