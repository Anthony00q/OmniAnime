import { useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { Music, Play, Plus, Trash2, FileAudio, AlertCircle, Scissors } from 'lucide-react';
import {
  SOUND_CATALOG_GROUPS,
  makeCustomRef,
  makeSampleRef,
  parseSoundRef,
  type CustomSoundFileMeta,
  type SoundCatalogGroup,
} from '../../../../utils/soundCatalog';
import { SOUND_CATALOG } from '../../../../utils/soundCatalogData';
import type { NotificationSoundType } from '../../../../utils/soundPacks';
import { loadFullSoundBuffer, previewSoundSlice } from '../../../utils/sound';
import { SoundTrimEditor } from './SoundTrimEditor';

interface SoundPickerDialogProps {
  open: boolean;
  onClose: () => void;
  type: NotificationSoundType;
  typeLabel: string;
  currentRef?: string;
  customFiles: CustomSoundFileMeta[];
  previewVolume: number;
  onSelect: (ref: string | null) => void;
  onImported: (file: CustomSoundFileMeta) => void;
  onUpdateTrim: (id: string, trimStartSec: number, trimSec: number) => void;
  onDelete: (id: string) => void;
  onPreview: (ref: string) => void;
}

const TYPE_GROUP: Record<NotificationSoundType, SoundCatalogGroup> = {
  download: 'inicio',
  success: 'exito',
  error: 'error',
  info: 'info',
};

type TrimTarget = { file: CustomSoundFileMeta; buffer: AudioBuffer };

export function SoundPickerDialog({
  open,
  onClose,
  type,
  typeLabel,
  currentRef,
  customFiles,
  previewVolume,
  onSelect,
  onImported,
  onUpdateTrim,
  onDelete,
  onPreview,
}: SoundPickerDialogProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [trimTarget, setTrimTarget] = useState<TrimTarget | null>(null);
  const parsedCurrent = parseSoundRef(currentRef);

  const openTrimFor = async (file: CustomSoundFileMeta) => {
    setImportError(null);
    const buffer = await loadFullSoundBuffer(makeCustomRef(file.id));
    if (!buffer) {
      setImportError('No se pudo leer el audio para recortarlo.');
      return;
    }
    setTrimTarget({ file, buffer });
  };

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const res = (await window.api.invoke('import-custom-sound')) as {
        ok: boolean;
        error?: string;
        canceled?: boolean;
        file?: CustomSoundFileMeta;
      };
      if (res?.canceled) return;
      if (!res?.ok || !res.file) {
        setImportError(res?.error || 'No se pudo importar el sonido.');
        return;
      }
      onImported(res.file);
      onSelect(makeCustomRef(res.file.id));
      await openTrimFor(res.file);
    } catch {
      setImportError('No se pudo importar el sonido.');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmTrim = (trimStartSec: number, trimSec: number) => {
    if (!trimTarget) return;
    onUpdateTrim(trimTarget.file.id, trimStartSec, trimSec);
    const ref = makeCustomRef(trimTarget.file.id);
    onSelect(ref);
    previewSoundSlice(trimTarget.buffer, trimStartSec, trimSec, previewVolume);
    setTrimTarget(null);
  };

  const groups = [...SOUND_CATALOG_GROUPS].sort((a, b) => {
    const pref = TYPE_GROUP[type];
    return (a.id === pref ? -1 : 0) - (b.id === pref ? -1 : 0);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setTrimTarget(null);
          onClose();
        }
      }}
      title={trimTarget ? `Recortar: ${trimTarget.file.name}` : `Sonido de ${typeLabel}`}
      message={trimTarget ? undefined : 'Elige un sonido del catálogo, uno tuyo o vuelve al predeterminado.'}
      showFooter={false}
      icon={<Music className="w-5 h-5 text-primary" />}
      className="max-w-2xl"
      onPointerDownOutside={(e) => {
        if (!trimTarget) return;
        e.preventDefault();
        setTrimTarget(null);
      }}
      onEscapeKeyDown={(e) => {
        if (!trimTarget) return;
        e.preventDefault();
        e.stopPropagation();
        setTrimTarget(null);
      }}
    >
      {trimTarget ? (
        <SoundTrimEditor
          buffer={trimTarget.buffer}
          initialStartSec={trimTarget.file.trimStartSec ?? 0}
          initialTrimSec={trimTarget.file.trimSec ?? 15}
          volume={previewVolume}
          onConfirm={handleConfirmTrim}
          onBack={() => setTrimTarget(null)}
        />
      ) : (
        <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-pressed={!parsedCurrent}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              !parsedCurrent
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border-strong'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Predeterminado</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                El sonido del pack activo.
              </span>
            </span>
          </button>

          {groups.map((group) => {
            const entries = (SOUND_CATALOG as readonly (typeof SOUND_CATALOG)[number][]).filter(
              (s) => s.group === group.id,
            );
            if (entries.length === 0) return null;
            return (
              <section key={group.id}>
                <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground mb-2">{group.label}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {entries.map((entry) => {
                    const ref = makeSampleRef(entry.id);
                    const selected = parsedCurrent?.kind === 'sample' && parsedCurrent.id === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className={`relative rounded-xl border transition-colors ${
                          selected
                            ? 'border-primary/30 bg-primary/15'
                            : 'border-border/60 bg-background hover:border-border-strong'
                        }`}
                      >
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            onSelect(ref);
                            onPreview(ref);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <Play className="w-3.5 h-3.5 shrink-0 text-primary" fill="currentColor" />
                          <span
                            className={`min-w-0 text-[13px] font-semibold truncate ${selected ? 'text-primary' : ''}`}
                          >
                            {entry.label}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section>
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground mb-2">Mis sonidos</h4>
            <div className="rounded-xl border border-border/60 bg-background p-2 space-y-1">
              {customFiles.length === 0 && (
                <p className="text-[13px] text-muted-foreground px-2 py-3 leading-relaxed">
                  Todavía no has subido ninguno. Se admiten mp3, wav, ogg, m4a, aac, flac y webm de hasta 10 MB y 5 min;
                  podrás elegir hasta 15 s.
                </p>
              )}
              {customFiles.map((file) => {
                const ref = makeCustomRef(file.id);
                const selected = parsedCurrent?.kind === 'custom' && parsedCurrent.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                      selected ? 'border-primary/30 bg-primary/15' : 'border-transparent hover:bg-secondary/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(ref);
                        onPreview(ref);
                      }}
                      aria-pressed={selected}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <FileAudio className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className={`min-w-0 text-[13px] font-semibold truncate ${selected ? 'text-primary' : ''}`}>
                        {file.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {(file.trimSec ?? file.durationSec).toFixed(1)} s
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openTrimFor(file)}
                      aria-label={`Editar recorte de ${file.name}`}
                      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(file.id)}
                      aria-label={`Eliminar ${file.name}`}
                      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> Subir sonido
              </button>
              {importError && (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-1.5 text-[13px] text-destructive-fg leading-relaxed"
                >
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {importError}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
