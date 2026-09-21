import { memo } from 'react';
import { Bell, Volume2, Info, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { ToastPositionSelector } from '../../../components/ToastPositionSelector';

interface NotificationsTabProps {
  settings: any;
  onChange: (key: string, value: any, category?: string) => void;
  onTestSound: () => void;
}

export const NotificationsTab = memo(function NotificationsTab({
  settings,
  onChange,
  onTestSound,
}: NotificationsTabProps) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
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
              <div className="space-y-1 rounded-xl border border-border/50 bg-background p-3">
                {[
                  {
                    key: 'showDownloadStarted',
                    label: 'Descarga iniciada',
                    desc: 'Al empezar cada episodio',
                  },
                  {
                    key: 'showDownloadFinished',
                    label: 'Descarga completada',
                    desc: 'Cuando termina una descarga',
                  },
                  { key: 'showDownloadError', label: 'Error de descarga', desc: 'Si falla la red o el servidor' },
                  {
                    key: 'showSystemMessages',
                    label: 'Mensajes del sistema',
                    desc: 'Avisos de la app y actualizaciones',
                  },
                ].map((item) => (
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

              <div className="rounded-xl border border-border/50 bg-background p-4">
                <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
                  <AppTooltip content="Posición de alertas internas">
                    <h4 className="text-sm font-bold leading-tight truncate min-w-0 flex-1">
                      Posición de alertas internas
                    </h4>
                  </AppTooltip>
                  <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold bg-primary/10 text-primary border border-primary/15 px-2.5 py-1 rounded-full leading-none">
                    {(
                      {
                        'top-left': 'Arriba a la izquierda',
                        'top-center': 'Arriba al centro',
                        'top-right': 'Arriba a la derecha',
                        'bottom-left': 'Abajo a la izquierda',
                        'bottom-center': 'Abajo al centro',
                        'bottom-right': 'Abajo a la derecha',
                      } as Record<string, string>
                    )[settings.toastPosition] || 'Arriba al centro'}
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
                    if (settings.notificationsSound !== false) onTestSound();
                  }}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-md hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Bell className="w-4 h-4" /> Probar notificación
                </button>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Se aplica a todas las notificaciones de la app.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-success" />
                <h3 className="text-sm font-bold">Alertas sonoras</h3>
              </div>

              <div className="rounded-xl border border-border/50 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Activar sonidos</div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Suena al completar o si algo falla.
                    </p>
                  </div>
                  <CustomSwitch
                    checked={settings.notificationsSound !== false}
                    onChange={(c) => onChange('notificationsSound', c)}
                    ariaLabel="Activar sonidos"
                  />
                </div>

                <div
                  className={`mt-5 rounded-xl border p-4 transition-opacity ${settings.notificationsSound === false ? 'opacity-50 pointer-events-none bg-secondary/20 border-border/40' : 'bg-secondary/20 border-border/50'}`}
                >
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
                    <input
                      id="sound-volume"
                      aria-label="Volumen general de sonidos"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.soundVolume ?? 0.5}
                      onChange={(e) => onChange('soundVolume', parseFloat(e.target.value))}
                      className="w-full h-2 accent-primary cursor-pointer appearance-none bg-secondary rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                      style={{
                        background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${Math.round((settings.soundVolume ?? 0.5) * 100)}%, var(--color-secondary) ${Math.round((settings.soundVolume ?? 0.5) * 100)}%, var(--color-secondary) 100%)`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3 gap-2">
                    <span className="text-[11px] text-muted-foreground">Silencio</span>
                    <button
                      type="button"
                      onClick={onTestSound}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-background hover:bg-secondary border border-border rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-primary" /> Probar sonido
                    </button>
                    <span className="text-[11px] text-muted-foreground">Alto</span>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/40 space-y-3">
                    <div className="text-xs font-bold tracking-wide uppercase text-muted-foreground flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Volumen por tipo
                    </div>
                    <div
                      className={`rounded-xl border bg-background p-2 transition-opacity ${settings.notificationsSound === false ? 'opacity-50 pointer-events-none border-border/40' : 'border-border/50'}`}
                    >
                      {(
                        [
                          { key: 'download', label: 'Descarga', desc: 'Al empezar' },
                          { key: 'success', label: 'Éxito', desc: 'Al terminar' },
                          { key: 'error', label: 'Error', desc: 'Si algo falla' },
                          { key: 'info', label: 'Info', desc: 'Avisos del sistema' },
                        ] as const
                      ).map((item) => {
                        const enabled = (settings.soundEnabled?.[item.key] ?? true) !== false;
                        const vol =
                          settings.soundProfiles?.[item.key] ??
                          (item.key === 'download'
                            ? 0.55
                            : item.key === 'success'
                              ? 0.5
                              : item.key === 'error'
                                ? 0.6
                                : 0.45);
                        const pct = Math.round(vol * 100);
                        return (
                          <div
                            key={item.key}
                            className="flex flex-col gap-2 py-2.5 border-b last:border-0 border-border/40 px-1"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold leading-snug">{item.label}</div>
                                <div className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                                  {item.desc}
                                </div>
                              </div>
                              <CustomSwitch
                                checked={enabled && settings.notificationsSound !== false}
                                onChange={(c) => onChange(item.key, c, 'soundEnabled')}
                                ariaLabel={`${item.label} sonido`}
                              />
                            </div>
                            <div
                              className={`flex items-center gap-3 ${!enabled || settings.notificationsSound === false ? 'opacity-40 pointer-events-none' : ''}`}
                            >
                              <input
                                aria-label={`Volumen ${item.label}`}
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={vol}
                                onChange={(e) => onChange(item.key, parseFloat(e.target.value), 'soundProfiles')}
                                className="flex-1 h-1.5 accent-primary cursor-pointer appearance-none bg-secondary rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                                style={{
                                  background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${pct}%, var(--color-secondary) ${pct}%, var(--color-secondary) 100%)`,
                                }}
                              />
                              <span className="shrink-0 text-[11px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/15 min-w-[38px] text-center">
                                {pct}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      El volumen final combina el general con el de cada tipo. Si desactivas un tipo, no sonará.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 px-1 leading-relaxed flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Si desactivas un evento, no verás ni oirás sus
                  avisos.
                </p>
              </div>

              <div className="flex items-start gap-2 px-1">
                <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Los avisos del sistema usan notificaciones del sistema y los de descargas aparecen en la app.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
});
