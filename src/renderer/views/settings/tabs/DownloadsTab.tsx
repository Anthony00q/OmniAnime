import { memo, useEffect, useId, useMemo, useState } from 'react';
import {
  Gauge,
  Server,
  Layers,
  Eye,
  SlidersHorizontal,
  Info,
  ChevronDown,
  FolderDown,
  FileText,
  FilePenLine,
  FolderPen,
} from 'lucide-react';
import { CustomSelect } from '@/renderer/components/CustomSelect';
import { CustomSwitch } from '@/renderer/components/CustomSwitch';
import { ServerOrderCard } from '@/renderer/views/settings/components/ServerOrderCard';
import { createSettingsTool, DeferredSettingsTool } from '@/renderer/views/settings/components/DeferredSettingsTool';
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
import { useStaggerIn } from '@/renderer/utils/motion';
import animeav1Icon from '@assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '@assets/provider-icons/jkanime-32.png';
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

const renameFoldersTool = createSettingsTool(() =>
  import('@/renderer/views/settings/components/RenameFoldersDialog').then((module) => module.RenameFoldersDialog),
);
const renameFilesTool = createSettingsTool(() =>
  import('@/renderer/views/settings/components/RenameLibraryFilesDialog').then(
    (module) => module.RenameLibraryFilesDialog,
  ),
);

interface DownloadsTabProps {
  settings: any;
  namingPreview: string;
  folderNamingPreview: string;
  onChange: (key: string, value: any, category?: string) => void;
  visible?: boolean;
}

const DescargasConcurrencia = memo(function DescargasConcurrencia({ settings, onChange }: DownloadsTabProps) {
  const adaptiveHintId = useId();
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
    <section className="settings-section">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="settings-section-icon">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Concurrencia</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Controla cuántos episodios y partes se descargan a la vez.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Episodios en paralelo</h3>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              Cuántos episodios del mismo anime se descargan a la vez.
            </p>
          </div>
          <CustomSelect
            value={String(dl.maxParallelEpisodes)}
            onChange={(v) => onDlChange('maxParallelEpisodes', Number(v))}
            ariaLabel="Episodios en paralelo"
            className="w-full"
            options={DOWNLOAD_PARALLEL_OPTIONS.map((o) => ({ ...o }))}
          />
        </div>
        {dl.maxParallelEpisodes >= 3 && (
          <p className="text-[13px] text-warning leading-relaxed select-none mt-3" role="note">
            Como máximo 2 se descargan a la vez del mismo servidor, para no saturarlo.
          </p>
        )}

        <div className="mt-5 border-t border-border/40 pt-5">
          <h3 className="text-sm font-semibold">Conexiones por archivo</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
            Partes del mismo archivo que se descargan a la vez.
          </p>
          {Object.values(locked).some(Boolean) && (
            <p id={adaptiveHintId} className="mt-2 mb-2 text-[13px] text-muted-foreground leading-relaxed" role="note">
              {ADAPTIVE_MANAGED_HINT}
            </p>
          )}
          <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">MediaFire</span>
              {locked.mediafireConnections && (
                <span id={managedHintId('mediafireConnections')} className="text-xs text-muted-foreground">
                  Automático
                </span>
              )}
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.mediafireConnections ?? 1,
                DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('mediafireConnections', Number(v))}
              ariaLabel="Conexiones por archivo en MediaFire"
              className="w-full"
              options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
              disabled={locked.mediafireConnections}
              describedBy={
                locked.mediafireConnections ? `${managedHintId('mediafireConnections')} ${adaptiveHintId}` : undefined
              }
            />
          </div>
          <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">MP4Upload</span>
              {locked.mp4uploadConnections && (
                <span id={managedHintId('mp4uploadConnections')} className="text-xs text-muted-foreground">
                  Automático
                </span>
              )}
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.mp4uploadConnections ?? 1,
                DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('mp4uploadConnections', Number(v))}
              ariaLabel="Conexiones por archivo en MP4Upload"
              className="w-full"
              options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
              disabled={locked.mp4uploadConnections}
              describedBy={
                locked.mp4uploadConnections ? `${managedHintId('mp4uploadConnections')} ${adaptiveHintId}` : undefined
              }
            />
          </div>
          <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">Voe</span>
              {locked.voeConnections && (
                <span id={managedHintId('voeConnections')} className="text-xs text-muted-foreground">
                  Automático
                </span>
              )}
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.voeConnections ?? 4,
                DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('voeConnections', Number(v))}
              ariaLabel="Conexiones por archivo en Voe"
              className="w-full"
              options={DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
              disabled={locked.voeConnections}
              describedBy={locked.voeConnections ? `${managedHintId('voeConnections')} ${adaptiveHintId}` : undefined}
            />
          </div>
          <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0">
              <span className="text-sm font-medium">Mega</span>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                Conexión fija. No usa Conexiones adaptativas.
              </p>
            </div>
            <p className="text-[13px] text-muted-foreground tabular-nums @2xl/settings:text-right">1 conexión</p>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            Si el servidor no permite varias conexiones, se utiliza una.
          </p>
        </div>
        <div className="mt-5 border-t border-border/40 pt-5">
          <h3 className="text-sm font-semibold">Descarga HLS</h3>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
            Solo AnimeAV1. Más segmentos no siempre aceleran la descarga.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0">
              <span className="text-sm font-medium">Segmentos en paralelo</span>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                Fragmentos del episodio que se descargan a la vez.
              </p>
            </div>
            <CustomSelect
              value={snapToClosestOption(
                dl.hlsConnections ?? 10,
                DOWNLOAD_HLS_CONNECTIONS_OPTIONS.map((o) => o.value),
              )}
              onChange={(v) => onDlChange('hlsConnections', Number(v))}
              ariaLabel="Segmentos HLS en paralelo"
              className="w-full"
              options={DOWNLOAD_HLS_CONNECTIONS_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>
        </div>
        <p className="mt-5 border-t border-border/40 pt-4 text-[13px] leading-relaxed text-muted-foreground">
          Solo afecta a las próximas descargas. Las que están en curso no cambian.
        </p>
      </div>
    </section>
  );
});

const DescargasServidores = memo(function DescargasServidores({ settings, onChange }: DownloadsTabProps) {
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');

  return (
    <section className="settings-section p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="settings-section-icon">
          <Server className="w-5 h-5" />
        </div>
        <h3 className="text-base font-semibold">Servidores disponibles</h3>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        Los servidores se prueban en este orden; si uno falla o no está, se pasa al siguiente.
      </p>
      <div className="grid grid-cols-1 gap-3 @xl/settings:grid-cols-2">
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
    <section className="settings-section p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="settings-section-icon">
          <Layers className="w-5 h-5" />
        </div>
        <h3 className="text-base font-semibold">Nombrado de archivos y carpetas</h3>
      </div>
      <div className="grid grid-cols-1 gap-5 @xl/settings:grid-cols-2">
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
        <div className="settings-subpanel self-center bg-surface-elevated">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Vista previa
          </div>
          <div className="font-mono text-xs leading-relaxed text-foreground break-all select-text">{namingPreview}</div>
        </div>
      </div>
      <div className="mt-5 pt-5 border-t border-border/40 grid grid-cols-1 gap-5 @xl/settings:grid-cols-2">
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
        <div className="settings-subpanel self-center bg-surface-elevated">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <FolderDown className="w-3.5 h-3.5" aria-hidden="true" /> Vista previa
          </div>
          <div className="font-mono text-xs leading-relaxed text-foreground break-all select-text">
            {folderNamingPreview}
          </div>
        </div>
      </div>
      <div className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Si el título elegido no está disponible, se usa el siguiente que sí lo esté. Solo afecta a descargas nuevas.
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilesRenameOpen(true)}
          onPointerEnter={renameFilesTool.preload}
          onFocus={renameFilesTool.preload}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          <FileText className="w-3.5 h-3.5" />
          Renombrar archivos de la librería…
        </button>
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          onPointerEnter={renameFoldersTool.preload}
          onFocus={renameFoldersTool.preload}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          <FolderDown className="w-3.5 h-3.5" />
          Renombrar carpetas de la librería…
        </button>
      </div>
      {filesRenameOpen && (
        <DeferredSettingsTool
          tool={renameFilesTool}
          title="Renombrar archivos de la librería"
          icon={<FilePenLine className="w-5 h-5" aria-hidden="true" />}
          onClose={() => setFilesRenameOpen(false)}
        >
          {(RenameLibraryFilesDialog) => (
            <RenameLibraryFilesDialog
              open
              onOpenChange={setFilesRenameOpen}
              dirs={outputDirs}
              style={settings.namingStyle === 'minimal' ? 'minimal' : 'descriptive'}
            />
          )}
        </DeferredSettingsTool>
      )}
      {renameOpen && (
        <DeferredSettingsTool
          tool={renameFoldersTool}
          title="Renombrar carpetas de la librería"
          icon={<FolderPen className="w-5 h-5" aria-hidden="true" />}
          onClose={() => setRenameOpen(false)}
        >
          {(RenameFoldersDialog) => (
            <RenameFoldersDialog open onOpenChange={setRenameOpen} dirs={outputDirs} source={folderSource} />
          )}
        </DeferredSettingsTool>
      )}
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
    <section className="settings-section overflow-hidden">
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="w-full flex items-center justify-between gap-3 p-5 sm:px-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
      >
        <span className="flex items-center gap-2">
          <span className="settings-section-icon">
            <SlidersHorizontal className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-base font-semibold">Opciones avanzadas</span>
            <span className="block text-[13px] text-muted-foreground mt-0.5">
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
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-1 gap-5 @xl/settings:grid-cols-2">
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
          <div className="mx-5 sm:mx-6 mb-5 sm:mb-6 flex flex-col">
            <div className="settings-option-row flex items-start justify-between gap-3">
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
            <div className="settings-option-row flex items-start justify-between gap-3">
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
            <div className="settings-option-row">
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
                <div className="mt-1 grid gap-x-6 gap-y-1 @xl/settings:grid-cols-3">
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
const DOWNLOADS_BLOCK_KEYS = ['concurrencia', 'servidores', 'nombres', 'avanzado'] as const;

export const DownloadsTab = memo(function DownloadsTab({ visible = true, ...props }: DownloadsTabProps) {
  const [mountedBlocks, setMountedBlocks] = useState(0);
  const staggerKeys = useMemo(() => DOWNLOADS_BLOCK_KEYS.slice(0, mountedBlocks), [mountedBlocks]);
  const contentRef = useStaggerIn<HTMLDivElement>(staggerKeys, {
    disabled: !visible,
    replay: visible,
    flat: true,
  });

  useEffect(() => {
    if (mountedBlocks >= 4) return;
    const timer = setTimeout(() => setMountedBlocks((n) => n + 1), 32);
    return () => clearTimeout(timer);
  }, [mountedBlocks]);

  return (
    <div ref={contentRef} className="flex flex-col gap-6">
      {[DescargasConcurrencia, DescargasServidores, DescargasNombrado, DescargasAvanzado].map((Block, index) =>
        mountedBlocks > index ? <Block key={DOWNLOADS_BLOCK_KEYS[index]} {...props} /> : null,
      )}
    </div>
  );
}, downloadsTabPropsEqual);
