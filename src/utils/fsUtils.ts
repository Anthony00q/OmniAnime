import * as fs from 'fs';
import * as path from 'path';

export function safeWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, data, 'utf-8');
  try {
    fs.renameSync(tempPath, filePath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

export function safeWriteBinarySync(filePath: string, data: Uint8Array): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  try {
    fs.renameSync(tempPath, filePath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}
