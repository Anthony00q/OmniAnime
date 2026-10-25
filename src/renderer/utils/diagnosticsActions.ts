import { toast } from 'sonner';
import { unwrap } from '@/renderer/hooks/queries/unwrap';
import { runToastTask } from './toastTask';

export async function revealLogFile(): Promise<boolean> {
  try {
    unwrap(await window.api.invoke('open-app-path', 'log-file'), { toast: false });
    return true;
  } catch (e: unknown) {
    toast.error('No se pudo mostrar el archivo de registro', {
      description: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export interface DiagnosticsSelection {
  level?: string;
  scope?: string;
  query?: string;
  sessionOnly?: boolean;
}

export async function exportDiagnostics(selection?: DiagnosticsSelection): Promise<boolean> {
  try {
    const record = await runToastTask(
      async () => unwrap(await window.api.invoke('export-diagnostics', selection ?? {}), { toast: false }),
      {
        loading: 'Exportando diagnóstico…',
        success: (result) => (result ? 'Diagnóstico exportado' : null),
        description: (result) => result?.path,
        error: 'No se pudo exportar el diagnóstico',
        timeoutMs: 125_000,
      },
    );
    return Boolean(record);
  } catch {
    return false;
  }
}
