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
   * Check if the given workspace is currently focused.
   * Returns false on error — safe default that sends notifications rather than suppressing them.
   */
  async isFocused(workspaceId: string): Promise<boolean> {
    try {
      const response = await this.send('identify --json');
      if (!response) return false;
      const info = JSON.parse(response);
      return info?.focused_workspace === workspaceId;
    } catch {
      return false;
    }
  }

  /**
   * Fire multiple commands in parallel, each on its own connection.
   * cmux uses a one-command-per-connection protocol (closes after response),
   * so pipelining over a single connection does not work.
   */
  fireAll(commands: string[]): void {
    for (const command of commands) {
      this.fire(command);
    }
  }
}
