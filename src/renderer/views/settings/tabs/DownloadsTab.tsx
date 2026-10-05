import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Gauge, Server, Layers, Eye, SlidersHorizontal, Info, ChevronDown, FolderDown, FileText } from 'lucide-react';
import { CustomSelect } from '@/renderer/components/CustomSelect';
import { CustomSwitch } from '@/renderer/components/CustomSwitch';
import { ServerOrderCard } from '@/renderer/views/settings/components/ServerOrderCard';
import { RenameFoldersDialog } from '@/renderer/views/settings/components/RenameFoldersDialog';
import { RenameLibraryFilesDialog } from '@/renderer/views/settings/components/RenameLibraryFilesDialog';
import { applyServerMove, applyServerToggle, splitServerOrder } from '@/renderer/views/settings/utils/serverOrder';
import {
  ADAPTIVE_MANAGED_HINT,
  ADAPTIVE_SERVER_ROWS,
  isConnectionControlLocked,
  managedHintId,
} from '@/renderer/views/settings/utils/adaptiveConnections';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { DEFAULT_DOWNLOAD_SETTINGS, normalizeAdaptiveConnections } from '@/utils/downloads/downloadSettings';
import { normalizeFolderNameSource } from '@/utils/downloads/folderNaming';
import { folderNameSourceHint, snapToClosestOption } from '@/renderer/views/settings/utils/settingsHelpers';
import animeav1Icon from '../../../../../assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '../../../../../assets/provider-icons/jkanime-32.png';
import {
  DOWNLOAD_PARALLEL_OPTIONS,
  DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS,
  DOWNLOAD_HLS_CONNECTIONS_OPTIONS,
  DOWNLOAD_RETRIES_OPTIONS,
  DOWNLOAD_START_TIMEOUT_OPTIONS,
  FOLDER_NAME_SOURCE_OPTIONS,
  PROVIDER_SERVERS,
} from '@/renderer/views/settings/constants';

const PROVIDER_ICONS: Record<string, string> = {
  animeav1: animeav1Icon,
  jkanime: jkanimeIcon,
};

interface DownloadsTabProps {
  settings: any;
  namingPreview: string;
  folderNamingPreview: string;
  onChange: (key: string, value: any, category?: string) => void;
  visible?: boolean;
}

const DescargasConcurrencia = memo(function DescargasConcurrencia({ settings, onChange }: DownloadsTabProps) {
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  // La configuración Adaptive puede llegar como boolean legacy: siempre objeto.
  const adaptive = normalizeAdaptiveConnections(dl.adaptiveConnections);
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');
  // Con Adaptive activo para un servidor, su control manual queda visible pero
  // bloqueado: muestra el valor guardado sin tocarlo. HLS no entra.
  const locked = {
    mediafireConnections: isConnectionControlLocked('mediafireConnections', adaptive),
    mp4uploadConnections: isConnectionControlLocked('mp4uploadConnections', adaptive),
    voeConnections: isConnectionControlLocked('voeConnections', adaptive),
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-card shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
            <Gauge className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Concurrencia</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Cuántos episodios y conexiones se usan a la vez.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
              Episodios en paralelo
              <AppTooltip content="Con 1 se descargan uno por uno.">
                <span aria-hidden="true" className="inline-flex text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </AppTooltip>
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Cuántos episodios del mismo anime se descargan a la vez.
            </p>
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
            Como máximo 2 se descargan a la vez del mismo servidor, para no saturarlo.
          </p>
        )}

        <div className="mt-4">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
            Conexiones por archivo
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Cuántas partes del archivo se descargan a la vez. Si el servidor no lo permite, se usa 1 conexión.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">MediaFire</span>
            {locked.mediafireConnections && (
              <p
                id={managedHintId('mediafireConnections')}
                className="text-xs text-muted-foreground mt-1 leading-relaxed"
              >
                {ADAPTIVE_MANAGED_HINT}
              </p>
            )}
          </div>
          <CustomSelect
            value={snapToClosestOption(
              dl.mediafireConnections ?? 1,
              DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
            )}
            onChange={(v) => onDlChange('mediafireConnections', Number(v))}
            ariaLabel="Conexiones por archivo en MediaFire"
            className="w-full sm:w-60 shrink-0"
            options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            disabled={locked.mediafireConnections}
            describedBy={locked.mediafireConnections ? managedHintId('mediafireConnections') : undefined}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">MP4Upload</span>
            {locked.mp4uploadConnections && (
              <p
                id={managedHintId('mp4uploadConnections')}
                className="text-xs text-muted-foreground mt-1 leading-relaxed"
              >
                {ADAPTIVE_MANAGED_HINT}
              </p>
            )}
          </div>
          <CustomSelect
            value={snapToClosestOption(
              dl.mp4uploadConnections ?? 1,
              DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
            )}
            onChange={(v) => onDlChange('mp4uploadConnections', Number(v))}
            ariaLabel="Conexiones por archivo en MP4Upload"
            className="w-full sm:w-60 shrink-0"
            options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            disabled={locked.mp4uploadConnections}
            describedBy={locked.mp4uploadConnections ? managedHintId('mp4uploadConnections') : undefined}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">Voe</span>
            {locked.voeConnections && (
              <p id={managedHintId('voeConnections')} className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {ADAPTIVE_MANAGED_HINT}
              </p>
            )}
          </div>
          <CustomSelect
            value={snapToClosestOption(
              dl.voeConnections ?? 4,
              DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
            )}
            onChange={(v) => onDlChange('voeConnections', Number(v))}
            ariaLabel="Conexiones por archivo en Voe"
            className="w-full sm:w-60 shrink-0"
            options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            disabled={locked.voeConnections}
            describedBy={locked.voeConnections ? managedHintId('voeConnections') : undefined}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
              Mega: single-stream
              <AppTooltip content="MEGA no permite descargar el archivo por partes, y Conexiones adaptativas no lo gestiona.">
                <span aria-hidden="true" className="inline-flex text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </AppTooltip>
            </span>
            <p id="mega-fixed-hint" className="text-xs text-muted-foreground mt-1 leading-relaxed">
              MEGA se descarga siempre con 1 conexión: es lo más rápido.
            </p>
          </div>
          <CustomSelect
            value="1"
            onChange={() => undefined}
            ariaLabel="Conexiones de Mega (fijas)"
            className="w-full sm:w-60 shrink-0"
            options={[{ value: '1', label: '1 conexión' }]}
            disabled
            describedBy="mega-fixed-hint"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
              Segmentos HLS en paralelo
              <AppTooltip content="Cuántos fragmentos del episodio se descargan a la vez.">
                <span aria-hidden="true" className="inline-flex text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </AppTooltip>
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Solo se usa en AnimeAV1, y subir los segmentos no siempre acelera la descarga.
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

        <div className="mt-4 rounded-xl bg-background border border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
          Los cambios se aplican a las siguientes descargas; la que está en marcha no se toca.
        </div>
      </div>
    </section>
  );
});

const DescargasServidores = memo(function DescargasServidores({ settings, onChange }: DownloadsTabProps) {
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');

  return (
    <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <Server className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold tracking-tight">Servidores disponibles</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Los servidores se prueban en este orden; si uno falla o no está, se pasa al siguiente.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROVIDER_SERVERS.map((provider) => {
          const orderKey = provider.id === 'jkanime' ? 'serverOrderJkanime' : 'serverOrderAnimeav1';
          const candidates = provider.servers;
          const stored = (dl as Record<string, unknown>)[orderKey];
          const { active } = splitServerOrder(candidates, stored, provider.defaultOrder);
          return (
            <ServerOrderCard
              key={provider.id}
              providerLabel={provider.label}
              hint={provider.hint}
              iconSrc={PROVIDER_ICONS[provider.id]}
              candidates={candidates}
              active={active}
              onReorder={(from, to) => onDlChange(orderKey, applyServerMove(active, from, to))}
              onToggle={(name) => onDlChange(orderKey, applyServerToggle(candidates, active, name))}
              onReset={() => onDlChange(orderKey, [...provider.defaultOrder])}
            />
          );
        })}
      </div>
    </section>
  );
});

const DescargasNombrado = memo(function DescargasNombrado({
  settings,
  namingPreview,
  folderNamingPreview,
  onChange,
}: DownloadsTabProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [filesRenameOpen, setFilesRenameOpen] = useState(false);
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const folderSource = normalizeFolderNameSource(dl.folderNameSource);
  const outputDirs: string[] =
    Array.isArray(settings.outputDirs) && settings.outputDirs.length
      ? settings.outputDirs
      : [settings.defaultOutputDir].filter(Boolean);
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');

  return (
    <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <Layers className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold tracking-tight">Nombrado de archivos y carpetas</h3>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-sm font-semibold">Estilo de nombre</span>
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
          <p className="min-h-[36px] text-[11px] text-muted-foreground leading-relaxed">
            {settings.namingStyle === 'minimal'
              ? 'Usa solo el número del episodio, sin el título.'
              : 'Incluye el título del anime y el número del episodio.'}
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
      <div className="mt-5 pt-5 border-t border-border/40 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-sm font-semibold">Carpeta de descarga</span>
          <CustomSelect
            value={folderSource}
            onChange={(v) => onDlChange('folderNameSource', v)}
            ariaLabel="Nombre de la carpeta de descarga"
            className="w-full"
            options={FOLDER_NAME_SOURCE_OPTIONS.map((o) => ({ ...o }))}
          />
          <p className="min-h-[36px] text-[11px] text-muted-foreground leading-relaxed">
            {folderNameSourceHint(folderSource)}
          </p>
        </div>
        <div className="rounded-xl bg-background border border-border/60 p-3">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
            <FolderDown className="w-3 h-3" /> Vista previa
          </div>
          <AppTooltip content={folderNamingPreview}>
            <div className="font-mono text-xs bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-foreground truncate">
              {folderNamingPreview}
            </div>
          </AppTooltip>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-background border border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
        Si el título elegido no está disponible, se usa el siguiente que sí lo esté. Solo afecta a descargas nuevas.
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilesRenameOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface-elevada px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          <FileText className="w-3.5 h-3.5" />
          Renombrar archivos de la librería…
        </button>
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface-elevada px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          <FolderDown className="w-3.5 h-3.5" />
          Renombrar carpetas de la librería…
        </button>
      </div>
      {filesRenameOpen && (
        <RenameLibraryFilesDialog
          open
          onOpenChange={setFilesRenameOpen}
          dirs={outputDirs}
          style={settings.namingStyle === 'minimal' ? 'minimal' : 'descriptive'}
        />
      )}
      {renameOpen && <RenameFoldersDialog open onOpenChange={setRenameOpen} dirs={outputDirs} source={folderSource} />}
    </section>
  );
});

const DescargasAvanzado = memo(function DescargasAvanzado({ settings, onChange }: DownloadsTabProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  // La configuración Adaptive puede llegar como boolean legacy: siempre objeto.
  const adaptive = normalizeAdaptiveConnections(dl.adaptiveConnections);
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');
  const setAdaptiveEnabled = (enabled: boolean) => onDlChange('adaptiveConnections', { ...adaptive, enabled });
  const setAdaptiveServer = (server: keyof typeof adaptive.servers, on: boolean) =>
    onDlChange('adaptiveConnections', { ...adaptive, servers: { ...adaptive.servers, [server]: on } });

  return (
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
              Reintentos, tiempos de espera y archivos temporales. Ya viene bien configurado.
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
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cuántas veces se vuelve a intentar si una descarga falla.
              </p>
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-semibold">Tiempo de espera al iniciar</span>
              <CustomSelect
                value={snapToClosestOption(
                  dl.startTimeoutSec,
                  DOWNLOAD_START_TIMEOUT_OPTIONS.map((o) => o.value),
                )}
                onChange={(v) => onDlChange('startTimeoutSec', Number(v))}
                ariaLabel="Tiempo de espera al iniciar"
                className="w-full"
                options={DOWNLOAD_START_TIMEOUT_OPTIONS.map((o) => ({ ...o }))}
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cuánto se espera a que la descarga empiece antes de cancelar el intento.
              </p>
            </div>
          </div>
          <div className="mx-5 sm:mx-6 mb-5 sm:mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                  Continuar descargas interrumpidas
                  <AppTooltip content="Si cambia el enlace o el servidor no lo permite, empieza de cero.">
                    <span aria-hidden="true" className="inline-flex text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </AppTooltip>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Retoma el episodio donde se quedó, en vez de empezar de cero.
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
                  <FolderDown className="w-3.5 h-3.5 text-muted-foreground" /> Limpiar al terminar
                  <AppTooltip content="Si lo desactivas, los puedes borrar luego desde Almacenamiento.">
                    <span aria-hidden="true" className="inline-flex text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </AppTooltip>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Borra los archivos temporales del episodio cuando termina bien.
                </p>
              </div>
              <CustomSwitch
                checked={dl.cleanCacheOnComplete}
                onChange={(c) => onDlChange('cleanCacheOnComplete', c)}
                ariaLabel="Limpiar temporales al terminar"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-background p-4 sm:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">
                    Conexiones adaptativas{' '}
                    <span className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1 py-px align-middle text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">
                      Experimental
                    </span>{' '}
                    <AppTooltip content="El número de conexiones que elijas es solo el punto de partida. Puede cambiar en próximas versiones.">
                      <span aria-hidden="true" className="inline-flex align-middle text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                      </span>
                    </AppTooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Ajusta las conexiones del episodio según el rendimiento de tu conexión.
                  </p>
                </div>
                <CustomSwitch
                  checked={adaptive.enabled}
                  onChange={setAdaptiveEnabled}
                  ariaLabel="Conexiones adaptativas (experimental)"
                />
              </div>
              <div className="mt-3 border-t border-border/40 pt-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Los servidores sin Adaptive usan el número de conexiones que configures a mano.
                </p>
                <div className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  {ADAPTIVE_SERVER_ROWS.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium select-none">{row.label}</span>
                      <CustomSwitch
                        checked={adaptive.servers[row.id]}
                        disabled={!adaptive.enabled}
                        onChange={(c) => setAdaptiveServer(row.id, c)}
                        ariaLabel={`Conexiones adaptativas en ${row.label}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

// Keep-alive oculto: sin este filtro, cualquier edición en otro tab re-renderiza Descargas entero.
function downloadsTabPropsEqual(prev: DownloadsTabProps, next: DownloadsTabProps): boolean {
  return (
    prev.visible === next.visible &&
    prev.onChange === next.onChange &&
    prev.namingPreview === next.namingPreview &&
    prev.folderNamingPreview === next.folderNamingPreview &&
    prev.settings?.download === next.settings?.download &&
    prev.settings?.namingStyle === next.settings?.namingStyle &&
    prev.settings?.outputDirs === next.settings?.outputDirs &&
    prev.settings?.defaultOutputDir === next.settings?.defaultOutputDir
  );
}

// Escalonado por bloques: los cuatro en un solo commit congelan la UI.
export const DownloadsTab = memo(function DownloadsTab({ visible = true, ...props }: DownloadsTabProps) {
  const [mountedBlocks, setMountedBlocks] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wasVisibleRef = useRef(false);
  const animatedCountRef = useRef(0);

  useEffect(() => {
    if (mountedBlocks >= 4) return;
    const timer = setTimeout(() => setMountedBlocks((n) => n + 1), 32);
    return () => clearTimeout(timer);
  }, [mountedBlocks]);

  // WAAPI desde useLayoutEffect: en useEffect se veía un frame en opacidad 0 al
  // re-entrar. Stagger de 30 ms, igual que la CSS de los demás tabs.
  useLayoutEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      animatedCountRef.current = 0;
      return;
    }
    const el = contentRef.current;
    if (!el) return;
    const blocks = Array.from(el.children);
    const from = wasVisibleRef.current ? animatedCountRef.current : 0;
    const entering = blocks.slice(from);
    wasVisibleRef.current = true;
    animatedCountRef.current = blocks.length;
    if (entering.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    entering.forEach((block, idx) => {
      block.animate(
        [
          { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 200, delay: idx * 30, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' },
      );
    });
  }, [visible, mountedBlocks]);

  return (
    <div ref={contentRef} className="flex flex-col gap-6">
      {mountedBlocks >= 1 && <DescargasConcurrencia {...props} />}
      {mountedBlocks >= 2 && <DescargasServidores {...props} />}
      {mountedBlocks >= 3 && <DescargasNombrado {...props} />}
      {mountedBlocks >= 4 && <DescargasAvanzado {...props} />}
    </div>
  );
}, downloadsTabPropsEqual);
