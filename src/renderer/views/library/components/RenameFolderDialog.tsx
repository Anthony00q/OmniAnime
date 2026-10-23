import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderPen } from 'lucide-react';
import { toast } from 'sonner';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import { Dialog } from '@/renderer/components/Dialog';
import { CustomInput } from '@/renderer/components/CustomInput';
import { CustomRadio, CustomRadioGroup } from '@/renderer/components/CustomRadioGroup';
import { ANILIST_BANNER_STALE_MS, getAniListBannerQuery, useLibraryActions } from '@/renderer/hooks/useQueries';
import {
  folderRenameCandidates,
  anilistInputFromFolderMeta,
  type FolderRenameMeta,
} from '@/renderer/utils/folderRename';
import type { AniListFolderTitles } from '@/utils/downloads/folderNaming';
import { isValidFolderName, withFolderLanguage } from '@/utils/downloads/folderNaming';

interface RenameFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  folderName: string;
  meta: FolderRenameMeta | null;
  onRenamed?: (newPath: string) => void;
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
  const actions = useLibraryActions();
  const [titles, setTitles] = useState<AniListFolderTitles | null>(null);
  const [picked, setPicked] = useState<string>('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const session = useRef(0);
  const lookup = JSON.stringify(anilistInputFromFolderMeta(meta));
  useEffect(() => {
    const current = ++session.current;
    return () => {
      session.current = current + 1;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPicked('');
    setCustom('');
    setError(null);
    setTitles(null);
    let cancelled = false;
    (async () => {
      try {
        const metaResult = await queryClient.fetchQuery({
          ...getAniListBannerQuery(JSON.parse(lookup)),
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
  }, [open, folderPath, lookup, queryClient]);

  const candidates = folderRenameCandidates({ folderPath, folderName, meta: meta ?? null }, titles);
  const requestedName = custom.trim() || picked;
  const validName = isValidFolderName(requestedName);
  const finalName = validName ? withFolderLanguage(requestedName, meta?.lang) : requestedName;

  const handleConfirm = async () => {
    if (!validName || finalName === folderName || saving || actions.isMutating) return;
    const currentSession = session.current;
    setSaving(true);
    setError(null);
    try {
      const result = await actions.renameFolder.mutateAsync({
        oldPath: folderPath,
        newName: finalName,
      });
      if (currentSession !== session.current) return;
      toast.success('Carpeta renombrada');
      onOpenChange(false);
      onRenamed?.(result.newPath);
    } catch (e: unknown) {
      if (currentSession !== session.current) return;
      setError(isIpcFailError(e) ? e.message : 'No se pudo renombrar la carpeta.');
    } finally {
      if (currentSession === session.current) setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar nombre de la carpeta"
      icon={<FolderPen className="w-5 h-5" aria-hidden="true" />}
      message="Elige uno de los nombres conocidos del anime o escribe el tuyo."
      confirmLabel={saving ? 'Guardando…' : 'Renombrar'}
      confirmDisabled={!validName || finalName === folderName || saving || actions.isMutating}
      confirmLoading={saving}
      closeOnConfirm={false}
      dismissDisabled={saving}
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
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary shrink-0">
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

        {requestedName && !validName && (
          <p role="alert" className="text-xs text-destructive-fg">
            El nombre no es válido en Windows.
          </p>
        )}
        {validName && finalName !== requestedName && (
          <p className="text-xs text-muted-foreground">
            Nombre final: <span className="font-mono">{finalName}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive-fg leading-relaxed">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
