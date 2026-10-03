import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { CustomInput } from '@/renderer/components/CustomInput';
import { CustomRadio, CustomRadioGroup } from '@/renderer/components/CustomRadioGroup';
import { ANILIST_BANNER_STALE_MS, getAniListBannerQuery } from '@/renderer/hooks/useQueries';
import { folderRenameCandidates, type FolderRenameMeta } from '@/renderer/utils/folderRename';
import type { AniListFolderTitles } from '@/utils/downloads/folderNaming';

interface RenameFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  folderName: string;
  meta: FolderRenameMeta | null;
  onRenamed?: () => void;
}

export function RenameFolderDialog({
  open,
  onOpenChange,
  folderPath,
  folderName,
  meta,
  onRenamed,
}: RenameFolderDialogProps) {
  const queryClient = useQueryClient();
  const [titles, setTitles] = useState<AniListFolderTitles | null>(null);
  const [picked, setPicked] = useState<string>('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked('');
    setCustom('');
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const metaResult = await queryClient.fetchQuery({
          ...getAniListBannerQuery({
            title: meta?.title ?? '',
            alternativeTitles: meta?.alternativeTitles ?? null,
            providerYear: meta?.year ?? null,
          }),
          staleTime: ANILIST_BANNER_STALE_MS,
        });
        if (!cancelled) setTitles(metaResult?.titles ?? null);
      } catch {
        if (!cancelled) setTitles(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, meta, queryClient]);

  const candidates = folderRenameCandidates({ folderPath, folderName, meta: meta ?? null }, titles);
  const finalName = custom.trim() || picked;

  const handleConfirm = async () => {
    if (!finalName || finalName === folderName) return;
    setSaving(true);
    setError(null);
    try {
      const res = (await window.api.invoke('rename-folder', {
        oldPath: folderPath,
        newName: finalName,
      })) as { success: boolean; error?: string } | null;
      if (res && res.success) {
        toast.success('Carpeta renombrada');
        onOpenChange(false);
        onRenamed?.();
      } else {
        setError(res?.error || 'No se pudo renombrar la carpeta.');
      }
    } catch {
      setError('No se pudo renombrar la carpeta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar nombre de la carpeta"
      message="Elige uno de los nombres conocidos del anime o escribe el tuyo."
      confirmLabel={saving ? 'Guardando…' : 'Renombrar'}
      confirmDisabled={!finalName || finalName === folderName || saving}
      confirmLoading={saving}
      onConfirm={handleConfirm}
      className="max-w-lg"
    >
      <div className="space-y-3">
        <CustomRadioGroup
          value={custom.trim() ? '' : picked}
          onChange={(v) => {
            setPicked(v);
            setCustom('');
          }}
          ariaLabel="Nombres conocidos del anime"
        >
          <ul className="rounded-xl border border-border/50 divide-y divide-border/40">
            {candidates.map((candidate) => {
              return (
                <li key={candidate.key}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-secondary/40">
                    <CustomRadio value={candidate.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">{candidate.label}</span>
                      <span className="block font-mono text-xs text-foreground truncate">{candidate.name}</span>
                    </span>
                    {candidate.name === folderName && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary shrink-0">
                        Actual
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </CustomRadioGroup>

        <div className="space-y-1.5">
          <span id="folder-rename-custom-label" className="block text-xs font-semibold text-foreground">
            Nombre personalizado
          </span>
          <CustomInput
            value={custom}
            onChange={setCustom}
            ariaLabelledBy="folder-rename-custom-label"
            placeholder={folderName}
          />
        </div>

        {error && <p className="text-[11px] text-destructive-fg leading-relaxed">{error}</p>}
      </div>
    </Dialog>
  );
}
