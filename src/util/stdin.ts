/**
 * Read all data from stdin with a timeout.
 * Returns empty string on timeout or any error.
 */
export function readStdin(timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (result: string): void => {
      if (settled) return;
      settled = true;
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      process.stdin.removeAllListeners('error');
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish(chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : '');
    }, timeoutMs);

    try {
      process.stdin.setEncoding('utf-8');
      process.stdin.resume();

      process.stdin.on('data', (chunk: Buffer | string) => {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf-8'));
        } else {
          chunks.push(chunk);
        }
      });

      process.stdin.on('end', () => {
        clearTimeout(timer);
        finish(Buffer.concat(chunks).toString('utf-8'));
      });

      process.stdin.on('error', () => {
        clearTimeout(timer);
        finish('');
      });
    } catch {
      clearTimeout(timer);
      finish('');
    }
  });
}
