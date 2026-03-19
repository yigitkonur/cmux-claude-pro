import { createConnection, type Socket } from 'node:net';

export class CmuxSocket {
  private readonly socketPath: string;

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  /**
   * Send a command and wait for the response.
   * Returns empty string on any error — never throws.
   */
  async send(command: string): Promise<string> {
    return new Promise<string>((resolve) => {
      let socket: Socket | null = null;
      let settled = false;
      const chunks: Buffer[] = [];

      const finish = (result: string): void => {
        if (settled) return;
        settled = true;
        if (socket) {
          socket.removeAllListeners();
          socket.destroy();
        }
        resolve(result);
      };

      const timer = setTimeout(() => finish(''), 1000);

      try {
        socket = createConnection({ path: this.socketPath }, () => {
          try {
            socket!.write(command + '\n');
          } catch {
            clearTimeout(timer);
            finish('');
          }
        });

        socket.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        socket.on('end', () => {
          clearTimeout(timer);
          finish(Buffer.concat(chunks).toString('utf-8').trimEnd());
        });

        socket.on('error', () => {
          clearTimeout(timer);
          finish('');
        });

        socket.on('timeout', () => {
          clearTimeout(timer);
          finish('');
        });

        socket.setTimeout(1000);
      } catch {
        clearTimeout(timer);
        finish('');
      }
    });
  }

  /**
   * Fire-and-forget: send a command without waiting for response.
   * Swallows all errors silently.
   */
  fire(command: string): void {
    try {
      const socket = createConnection({ path: this.socketPath }, () => {
        try {
          socket.write(command + '\n', () => {
            socket.destroy();
          });
        } catch {
          socket.destroy();
        }
      });

      socket.on('error', () => {
        socket.destroy();
      });

      socket.setTimeout(1000, () => {
        socket.destroy();
      });
    } catch {
      // Silently ignore — cmux may not be running
    }
  }

  /**
   * Send multiple commands over a single connection, collect all responses.
   * Returns an array of responses (empty strings for failures).
   */
  async sendBatch(commands: string[]): Promise<string[]> {
    if (commands.length === 0) return [];

    return new Promise<string[]>((resolve) => {
      let socket: Socket | null = null;
      let settled = false;
      const results: string[] = [];
      let currentChunks: Buffer[] = [];
      let commandIndex = 0;

      const finish = (fallback?: true): void => {
        if (settled) return;
        settled = true;
        if (socket) {
          socket.removeAllListeners();
          socket.destroy();
        }
        if (fallback) {
          // Fill remaining slots with empty strings
          while (results.length < commands.length) {
            results.push('');
          }
        }
        resolve(results);
      };

      const timer = setTimeout(() => finish(true), 1000);

      const sendNext = (): void => {
        if (commandIndex >= commands.length) {
          clearTimeout(timer);
          finish();
          return;
        }
        try {
          currentChunks = [];
          socket!.write(commands[commandIndex] + '\n');
        } catch {
          clearTimeout(timer);
          finish(true);
        }
      };

      try {
        socket = createConnection({ path: this.socketPath }, () => {
          sendNext();
        });

        socket.on('data', (chunk: Buffer) => {
          currentChunks.push(chunk);
          const combined = Buffer.concat(currentChunks).toString('utf-8');
          // Check if we received a complete response (ends with newline)
          if (combined.endsWith('\n')) {
            results.push(combined.trimEnd());
            commandIndex++;
            sendNext();
          }
        });

        socket.on('end', () => {
          // If we have pending data, push it
          if (currentChunks.length > 0 && results.length < commands.length) {
            results.push(Buffer.concat(currentChunks).toString('utf-8').trimEnd());
          }
          clearTimeout(timer);
          finish(true);
        });

        socket.on('error', () => {
          clearTimeout(timer);
          finish(true);
        });

        socket.on('timeout', () => {
          clearTimeout(timer);
          finish(true);
        });

        socket.setTimeout(1000);
      } catch {
        clearTimeout(timer);
        finish(true);
      }
    });
  }
}
