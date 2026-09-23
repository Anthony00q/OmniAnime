import { memo, useState } from 'react';
import { Bell, Volume2, Info, Zap, Play, ChevronDown, Music } from 'lucide-react';
import { toast } from 'sonner';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { ToastPositionSelector } from '../../../components/ToastPositionSelector';
import { SoundPickerDialog } from '../components/SoundPickerDialog';
import {
  DEFAULT_TYPE_VOLUMES,
  SOUND_PACK_CHOICES,
  SOUND_PACK_HINTS,
  SOUND_PACK_LABELS,
  type NotificationSoundType,
  type SoundPackId,
} from '../../../../utils/soundPacks';
import { parseSoundRef, type CustomSoundFileMeta, type SoundCatalogGroup } from '../../../../utils/soundCatalog';
import { SOUND_CATALOG } from '../../../../utils/soundCatalogData';

interface NotificationsTabProps {
  settings: any;
  onChange: (key: string, value: any, category?: string) => void;
  onTestSound: (type?: NotificationSoundType, pack?: SoundPackId, ref?: string) => void;
}

const TYPE_ROWS: ReadonlyArray<{
  key: NotificationSoundType;
  label: string;
  desc: string;
  group: SoundCatalogGroup;
}> = [
  { key: 'download', label: 'Descarga', desc: 'Al empezar', group: 'inicio' },
  { key: 'success', label: 'Éxito', desc: 'Al terminar', group: 'exito' },
  { key: 'error', label: 'Error', desc: 'Si algo falla', group: 'error' },
  { key: 'info', label: 'Info', desc: 'Avisos del sistema', group: 'info' },
];

const EVENT_ROWS: ReadonlyArray<{ key: string; label: string; desc: string }> = [
  { key: 'showDownloadStarted', label: 'Descarga iniciada', desc: 'Al empezar cada episodio' },
  { key: 'showDownloadFinished', label: 'Descarga completada', desc: 'Cuando termina una descarga' },
  { key: 'showDownloadError', label: 'Error de descarga', desc: 'Si falla la red o el servidor' },
  { key: 'showSystemMessages', label: 'Mensajes del sistema', desc: 'Avisos de la app y actualizaciones' },
];

const TOAST_POSITION_LABELS: Record<string, string> = {
  'top-left': 'Arriba a la izquierda',
  'top-center': 'Arriba al centro',
  'top-right': 'Arriba a la derecha',
  'bottom-left': 'Abajo a la izquierda',
  'bottom-center': 'Abajo al centro',
  'bottom-right': 'Abajo a la derecha',
};

function SoundSlider({
  value,
  onChange,
  ariaLabel,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <input
      aria-label={ariaLabel}
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={
        compact
          ? 'flex-1 h-1.5 accent-primary cursor-pointer appearance-none bg-secondary rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background'
          : 'w-full h-2 accent-primary cursor-pointer appearance-none bg-secondary rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background'
      }
      style={{
        background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${pct}%, var(--color-secondary) ${pct}%, var(--color-secondary) 100%)`,
      }}
    />
  );
}

function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <Play className="w-3.5 h-3.5" fill="currentColor" />
    </button>
  );
}

function describeSoundRef(ref: unknown, customFiles: CustomSoundFileMeta[]): string | null {
  const parsed = parseSoundRef(ref);
  if (!parsed) return null;
  if (parsed.kind === 'custom') {
    const file = customFiles.find((f) => f.id === parsed.id);
    return file ? file.name : null;
  }
  const entry = (SOUND_CATALOG as readonly { id: string; label: string }[]).find((s) => s.id === parsed.id);
  return entry ? entry.label : null;
}

export const NotificationsTab = memo(function NotificationsTab({
  settings,
  onChange,
  onTestSound,
}: NotificationsTabProps) {
  const [typesOpen, setTypesOpen] = useState(false);
  const [pickerType, setPickerType] = useState<NotificationSoundType | null>(null);
  const soundsOn = settings.notificationsSound !== false;
  const activePack = (SOUND_PACK_CHOICES as readonly string[]).includes(settings.soundPack)
    ? (settings.soundPack as SoundPackId)
    : 'sala';
  const customFiles: CustomSoundFileMeta[] = Array.isArray(settings.customSoundFiles) ? settings.customSoundFiles : [];
  const soundCustom: Record<string, string> = settings.soundCustom || {};

  const handleImported = (file: CustomSoundFileMeta) => {
    const next = [...customFiles.filter((f) => f.id !== file.id), file];
    onChange('customSoundFiles', next);
  };

  const handleDeleteCustom = async (id: string) => {
    try {
      await window.api.invoke('delete-custom-sound', id);
    } catch {}
    onChange(
      'customSoundFiles',
      customFiles.filter((f) => f.id !== id),
    );
    const nextMap: Record<string, string> = { ...soundCustom };
    for (const [k, v] of Object.entries(nextMap)) {
      const parsed = parseSoundRef(v);
      if (parsed?.kind === 'custom' && parsed.id === id) delete nextMap[k];
    }
    onChange('soundCustom', nextMap);
  };

  const handleSelectSound = (type: NotificationSoundType, ref: string | null) => {
    const nextMap: Record<string, string> = { ...soundCustom };
    if (ref) nextMap[type] = ref;
    else delete nextMap[type];
    onChange('soundCustom', nextMap);
  };

  const handleUpdateTrim = (id: string, trimStartSec: number, trimSec: number) => {
    onChange(
      'customSoundFiles',
      customFiles.map((f) => (f.id === id ? { ...f, trimStartSec, trimSec } : f)),
    );
  };

  const pickerRow = pickerType ? TYPE_ROWS.find((t) => t.key === pickerType) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Notificaciones y alertas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Elige qué avisos y sonidos quieres ver.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-primary" />
                <h3 className="text-sm font-bold">Eventos de notificación</h3>
              </div>
              <div className="rounded-xl border border-border/60 bg-background p-3">
                {EVENT_ROWS.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 py-3 border-b last:border-0 border-border/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug">{item.label}</div>
                      <div className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                    <CustomSwitch
                      checked={settings.notificationSettings?.[item.key] !== false}
                      onChange={(c) => onChange(item.key, c, 'notificationSettings')}
                      ariaLabel={item.label}
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
                  <h4 className="text-sm font-bold leading-tight truncate min-w-0 flex-1">
                    Posición de alertas internas
                  </h4>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
                    {TOAST_POSITION_LABELS[settings.toastPosition] || 'Arriba al centro'}
                  </span>
                </div>
                <ToastPositionSelector
                  value={settings.toastPosition || 'top-center'}
                  onChange={(v) => onChange('toastPosition', v)}
                />
                <button
                  type="button"
                  onClick={() => {
                    toast.success('Notificación de prueba.', {
                      position: settings.toastPosition || 'top-center',
                    });
                    if (soundsOn) onTestSound('success');
                  }}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-background hover:bg-secondary border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Bell className="w-4 h-4 text-primary" /> Probar notificación
                </button>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Se aplica a todas las notificaciones de la app.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-primary" />
                <h3 className="text-sm font-bold">Alertas sonoras</h3>
              </div>

              <div className="rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Activar sonidos</div>
                    <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                      Suena al iniciar, al terminar o si algo falla.
                    </p>
                  </div>
                  <CustomSwitch
                    checked={soundsOn}
                    onChange={(c) => onChange('notificationsSound', c)}
                    ariaLabel="Activar sonidos"
                  />
                </div>
              </div>

              <div className={`space-y-4 transition-opacity ${soundsOn ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="text-sm font-semibold mb-1">Sonido</div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                    Elige el timbre. Al pulsar uno suena una muestra.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {SOUND_PACK_CHOICES.map((id) => {
                      const selected = activePack === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            onChange('soundPack', id);
                            onTestSound('success', id);
                          }}
                          className={`h-8 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                            selected
                              ? 'border-primary/30 bg-primary/15 text-primary'
                              : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border-strong'
                          }`}
                        >
                          {SOUND_PACK_LABELS[id]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">{SOUND_PACK_HINTS[activePack]}</p>

                  {activePack === 'custom' && (
                    <div className="mt-4 pt-4 border-t border-border/40 space-y-1">
                      <div className="text-xs font-bold tracking-wide uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Music className="w-3.5 h-3.5" /> Sonidos por tipo
                      </div>
                      {TYPE_ROWS.map((item) => {
                        const current = describeSoundRef(soundCustom[item.key], customFiles);
                        return (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0 border-border/40"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <PlayButton
                                label={`Probar sonido de ${item.label}`}
                                onClick={() => onTestSound(item.key, undefined, soundCustom[item.key])}
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold leading-snug">{item.label}</div>
                                <div className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                                  {current || 'Predeterminado'}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPickerType(item.key)}
                              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                            >
                              Cambiar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex justify-between items-center mb-3">
                    <label
                      htmlFor="sound-volume"
                      className="text-xs font-bold tracking-wide uppercase text-muted-foreground"
                    >
                      Volumen general
                    </label>
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                      {Math.round((settings.soundVolume ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <div className="relative py-2">
                    <SoundSlider
                      value={settings.soundVolume ?? 0.5}
                      onChange={(v) => onChange('soundVolume', v)}
                      ariaLabel="Volumen general de sonidos"
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3 gap-2">
                    <span className="text-[11px] text-muted-foreground">Silencio</span>
                    <button
                      type="button"
                      onClick={() => onTestSound('success')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-background hover:bg-secondary border border-border rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-primary" /> Probar sonido
                    </button>
                    <span className="text-[11px] text-muted-foreground">Alto</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <button
                    type="button"
                    onClick={() => setTypesOpen((v) => !v)}
                    aria-expanded={typesOpen}
                    className="w-full flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Volumen por tipo</span>
                      <span className="block text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                        Ajuste fino de cada aviso.
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${typesOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${typesOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  >
                    <div className="overflow-hidden">
                      <div className="pt-3">
                        {TYPE_ROWS.map((item) => {
                          const enabled = (settings.soundEnabled?.[item.key] ?? true) !== false;
                          const vol = settings.soundProfiles?.[item.key] ?? DEFAULT_TYPE_VOLUMES[item.key];
                          const pct = Math.round(vol * 100);
                          return (
                            <div
                              key={item.key}
                              className="flex flex-col gap-2 py-2.5 border-b last:border-0 border-border/40"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <PlayButton
                                    label={`Probar sonido de ${item.label}`}
                                    onClick={() => onTestSound(item.key, undefined, soundCustom[item.key])}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold leading-snug">{item.label}</div>
                                    <div className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                                      {item.desc}
                                    </div>
                                  </div>
                                </div>
                                <CustomSwitch
                                  checked={enabled && soundsOn}
                                  onChange={(c) => onChange(item.key, c, 'soundEnabled')}
                                  ariaLabel={`${item.label} sonido`}
                                />
                              </div>
                              <div
                                className={`flex items-center gap-3 pl-9 ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}
                              >
                                <SoundSlider
                                  compact
                                  value={vol}
                                  onChange={(v) => onChange(item.key, v, 'soundProfiles')}
                                  ariaLabel={`Volumen ${item.label}`}
                                />
                                <span className="shrink-0 text-[11px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/15 min-w-[38px] text-center">
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[11px] text-muted-foreground leading-relaxed pt-3">
                          El volumen final combina el general con el de cada tipo. Si desactivas un tipo, no sonará.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2 px-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Si desactivas un evento, no verás ni oirás sus avisos.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 px-1">
        <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Los avisos del sistema usan notificaciones del sistema y los de descargas aparecen en la app.
        </p>
      </div>

      {pickerRow && (
        <SoundPickerDialog
          open
          onClose={() => setPickerType(null)}
          type={pickerRow.key}
          typeLabel={pickerRow.label}
          currentRef={soundCustom[pickerRow.key]}
          customFiles={customFiles}
          previewVolume={Math.max(
            0.05,
            Math.min(1, settings.soundVolume ?? 0.5) *
              Math.min(1, Math.max(0, settings.soundProfiles?.[pickerRow.key] ?? DEFAULT_TYPE_VOLUMES[pickerRow.key])),
          )}
          onSelect={(ref) => handleSelectSound(pickerRow.key, ref)}
          onImported={handleImported}
          onUpdateTrim={handleUpdateTrim}
          onDelete={handleDeleteCustom}
          onPreview={(ref) => onTestSound(pickerRow.key, undefined, ref)}
        />
      )}
    </div>
  );
});
