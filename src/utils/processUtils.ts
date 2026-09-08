import { execFile, type ChildProcess } from 'child_process';

export function terminateChildProcessTree(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true }, () => undefined);
    } else {
      child.kill('SIGKILL');
    }
  } catch {}
}
