export interface CcCmuxConfig {
  features: {
    statusPills: boolean;
    progress: boolean;
    logs: boolean;
    notifications: boolean;
    tabTitles: boolean;
    gitIntegration: boolean;
    subagentTracking: boolean;
    /** Spawn visible panes for execution agents */
    visibleAgentPanes: boolean;
  };
  notifications: {
    onStop: boolean;
    onError: boolean;
    onPermission: boolean;
  };
  tabTitle: {
    style: 'ai' | 'directory' | 'branch';
  };
  visibleAgents: {
    /** Agent types that pass through (read-only, no pane spawn) */
    readOnlyPassthrough: string[];
    splitDirection: 'right' | 'down' | 'alternate';
    autoClose: boolean;
    notifyOnComplete: boolean;
  };
}
