import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleArrowUp, FileText } from 'lucide-react';
import { Dialog } from '@/renderer/components/Dialog';
import { ProgressBar } from '@/renderer/components/ui/ProgressBar';
import { ReleaseNotesView } from './ReleaseNotesView';
import { useAppUpdate } from '@/renderer/hooks/useAppUpdate';
import { releaseNotesForVersion } from '@/renderer/utils/releaseNotes';
import { buildReleasePageUrl } from '@/utils/security/externalUrl';
import {
  appUpdateAvailableAtom,
  appUpdateErrorAtom,
  appUpdateModalOpenAtom,
  appUpdatePercentAtom,
  appUpdatePhaseAtom,
} from '@/renderer/store/atoms';

const FALLBACK_NOTES = 'Sin notas de cambios para esta versión.';

const VERSION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary';
const VERSION_VALUE = 'text-base font-semibold tabular-nums';
const STATUS_ROW = 'mt-4 flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5';

export function UpdateModal() {
  const available = useAtomValue(appUpdateAvailableAtom);
  const open = useAtomValue(appUpdateModalOpenAtom);
  const phase = useAtomValue(appUpdatePhaseAtom);
  const percent = useAtomValue(appUpdatePercentAtom);
  const error = useAtomValue(appUpdateErrorAtom);
  const { dismiss, startDownload, install } = useAppUpdate();
  // null = aún sin leer la versión instalada; '' = no se pudo leer.
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const [notesCut, setNotesCut] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.api
      .invoke('get-app-version')
      .then((version: unknown) => {
        if (cancelled) return;
        setCurrentVersion(typeof version === 'string' ? version : '');
      })
      .catch(() => {
        if (!cancelled) setCurrentVersion('');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // El velo inferior avisa de que quedan cambios por leer; se recalcula al
  // desplazar y al redibujar, sin observers: el diálogo solo existe abierto.
  const syncNotesCut = () => {
    const el = notesRef.current;
    if (!el) return;
    setNotesCut(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };
  useEffect(syncNotesCut);

  if (!available) return null;

  const loadingVersion = currentVersion === null;
  const hasCompare = !loadingVersion && currentVersion !== '' && currentVersion !== available.version;
  const trimmedNotes = available.notes?.trim() ? releaseNotesForVersion(available.notes, available.version) : null;
  const notes = trimmedNotes?.trim() ? trimmedNotes : null;
  // Sin notas, al menos un camino a la release publicada.
  const releaseUrl = notes ? null : buildReleasePageUrl(available.version);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      title="Actualización disponible"
      showFooter={false}
      headerAlign="center"
      className="max-w-2xl"
      icon={
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/15">
          <CircleArrowUp className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
      }
    >
      <div aria-live="polite" className="rounded-lg border border-border/60 bg-background/40 px-4 py-3">
        {hasCompare || loadingVersion ? (
          <>
            <div className="flex items-center gap-4">
              <div className={`flex-1 text-right ${VERSION_LABEL}`}>Instalada</div>
              <div className="w-4 shrink-0" aria-hidden="true" />
              <div className={`flex-1 ${VERSION_LABEL}`}>Nueva</div>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div className={`flex-1 text-right ${VERSION_VALUE} text-muted-foreground`}>
                {loadingVersion ? <span className="text-text-tertiary">—</span> : `v${currentVersion}`}
              </div>
              <ArrowRight className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
              <div className={`flex-1 ${VERSION_VALUE} text-foreground`}>v{available.version}</div>
            </div>
          </>
        ) : (
          <p className={`${VERSION_VALUE} text-center text-foreground`}>v{available.version}</p>
        )}
      </div>

      <div className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        Novedades
      </div>

      <div className="relative">
        <div
          ref={notesRef}
          onScroll={syncNotesCut}
          className="custom-scrollbar max-h-[50vh] overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-foreground select-text"
        >
          {notes ? (
            <ReleaseNotesView notes={notes} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <FileText className="w-5 h-5 text-text-tertiary" aria-hidden="true" />
              <p className="text-[13px] text-muted-foreground">{FALLBACK_NOTES}</p>
              {releaseUrl && (
                <a
                  href={releaseUrl}
                  onClick={(event) => {
                    event.preventDefault();
                    void window.api.invoke('open-external-url', releaseUrl, { policy: 'changelog' });
                  }}
                  className="mt-1 text-[13px] font-medium text-primary underline underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                >
                  Ver la release en GitHub
                </a>
              )}
            </div>
          )}
        </div>
        {notesCut && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-px bottom-px h-8 rounded-b-[7px] bg-gradient-to-t from-[color-mix(in_srgb,var(--color-background)_40%,var(--color-popover))] to-transparent"
          />
        )}
      </div>

      {phase === 'downloading' && (
        <div className="mt-4">
          <ProgressBar value={Math.round(percent)} showValue label="Descargando actualización" />
        </div>
      )}

      {phase === 'downloaded' && (
        <div className={STATUS_ROW}>
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden="true" />
          <p className="text-[13px] text-muted-foreground">Descarga lista. La app se reiniciará para instalar.</p>
        </div>
      )}

      {error && (
        <div role="alert" className={STATUS_ROW}>
          <AlertTriangle className="w-4 h-4 text-destructive-fg shrink-0" aria-hidden="true" />
          <p className="text-[13px] text-destructive-fg">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={dismiss}
          className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Ahora no
        </button>
        {phase === 'downloaded' ? (
          <button
            type="button"
            onClick={() => void install()}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] min-w-[148px]"
          >
            Reiniciar para instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startDownload()}
            disabled={phase === 'downloading'}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] min-w-[148px]"
          >
            {phase === 'downloading' ? 'Descargando…' : 'Descargar e instalar'}
          </button>
        )}
      </div>
    </Dialog>
  );
}
