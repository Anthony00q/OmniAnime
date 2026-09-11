import { memo, useState } from 'react';
import { Gauge, Server, Layers, Eye, SlidersHorizontal, Info, ChevronDown, FolderDown } from 'lucide-react';
import { CustomSelect } from '../../../components/CustomSelect';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { DEFAULT_DOWNLOAD_SETTINGS } from '../../../../utils/downloadSettings';
import { snapToClosestOption } from '../utils/settingsHelpers';
import animeav1Icon from '../../../../../assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '../../../../../assets/provider-icons/jkanime-32.png';
import {
  DOWNLOAD_PARALLEL_OPTIONS,
  DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS,
  DOWNLOAD_HLS_CONNECTIONS_OPTIONS,
  DOWNLOAD_RETRIES_OPTIONS,
  DOWNLOAD_START_TIMEOUT_OPTIONS,
  PROVIDER_SERVERS,
} from '../constants';

const PROVIDER_ICONS: Record<string, string> = {
  animeav1: animeav1Icon,
  jkanime: jkanimeIcon,
};

interface DownloadsTabProps {
  settings: any;
  namingPreview: string;
  onChange: (key: string, value: any, category?: string) => void;
}

export const DownloadsTab = memo(function DownloadsTab({ settings, namingPreview, onChange }: DownloadsTabProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/90 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
              <Gauge className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Concurrencia</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paralelismo de tus descargas: episodios y conexiones. Por defecto secuencial.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
                Episodios en paralelo
                <AppTooltip content="Cuántos episodios del mismo anime se descargan a la vez. Con 1 van uno por uno, como siempre.">
                  <span aria-hidden="true" className="inline-flex text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </AppTooltip>
              </span>
            </div>
            <CustomSelect
              value={String(dl.maxParallelEpisodes)}
              onChange={(v) => onDlChange('maxParallelEpisodes', Number(v))}
              ariaLabel="Episodios en paralelo"
              className="w-full sm:w-56 shrink-0"
              options={DOWNLOAD_PARALLEL_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>
          {dl.maxParallelEpisodes >= 3 && (
            <p className="text-[11px] text-warning leading-relaxed select-none mt-3" role="note">
              Con 3, como máximo 2 episodios usan el mismo servidor a la vez para no saturarlo.
            </p>
          )}

          <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
                Conexiones por archivo
                <AppTooltip content="MediaFire y MP4Upload: divide cada descarga directa en segmentos en paralelo. Solo se usa si el servidor lo soporta; si no, se descarga a 1 conexión automáticamente.">
                  <span aria-hidden="true" className="inline-flex text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </AppTooltip>
              </span>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Afecta a descargas directas (MediaFire y MP4Upload). Más conexiones no siempre es más rápido; si falla,
                se reintenta a 1.
              </p>
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.directConnections ?? 1,
                DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('directConnections', Number(v))}
              ariaLabel="Conexiones por archivo"
              className="w-full sm:w-60 shrink-0"
              options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
                Segmentos HLS en paralelo
                <AppTooltip content="HLS (AnimeAV1): cuántos fragmentos del episodio se descargan a la vez. Solo se usa en HLS; el resto de servidores no cambia.">
                  <span aria-hidden="true" className="inline-flex text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </AppTooltip>
              </span>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Afecta solo a HLS. Más no siempre es más rápido; si el servidor limita, baja a 6–8.
              </p>
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.hlsConnections ?? 10,
                DOWNLOAD_HLS_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('hlsConnections', Number(v))}
              ariaLabel="Segmentos HLS en paralelo"
              className="w-full sm:w-60 shrink-0"
              options={DOWNLOAD_HLS_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>

          <div className="mt-4 rounded-xl bg-background border border-border/60 px-3 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <AppTooltip content="Si cambias algo mientras se descarga, se nota en las siguientes, no en la que ya está en marcha.">
              <span aria-hidden="true" className="inline-flex shrink-0">
                <Info className="w-3.5 h-3.5" />
              </span>
            </AppTooltip>
            <span>Los cambios se aplican a las siguientes descargas.</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Servidores disponibles</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROVIDER_SERVERS.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <img
                  src={PROVIDER_ICONS[provider.id]}
                  alt=""
                  aria-hidden="true"
                  className="w-[18px] h-[18px] rounded shrink-0"
                  draggable={false}
                />
                <span className="text-sm font-semibold">{provider.label}</span>
                <span className="text-[11px] font-bold tracking-widest uppercase bg-secondary text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                  {provider.hint}
                </span>
                <AppTooltip content="No todos los servidores aparecen en cada episodio. Si uno no está o falla, se intenta automáticamente con el siguiente.">
                  <span
                    aria-hidden="true"
                    className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-lg text-muted-foreground"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </AppTooltip>
              </div>
              <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Servidores de ${provider.label}`}>
                {provider.servers.map((name) => (
                  <span
                    key={name}
                    role="listitem"
                    className="inline-flex items-center rounded-full bg-secondary border border-border px-2.5 py-1 text-xs font-semibold"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          Los servidores varían por episodio y se prueban en este orden. Si uno no está o falla, se intenta
          automáticamente con el siguiente.
        </p>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Nombrado de archivos</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="block text-sm font-semibold">Estilo de Nombramiento</span>
            <CustomSelect
              value={settings.namingStyle || 'descriptive'}
              onChange={(v) => onChange('namingStyle', v)}
              ariaLabel="Estilo de nombramiento"
              className="w-full"
              options={[
                { value: 'minimal', label: 'Minimalista (EP_01)' },
                { value: 'descriptive', label: 'Descriptivo (Título + EP)' },
              ]}
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {settings.namingStyle === 'minimal'
                ? 'Solo número de episodio, ideal para bibliotecas limpias.'
                : 'Incluye el título del anime para identificar archivos rápidamente.'}
            </p>
          </div>
          <div className="rounded-xl bg-background border border-border/60 p-3">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
              <Eye className="w-3 h-3" /> Vista previa
            </div>
            <AppTooltip content={namingPreview}>
              <div className="font-mono text-xs bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-foreground truncate">
                {namingPreview}
              </div>
            </AppTooltip>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="w-full flex items-center justify-between gap-3 p-5 sm:px-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
        >
          <span className="flex items-center gap-2">
            <span className="p-1.5 bg-primary/10 rounded-lg">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight">Opciones avanzadas</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Si algo tarda o falla, cuántas veces lo intenta. Ya viene bien configurado.
              </span>
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="block text-sm font-semibold">Reintentos</span>
                <CustomSelect
                  value={snapToClosestOption(
                    dl.retries,
                    DOWNLOAD_RETRIES_OPTIONS.map((o) => o.value),
                  )}
                  onChange={(v) => onDlChange('retries', Number(v))}
                  ariaLabel="Reintentos por descarga"
                  className="w-full"
                  options={DOWNLOAD_RETRIES_OPTIONS.map((o) => ({ ...o }))}
                />
              </div>
              <div className="space-y-2">
                <span className="block text-sm font-semibold">Timeout de inicio</span>
                <CustomSelect
                  value={snapToClosestOption(
                    dl.startTimeoutSec,
                    DOWNLOAD_START_TIMEOUT_OPTIONS.map((o) => o.value),
                  )}
                  onChange={(v) => onDlChange('startTimeoutSec', Number(v))}
                  ariaLabel="Timeout de inicio"
                  className="w-full"
                  options={DOWNLOAD_START_TIMEOUT_OPTIONS.map((o) => ({ ...o }))}
                />
              </div>
            </div>
            <div className="mx-5 sm:mx-6 mb-5 sm:mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                    Continuar parciales
                    <AppTooltip content="Si pausas y sigues más tarde, continúa donde se quedó en vez de empezar de cero. Hay servidores donde siempre empieza de cero, y si uno falla se prueba automáticamente con otro.">
                      <span aria-hidden="true" className="inline-flex text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </AppTooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Sigue donde se quedó en vez de empezar de cero.
                  </p>
                </div>
                <CustomSwitch
                  checked={dl.allowContinue}
                  onChange={(c) => onDlChange('allowContinue', c)}
                  ariaLabel="Continuar descargas parciales"
                />
              </div>
              <div className="rounded-xl border border-border/60 bg-background p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                    <FolderDown className="w-3.5 h-3.5 text-muted-foreground" /> Limpiar al completar
                    <AppTooltip content="Cuando un episodio termina bien, borra sus archivos temporales. Si lo dejas apagado pueden quedar restos que ocupan espacio; puedes borrarlos luego en Almacenamiento. Si algo falla, siempre se limpia solo para volver a intentarlo.">
                      <span aria-hidden="true" className="inline-flex text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </AppTooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Borra los archivos temporales cuando termina bien.
                  </p>
                </div>
                <CustomSwitch
                  checked={dl.cleanCacheOnComplete}
                  onChange={(c) => onDlChange('cleanCacheOnComplete', c)}
                  ariaLabel="Limpiar temporales al completar"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
});
