import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CcCmuxConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';

const CONFIG_FILE = join(homedir(), '.cc-cmux', 'config.json');
const CACHE_FILE = '/tmp/cc-cmux/config.cache.json';

/**
 * Deep merge overrides into defaults.
 * Only merges plain objects recursively; arrays and primitives from
 * overrides replace defaults.
 */
function deepMerge(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(overrides)) {
    const defaultVal = defaults[key];
    const overrideVal = overrides[key];

    if (
      defaultVal !== null &&
      defaultVal !== undefined &&
      typeof defaultVal === 'object' &&
      !Array.isArray(defaultVal) &&
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }

  return result;
}

/**
 * Try to read and parse a JSON file. Returns null on any failure.
 */
function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write the resolved config to the cache file for fast subsequent loads.
 */
function writeCache(config: CcCmuxConfig): void {
  try {
    mkdirSync('/tmp/cc-cmux', { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(config), 'utf-8');
  } catch {
    // Non-critical — ignore
  }
}

/**
 * Load configuration with 3-tier fallback:
 * 1. Fast cache at /tmp/cc-cmux/config.cache.json
 * 2. User config at ~/.cc-cmux/config.json (merged over defaults, then cached)
 * 3. Built-in defaults
 *
 * Partial user configs are deep-merged over defaults, so users only need
 * to specify the keys they want to override.
 */
export function loadConfig(): CcCmuxConfig {
  // Tier 1: cache (fast path for hot hooks — invalidated if config file is newer)
  const cached = tryReadJson(CACHE_FILE);
  if (cached) {
    let cacheValid = true;
    try {
      const cacheMtime = statSync(CACHE_FILE).mtimeMs;
      const configMtime = statSync(CONFIG_FILE).mtimeMs;
      if (configMtime > cacheMtime) cacheValid = false;
    } catch {
      // If stat fails, trust the cache
    }
    if (cacheValid) {
      // Merge cached config over defaults for forward-compatibility: if DEFAULT_CONFIG
      // gains new keys in a code update, they appear even with an older cache file.
      return deepMerge(
        DEFAULT_CONFIG as unknown as Record<string, unknown>,
        cached,
      ) as unknown as CcCmuxConfig;
    }
  }

  // Tier 2: user config file
  const userConfig = tryReadJson(CONFIG_FILE);
  if (userConfig) {
    const merged = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      userConfig,
    ) as unknown as CcCmuxConfig;
    writeCache(merged);
    return merged;
  }

  // Tier 3: defaults
  return DEFAULT_CONFIG;
}
