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
import { usePreviewFolderRename } from '@/renderer/hooks/useQueries';
import { AniListLinkDialog } from '@/renderer/views/animeDetails/components/AniListLinkDialog';

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
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [titlesError, setTitlesError] = useState(false);
  const [lookupRevision, setLookupRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [visibleCheck, setVisibleCheck] = useState<string | null>(null);
  const session = useRef(0);
  const lookup = JSON.stringify(anilistInputFromFolderMeta(meta));
  useEffect(() => {
    const current = ++session.current;
    return () => {
      session.current = current + 1;
    };
  }, [open]);

  useEffect(() => {
    setPicked('');
    setCustom('');
    setError(null);
    setLinkOpen(false);
  }, [open, folderPath]);

  useEffect(() => {
    if (!open) return;
    setTitles(null);
    setLoadingTitles(true);
    setTitlesError(false);
    let cancelled = false;
    (async () => {
      try {
        const metaResult = await queryClient.fetchQuery({
          ...getAniListBannerQuery({ ...JSON.parse(lookup), forceRefresh: lookupRevision > 0 }),
          staleTime: lookupRevision ? 0 : ANILIST_BANNER_STALE_MS,
          retry: false,
        });
        if (!cancelled) setTitles(metaResult?.titles ?? null);
      } catch {
        if (!cancelled) {
          setTitles(null);
          setTitlesError(true);
        }
      } finally {
        if (!cancelled) setLoadingTitles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, folderPath, lookup, lookupRevision, queryClient]);

  const candidates = folderRenameCandidates({ folderPath, folderName, meta: meta ?? null }, titles);
  const requestedName = custom.trim() || picked;
  const validName = isValidFolderName(requestedName);
  const finalName = validName ? withFolderLanguage(requestedName, meta?.lang) : requestedName;
  const preview = usePreviewFolderRename(
    folderPath,
    finalName,
    open && validName && finalName !== folderName && !linkOpen,
  );
  const checkingDestination = open && !linkOpen && validName && finalName !== folderName && preview.isFetching;
  const checkKey = checkingDestination ? JSON.stringify([folderPath, finalName]) : null;
  useEffect(() => {
    setVisibleCheck(null);
    if (!checkKey) return;
    const timeout = window.setTimeout(() => setVisibleCheck(checkKey), 250);
    return () => window.clearTimeout(timeout);
  }, [checkKey]);
  const showDestinationCheck = checkKey !== null && visibleCheck === checkKey;

  const handleConfirm = async () => {
    if (
      !validName ||
      finalName === folderName ||
      saving ||
      actions.isMutating ||
      preview.isError ||
      !preview.data?.available ||
      preview.isFetching
    )
      return;
    const currentSession = session.current;
    setSaving(true);
    setError(null);
    try {
      const result = await actions.renameFolder.mutateAsync({
        oldPath: folderPath,
        newName: finalName,
        expectedRevision: preview.data.revision,
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

  if (linkOpen && meta?.providerId && meta.slug)
    return (
      <AniListLinkDialog
        open
        onClose={() => setLinkOpen(false)}
        providerId={meta.providerId}
        slug={meta.slug}
        defaultQuery={meta.title ?? folderName}
        currentId={meta.anilistId}
        onLinked={() => setLookupRevision((value) => value + 1)}
      />
    );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar nombre de la carpeta"
      icon={<FolderPen className="w-5 h-5" aria-hidden="true" />}
      message="Elige uno de los nombres conocidos del anime o escribe el tuyo."
      confirmLabel={saving ? 'Guardando…' : 'Renombrar'}
      confirmDisabled={
        !validName ||
        finalName === folderName ||
        saving ||
        actions.isMutating ||
        preview.isError ||
        preview.isFetching ||
        !preview.data?.available
      }
      confirmLoading={saving || showDestinationCheck}
      closeOnConfirm={false}
      dismissDisabled={saving}
      onConfirm={handleConfirm}
      className="max-w-lg"
    >
      <span role="status" className="sr-only">
        {showDestinationCheck ? 'Comprobando el destino…' : ''}
      </span>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <p role="status">
            {loadingTitles
              ? 'Consultando títulos de AniList…'
              : titlesError
                ? 'No se pudieron consultar los títulos de AniList.'
                : titles
                  ? 'Títulos del proveedor y de AniList'
                  : 'No hay títulos de AniList disponibles.'}
          </p>
          {titlesError && (
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 hover:bg-secondary"
              onClick={() => setLookupRevision((value) => value + 1)}
            >
              Reintentar
            </button>
          )}
          {meta?.providerId && meta.slug && (
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-foreground hover:bg-secondary"
              onClick={() => setLinkOpen(true)}
            >
              Revisar vínculo AniList
            </button>
          )}
        </div>
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
                <li key={candidate.id}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-secondary/40">
                    <CustomRadio value={candidate.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">{candidate.label}</span>
                      <span className="block break-words text-sm text-foreground">{candidate.name}</span>
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
            focusTone="neutral"
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
        {validName && finalName !== folderName && (
          <div className="grid gap-3 rounded-xl bg-secondary/30 p-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Actual</p>
              <p className="mt-1 break-words text-sm">{folderName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nombre final</p>
              <p className="mt-1 break-words text-sm font-medium">{finalName}</p>
            </div>
          </div>
        )}
        {!preview.isFetching && preview.data && !preview.data.available && (
          <p role="alert" className="text-xs text-destructive-fg">
            Ya existe una carpeta con ese nombre. Elige otro.
          </p>
        )}
        {preview.isError && (
          <p role="alert" className="text-xs text-destructive-fg">
            No se pudo comprobar el destino.{' '}
            <button type="button" className="min-h-11 px-2 underline" onClick={() => void preview.refetch()}>
              Reintentar
            </button>
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
