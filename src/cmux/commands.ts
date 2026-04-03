export interface StatusOpts {
  icon?: string;
  color?: string;
}

export interface LogOpts {
  level?: 'info' | 'progress' | 'success' | 'warning' | 'error';
  source?: string;
}

export interface MetaOpts {
  icon?: string;
  color?: string;
}

function q(value: string): string {
  if (value.includes(' ') || value.includes('"') || value.includes('|')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

export class CmuxCommands {
  private readonly wid: string;

  constructor(workspaceId: string) {
    this.wid = workspaceId;
  }

  private tab(): string {
    return ` --tab=${this.wid}`;
  }

  setStatus(key: string, value: string, opts?: StatusOpts & { pid?: number }): string {
    let c = `set_status ${q(key)} ${q(value)}`;
    if (opts?.icon) c += ` --icon=${q(opts.icon)}`;
    if (opts?.color) c += ` --color=${opts.color}`;
    if (opts?.pid) c += ` --pid=${opts.pid}`;
    c += this.tab();
    return c;
  }

  clearStatus(key: string): string {
    return `clear_status ${q(key)}${this.tab()}`;
  }

  setProgress(value: number, label?: string): string {
    let c = `set_progress ${value.toFixed(2)}`;
    if (label) c += ` --label=${q(label)}`;
    c += this.tab();
    return c;
  }

  clearProgress(): string {
    return `clear_progress${this.tab()}`;
  }

  log(message: string, opts?: LogOpts): string {
    let c = 'log';
    if (opts?.level) c += ` --level=${opts.level}`;
    if (opts?.source) c += ` --source=${q(opts.source)}`;
    c += this.tab();
    c += ` -- ${q(message)}`;
    return c;
  }

  clearLog(): string {
    return `clear_log${this.tab()}`;
  }

  /** Generic notification (goes to focused workspace) */
  notify(title: string, subtitle?: string, body?: string): string {
    const parts = [title, subtitle || '', body || ''];
    return `notify ${q(parts.join('|'))}`;
  }

  /** Targeted notification to a specific workspace+surface (like official cmux hooks) */
  notifyTarget(workspaceId: string, surfaceId: string, title: string, subtitle?: string, body?: string): string {
    const parts = [title, subtitle || '', body || ''];
    return `notify_target ${workspaceId} ${surfaceId} ${q(parts.join('|'))}`;
  }

  /** Register agent PID — enables cmux's 30s crash recovery auto-cleanup */
  setAgentPid(key: string, pid: number): string {
    return `set_agent_pid ${q(key)} ${pid}${this.tab()}`;
  }

  /** Clear agent PID registration */
  clearAgentPid(key: string): string {
    return `clear_agent_pid ${q(key)}${this.tab()}`;
  }

  /** Clear all notifications for this workspace */
  clearNotifications(): string {
    return `clear_notifications${this.tab()}`;
  }

  reportGitBranch(branch: string, dirty: boolean): string {
    let c = `report_git_branch ${q(branch)}`;
    if (dirty) c += ' --status=dirty';
    c += this.tab();
    return c;
  }

  reportMeta(key: string, value: string, opts?: MetaOpts): string {
    let c = `report_meta ${q(key)} ${q(value)}`;
    if (opts?.icon) c += ` --icon=${q(opts.icon)}`;
    if (opts?.color) c += ` --color=${opts.color}`;
    c += this.tab();
    return c;
  }

  clearMeta(key: string): string {
    return `clear_meta ${q(key)}${this.tab()}`;
  }

  resetSidebar(): string {
    return `reset_sidebar${this.tab()}`;
  }

  renameTab(surfaceId: string, title: string): string {
    return `rename_tab --surface=${surfaceId} ${q(title)}`;
  }

  newPane(direction: 'right' | 'down'): string {
    return `new_pane --direction=${direction}`;
  }

  sendToSurface(surfaceRef: string, text: string): string {
    return `send --surface=${surfaceRef} ${q(text)}`;
  }

  sendKeyToSurface(surfaceRef: string, key: string): string {
    return `send_key --surface=${surfaceRef} ${q(key)}`;
  }

  /** Mark workspace tab as unread (visual attention indicator). */
  markUnread(): string {
    return `workspace_action --action=mark_unread${this.tab()}`;
  }

  /** Mark workspace tab as read (clear unread indicator). */
  markRead(): string {
    return `workspace_action --action=mark_read${this.tab()}`;
  }
}
