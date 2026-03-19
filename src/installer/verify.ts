/**
 * Post-install verification — confirm that cc-cmux is properly installed
 * and functional by running a series of checks.
 */

import { existsSync, accessSync, constants } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerifyResult {
  checks: CheckResult[];
  allPassed: boolean;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export async function verifyInstallation(handlerPath: string): Promise<VerifyResult> {
  const checks: CheckResult[] = [];

  // 1. Handler file exists and is readable
  try {
    accessSync(handlerPath, constants.R_OK);
    checks.push({
      name: 'Handler file',
      passed: true,
      detail: 'Exists and is readable',
    });
  } catch {
    checks.push({
      name: 'Handler file',
      passed: false,
      detail: `Not found at ${handlerPath}`,
    });
  }

  // 2. Tab title worker exists
  const workerPath = join(homedir(), '.cc-cmux', 'tab-title-worker.cjs');
  try {
    accessSync(workerPath, constants.R_OK);
    checks.push({
      name: 'Tab title worker',
      passed: true,
      detail: 'Exists and is readable',
    });
  } catch {
    checks.push({
      name: 'Tab title worker',
      passed: false,
      detail: `Not found at ${workerPath}`,
    });
  }

  // 3. Handler cold start time
  try {
    const start = performance.now();
    execSync(
      `echo '{}' | node "${handlerPath}" 2>/dev/null`,
      { timeout: 5000, encoding: 'utf-8' },
    );
    const elapsed = Math.round(performance.now() - start);
    checks.push({
      name: 'Handler cold start',
      passed: elapsed < 3000,
      detail: `${elapsed}ms`,
    });
  } catch {
    checks.push({
      name: 'Handler cold start',
      passed: false,
      detail: 'Failed to execute',
    });
  }

  // 4. Config file exists
  const configPath = join(homedir(), '.cc-cmux', 'config.json');
  checks.push({
    name: 'Config file',
    passed: existsSync(configPath),
    detail: existsSync(configPath) ? 'Found' : `Not found at ${configPath}`,
  });

  // 5. Socket ping (if socket path is available)
  const socketPath =
    process.env['CMUX_SOCKET_PATH'] ??
    join(homedir(), 'Library', 'Application Support', 'cmux', 'cmux.sock');

  if (existsSync(socketPath)) {
    try {
      const socatBin = existsSync('/opt/homebrew/bin/socat')
        ? '/opt/homebrew/bin/socat'
        : 'socat';
      const result = execSync(
        `echo 'ping' | ${socatBin} -T1 - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      ).trim();
      checks.push({
        name: 'Socket ping',
        passed: true,
        detail: result || 'OK',
      });
    } catch {
      checks.push({
        name: 'Socket ping',
        passed: false,
        detail: 'Socket not responding',
      });
    }

    // 6. Test set_status / clear_status cycle
    try {
      const socatBin = existsSync('/opt/homebrew/bin/socat')
        ? '/opt/homebrew/bin/socat'
        : 'socat';
      execSync(
        `echo 'status set cc_verify_test "test" --icon=checkmark.circle' | ${socatBin} -T1 - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      );
      execSync(
        `echo 'status clear cc_verify_test' | ${socatBin} -T1 - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      );
      checks.push({
        name: 'Status set/clear',
        passed: true,
        detail: 'Cycle completed',
      });
    } catch {
      checks.push({
        name: 'Status set/clear',
        passed: false,
        detail: 'Failed to set/clear status',
      });
    }

    // 7. Test set_progress / clear_progress cycle
    try {
      const socatBin = existsSync('/opt/homebrew/bin/socat')
        ? '/opt/homebrew/bin/socat'
        : 'socat';
      execSync(
        `echo 'progress set 0.5 "verify test"' | ${socatBin} -T1 - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      );
      execSync(
        `echo 'progress clear' | ${socatBin} -T1 - UNIX-CONNECT:"${socketPath}" 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      );
      checks.push({
        name: 'Progress set/clear',
        passed: true,
        detail: 'Cycle completed',
      });
    } catch {
      checks.push({
        name: 'Progress set/clear',
        passed: false,
        detail: 'Failed to set/clear progress',
      });
    }
  } else {
    checks.push({
      name: 'Socket ping',
      passed: false,
      detail: 'Socket file not found',
    });
  }

  return {
    checks,
    allPassed: checks.every((c) => c.passed),
  };
}
