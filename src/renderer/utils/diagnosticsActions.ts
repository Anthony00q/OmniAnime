import { toast } from 'sonner';
import { unwrap } from '@/renderer/hooks/queries/unwrap';

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
  const toastId = toast.loading('Exportando diagnóstico...');
  try {
    const record = unwrap(await window.api.invoke('export-diagnostics', selection ?? {}), { toast: false });
    if (!record) {
      toast.dismiss(toastId);
      return false;
    }
    toast.success('Diagnóstico exportado', { id: toastId, description: record.path });
    return true;
  } catch (e: unknown) {
    toast.error('No se pudo exportar el diagnóstico', {
      id: toastId,
      description: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
