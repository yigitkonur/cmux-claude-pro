#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const command = process.argv[2] || 'setup';

async function main() {
  switch (command) {
    case 'setup':
    case 'install': {
      const mod = await import(join(__dirname, '..', 'dist', 'installer.mjs'));
      await mod.run();
      break;
    }
    case 'status': {
      const mod = await import(join(__dirname, '..', 'dist', 'installer.mjs'));
      await mod.status();
      break;
    }
    case 'uninstall': {
      const mod = await import(join(__dirname, '..', 'dist', 'installer.mjs'));
      await mod.uninstall();
      break;
    }
    case 'test': {
      const mod = await import(join(__dirname, '..', 'dist', 'installer.mjs'));
      await mod.test();
      break;
    }
    case 'config': {
      const configPath = join(process.env.HOME || '~', '.cc-cmux', 'config.json');
      if (existsSync(configPath)) {
        const { readFileSync } = await import('node:fs');
        console.log(readFileSync(configPath, 'utf-8'));
      } else {
        console.log('No configuration found. Run: cc-cmux setup');
      }
      break;
    }
    case '--help':
    case '-h':
    case 'help':
      console.log(`cc-cmux — Claude Code ↔ cmux Integration

Usage: cc-cmux <command>

Commands:
  setup       Interactive setup wizard (default)
  status      Health check (socket, handler, hooks)
  uninstall   Remove hooks and configuration
  test        Fire test events to verify sidebar
  config      Print current configuration
  help        Show this help message`);
      break;
    default:
      console.error(`Unknown command: ${command}. Run: cc-cmux help`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
