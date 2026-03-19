/**
 * Git integration — detect branch, dirty state, and extract PR URLs.
 */

import { execSync } from 'node:child_process';

export interface GitInfo {
  branch: string | null;
  dirty: boolean;
}

/**
 * Detect the current git branch and whether the working tree is dirty.
 * Uses a 500ms timeout to avoid blocking on slow filesystems.
 * Returns null branch if not in a git repo.
 */
export function detectGitInfo(cwd: string): GitInfo {
  const execOpts = {
    cwd,
    timeout: 500,
    stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
    encoding: 'utf-8' as BufferEncoding,
  };

  let branch: string | null = null;
  let dirty = false;

  try {
    const branchOutput = execSync('git branch --show-current', execOpts);
    branch = branchOutput.trim() || null;
  } catch {
    // Not a git repo or git not available
    return { branch: null, dirty: false };
  }

  try {
    const statusOutput = execSync('git status --porcelain', execOpts);
    dirty = statusOutput.trim().length > 0;
  } catch {
    // If status fails but branch succeeded, assume clean
  }

  return { branch, dirty };
}

/**
 * Check whether a bash command involves git operations.
 * Used to decide whether to refresh git state after a tool call.
 */
export function isGitCommand(command: string): boolean {
  const trimmed = command.trim();
  return (
    trimmed.startsWith('git ') ||
    trimmed.startsWith('git\t') ||
    trimmed === 'git' ||
    // Also catch piped/chained git commands
    trimmed.includes(' git ') ||
    trimmed.includes('|git ') ||
    trimmed.includes('| git ') ||
    trimmed.includes('&&git ') ||
    trimmed.includes('&& git ')
  );
}

/**
 * Try to extract a PR/MR URL from git push output.
 * GitHub and GitLab both print the URL when pushing with -u or creating a PR.
 */
export function extractPrUrl(output: string): string | null {
  if (!output) return null;

  // GitHub: "https://github.com/owner/repo/pull/123"
  // GitLab: "https://gitlab.com/owner/repo/-/merge_requests/123"
  const urlPatterns = [
    /https?:\/\/github\.com\/[^\s]+\/pull\/\d+/,
    /https?:\/\/gitlab\.com\/[^\s]+\/merge_requests\/\d+/,
    /https?:\/\/bitbucket\.org\/[^\s]+\/pull-requests\/\d+/,
  ];

  for (const pattern of urlPatterns) {
    const match = output.match(pattern);
    if (match) return match[0];
  }

  return null;
}
