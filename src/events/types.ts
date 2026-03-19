/**
 * Base interface shared by all hook event inputs.
 * Claude Code passes these fields for every hook invocation.
 */
export interface HookEventInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  permission_mode: string;
}

// ---- Session lifecycle ----

export interface SessionStartInput extends HookEventInput {
  hook_event_name: 'SessionStart';
  source: string;
  model: string;
}

export interface SessionEndInput extends HookEventInput {
  hook_event_name: 'SessionEnd';
}

// ---- User interaction ----

export interface UserPromptSubmitInput extends HookEventInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

// ---- Tool lifecycle ----

export interface PreToolUseInput extends HookEventInput {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUseInput extends HookEventInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

export interface PostToolUseFailureInput extends HookEventInput {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  error: string;
  tool_use_id: string;
}

// ---- Permission ----

export interface PermissionRequestInput extends HookEventInput {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: Record<string, unknown>;
  permission: string;
}

// ---- Stop events ----

export interface StopInput extends HookEventInput {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
  last_assistant_message: string;
}

export interface StopFailureInput extends HookEventInput {
  hook_event_name: 'StopFailure';
}

// ---- Subagent lifecycle ----

export interface SubagentStartInput extends HookEventInput {
  hook_event_name: 'SubagentStart';
  agent_type: string;
  agent_id: string;
  prompt?: string;
}

export interface SubagentStopInput extends HookEventInput {
  hook_event_name: 'SubagentStop';
  agent_type: string;
  agent_id: string;
  result: unknown;
}

// ---- Notifications ----

export interface NotificationInput extends HookEventInput {
  hook_event_name: 'Notification';
  message: string;
  title: string;
  notification_type: string;
}

// ---- Compaction ----

export interface PreCompactInput extends HookEventInput {
  hook_event_name: 'PreCompact';
  trigger: string;
}

export interface PostCompactInput extends HookEventInput {
  hook_event_name: 'PostCompact';
  trigger: string;
}

// ---- Task ----

export interface TaskCompletedInput extends HookEventInput {
  hook_event_name: 'TaskCompleted';
}

// ---- Worktree ----

export interface WorktreeCreateInput extends HookEventInput {
  hook_event_name: 'WorktreeCreate';
}

/**
 * Union of all hook event input types.
 * Useful for discriminated unions via hook_event_name.
 */
export type AnyHookEventInput =
  | SessionStartInput
  | SessionEndInput
  | UserPromptSubmitInput
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | PermissionRequestInput
  | StopInput
  | StopFailureInput
  | SubagentStartInput
  | SubagentStopInput
  | NotificationInput
  | PreCompactInput
  | PostCompactInput
  | TaskCompletedInput
  | WorktreeCreateInput;
