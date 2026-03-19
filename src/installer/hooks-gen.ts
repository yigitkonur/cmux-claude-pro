/**
 * Hook configuration generator.
 *
 * Given the user's feature choices and the handler path, produces the
 * Claude Code hooks object that should be merged into settings.json.
 *
 * All hooks point to the same handler binary — the handler dispatches
 * internally based on the hook_event_name field in stdin JSON.
 */

import type { InstallerChoices } from './prompts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HookEntry {
  type: 'command';
  command: string;
  timeout: number;
}

interface HookEventConfig {
  description: string;
  hooks: HookEntry[];
  matcher?: string;
}

// ---------------------------------------------------------------------------
// Feature-to-event mapping
// ---------------------------------------------------------------------------

/**
 * Maps each feature to the set of hook events it requires.
 * Some events are shared across features — the generator de-duplicates.
 */
const FEATURE_EVENTS: Record<string, string[]> = {
  statusPills: [
    'SessionStart',
    'UserPromptSubmit',
    'Stop',
    'StopFailure',
    'SessionEnd',
  ],
  progress: [
    'PreToolUse',
    'Stop',
  ],
  logs: [
    'PostToolUse',
    'PostToolUseFailure',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'PostCompact',
    'TaskCompleted',
    'WorktreeCreate',
  ],
  notifications: [
    'Stop',
    'StopFailure',
    'PermissionRequest',
    'Notification',
  ],
  tabTitles: [
    'Stop',
    'UserPromptSubmit',
    'SessionStart',
  ],
  gitIntegration: [
    'SessionStart',
  ],
  subagentTracking: [
    'SubagentStart',
    'SubagentStop',
  ],
  visibleAgentPanes: [
    'PreToolUse',
  ],
};

/**
 * Human-readable descriptions for each hook event, explaining what
 * cc-cmux does when that event fires. Descriptions are merged when
 * multiple features share the same event.
 */
const EVENT_DESCRIPTIONS: Record<string, string[]> = {
  SessionStart: ['initialize sidebar state', 'detect git branch', 'claim tab ownership'],
  SessionEnd: ['clean up sidebar state'],
  UserPromptSubmit: ['set thinking status', 'restore tab title'],
  PreToolUse: ['update progress', 'intercept agent tool calls'],
  PostToolUse: ['log tool results'],
  PostToolUseFailure: ['log tool errors'],
  Stop: ['set done status', 'complete progress', 'send notification', 'generate tab title'],
  StopFailure: ['set error status', 'send error notification'],
  PermissionRequest: ['set waiting status', 'send permission notification'],
  Notification: ['forward desktop notification'],
  SubagentStart: ['track agent spawn'],
  SubagentStop: ['track agent completion'],
  PreCompact: ['log compaction start'],
  PostCompact: ['log compaction complete'],
  TaskCompleted: ['log task completion'],
  WorktreeCreate: ['log worktree creation'],
};

/**
 * Events where the hook should run synchronously (not async).
 * Most hooks are async, but PreToolUse with Agent interception
 * must be synchronous to block and return JSON.
 */
const SYNC_EVENTS = new Set<string>([
  'SessionStart',
]);

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateHooks(
  choices: InstallerChoices,
  handlerPath: string,
): Record<string, HookEventConfig[]> {
  const enabledFeatures = choices.features;

  // 1. Collect all needed events, de-duplicated
  const neededEvents = new Set<string>();
  for (const feature of enabledFeatures) {
    const events = FEATURE_EVENTS[feature];
    if (events) {
      for (const event of events) {
        // Filter notification sub-events based on user choices
        if (feature === 'notifications') {
          if (event === 'Stop' && !choices.notifications.onStop) continue;
          if (event === 'StopFailure' && !choices.notifications.onError) continue;
          if (event === 'PermissionRequest' && !choices.notifications.onPermission) continue;
        }
        neededEvents.add(event);
      }
    }
  }

  // 2. Build the hooks object
  const hooks: Record<string, HookEventConfig[]> = {};

  for (const eventName of neededEvents) {
    // Determine which features are driving this event
    const activeFeatures = enabledFeatures.filter((f) => {
      const events = FEATURE_EVENTS[f];
      return events && events.includes(eventName);
    });

    // Build description from active features
    const allDescs = EVENT_DESCRIPTIONS[eventName] ?? [];
    const relevantDescs = allDescs.filter((_desc, i) => {
      // Match descriptions to features by index convention
      // For simplicity, include all descriptions for active events
      return true;
    });
    const description = `cc-cmux: ${relevantDescs.join(', ')}`;

    // Special case: PreToolUse with visibleAgentPanes needs a separate
    // entry with matcher: "Agent" that is NOT async
    if (eventName === 'PreToolUse' && enabledFeatures.includes('visibleAgentPanes')) {
      // Create the Agent-specific entry (sync, with matcher)
      const agentEntry: HookEventConfig = {
        description: 'cc-cmux: intercept agent tool calls for visible panes',
        matcher: 'Agent',
        hooks: [{
          type: 'command',
          command: `node ${handlerPath}`,
          timeout: 10,
        }],
      };

      // Create the general PreToolUse entry (async, no matcher) if progress is enabled
      if (enabledFeatures.includes('progress')) {
        const generalEntry: HookEventConfig = {
          description: 'cc-cmux: update progress',
          hooks: [{
            type: 'command',
            command: `node ${handlerPath}`,
            timeout: 10,
          }],
        };
        hooks[eventName] = [generalEntry, agentEntry];
      } else {
        hooks[eventName] = [agentEntry];
      }
      continue;
    }

    // Standard entry
    const entry: HookEventConfig = {
      description,
      hooks: [{
        type: 'command',
        command: `node ${handlerPath}`,
        timeout: 10,
      }],
    };

    hooks[eventName] = [entry];
  }

  return hooks;
}

/**
 * Returns the list of all possible hook event names that cc-cmux can register.
 * Useful for uninstall operations.
 */
export function allCcCmuxEvents(): string[] {
  const allEvents = new Set<string>();
  for (const events of Object.values(FEATURE_EVENTS)) {
    for (const e of events) {
      allEvents.add(e);
    }
  }
  return [...allEvents];
}
