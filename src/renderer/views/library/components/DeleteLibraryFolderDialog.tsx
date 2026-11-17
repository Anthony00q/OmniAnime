import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { useLibraryActions } from '@/renderer/hooks/useQueries';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import type { LibraryFolder } from '@/services/library/LibraryFileService';

export function DeleteLibraryFolderDialog({ item, onClose }: { item: LibraryFolder; onClose: () => void }) {
  const { deleteFolder } = useLibraryActions();
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const confirm = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    try {
      await deleteFolder.mutateAsync(item.path);
      toast.success('Carpeta eliminada');
      onClose();
    } catch (reason) {
      setError(
        isIpcFailError(reason)
          ? reason.message
          : 'No se pudo confirmar el borrado. Comprueba la carpeta antes de intentarlo de nuevo.',
      );
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="¿Eliminar esta carpeta?"
      message="Se eliminarán la carpeta y todos sus archivos, incluidos los episodios descargados."
      icon={<Trash2 className="h-5 w-5" />}
      danger
      confirmLabel="Eliminar carpeta"
      confirmLoading={deleteFolder.isPending}
      dismissDisabled={deleteFolder.isPending}
      closeOnConfirm={false}
      onConfirm={confirm}
      className="max-w-lg"
    >
      <div className="rounded-lg bg-surface-elevated p-4 select-text">
        <p className="text-sm font-semibold text-foreground break-words">{item.metaTitle || item.name}</p>
        <p className="mt-2 text-xs text-muted-foreground break-all">{item.path}</p>
      </div>
      <p className="mt-4 text-[13px] text-destructive-fg">Esta acción no se puede deshacer.</p>
      {error && (
        <p role="alert" className="mt-4 text-[13px] leading-relaxed text-destructive-fg">
          {error}
        </p>
      )}
    </Dialog>
  );
}
