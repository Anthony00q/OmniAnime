import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { CheckCircle2, CircleArrowUp } from 'lucide-react';
import { Dialog } from '../Dialog';
import { ProgressBar } from '../ui/ProgressBar';
import { ReleaseNotesView } from './ReleaseNotesView';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import {
  appUpdateAvailableAtom,
  appUpdateErrorAtom,
  appUpdateModalOpenAtom,
  appUpdatePercentAtom,
  appUpdatePhaseAtom,
} from '../../store/atoms';

const FALLBACK_NOTES = 'Sin notas de cambios para esta versión.';

export function UpdateModal() {
  const available = useAtomValue(appUpdateAvailableAtom);
  const open = useAtomValue(appUpdateModalOpenAtom);
  const phase = useAtomValue(appUpdatePhaseAtom);
  const percent = useAtomValue(appUpdatePercentAtom);
  const error = useAtomValue(appUpdateErrorAtom);
  const { dismiss, startDownload, install } = useAppUpdate();
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.api
      .invoke('get-app-version')
      .then((version: unknown) => {
        if (!cancelled && typeof version === 'string') setCurrentVersion(version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!available) return null;

  const versionLine =
    currentVersion && currentVersion !== available.version
      ? `v${currentVersion} → v${available.version}`
      : `v${available.version}`;

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
      <p className="text-xs font-bold tabular-nums text-primary mb-3" aria-live="polite">
        {versionLine}
      </p>

      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 select-none">
        Novedades
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-foreground select-text">
        <ReleaseNotesView notes={available.notes || FALLBACK_NOTES} />
      </div>

      {phase === 'downloading' && (
        <div className="mt-4">
          <ProgressBar value={Math.round(percent)} showValue label="Descargando actualización" />
        </div>
      )}

      {phase === 'downloaded' && (
        <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden="true" />
          Descarga lista. La app se reiniciará para instalar.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-destructive-fg">
          {error}
        </p>
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
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 bg-primary text-primary-foreground hover:bg-primary/90 min-w-[148px]"
          >
            Reiniciar para instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startDownload()}
            disabled={phase === 'downloading'}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90 min-w-[148px]"
          >
            {phase === 'downloading' ? `Descargando… ${Math.round(percent)}%` : 'Descargar e instalar'}
          </button>
        )}
      </div>
    </Dialog>
  );
}
