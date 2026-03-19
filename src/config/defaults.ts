import type { CcCmuxConfig } from './types.js';

export const DEFAULT_CONFIG: CcCmuxConfig = {
  features: {
    statusPills: true,
    progress: true,
    logs: true,
    notifications: true,
    tabTitles: false,       // opt-in
    gitIntegration: true,
    subagentTracking: true,
    visibleAgentPanes: false, // opt-in
  },
  notifications: {
    onStop: true,
    onError: true,
    onPermission: true,
  },
  tabTitle: {
    style: 'directory',
  },
  visibleAgents: {
    readOnlyPassthrough: ['Explore', 'Plan', 'claude-code-guide'],
    splitDirection: 'alternate',
    autoClose: true,
    notifyOnComplete: true,
  },
};
