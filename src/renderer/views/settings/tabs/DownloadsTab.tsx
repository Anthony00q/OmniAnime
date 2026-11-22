import { memo, useEffect, useId, useMemo, useState } from 'react';
import {
  Gauge,
  Server,
  Layers,
  Eye,
  SlidersHorizontal,
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
import { DownloadHelpIcon } from '@/renderer/views/settings/components/DownloadHelpIcon';
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
  const episodeScopeId = useId();
  const adaptiveHintId = useId();
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const adaptive = normalizeAdaptiveConnections(dl.adaptiveConnections);
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');
  const setAdaptiveEnabled = (enabled: boolean) => onDlChange('adaptiveConnections', { ...adaptive, enabled });
  const setAdaptiveServer = (server: keyof typeof adaptive.servers, on: boolean) =>
    onDlChange('adaptiveConnections', { ...adaptive, servers: { ...adaptive.servers, [server]: on } });
  const locked = {
    mediafireConnections: isConnectionControlLocked('mediafireConnections', adaptive),
    mp4uploadConnections: isConnectionControlLocked('mp4uploadConnections', adaptive),
    voeConnections: isConnectionControlLocked('voeConnections', adaptive),
  };

  return (
    <section className="settings-section">
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="settings-section-icon">
            <Gauge className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold">Rendimiento</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Episodios en paralelo</h3>
            <p id={episodeScopeId} className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Del mismo anime.
            </p>
          </div>
          <CustomSelect
            value={String(dl.maxParallelEpisodes)}
            onChange={(v) => onDlChange('maxParallelEpisodes', Number(v))}
            ariaLabel="Episodios en paralelo"
            describedBy={episodeScopeId}
            className="w-full"
            options={DOWNLOAD_PARALLEL_OPTIONS.map((o) => ({ ...o }))}
          />
        </div>
        {dl.maxParallelEpisodes >= 3 && (
          <p className="text-[13px] text-warning leading-relaxed select-none mt-3" role="note">
            Como máximo 2 se descargan a la vez del mismo servidor, para no saturarlo.
          </p>
        )}

        <div className="mt-6 border-t border-border/40 pt-6">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold">Conexiones por archivo</h3>
            <DownloadHelpIcon
              label="Ayuda sobre conexiones por archivo"
              content="Si un servidor no admite varias conexiones, se usa una."
            />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Partes del mismo archivo que se descargan a la vez.
          </p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                <span>Conexiones adaptativas</span>
                <span className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1 py-px text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">
                  Experimental
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Ajusta las conexiones según su rendimiento durante la descarga.
              </p>
            </div>
            <div className="shrink-0">
              <CustomSwitch
                checked={adaptive.enabled}
                onChange={setAdaptiveEnabled}
                ariaLabel="Conexiones adaptativas (experimental)"
              />
            </div>
          </div>
          <details className="group mt-2">
            <summary
              data-keep-focus
              className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              Elegir servidores para el modo adaptativo
              <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="settings-subpanel mb-1 mt-1 bg-surface-elevated">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {adaptive.enabled
                  ? 'Los servidores que desactives aquí usarán su ajuste manual.'
                  : 'Activa Conexiones adaptativas para elegir los servidores.'}
              </p>
              <div className="mt-2 grid gap-x-6 gap-y-1 @2xl/settings:grid-cols-3">
                {ADAPTIVE_SERVER_ROWS.map((row) => (
                  <div key={row.id} className="flex min-h-11 items-center justify-between gap-3">
                    <span className="text-sm font-medium">{row.label}</span>
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
          </details>
          <div className="mt-3 border-t border-border/40 pt-4">
            <h4 className="text-sm font-semibold">Ajuste por servidor</h4>
            {Object.values(locked).some(Boolean) && (
              <p
                id={adaptiveHintId}
                className="mt-3 rounded-lg bg-surface-elevated px-3 py-2 text-[13px] leading-relaxed text-muted-foreground"
                role="note"
              >
                {ADAPTIVE_MANAGED_HINT}
              </p>
            )}
            <div className="settings-option-row mt-2 grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
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
          </div>
        </div>
        <div className="mt-6 border-t border-border/40 pt-6">
          <div className="grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Segmentos HLS en paralelo</h3>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                Cuántas partes del episodio se descargan a la vez. Solo en AnimeAV1.
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
        <p
          className="mt-5 border-t border-border/40 pt-4 text-[13px] leading-relaxed text-muted-foreground"
          role="note"
        >
          Los cambios no alteran una transferencia en curso. Se aplican al iniciar nuevos episodios o intentos.
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
        <h2 className="text-base font-semibold">Servidores disponibles</h2>
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
        <h2 className="text-base font-semibold">Archivos y carpetas</h2>
      </div>
      <div className="grid grid-cols-1 gap-5 @xl/settings:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-sm font-semibold">Nombre de los archivos</span>
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
          <span className="block text-sm font-semibold">Nombre de la carpeta de descarga</span>
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
      <details className="group mt-3 border-t border-border/40">
        <summary
          data-keep-focus
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-semibold [&::-webkit-details-marker]:hidden"
        >
          Herramientas para renombrar la librería
          <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
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
      </details>
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
  const dl = { ...DEFAULT_DOWNLOAD_SETTINGS, ...(settings.download || {}) };
  const onDlChange = (key: string, value: any) => onChange(key, value, 'download');

  return (
    <section className="settings-section p-5 sm:p-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="settings-section-icon">
          <SlidersHorizontal className="size-5" />
        </div>
        <h2 className="text-base font-semibold">Reintentos y recuperación</h2>
      </div>
      <div className="flex flex-col">
        <div className="settings-option-row flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
              Continuar descargas interrumpidas
              <DownloadHelpIcon
                label="Ayuda sobre continuar descargas interrumpidas"
                content="Si cambia el enlace o el servidor no lo permite, empieza de cero."
              />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Retoma el episodio donde se quedó, en vez de empezar de cero.
            </p>
          </div>
          <CustomSwitch
            checked={dl.allowContinue}
            onChange={(c) => onDlChange('allowContinue', c)}
            ariaLabel="Continuar descargas parciales"
          />
        </div>
        <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
          <span className="text-sm font-semibold">Reintentos por descarga</span>
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
        <div className="settings-option-row grid grid-cols-1 gap-3 @2xl/settings:grid-cols-[minmax(0,1fr)_15rem] @2xl/settings:items-center @2xl/settings:gap-6">
          <div className="space-y-2">
            <span className="block text-sm font-semibold">Tiempo de espera al iniciar</span>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Cuánto se espera a que la descarga empiece antes de cancelar el intento.
            </p>
          </div>
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
        </div>
        <div className="settings-option-row flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
              Limpiar temporales al terminar
              <DownloadHelpIcon
                label="Ayuda sobre limpiar temporales"
                content="Si lo desactivas, los puedes borrar luego desde Almacenamiento."
              />
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Borra los archivos temporales del episodio cuando termina bien.
            </p>
          </div>
          <CustomSwitch
            checked={dl.cleanCacheOnComplete}
            onChange={(c) => onDlChange('cleanCacheOnComplete', c)}
            ariaLabel="Limpiar temporales al terminar"
          />
        </div>
        <div className="settings-option-row flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Eliminar carpeta vacía al cancelar</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Solo al cancelar toda la descarga. Los temporales propios se limpian aunque conserves la carpeta.
            </p>
          </div>
          <CustomSwitch
            checked={dl.removeEmptyFolderOnCancel}
            onChange={(checked) => onDlChange('removeEmptyFolderOnCancel', checked)}
            ariaLabel="Eliminar carpeta vacía al cancelar"
          />
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
