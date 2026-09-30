import * as fs from 'fs';
import * as path from 'path';

export interface RuntimeDirectories {
  logDir: string;
  dataDir: string;
  downloadsDir: string;
  ensure(): void;
}

export function createRuntimeDirectories(rootDir = process.cwd()): RuntimeDirectories {
  const directories = {
    logDir: path.join(rootDir, 'logs'),
    dataDir: path.join(rootDir, 'data'),
    downloadsDir: path.join(rootDir, 'Descargas'),
  };

  return {
    ...directories,
    ensure: () => {
      if (!fs.existsSync(directories.logDir)) fs.mkdirSync(directories.logDir, { recursive: true });
      if (!fs.existsSync(directories.dataDir)) fs.mkdirSync(directories.dataDir, { recursive: true });
      if (!fs.existsSync(directories.downloadsDir)) fs.mkdirSync(directories.downloadsDir, { recursive: true });
    },
  };
}
