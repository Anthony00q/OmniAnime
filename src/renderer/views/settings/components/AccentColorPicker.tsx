import { useEffect, useRef, useState } from 'react';
import { Pipette, X } from 'lucide-react';
import {
  Button,
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input,
  I18nProvider,
  Label,
  Popover,
  SliderTrack,
  parseColor,
  type Color,
} from 'react-aria-components';
import { preserveAccentHue, resolveAccentPickerColor } from '@/renderer/views/settings/utils/accentPickerColor';

interface AccentColorPickerProps {
  accentHex: string;
  onChange: (hex: string) => void;
}

interface ScreenEyeDropper {
  open: (options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>;
}

const RGB_CHANNELS = [
  { channel: 'red', label: 'R', name: 'Rojo' },
  { channel: 'green', label: 'G', name: 'Verde' },
  { channel: 'blue', label: 'B', name: 'Azul' },
] as const;

const inputClassName =
  'field-input h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm tabular-nums text-foreground hover:border-border-strong';
const thumbClassName =
  'h-5 w-5 rounded-full border-2 border-white shadow-[0_0_0_1px_#000] data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-4 data-[focus-visible]:outline-primary';

export function AccentColorPicker({ accentHex, onChange }: AccentColorPickerProps) {
  const [color, setColor] = useState(() => parseColor(accentHex).toFormat('hsb'));
  const [isOpen, setIsOpen] = useState(false);
  const [eyeDropperError, setEyeDropperError] = useState('');
  const eyeDropperAbortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resolvedColor = resolveAccentPickerColor(color, accentHex);
  if (resolvedColor !== color) setColor(resolvedColor);

  const EyeDropper = (window as Window & { EyeDropper?: new () => ScreenEyeDropper }).EyeDropper;

  const handleColorChange = (next: Color) => {
    const updated = preserveAccentHue(next, resolvedColor);
    setColor(updated);
    onChange(updated.toString('hex').toLowerCase());
  };

  useEffect(() => {
    if (!isOpen) return;
    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('input[type="range"]')?.focus({ preventScroll: true });
    });
    const close = (event: Event) => {
      event.preventDefault();
      setIsOpen(false);
    };
    window.addEventListener('close-modals', close);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('close-modals', close);
      eyeDropperAbortRef.current?.abort();
      eyeDropperAbortRef.current = null;
    };
  }, [isOpen]);

  const pickScreenColor = async () => {
    if (!EyeDropper || eyeDropperAbortRef.current) return;
    const controller = new AbortController();
    eyeDropperAbortRef.current = controller;
    setEyeDropperError('');
    try {
      const result = await new EyeDropper().open({ signal: controller.signal });
      if (!controller.signal.aborted) handleColorChange(parseColor(result.sRGBHex));
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
        setEyeDropperError('No se pudo tomar el color de la pantalla. Usa el selector o escribe un HEX.');
      }
    } finally {
      if (eyeDropperAbortRef.current === controller) eyeDropperAbortRef.current = null;
    }
  };

  return (
    <I18nProvider locale="es-ES">
      <ColorPicker value={resolvedColor} onChange={handleColorChange}>
        <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
          <Button
            aria-label={`Elegir color de acento, actual ${accentHex}`}
            data-keep-focus
            className="relative h-11 w-11 shrink-0 rounded-xl border border-border bg-secondary p-1.5 hover:border-border-strong"
            onPress={() => setEyeDropperError('')}
          >
            <span
              className="block h-full w-full rounded-lg border border-border-strong"
              style={{ backgroundColor: accentHex }}
              aria-hidden="true"
            />
          </Button>
          <Popover
            placement="right"
            offset={12}
            containerPadding={48}
            shouldFlip
            scrollRef={scrollRef}
            className="z-50 flex w-[300px] max-w-[calc(100vw-96px)] overflow-clip rounded-2xl border border-border-strong bg-popover text-foreground shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          >
            <Dialog
              ref={dialogRef}
              aria-label="Elegir color de acento"
              className="disable-shortcuts flex min-h-0 w-full max-h-[inherit] flex-col outline-none"
            >
              <div
                className="flex min-h-0 flex-1 flex-col"
                onKeyDownCapture={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setIsOpen(false);
                }}
              >
                <div
                  data-accent-picker-header
                  className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3"
                >
                  <span className="text-sm font-semibold">Color de acento</span>
                  <Button
                    aria-label="Cerrar selector de color"
                    onPress={() => setIsOpen(false)}
                    className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <div
                  ref={scrollRef}
                  data-accent-picker-scroll
                  className="custom-scrollbar mx-2 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-4"
                >
                  <ColorArea
                    aria-label="Saturación y brillo"
                    colorSpace="hsb"
                    xChannel="saturation"
                    yChannel="brightness"
                    className="h-44 w-full rounded-lg border border-border-strong"
                  >
                    <ColorThumb className={thumbClassName} />
                  </ColorArea>
                  <ColorSlider colorSpace="hsb" channel="hue" aria-label="Tono" className="my-1">
                    <div className="flex h-11 items-center">
                      <SliderTrack className="h-3 w-full rounded-full">
                        <ColorThumb className={thumbClassName} />
                      </SliderTrack>
                    </div>
                  </ColorSlider>
                  <ColorField className="flex min-w-0 flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">HEX</Label>
                    <Input className={inputClassName} spellCheck={false} autoComplete="off" />
                  </ColorField>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {RGB_CHANNELS.map(({ channel, label, name }) => (
                      <ColorField key={channel} colorSpace="rgb" channel={channel} className="min-w-0">
                        <Label className="mb-1.5 block text-xs text-muted-foreground">
                          <span aria-hidden="true">{label}</span>
                          <span className="sr-only">{name}</span>
                        </Label>
                        <Input className={inputClassName} />
                      </ColorField>
                    ))}
                  </div>
                </div>
                {EyeDropper && (
                  <div data-accent-picker-footer className="shrink-0 border-t border-border/60 px-4 py-3">
                    <Button
                      onPress={() => void pickScreenColor()}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:border-border-strong hover:bg-secondary hover:text-foreground"
                    >
                      <Pipette className="h-4 w-4" aria-hidden="true" />
                      Tomar color de pantalla
                    </Button>
                    {eyeDropperError && (
                      <p role="alert" className="mt-2 text-xs leading-relaxed text-destructive-fg">
                        {eyeDropperError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Dialog>
          </Popover>
        </DialogTrigger>
      </ColorPicker>
    </I18nProvider>
  );
}
