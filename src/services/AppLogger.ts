import * as fs from 'fs';
import * as path from 'path';
import type { RuntimeDirectories } from './RuntimeDirectories';

export class AppLogger {
  constructor(private readonly directories: RuntimeDirectories) {}

  write(error: unknown, isRenderer = false): void {
    try {
      this.directories.ensure();
      const prefix = isRenderer ? 'FRONTEND_ERROR' : 'BACKEND_ERROR';
      const errorWithStack = error as { stack?: unknown } | null | undefined;
      const details = errorWithStack?.stack || error;
      const msg = `[${new Date().toLocaleString()}] ${prefix}:\n${details}\n\n`;
      fs.appendFileSync(path.join(this.directories.logDir, 'app_errors.log'), msg);
    } catch (loggerError) {
      console.error('Logger falló:', loggerError);
    }
  }
}
