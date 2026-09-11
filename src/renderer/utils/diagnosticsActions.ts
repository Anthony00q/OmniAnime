import { toast } from 'sonner';

export async function revealLogFile(): Promise<boolean> {
  try {
    const res = (await window.api.invoke('open-app-path', 'log-file')) as { success?: boolean; error?: string };
    if (res?.success === false) throw new Error(res?.error || 'No se pudo mostrar el archivo');
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
}

export async function exportDiagnostics(selection?: DiagnosticsSelection): Promise<boolean> {
  const toastId = toast.loading('Exportando diagnóstico...');
  try {
    const res: unknown = await window.api.invoke('export-diagnostics', selection ?? {});
    const record = res as { success?: boolean; canceled?: boolean; path?: string; error?: string };
    if (record?.canceled) {
      toast.dismiss(toastId);
      return false;
    }
    if (record?.success !== true) throw new Error(record?.error || 'Sin datos');
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
