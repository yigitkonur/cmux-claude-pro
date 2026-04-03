/**
 * V2Emitter — direct V2 JSON-RPC call builder for SSH/TCP relay sessions.
 *
 * Over SSH, cmux's sidebar V1 primitives (set_status, log, set_progress) are
 * unavailable. This emitter builds V2 RPC calls that use the confirmed-working
 * methods: tab.action, workspace.action, workspace.rename, notification.*,
 * surface.trigger_flash, system.identify.
 *
 * Channel strategy:
 *   Tab title       = phase + current action ("Working: Bash: npm test")
 *   Workspace color = state (green/gold/blue/orange/purple/red)
 *   Workspace title = git branch + progress ("main* | 5 tools 33%")
 *   Notifications   = done/error/permission alerts
 *   Mark unread     = attention for permission/error
 *   Flash           = urgent visual attention
 *   Pin/Unpin       = keep workspace visible while working
 */

export interface V2RpcCall {
  method: string;
  params: Record<string, unknown>;
}

/** Colors matching the status phases. */
export const V2_COLORS: Record<string, string> = {
  ready: '#50C878',
  thinking: '#FFD700',
  working: '#4C8DFF',
  waiting: '#FF6B35',
  compacting: '#9B59B6',
  done: '#50C878',
  error: '#FF4444',
};

export class V2Emitter {
  // ---- Tab title (primary status line) ----

  setTabTitle(title: string): V2RpcCall {
    return { method: 'tab.action', params: { action: 'rename', title } };
  }

  clearTabTitle(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'clear_name' } };
  }

  // ---- Workspace color (state indicator) ----

  setWorkspaceColor(color: string): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'set-color', color } };
  }

  clearWorkspaceColor(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'clear-color' } };
  }

  // ---- Workspace title (progress + git branch) ----

  setWorkspaceTitle(title: string): V2RpcCall {
    return { method: 'workspace.rename', params: { title } };
  }

  clearWorkspaceTitle(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'clear_name' } };
  }

  // ---- Notifications ----

  notify(surfaceId: string, title: string, subtitle: string, body: string): V2RpcCall {
    return {
      method: 'notification.create_for_surface',
      params: { surface_id: surfaceId, title, subtitle, body },
    };
  }

  notifyBroadcast(title: string, subtitle: string, body: string): V2RpcCall {
    return { method: 'notification.create', params: { title, subtitle, body } };
  }

  clearNotifications(): V2RpcCall {
    return { method: 'notification.clear', params: {} };
  }

  // ---- Attention indicators ----

  markTabUnread(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'mark_unread' } };
  }

  markWorkspaceUnread(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'mark_unread' } };
  }

  markRead(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'mark_read' } };
  }

  flash(surfaceId: string): V2RpcCall {
    return { method: 'surface.trigger_flash', params: { surface_id: surfaceId } };
  }

  // ---- Workspace pin (keep visible while working) ----

  pin(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'pin' } };
  }

  unpin(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'unpin' } };
  }

  // ---- Focus detection ----

  identifyCall(): V2RpcCall {
    return { method: 'system.identify', params: {} };
  }
}

// ---- Helpers ----

/**
 * Format workspace title combining git branch and progress.
 * During work: "main* | 5 tools 33%"
 * On done: "main*"
 * No git: "5 tools 33%"
 */
export function formatWorkspaceTitle(
  gitBranch: string | null,
  gitDirty: boolean,
  toolCount?: number,
  progress?: number,
): string {
  const parts: string[] = [];
  if (gitBranch) {
    parts.push(gitDirty ? `${gitBranch}*` : gitBranch);
  }
  if (toolCount !== undefined && toolCount > 0 && progress !== undefined) {
    const pct = Math.round(progress * 100);
    const label = toolCount === 1 ? '1 tool' : `${toolCount} tools`;
    parts.push(`${label} ${pct}%`);
  }
  return parts.join(' | ');
}
