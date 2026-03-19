/**
 * Safe settings.json merge logic.
 *
 * Reads the existing settings file, merges cc-cmux hooks into it while
 * preserving all non-cc-cmux entries, creates a backup, and writes
 * the result with proper formatting.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeResult {
  merged: boolean;
  backup: string | null;
  added: string[];
  updated: string[];
  preserved: string[];
}

// ---------------------------------------------------------------------------
// CC-CMUX identification
// ---------------------------------------------------------------------------

const CC_CMUX_PREFIX = 'cc-cmux:';

/**
 * Check whether a hook entry belongs to cc-cmux by its description field.
 */
function isCcCmuxEntry(entry: Record<string, unknown>): boolean {
  const desc = entry['description'];
  return typeof desc === 'string' && desc.startsWith(CC_CMUX_PREFIX);
}

// ---------------------------------------------------------------------------
// Resolve settings path
// ---------------------------------------------------------------------------

export function resolveSettingsPath(
  target: 'global' | 'project' | 'project-local',
): string {
  switch (target) {
    case 'global':
      return join(homedir(), '.claude', 'settings.json');
    case 'project':
      return join(process.cwd(), '.claude', 'settings.json');
    case 'project-local':
      return join(process.cwd(), '.claude', 'settings.local.json');
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export function mergeHooksIntoSettings(
  settingsPath: string,
  newHooks: Record<string, unknown[]>,
): MergeResult {
  const result: MergeResult = {
    merged: false,
    backup: null,
    added: [],
    updated: [],
    preserved: [],
  };

  try {
    // 1. Read existing settings or start with empty object
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try {
        const raw = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Corrupt file — start fresh but back it up
        settings = {};
      }

      // 2. Create backup
      const backupPath = settingsPath + '.cc-cmux-backup';
      try {
        copyFileSync(settingsPath, backupPath);
        result.backup = backupPath;
      } catch {
        // Backup failed — proceed anyway
      }
    }

    // 3. Ensure hooks object exists
    if (!settings['hooks'] || typeof settings['hooks'] !== 'object') {
      settings['hooks'] = {};
    }
    const existingHooks = settings['hooks'] as Record<string, unknown[]>;

    // 4. Merge each event
    for (const [eventName, newEntries] of Object.entries(newHooks)) {
      if (!Array.isArray(existingHooks[eventName])) {
        // Event doesn't exist yet — add it
        existingHooks[eventName] = newEntries;
        result.added.push(eventName);
      } else {
        // Event exists — separate cc-cmux entries from user entries
        const existing = existingHooks[eventName] as Record<string, unknown>[];
        const userEntries = existing.filter((e) => !isCcCmuxEntry(e));
        const hadCcCmux = existing.some((e) => isCcCmuxEntry(e));

        // Record preserved user entries
        if (userEntries.length > 0) {
          result.preserved.push(eventName);
        }

        // Combine: user entries first, then cc-cmux entries
        existingHooks[eventName] = [...userEntries, ...newEntries];

        if (hadCcCmux) {
          result.updated.push(eventName);
        } else {
          result.added.push(eventName);
        }
      }
    }

    // 5. Ensure directory exists
    const dir = dirname(settingsPath);
    mkdirSync(dir, { recursive: true });

    // 6. Write with proper formatting
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    result.merged = true;
  } catch (err) {
    result.merged = false;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Remove cc-cmux hooks (for uninstall)
// ---------------------------------------------------------------------------

export function removeCcCmuxHooks(settingsPath: string): {
  removed: string[];
  backup: string | null;
} {
  const result = { removed: [] as string[], backup: null as string | null };

  if (!existsSync(settingsPath)) {
    return result;
  }

  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw) as Record<string, unknown>;

    if (!settings['hooks'] || typeof settings['hooks'] !== 'object') {
      return result;
    }

    // Backup
    const backupPath = settingsPath + '.cc-cmux-backup';
    try {
      copyFileSync(settingsPath, backupPath);
      result.backup = backupPath;
    } catch {
      // Continue without backup
    }

    const hooks = settings['hooks'] as Record<string, unknown[]>;

    for (const [eventName, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;

      const filtered = entries.filter(
        (e) => !isCcCmuxEntry(e as Record<string, unknown>),
      );

      if (filtered.length < entries.length) {
        result.removed.push(eventName);
      }

      if (filtered.length === 0) {
        // Remove the event entirely if no entries remain
        delete hooks[eventName];
      } else {
        hooks[eventName] = filtered;
      }
    }

    // If hooks object is now empty, remove it
    if (Object.keys(hooks).length === 0) {
      delete settings['hooks'];
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  } catch {
    // Failed to process
  }

  return result;
}
