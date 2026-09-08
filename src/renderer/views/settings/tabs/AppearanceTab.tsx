import { memo, useRef, useCallback } from 'react';
import { Palette, Eye, Check, AlertCircle, Copy, LayoutGrid, List } from 'lucide-react';
import { THEME_META, THEME_IDS, ACCENT_PRESETS } from '../constants';
import type { ThemeId } from '../../../../types/settings';
import { isActiveTheme } from '../utils/settingsHelpers';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { useEpisodeView, type EpisodeView } from '../../../utils/episodeView';

// Controlada por SettingsView: el cambio se estadía hasta Guardar (desde
// Detalles aplica al instante). El valor en vivo sincroniza sola al guardar
// o al cambiar fuera, ya que el staged solo vive si no hubo cambio externo.
const EpisodeViewSetting = memo(function EpisodeViewSetting({
  pending,
  onChange,
}: {
  pending: EpisodeView | null;
  onChange: (view: EpisodeView) => void;
}) {
  const [live] = useEpisodeView();
  const view = pending ?? live;
  const options: Array<{ value: EpisodeView; label: string; desc: string; Icon: typeof LayoutGrid }> = [
    { value: 'cards', label: 'Miniaturas', desc: 'Fichas con imagen', Icon: LayoutGrid },
    { value: 'list', label: 'Lista', desc: 'Números sin imagen', Icon: List },
  ];
  return (
    <div>
      <div className="block text-sm font-semibold">Vista de episodios</div>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">
        Cómo se muestran los capítulos en Detalles. Aquí se aplica al Guardar; con clic derecho sobre un capítulo, al
        instante.
      </p>
      <div role="radiogroup" aria-label="Vista de episodios" className="grid grid-cols-2 gap-3">
        {options.map(({ value, label, desc, Icon }) => {
          const active = view === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(value)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/60 bg-background hover:border-border hover:bg-secondary/30'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-none text-foreground">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
              </span>
              {active && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface AppearanceTabProps {
  theme: ThemeId;
  accentHex: string;
  accentInput: string;
  accentInputValid: boolean;
  onThemeChange: (theme: ThemeId) => void;
  onAccentPreset: (hex: string) => void;
  onAccentInputChange: (raw: string) => void;
  epViewPending: EpisodeView | null;
  onEpViewChange: (view: EpisodeView) => void;
}

const ThemeMiniPreview = memo(function ThemeMiniPreview({
  themeId,
  accentHex,
}: {
  themeId: ThemeId;
  accentHex: string;
}) {
  const themeClass = themeId === 'dark' ? '' : `theme-${themeId}`;
  const accentStyle = { background: accentHex } as const;
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-[10px] border border-border/50 bg-background min-w-0 ${themeClass}`}
    >
      <div className="h-6 flex items-center gap-1 px-2 bg-card border-b border-border/40">
        <span className="w-2 h-2 rounded-full" style={accentStyle} />
        <span className="w-2 h-2 rounded-full bg-border" />
        <span className="w-2 h-2 rounded-full bg-border" />
        <span className="ml-auto w-8 h-1.5 rounded-full bg-foreground/10" />
      </div>
      <div className="p-2 flex gap-2">
        <div className="w-7 rounded-md bg-secondary border border-border/40 flex flex-col items-center gap-1.5 py-1.5 shrink-0">
          <span className="w-4 h-4 rounded-md" style={accentStyle} />
          <span className="w-4 h-1 rounded bg-foreground/15" />
          <span className="w-4 h-1 rounded bg-foreground/8" />
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-card border border-border/40 p-1.5 flex gap-1.5 overflow-hidden">
          <div className="w-8 h-10 rounded-[6px] bg-secondary border border-border/30 shrink-0 flex flex-col justify-end p-1">
            <span className="h-1 w-full rounded bg-foreground/15" />
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <div className="h-1.5 w-3/4 rounded bg-foreground/15 mb-1" />
            <div className="h-1 w-1/2 rounded bg-foreground/8 mb-1.5" />
            <div className="h-1 w-full rounded-full bg-secondary border border-border/30 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: '62%', background: accentHex }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export const AppearanceTab = memo(
  function AppearanceTab({
    theme,
    accentHex,
    accentInput,
    accentInputValid,
    onThemeChange,
    onAccentPreset,
    onAccentInputChange,
    epViewPending,
    onEpViewChange,
  }: AppearanceTabProps) {
    const colorInputRef = useRef<HTMLInputElement>(null);
    const normalizedAccentLower = accentHex.toLowerCase();

    const handleSwatchClick = useCallback(() => {
      colorInputRef.current?.click();
    }, []);

    const handleSwatchKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        colorInputRef.current?.click();
      }
    }, []);

    const copyAccent = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(accentHex);
      } catch {
        try {
          await (window as unknown as { api?: { invoke?: (c: string, v: string) => Promise<unknown> } }).api?.invoke?.(
            'write-clipboard',
            accentHex,
          );
        } catch {}
      }
    }, [accentHex]);

    const handleThemeKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const idx = THEME_IDS.indexOf(theme);
        const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        const next = THEME_IDS[(idx + dir + THEME_IDS.length) % THEME_IDS.length];
        onThemeChange(next);
        // move focus to next radio
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-theme-id="${next}"]`) as HTMLElement | null;
          el?.focus();
        });
      },
      [theme, onThemeChange],
    );

    const handlePresetKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const target = e.target as HTMLElement;
        const current = target.getAttribute('data-preset-hex');
        if (!current) return;
        e.preventDefault();
        const idx = (ACCENT_PRESETS as readonly string[]).indexOf(current);
        if (idx === -1) return;
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const next = ACCENT_PRESETS[(idx + dir + ACCENT_PRESETS.length) % ACCENT_PRESETS.length];
        onAccentPreset(next);
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-preset-hex="${next}"]`) as HTMLElement | null;
          el?.focus();
        });
      },
      [onAccentPreset],
    );

    const showError = !accentInputValid && accentInput.trim() !== '';
    const isEmpty = accentInput.trim() === '';
    const accentDescribedBy = showError ? 'accent-error' : isEmpty ? 'accent-hint-empty' : 'accent-hint';

    return (
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
                <Palette className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">Apariencia y UI</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Interfaz nocturna · tema, acento y vista previa.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3 space-y-6">
                <div>
                  <div className="flex items-baseline gap-2 mb-5">
                    <label className="block text-sm font-semibold">Tema de la Interfaz</label>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Selector de tema"
                    className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3"
                    onKeyDown={handleThemeKeyDown}
                  >
                    {THEME_IDS.map((t) => {
                      const active = isActiveTheme(theme, t);
                      const meta = THEME_META[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={`Seleccionar tema ${meta.shortLabel}: ${meta.desc}`}
                          data-theme-id={t}
                          onClick={() => onThemeChange(t)}
                          className={`group relative text-left rounded-xl border p-2.5 pt-6 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out active:scale-[0.98] ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/60 bg-background hover:border-border hover:bg-secondary/30 hover:shadow-sm'}`}
                        >
                          {meta.hint && (
                            <span
                              className={`pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border shadow-sm z-10 ${active ? 'bg-primary text-primary-foreground border-primary' : t === 'dark' ? 'bg-card text-muted-foreground border-border' : 'bg-secondary text-muted-foreground border-border'}`}
                            >
                              {meta.hint}
                            </span>
                          )}
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="text-xs font-bold tracking-tight">{meta.shortLabel}</span>
                            {active ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 border border-primary/20 shrink-0">
                                <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                              </span>
                            ) : (
                              <span className="w-5 h-5 shrink-0" aria-hidden="true" />
                            )}
                          </div>
                          <ThemeMiniPreview themeId={t} accentHex={accentHex} />
                          <div className="text-[11px] text-muted-foreground mt-2 leading-tight line-clamp-2 min-h-[28px]">
                            {meta.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                    Todos optimizados para baja luz. <span className="font-medium text-foreground/80">OLED</span> ahorra
                    batería, <span className="font-medium text-foreground/80">Quantum</span> profundidad azul.
                  </p>
                </div>

                <div className="h-px bg-border/40" role="separator" />

                <div>
                  <label htmlFor="accent-color-text" className="block text-sm font-semibold mb-2">
                    Color de Acento
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSwatchClick}
                      onKeyDown={handleSwatchKeyDown}
                      aria-label={`Selector de color de acento, actual ${accentHex}. Presiona Enter para abrir`}
                      aria-haspopup="dialog"
                      className="relative w-11 h-11 rounded-xl shrink-0 border border-border bg-secondary p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-[transform,border-color,box-shadow] duration-150 active:scale-[0.97] hover:border-border-strong hover:shadow-sm group"
                    >
                      <span
                        className="block w-full h-full rounded-lg border border-black/10 shadow-inner transition-[background-color] duration-200 ease-out"
                        style={{ background: accentHex }}
                        aria-hidden="true"
                      />
                      <span
                        className="absolute inset-0 rounded-xl ring-1 ring-black/5 pointer-events-none"
                        aria-hidden="true"
                      />
                    </button>
                    {/* hidden native color input */}
                    <input
                      ref={colorInputRef}
                      type="color"
                      value={accentHex}
                      onChange={(e) => onAccentPreset(e.target.value)}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="sr-only"
                    />
                    <div className="flex-1 relative">
                      <input
                        id="accent-color-text"
                        type="text"
                        value={accentInput}
                        onChange={(e) => onAccentInputChange(e.target.value)}
                        placeholder="#3b82f6"
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={showError}
                        aria-describedby={accentDescribedBy}
                        className={`w-full bg-background border rounded-xl px-3.5 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 font-mono text-foreground transition-colors ${showError ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20' : 'border-border focus:border-primary focus:ring-primary/20'}`}
                      />
                      <AppTooltip content="Copiar HEX">
                        <button
                          type="button"
                          onClick={copyAccent}
                          aria-label={`Copiar ${accentHex} al portapapeles`}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </AppTooltip>
                    </div>
                  </div>

                  <div className="mt-2 min-h-[18px]">
                    {showError ? (
                      <p
                        id="accent-error"
                        role="alert"
                        aria-live="polite"
                        className="text-xs text-amber-600 flex items-start gap-1.5 leading-relaxed"
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          Formato no válido. Usa HEX como <span className="font-mono font-semibold">#3b82f6</span> o HSL
                          como <span className="font-mono font-semibold">hsl(217 91% 60%)</span>.
                        </span>
                      </p>
                    ) : isEmpty ? (
                      <p id="accent-hint-empty" className="text-xs text-muted-foreground leading-relaxed">
                        Vacío — se usará <span className="font-mono text-foreground/80">#3b82f6</span> por defecto.
                        Escribe un HEX/HSL o elige abajo.
                      </p>
                    ) : (
                      <p id="accent-hint" className="text-xs text-muted-foreground">
                        HEX o HSL válido. El cambio se previsualiza al instante.
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2.5">Paleta rápida</div>
                    <div
                      role="radiogroup"
                      aria-label="Paleta de acentos"
                      className="flex flex-wrap gap-2.5"
                      onKeyDown={handlePresetKeyDown}
                    >
                      {ACCENT_PRESETS.map((hex) => {
                        const selected = normalizedAccentLower === hex.toLowerCase();
                        return (
                          <AppTooltip key={hex} content={hex}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${selected ? 'Seleccionado, ' : ''}Usar color ${hex}`}
                              data-preset-hex={hex}
                              onClick={() => onAccentPreset(hex)}
                              className={`relative w-9 h-9 rounded-full border-2 shadow-sm transition-[transform,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-95 ${selected ? 'border-foreground scale-110 ring-2 ring-primary/30 shadow-md' : 'border-white/15 hover:scale-105 hover:border-white/25 hover:shadow'}`}
                              style={{ background: hex }}
                            >
                              {selected && (
                                <Check
                                  className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </AppTooltip>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      8 tonos nocturnos curados · el anillo de foco y la selección usarán este acento.
                    </p>
                  </div>

                  <div className="pt-3">
                    <div className="h-px bg-border/40" role="separator" />
                  </div>

                  <EpisodeViewSetting pending={epViewPending} onChange={onEpViewChange} />
                </div>
              </div>

              <div className="xl:col-span-2 min-w-0">
                <div className="xl:sticky xl:top-4">
                  <div className="rounded-2xl border border-border/60 bg-background p-4 shadow-inner min-w-0 overflow-hidden">
                    <div className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Vista previa
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
                        <div className="h-7 flex items-center gap-1.5 px-3 bg-secondary/40 border-b border-border/30">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: accentHex }}
                            aria-hidden="true"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-border" aria-hidden="true" />
                          <span className="w-2.5 h-2.5 rounded-full bg-border" aria-hidden="true" />
                          <span className="ml-auto text-[11px] font-semibold text-muted-foreground tracking-wide">
                            OmniAnime
                          </span>
                        </div>
                        <div className="p-3 flex gap-3">
                          <div className="w-20 shrink-0">
                            <div className="aspect-[3/4] rounded-lg bg-secondary border border-border/40 overflow-hidden relative">
                              <div
                                className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent"
                                aria-hidden="true"
                              />
                              <div className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-secondary/80 border border-border/30 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-[width] duration-200"
                                  style={{ width: '68%', background: accentHex }}
                                />
                              </div>
                              <div
                                className="absolute top-1.5 left-1.5 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full text-white shadow-sm"
                                style={{ background: accentHex }}
                              >
                                EP 7
                              </div>
                            </div>
                            <div className="h-2.5 w-3/4 rounded bg-foreground/10 mt-2" />
                            <div className="h-2 w-1/2 rounded bg-foreground/5 mt-1" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className="h-2 w-14 rounded-full mb-2"
                              style={{ background: accentHex }}
                              aria-hidden="true"
                            />
                            <div className="h-3 w-full rounded bg-foreground/10 mb-1.5" />
                            <div className="h-3 w-2/3 rounded bg-foreground/5 mb-3" />
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow-sm"
                                style={{ background: accentHex }}
                              >
                                Primario
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary border border-border">
                                Secundario
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary border border-border">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: accentHex }}
                                  aria-hidden="true"
                                />
                                En curso
                              </span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <div
                                className="flex-1 min-w-[74px] rounded-xl px-3 py-2 text-center text-xs font-bold text-white shadow-md cursor-default select-none transition-colors"
                                style={{ background: accentHex }}
                              >
                                Botón
                              </div>
                              <div className="flex-1 min-w-[104px] rounded-xl px-3 py-2 text-center text-xs font-semibold bg-secondary border border-border cursor-default select-none">
                                Secundario
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/50 bg-popover p-2.5 flex items-center gap-2.5 shadow-sm">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
                          style={{ background: accentHex }}
                          aria-hidden="true"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="h-2.5 w-24 rounded bg-foreground/10 mb-1" />
                          <div className="h-2 w-16 rounded bg-foreground/5" />
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground">ahora</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                        <span
                          className="w-2 h-2 rounded-full transition-colors duration-200"
                          style={{ background: accentHex }}
                          aria-hidden="true"
                        />
                        Anillo de foco, selección y barra de descarga usarán este acento.
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    Previsualización con layout real (póster, barra, badges, toast). El acento se refleja en toda la
                    interfaz y se persiste al <span className="font-medium text-foreground">Guardar</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  },
  (prev, next) =>
    prev.theme === next.theme &&
    prev.accentHex === next.accentHex &&
    prev.accentInput === next.accentInput &&
    prev.accentInputValid === next.accentInputValid &&
    prev.onThemeChange === next.onThemeChange &&
    prev.onAccentPreset === next.onAccentPreset &&
    prev.onAccentInputChange === next.onAccentInputChange &&
    prev.epViewPending === next.epViewPending &&
    prev.onEpViewChange === next.onEpViewChange,
);
