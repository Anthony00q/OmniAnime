import { spawn, ChildProcessByStdio } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { YtdlpUpdateResult } from '../types/ytdlp';
import { terminateChildProcessTree } from '../utils/processUtils';

type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut: boolean;
  cancelled: boolean;
};

type VersionResult = {
  ok: boolean;
  version?: string;
  error?: string;
  cancelled?: boolean;
};

type RecoveryResult = {
  restored: boolean;
  message?: string;
  warning?: string;
};

const UPDATE_TIMEOUT_MS = 60_000;
const VERSION_TIMEOUT_MS = 15_000;
type ManagedChildProcess = ChildProcessByStdio<null, Readable, Readable>;

function getErrorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

function formatProcessOutput(result: ProcessResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
}

export class YtdlpUpdateService {
  private activeChild: ManagedChildProcess | null = null;
  private cancelRequested = false;

  constructor(private readonly executablePath: string) {}

  get isRunning(): boolean {
    return this.activeChild !== null;
  }

  cancel(): void {
    this.cancelRequested = true;
    if (this.activeChild) {
      this.killProcessTree(this.activeChild);
    }
  }

  async update(): Promise<YtdlpUpdateResult> {
    this.cancelRequested = false;

    const oldPath = `${this.executablePath}.old`;
    const missingResult = this.validateExecutablePath(oldPath);
    if (missingResult) return missingResult;

    const permissionError = this.probeDirectoryWriteAccess();
    if (permissionError) {
      return {
        success: false,
        updated: false,
        code: 'PERMISSION_DENIED',
        message: permissionError,
      };
    }

    let previous = await this.readVersion(this.executablePath);
    if (previous.cancelled) {
      return this.cancelledResult();
    }
    if (!previous.ok || !previous.version) {
      const recovery = await this.recoverIfNeeded(oldPath);
      if (recovery.restored) {
        previous = await this.readVersion(this.executablePath);
      }
      if (previous.cancelled) {
        return this.cancelledResult();
      }
      if (!previous.ok || !previous.version) {
        return {
          success: false,
          updated: false,
          code: 'VERIFY_FAILED',
          message: [previous.error || 'No se pudo verificar la version actual de yt-dlp.', recovery.message]
            .filter(Boolean)
            .join('\n'),
          warning: recovery.warning,
        };
      }
    }

    const staleBackupError = this.removeStaleBackup(oldPath);
    if (staleBackupError) {
      return {
        success: false,
        updated: false,
        code: 'PERMISSION_DENIED',
        previousVersion: previous.version,
        message: staleBackupError,
      };
    }

    const updateProcess = await this.runProcess(this.executablePath, ['-U'], UPDATE_TIMEOUT_MS);
    const updateOutput = formatProcessOutput(updateProcess);

    if (updateProcess.cancelled) {
      this.cancelRequested = false;
      const recovery = await this.recoverIfNeeded(oldPath);
      return {
        ...this.cancelledResult(),
        previousVersion: previous.version,
        message: recovery.message || 'La actualizacion fue cancelada.',
        warning: recovery.warning,
      };
    }

    if (updateProcess.timedOut || updateProcess.code !== 0 || updateProcess.error) {
      const recovery = await this.recoverIfNeeded(oldPath);
      return {
        success: false,
        updated: false,
        code: isPermissionError(updateProcess.error) ? 'PERMISSION_DENIED' : 'FAILED',
        previousVersion: previous.version,
        message: [
          updateOutput || updateProcess.error?.message || 'yt-dlp no pudo completar la actualizacion.',
          recovery.message,
        ]
          .filter(Boolean)
          .join('\n'),
        warning: recovery.warning,
      };
    }

    const current = await this.readVersion(this.executablePath);
    if (current.cancelled) {
      this.cancelRequested = false;
      const recovery = await this.recoverIfNeeded(oldPath);
      return {
        ...this.cancelledResult(),
        previousVersion: previous.version,
        message: recovery.message || 'La actualizacion fue cancelada.',
        warning: recovery.warning,
      };
    }
    if (!current.ok || !current.version) {
      const recovery = await this.recoverIfNeeded(oldPath);
      return {
        success: false,
        updated: false,
        code: 'VERIFY_FAILED',
        previousVersion: previous.version,
        message: [current.error || 'La nueva version de yt-dlp no pudo verificarse.', recovery.message]
          .filter(Boolean)
          .join('\n'),
        warning: recovery.warning,
      };
    }

    const cleanupWarning = this.removeBackup(oldPath);
    const updated = previous.version !== current.version;
    return {
      success: true,
      updated,
      code: updated ? 'UPDATED' : 'UP_TO_DATE',
      previousVersion: previous.version,
      currentVersion: current.version,
      message: updateOutput || (updated ? 'yt-dlp se actualizo correctamente.' : 'yt-dlp ya esta actualizado.'),
      warning: cleanupWarning || undefined,
    };
  }

  private validateExecutablePath(oldPath: string): YtdlpUpdateResult | null {
    try {
      const currentExists = fs.existsSync(this.executablePath);
      const backupExists = fs.existsSync(oldPath);
      if (!currentExists && !backupExists) {
        return {
          success: false,
          updated: false,
          code: 'MISSING_LOCAL',
          message: 'No se encontro yt-dlp.exe en tools/win.',
        };
      }
      if (currentExists && !fs.statSync(this.executablePath).isFile()) {
        return {
          success: false,
          updated: false,
          code: 'MISSING_LOCAL',
          message: 'La ruta de yt-dlp no apunta a un archivo valido.',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        updated: false,
        code: isPermissionError(error) ? 'PERMISSION_DENIED' : 'MISSING_LOCAL',
        message: error?.message || 'No se pudo acceder a yt-dlp.exe.',
      };
    }
    return null;
  }

  private probeDirectoryWriteAccess(): string | null {
    const directory = path.dirname(this.executablePath);
    const probePath = path.join(directory, `.yt-dlp-update-${process.pid}-${Date.now()}.tmp`);
    const renamedProbePath = `${probePath}.renamed`;
    try {
      fs.writeFileSync(probePath, '');
      fs.renameSync(probePath, renamedProbePath);
      fs.unlinkSync(renamedProbePath);
      return null;
    } catch (error: any) {
      try {
        if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
        if (fs.existsSync(renamedProbePath)) fs.unlinkSync(renamedProbePath);
      } catch {}
      return `No hay permisos de escritura en la carpeta de herramientas: ${error?.message || error}`;
    }
  }

  private removeStaleBackup(oldPath: string): string | null {
    if (!fs.existsSync(oldPath)) return null;
    try {
      fs.unlinkSync(oldPath);
      return null;
    } catch (error: any) {
      return `No se pudo limpiar la copia de recuperacion anterior: ${error?.message || error}`;
    }
  }

  private removeBackup(oldPath: string): string | null {
    if (!fs.existsSync(oldPath)) return null;
    try {
      fs.unlinkSync(oldPath);
      return null;
    } catch (error: any) {
      return `La actualizacion termino, pero no se pudo eliminar ${path.basename(oldPath)}: ${error?.message || error}`;
    }
  }

  private async readVersion(executablePath: string): Promise<VersionResult> {
    if (!fs.existsSync(executablePath)) {
      return { ok: false, error: `No existe ${path.basename(executablePath)}.` };
    }

    const result = await this.runProcess(executablePath, ['--version'], VERSION_TIMEOUT_MS);
    if (result.cancelled) return { ok: false, cancelled: true };
    if (result.code !== 0 || result.error) {
      return {
        ok: false,
        error:
          formatProcessOutput(result) ||
          result.error?.message ||
          `No se pudo ejecutar ${path.basename(executablePath)}.`,
      };
    }

    const version = [result.stdout, result.stderr]
      .join('\n')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return version ? { ok: true, version } : { ok: false, error: 'yt-dlp no devolvio una version valida.' };
  }

  private async recoverIfNeeded(oldPath: string): Promise<RecoveryResult> {
    if (!fs.existsSync(oldPath)) {
      return { restored: false, message: 'No existe una copia de recuperacion disponible.' };
    }

    const current = await this.readVersion(this.executablePath);
    if (current.ok) {
      const warning = this.removeBackup(oldPath);
      return {
        restored: false,
        message: 'La version actual de yt-dlp sigue siendo valida; no fue necesario restaurar la copia anterior.',
        warning: warning || undefined,
      };
    }

    const backup = await this.readVersion(oldPath);
    if (!backup.ok) {
      return {
        restored: false,
        message: `La copia de recuperacion no es valida: ${backup.error || 'version desconocida.'}`,
      };
    }

    const failedPath = `${this.executablePath}.failed-${Date.now()}`;
    let movedCurrent = false;
    try {
      if (fs.existsSync(this.executablePath)) {
        fs.renameSync(this.executablePath, failedPath);
        movedCurrent = true;
      }
      fs.renameSync(oldPath, this.executablePath);
    } catch (error: any) {
      if (movedCurrent && !fs.existsSync(this.executablePath)) {
        try {
          fs.renameSync(failedPath, this.executablePath);
        } catch {}
      }
      return {
        restored: false,
        message: `No se pudo restaurar yt-dlp.exe: ${error?.message || error}`,
      };
    }

    const restored = await this.readVersion(this.executablePath);
    if (!restored.ok) {
      try {
        if (fs.existsSync(this.executablePath)) fs.unlinkSync(this.executablePath);
        if (movedCurrent && fs.existsSync(failedPath)) fs.renameSync(failedPath, this.executablePath);
      } catch {}
      return {
        restored: false,
        message: `La copia restaurada no pudo verificarse: ${restored.error || 'version desconocida.'}`,
      };
    }

    let warning: string | undefined;
    if (movedCurrent && fs.existsSync(failedPath)) {
      try {
        fs.unlinkSync(failedPath);
      } catch (error: any) {
        warning = `La version defectuosa quedo guardada en ${path.basename(failedPath)}: ${error?.message || error}`;
      }
    }

    return {
      restored: true,
      message: `Se restauro automaticamente la version anterior de yt-dlp (${restored.version}).`,
      warning,
    };
  }

  private cancelledResult(): YtdlpUpdateResult {
    return {
      success: false,
      updated: false,
      code: 'CANCELLED',
      message: 'La actualizacion de yt-dlp fue cancelada.',
    };
  }

  private runProcess(executablePath: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
    return new Promise((resolve) => {
      if (this.cancelRequested) {
        resolve({
          code: null,
          stdout: '',
          stderr: '',
          timedOut: false,
          cancelled: true,
        });
        return;
      }

      let child: ManagedChildProcess;
      try {
        child = spawn(executablePath, args, {
          cwd: path.dirname(executablePath),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        resolve({
          code: null,
          stdout: '',
          stderr: '',
          error,
          timedOut: false,
          cancelled: false,
        });
        return;
      }

      this.activeChild = child;
      let stdout = '';
      let stderr = '';
      const OUTPUT_LIMIT = 20000;
      let timedOut = false;
      let settled = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        this.killProcessTree(child);
      }, timeoutMs);

      const finish = (result: ProcessResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.activeChild === child) this.activeChild = null;
        resolve(result);
      };

      child.stdout.on('data', (data: Buffer) => {
        if (stdout.length < OUTPUT_LIMIT) stdout += data.toString().slice(0, OUTPUT_LIMIT - stdout.length);
      });
      child.stderr.on('data', (data: Buffer) => {
        if (stderr.length < OUTPUT_LIMIT) stderr += data.toString().slice(0, OUTPUT_LIMIT - stderr.length);
      });
      child.once('error', (error: NodeJS.ErrnoException) =>
        finish({
          code: null,
          stdout,
          stderr,
          error,
          timedOut,
          cancelled: this.cancelRequested,
        }),
      );
      child.once('close', (code) =>
        finish({
          code,
          stdout,
          stderr,
          timedOut,
          cancelled: this.cancelRequested,
        }),
      );
    });
  }

  private killProcessTree(child: ManagedChildProcess): void {
    terminateChildProcessTree(child);
  }
}
