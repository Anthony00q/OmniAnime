import { memo, useCallback, type CSSProperties } from 'react';
import { Palette, Eye, Check, AlertCircle, Copy, Minus, Square, X, Download, Clapperboard } from 'lucide-react';
import { THEME_META, THEME_IDS, ACCENT_PRESETS, THEME_SUGGESTED_ACCENT } from '@/renderer/views/settings/constants';
import type { ThemeId } from '@/types/settings';
import { isActiveTheme } from '@/renderer/views/settings/utils/settingsHelpers';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { AccentColorPicker } from '@/renderer/views/settings/components/AccentColorPicker';
import { getInterfaceAccent } from '@/renderer/utils/color';

interface AppearanceTabProps {
  theme: ThemeId;
  savedAccentHex: string;
  accentHex: string;
  accentInput: string;
  accentInputValid: boolean;
  onThemeChange: (theme: ThemeId) => void;
  onAccentPreset: (hex: string) => void;
  onAccentInputChange: (raw: string) => void;
}

const ThemeMiniPreview = memo(function ThemeMiniPreview({
  themeId,
  accentHex,
}: {
  themeId: ThemeId;
  accentHex: string;
}) {
  const themeClass = themeId === 'dark' ? '' : `theme-${themeId}`;
  return (
    <div
      aria-hidden="true"
      className={`theme-preview relative overflow-hidden rounded-[10px] border border-border/50 bg-background min-w-0 ${themeClass}`}
      style={{ '--color-primary': getInterfaceAccent(accentHex) } as CSSProperties}
    >
      <div className="h-6 flex items-center gap-2 px-2 bg-card border-b border-border/40 text-muted-foreground">
        <span className="w-8 h-1.5 rounded bg-foreground/15" />
        <Minus className="ml-auto w-2 h-2" />
        <Square className="w-2 h-2" />
        <X className="w-2 h-2" />
      </div>
      <div className="p-2 flex gap-2">
        <div className="w-7 rounded-md bg-secondary border border-border/40 flex flex-col items-center gap-1.5 py-1.5 shrink-0">
          <span className="w-4 h-4 rounded-md bg-primary" />
          <span className="w-4 h-1 rounded bg-foreground/15" />
          <span className="w-4 h-1 rounded bg-foreground/8" />
        </div>
        <div className="flex-1 min-w-0 rounded-md bg-card border border-border/40 p-1.5 flex gap-1.5 overflow-hidden">
          <div className="w-8 aspect-[2/3] rounded-[6px] bg-secondary border border-border/30 shrink-0 flex flex-col justify-end p-1">
            <span className="h-1 w-full rounded bg-foreground/15" />
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <div className="h-1.5 w-3/4 rounded bg-foreground/15 mb-1" />
            <div className="h-1 w-1/2 rounded bg-foreground/8 mb-1.5" />
            <div className="h-1 w-full rounded-full bg-secondary border border-border/30 overflow-hidden">
              <div className="h-full w-[62%] rounded-full bg-primary" />
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
    savedAccentHex,
    accentHex,
    accentInput,
    accentInputValid,
    onThemeChange,
    onAccentPreset,
    onAccentInputChange,
  }: AppearanceTabProps) {
    const normalizedAccentLower = accentHex.toLowerCase();
    const interfaceAccent = getInterfaceAccent(accentHex);

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
    const suggestedHex = THEME_SUGGESTED_ACCENT[theme];
    const showSuggested = normalizedAccentLower !== suggestedHex.toLowerCase();
    const accentDescribedBy = showError ? 'accent-error' : isEmpty ? 'accent-hint-empty' : 'accent-hint';

    return (
      <div className="space-y-6">
        <section className="settings-section">
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="settings-section-icon">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Tema y color</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 @4xl/settings:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-6">
                <div className="@container/themes">
                  <div className="flex items-baseline gap-2 mb-5">
                    <h3 className="text-sm font-semibold">Tema de la interfaz</h3>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Selector de tema"
                    className="grid grid-cols-1 gap-3 @min-[21rem]/themes:grid-cols-2 @min-[41rem]/themes:grid-cols-4"
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
                          className={`group relative text-left rounded-lg border p-2.5 pt-6 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-colors duration-(--duration-motion-micro) ${active ? 'border-primary/60 bg-primary/5' : 'border-border/60 bg-background hover:border-border-strong hover:bg-secondary/30'}`}
                        >
                          {meta.hint && (
                            <span className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-0.5 rounded border border-border bg-card text-muted-foreground z-10">
                              {meta.hint}
                            </span>
                          )}
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="text-[13px] font-semibold">{meta.shortLabel}</span>
                            {active ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 shrink-0">
                                <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                              </span>
                            ) : (
                              <span className="w-5 h-5 shrink-0" aria-hidden="true" />
                            )}
                          </div>
                          <ThemeMiniPreview themeId={t} accentHex={savedAccentHex} />
                          <div className="text-[11px] text-muted-foreground mt-2 leading-tight line-clamp-2 min-h-[28px]">
                            {meta.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="h-px bg-border/40" role="separator" />

                <div>
                  <label htmlFor="accent-color-text" className="block text-sm font-semibold mb-2">
                    Color de acento
                  </label>
                  <div className="flex gap-2">
                    <AccentColorPicker accentHex={accentHex} onChange={onAccentPreset} />
                    <div className="flex-1 relative">
                      <input
                        id="accent-color-text"
                        type="text"
                        value={accentInput}
                        onChange={(e) => onAccentInputChange(e.target.value)}
                        placeholder="#e8a33d"
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={showError}
                        aria-describedby={accentDescribedBy}
                        className={`field-input h-11 w-full bg-surface border rounded-lg px-3.5 py-2.5 pr-9 text-sm focus:outline-none tabular-nums text-foreground transition-colors ${showError ? 'border-warning/50' : 'border-border'}`}
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
                        className="text-xs text-destructive-fg flex items-start gap-1.5 leading-relaxed"
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          Formato no válido. Usa HEX como <span className="font-mono font-semibold">#e8a33d</span> o HSL
                          como <span className="font-mono font-semibold">hsl(35 78% 57%)</span>.
                        </span>
                      </p>
                    ) : isEmpty ? (
                      <p id="accent-hint-empty" className="text-xs text-muted-foreground leading-relaxed">
                        Vacío: se usará <span className="font-mono text-foreground/80">#e8a33d</span>. Escribe un
                        HEX/HSL o elige uno abajo.
                      </p>
                    ) : (
                      <p id="accent-hint" className="text-xs text-muted-foreground">
                        HEX o HSL válido. Se previsualiza al instante.
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold text-muted-foreground">Paleta rápida</div>
                      <button
                        type="button"
                        onClick={() => onAccentPreset(suggestedHex)}
                        aria-label={`Usar el acento sugerido para ${THEME_META[theme].shortLabel}: ${suggestedHex}`}
                        className={`ml-auto inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${showSuggested ? '' : 'invisible'}`}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{ background: suggestedHex }}
                          aria-hidden="true"
                        />
                        Sugerido: {THEME_META[theme].shortLabel}
                      </button>
                    </div>
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
                              className={`relative w-9 h-9 rounded-full border-2 transition-colors duration-(--duration-motion-micro) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${selected ? 'border-foreground ring-2 ring-foreground/20' : 'border-border-strong hover:border-foreground/60'}`}
                              style={{ background: hex }}
                            >
                              {selected && (
                                <Check
                                  className="absolute inset-0 m-auto w-4 h-4 text-primary-foreground"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </AppTooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="w-full max-w-[30rem] @4xl/settings:sticky @4xl/settings:top-4 @4xl/settings:max-w-none">
                  <div className="min-w-0">
                    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                      <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" /> Vista previa del tema y
                      acento
                    </h3>

                    <div
                      className={`theme-preview @container/theme-sample text-foreground ${theme === 'dark' ? '' : `theme-${theme}`}`}
                      style={{ '--color-primary': interfaceAccent } as CSSProperties}
                      aria-hidden="true"
                    >
                      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
                        <div className="h-7 flex items-center gap-3 px-3 bg-secondary/40 border-b border-border/30 text-muted-foreground">
                          <span className="mr-auto text-[11px] font-semibold tracking-wide">OmniAnime</span>
                          <Minus className="w-2.5 h-2.5" />
                          <Square className="w-2.5 h-2.5" />
                          <X className="w-2.5 h-2.5" />
                        </div>
                        <div className="flex items-center gap-3 p-3 @[20rem]/theme-sample:gap-4 @[20rem]/theme-sample:p-4">
                          <div className="relative grid aspect-[2/3] w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border-strong/60 bg-surface-elevated text-brand @[20rem]/theme-sample:w-16">
                            <span className="pointer-events-none absolute inset-x-1.5 top-1.5 h-px bg-brand/25" />
                            <Clapperboard className="size-5" strokeWidth={1.5} />
                            <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 h-px bg-brand/25" />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="font-display text-base font-bold leading-tight">La última función</p>
                            <p className="text-[11px] text-muted-foreground">Episodios 7–9 · SUB</p>
                            <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
                              <Download className="size-3 shrink-0" /> Descargar (3)
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-border/50 bg-surface px-3 py-2.5 @[20rem]/theme-sample:px-4">
                          <Check className="size-3.5 shrink-0 text-success" />
                          <p className="min-w-0 text-xs font-medium">Se descargaron 3 episodios</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    Los cambios se aplican al guardar. La interfaz aclara los acentos muy oscuros sin cambiar el color
                    elegido.
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
    prev.savedAccentHex === next.savedAccentHex &&
    prev.accentHex === next.accentHex &&
    prev.accentInput === next.accentInput &&
    prev.accentInputValid === next.accentInputValid &&
    prev.onThemeChange === next.onThemeChange &&
    prev.onAccentPreset === next.onAccentPreset &&
    prev.onAccentInputChange === next.onAccentInputChange,
);
