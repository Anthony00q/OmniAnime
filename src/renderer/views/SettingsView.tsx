import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSetAtom } from 'jotai';
import { Dialog } from '../components/Dialog';
import { SettingsHeader } from './settings/components/SettingsHeader';
import { SettingsTabNav } from './settings/components/SettingsTabNav';
import { SettingsFooter } from './settings/components/SettingsFooter';
import { playNotificationSound } from '../utils/sound';
import { DEFAULT_ACCENT_HEX, getAccentHex, isValidAccentColor } from '../utils/color';
import { settingsAtom } from '../store/atoms';
import type { AppSettings, ThemeId } from '../../types/settings';
import {
  useLoadSettings,
  useSaveSettings,
  useUpdateYtdlp,
  useStorageStats,
  useAppPaths,
  useStorageActions,
} from '../hooks/useQueries';
import { ErrorState } from '../components/ui/ErrorState';
import { AppearanceTab } from './settings/tabs/AppearanceTab';
import { DownloadsTab } from './settings/tabs/DownloadsTab';
import { NotificationsTab } from './settings/tabs/NotificationsTab';
import { ShortcutsTab } from './settings/tabs/ShortcutsTab';
import { StorageTab } from './settings/tabs/StorageTab';
import { SystemTab } from './settings/tabs/SystemTab';
import {
  normalizeSettings,
  buildNamingPreview,
  formatBytes,
  formatDiskPercent,
  reorderOutputDirs,
} from './settings/utils/settingsHelpers';
import { isValidOutputDirString } from '../../utils/outputDirs';
import {
  EPISODE_VIEW_EVENT,
  getEpisodeView,
  normalizeEpisodeView,
  setEpisodeView,
  type EpisodeView,
} from '../utils/episodeView';

export function SettingsView({ isActive = true }: { isActive?: boolean }) {
  const { data: loadedSettings, isLoading, isError, refetch } = useLoadSettings();
  const saveSettings = useSaveSettings();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);
  const [initialSettingsJson, setInitialSettingsJson] = useState<string>('');
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('sistema');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restartItems, setRestartItems] = useState<string[]>([]);
  const [restartHasDownloads, setRestartHasDownloads] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState<string>('');
  // Vista de episodios (localStorage): en Ajustes se estadía hasta Guardar,
  // desde Detalles aplica al instante. Un cambio externo limpia el staged.
  const [pendingEpView, setPendingEpView] = useState<EpisodeView | null>(null);
  const [liveEpView, setLiveEpView] = useState<EpisodeView>(getEpisodeView);
  const handleEpViewChange = useCallback((view: EpisodeView) => {
    setPendingEpView(normalizeEpisodeView(view));
  }, []);
  useEffect(() => {
    const onExternalChange = () => {
      setPendingEpView(null);
      setLiveEpView(getEpisodeView());
    };
    window.addEventListener(EPISODE_VIEW_EVENT, onExternalChange);
    return () => window.removeEventListener(EPISODE_VIEW_EVENT, onExternalChange);
  }, []);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevHwAccelRef = useRef<boolean | null>(null);
  const prevProviderRef = useRef<string | null>(null);
  const accentRafRef = useRef<number | null>(null);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);

  const setGlobalSettings = useSetAtom(settingsAtom);
  const updateYtdlp = useUpdateYtdlp();
  const queryDirs = useMemo(() => {
    if (!settings) return [];
    const s = settings as AppSettings;
    const dirs =
      (s as unknown as { outputDirs?: unknown }).outputDirs ||
      ((s as unknown as { defaultOutputDir?: string }).defaultOutputDir
        ? [(s as unknown as { defaultOutputDir?: string }).defaultOutputDir as string]
        : []);
    return (dirs as unknown[]).filter(
      (d: unknown): d is string => typeof d === 'string' && (d as string).trim().length > 0,
    );
  }, [settings]);
  const storageStatsQuery = useStorageStats(isActive && activeTab === 'almacenamiento', queryDirs);
  const appPathsQuery = useAppPaths(isActive && activeTab === 'almacenamiento');
  const storageActions = useStorageActions();
  // Sin refetch manual: `enabled` + invalidaciones ya cubren la carga.

  const normalizedSettingsJson = useMemo(() => {
    if (!settings) return '';
    try {
      return JSON.stringify(normalizeSettings(settings as AppSettings));
    } catch {
      return '';
    }
  }, [settings]);

  const isDirty = useMemo(() => {
    if (pendingEpView !== null && pendingEpView !== liveEpView) return true;
    if (!initialSettings || !settings || !initialSettingsJson) return false;
    try {
      const a = settings as AppSettings;
      const b = initialSettings as AppSettings;
      if (a.theme !== b.theme || a.accentColor !== b.accentColor) return true;
      return normalizedSettingsJson !== initialSettingsJson;
    } catch {
      return false;
    }
  }, [settings, initialSettings, initialSettingsJson, normalizedSettingsJson, pendingEpView, liveEpView]);

  const accentHex = useMemo(
    () => getAccentHex((settings as AppSettings | null)?.accentColor || '#3b82f6'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.accentColor],
  );
  const accentInputValid = useMemo(() => {
    const trimmed = accentInput.trim();
    if (!trimmed) return true; // empty allowed (will fallback)
    return isValidAccentColor(trimmed);
  }, [accentInput]);

  const checkActiveDownloads = async (): Promise<boolean> => {
    try {
      const queue = await (window as any).api?.invoke?.('get-queue');
      const items = Array.isArray(queue) ? queue : queue?.items || [];
      return items.some((item: any) => item?.status === 'downloading');
    } catch {
      return false;
    }
  };

  const openRestartDialog = async (items: string[]) => {
    if (items.length === 0) return;
    setRestartItems(items);
    setRestartHasDownloads(await checkActiveDownloads());
    setShowRestartConfirm(true);
  };

  const handleRestartNow = async () => {
    setRestartLoading(true);
    try {
      await (window as any).api?.invoke?.('app-restart');
    } catch {
      toast.error('No se pudo reiniciar. Ciérrala y ábrela de nuevo.');
      setRestartLoading(false);
      setShowRestartConfirm(false);
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      if (accentRafRef.current !== null) cancelAnimationFrame(accentRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (isActive === false) {
      setShowRestoreConfirm(false);
      if (!restartLoading) setShowRestartConfirm(false);
    }
  }, [isActive, restartLoading]);

  // Cada pestaña empieza arriba: evita saltos al venir de un tab más largo
  useEffect(() => {
    tabScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (loadedSettings && !settings) {
      const normalizedSettings = normalizeSettings(loadedSettings) as AppSettings;
      setSettings(normalizedSettings);
      setInitialSettings(normalizedSettings);
      try {
        setInitialSettingsJson(JSON.stringify(normalizedSettings));
      } catch {
        setInitialSettingsJson('');
      }
      setAccentInput(normalizedSettings.accentColor || '#3b82f6');
      prevHwAccelRef.current = normalizedSettings.hardwareAcceleration !== false;
      prevProviderRef.current = normalizedSettings.defaultProvider || 'animeav1';
      // --color-primary is now owned solely by App.tsx (via settingsAtom), no direct setProperty here
    }
  }, [loadedSettings, settings]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const fetchVersion = async () => {
      try {
        const v = await (window as any).api?.invoke?.('get-ytdlp-version');
        if (!cancelled && typeof v === 'string' && v) setYtdlpVersion(v);
      } catch {}
    };
    fetchVersion();
    return () => {
      cancelled = true;
    };
  }, [isActive]);

  // Preview live: gate by visibility to avoid RAF when Settings hidden (hidden keep-alive)
  useEffect(() => {
    if (!isActive || activeTab !== 'apariencia') return;
    const raw = (settings as AppSettings | null)?.accentColor;
    if (!raw) return;
    const hex = getAccentHex(raw);
    if (!isValidAccentColor(raw) && raw.trim() !== '') return;
    if (accentRafRef.current !== null) cancelAnimationFrame(accentRafRef.current);
    accentRafRef.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--color-primary', hex);
      accentRafRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.accentColor, isActive, activeTab]);

  const handleSave = async () => {
    const nextSettings = normalizeSettings(settings) as AppSettings;
    const trimmedAccent = String(nextSettings.accentColor || '').trim();
    if (trimmedAccent && isValidAccentColor(trimmedAccent)) {
      nextSettings.accentColor = getAccentHex(trimmedAccent);
    } else if (!trimmedAccent) {
      nextSettings.accentColor = DEFAULT_ACCENT_HEX;
    } else {
      const fallbackHex = getAccentHex((initialSettings as AppSettings | null)?.accentColor || DEFAULT_ACCENT_HEX);
      nextSettings.accentColor = fallbackHex;
      toast.error('Color de acento no válido', {
        description: 'Usa HEX como #3b82f6 o HSL como hsl(217 91% 60%). Se restauró el anterior.',
      });
    }
    const hwChanged = (nextSettings?.hardwareAcceleration !== false) !== prevHwAccelRef.current;
    const providerChanged = (nextSettings?.defaultProvider || 'animeav1') !== (prevProviderRef.current || 'animeav1');
    const retroArmed = nextSettings?.autoRenameRetroactive === true;

    const committedEpView = pendingEpView;
    saveSettings.mutate(nextSettings as unknown as Record<string, unknown>, {
      onSuccess: () => {
        prevHwAccelRef.current = nextSettings?.hardwareAcceleration !== false;
        prevProviderRef.current = nextSettings?.defaultProvider || 'animeav1';
        if (committedEpView !== null) {
          setEpisodeView(committedEpView);
          setPendingEpView(null);
          setLiveEpView(committedEpView);
        }
        toast.success('Configuración guardada correctamente');
        setSettings(nextSettings);
        setInitialSettings(nextSettings);
        try {
          setInitialSettingsJson(JSON.stringify(nextSettings));
        } catch {
          setInitialSettingsJson('');
        }
        setAccentInput(nextSettings.accentColor || DEFAULT_ACCENT_HEX);
        setGlobalSettings(nextSettings as unknown as AppSettings);
        setIsSaved(true);
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setIsSaved(false), 2000);
        const items: string[] = [];
        if (hwChanged) items.push('Aceleración por hardware');
        if (providerChanged) items.push('Proveedor por defecto');
        if (retroArmed) items.push('Renombrado retroactivo');
        if (items.length > 0) void openRestartDialog(items);
      },
      onError: () => {
        toast.error('Error al guardar la configuración');
      },
    });
  };

  const handleRestore = () => {
    setShowRestoreConfirm(true);
  };

  const confirmRestore = async () => {
    try {
      const defaultSettings = await window.api.invoke('get-default-settings');
      const nextSettings = normalizeSettings(defaultSettings) as AppSettings;
      const hwChanged = (nextSettings?.hardwareAcceleration !== false) !== prevHwAccelRef.current;
      const providerChanged = (nextSettings?.defaultProvider || 'animeav1') !== (prevProviderRef.current || 'animeav1');
      const retroArmed = nextSettings?.autoRenameRetroactive === true;

      saveSettings.mutate(nextSettings as unknown as Record<string, unknown>, {
        onSuccess: () => {
          prevHwAccelRef.current = nextSettings?.hardwareAcceleration !== false;
          prevProviderRef.current = nextSettings?.defaultProvider || 'animeav1';
          setPendingEpView(null);
          setSettings(nextSettings);
          setInitialSettings(nextSettings);
          try {
            setInitialSettingsJson(JSON.stringify(nextSettings));
          } catch {
            setInitialSettingsJson('');
          }
          setAccentInput(nextSettings.accentColor || DEFAULT_ACCENT_HEX);
          setGlobalSettings(nextSettings);
          toast.success('Todos los ajustes se han restaurado y guardado correctamente.');
          const items: string[] = [];
          if (hwChanged) items.push('Aceleración por hardware');
          if (providerChanged) items.push('Proveedor por defecto');
          if (retroArmed) items.push('Renombrado retroactivo');
          if (items.length > 0) void openRestartDialog(items);
        },
        onError: () => {
          toast.error('Error al restablecer la configuración');
        },
      });
    } catch {
      toast.error('Error al restablecer la configuración');
    } finally {
      setShowRestoreConfirm(false);
    }
  };

  const handleDiscard = useCallback(() => {
    setPendingEpView(null);
    if (!initialSettings) return;
    // Revierte el preview en vivo del acento (el efecto RAF solo corre en el tab apariencia)
    if (accentRafRef.current !== null) {
      cancelAnimationFrame(accentRafRef.current);
      accentRafRef.current = null;
    }
    document.documentElement.style.setProperty(
      '--color-primary',
      getAccentHex(initialSettings.accentColor || DEFAULT_ACCENT_HEX),
    );
    setSettings(initialSettings);
    setAccentInput(initialSettings.accentColor || DEFAULT_ACCENT_HEX);
    toast.info('Cambios descartados');
  }, [initialSettings]);

  const handleUpdateYtdlp = async () => {
    if (updateYtdlp.isPending) return;
    const toastId = toast.loading('Buscando actualizaciones de yt-dlp...');
    try {
      const res = await updateYtdlp.mutateAsync();
      const versionDescription =
        res.previousVersion && res.currentVersion ? `${res.previousVersion} → ${res.currentVersion}` : undefined;

      if (res.currentVersion) setYtdlpVersion(res.currentVersion);

      if (res.code === 'UP_TO_DATE') {
        toast.success('Sin cambios', {
          id: toastId,
          description: versionDescription || 'Ya tienes la versión más reciente de yt-dlp.',
        });
      } else if (res.success) {
        toast.success('Actualización completada', {
          id: toastId,
          description: res.warning || versionDescription || 'Se instaló la nueva versión de yt-dlp.',
        });
      } else if (res.code === 'ACTIVE_DOWNLOADS') {
        toast.info('Actualización pospuesta', { id: toastId, description: res.message });
      } else {
        toast.error('Error al actualizar yt-dlp', { id: toastId, description: res.message });
      }
    } catch (e: any) {
      toast.error('Error al actualizar yt-dlp', { id: toastId, description: e.message });
    }
  };

  const handleChange = useCallback((key: string, value: unknown, category?: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const p = prev as unknown as Record<string, unknown>;
      if (category) {
        const cat = (p[category] as Record<string, unknown>) || {};
        return { ...p, [category]: { ...cat, [key]: value } } as unknown as AppSettings;
      }
      return { ...p, [key]: value } as unknown as AppSettings;
    });
  }, []);

  const handleThemeChange = useCallback(
    (t: ThemeId) => {
      handleChange('theme', t);
    },
    [handleChange],
  );

  const handleAccentPreset = useCallback(
    (hex: string) => {
      setAccentInput(hex);
      handleChange('accentColor', hex);
    },
    [handleChange],
  );

  const handleAccentInputChange = useCallback(
    (raw: string) => {
      setAccentInput(raw);
      const trimmed = raw.trim();
      if (trimmed === '') {
        // keep preview on fallback but don't persist empty yet; let isDirty stay false until save normalizes
        handleChange('accentColor', '');
        return;
      }
      if (isValidAccentColor(trimmed)) {
        handleChange('accentColor', trimmed);
      }
      // invalid → keep accentInput dirty for inline error, but don't mutate settings.accentColor (preview stays previous valid)
    },
    [handleChange],
  );

  const testSound = () => {
    playNotificationSound(settings, 'success');
  };

  const handleSelectOutputDir = async (index: number) => {
    try {
      const selectedPath = await window.api.invoke('select-folder');
      if (!selectedPath) return;
      if (typeof selectedPath !== 'string' || !isValidOutputDirString(selectedPath)) {
        toast.error('Carpeta no válida. Elige una carpeta dentro de un disco, no la raíz.');
        return;
      }
      const s = settings as unknown as { outputDirs?: string[]; defaultOutputDir?: string };
      const newDirs = [...(s.outputDirs || (s.defaultOutputDir ? [s.defaultOutputDir] : []))];
      newDirs[index] = selectedPath;
      handleChange('outputDirs', newDirs);
    } catch {
      toast.error('Error al seleccionar carpeta');
    }
  };

  const handleOpenOutputDir = async (dir: string) => {
    if (!dir) return;
    try {
      const res = await window.api.invoke('open-folder', dir);
      if (res && res.success === false) toast.error(res.error || 'No se pudo abrir la carpeta');
    } catch {
      toast.error('No se pudo abrir la carpeta');
    }
  };

  const handleAddOutputDir = () => {
    const s = settings as unknown as { outputDirs?: string[]; defaultOutputDir?: string };
    const dirs = s.outputDirs || (s.defaultOutputDir ? [s.defaultOutputDir] : []);
    if (dirs.length >= 3) {
      toast.error('Máximo 3 carpetas permitidas');
      return;
    }
    handleChange('outputDirs', [...dirs, '']);
  };

  const handleRemoveOutputDir = (index: number) => {
    const s = settings as unknown as { outputDirs?: string[]; defaultOutputDir?: string };
    const dirs = s.outputDirs || (s.defaultOutputDir ? [s.defaultOutputDir] : []);
    if (dirs.length <= 1) {
      toast.error('Debe haber al menos 1 carpeta configurada');
      return;
    }
    const newDirs = dirs.filter((_: string, i: number) => i !== index);
    handleChange('outputDirs', newDirs);
  };

  const handleReorderOutputDirs = useCallback((from: number, to: number) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const p = prev as unknown as { outputDirs?: string[]; defaultOutputDir?: string };
      const dirs: string[] = p.outputDirs || (p.defaultOutputDir ? [p.defaultOutputDir] : []);
      if (from < 0 || to < 0 || from >= dirs.length || to >= dirs.length || from === to) return prev;
      return {
        ...(prev as unknown as AppSettings),
        outputDirs: reorderOutputDirs(dirs, from, to),
      } as unknown as AppSettings;
    });
  }, []);

  if (isLoading || !settings) {
    if (isError) {
      return (
        <div className="flex h-full items-center justify-center">
          <ErrorState
            title="No se pudo cargar la configuración"
            description="No pudimos leer tus preferencias guardadas."
            onRetry={() => refetch()}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full" role="status" aria-label="Cargando configuración">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outputDirs: string[] = settings.outputDirs || [settings.defaultOutputDir];
  const namingPreview = buildNamingPreview(settings.namingStyle || 'descriptive');

  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground">
      <SettingsHeader isDirty={isDirty} onDiscard={handleDiscard} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-[960px]:flex-row">
        <SettingsTabNav activeTab={activeTab} onTabChange={setActiveTab} />

        <div
          ref={tabScrollRef}
          className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 min-[960px]:p-8 min-[960px]:pt-6 custom-scrollbar [scrollbar-gutter:stable]"
        >
          <div
            key={activeTab}
            className="settings-tab-enter mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16 xl:max-w-6xl 2xl:max-w-7xl"
          >
            {activeTab === 'sistema' && (
              <SystemTab
                settings={settings}
                outputDirs={outputDirs}
                onSelectOutputDir={handleSelectOutputDir}
                onOpenOutputDir={handleOpenOutputDir}
                onAddOutputDir={handleAddOutputDir}
                onRemoveOutputDir={handleRemoveOutputDir}
                onReorderOutputDirs={handleReorderOutputDirs}
                onChange={handleChange}
              />
            )}

            {activeTab === 'descargas' && (
              <DownloadsTab
                settings={settings}
                namingPreview={namingPreview}
                ytdlpVersion={ytdlpVersion}
                updateYtdlp={updateYtdlp}
                onChange={handleChange}
                onUpdateYtdlp={handleUpdateYtdlp}
              />
            )}

            {activeTab === 'almacenamiento' && (
              <StorageTab
                storageStatsQuery={storageStatsQuery}
                appPathsQuery={appPathsQuery}
                storageActions={storageActions}
                formatBytes={formatBytes}
                formatDiskPercent={formatDiskPercent}
              />
            )}

            {activeTab === 'apariencia' && (
              <AppearanceTab
                theme={(settings as AppSettings).theme}
                accentHex={accentHex}
                accentInput={accentInput}
                accentInputValid={accentInputValid}
                onThemeChange={handleThemeChange}
                onAccentPreset={handleAccentPreset}
                onAccentInputChange={handleAccentInputChange}
                epViewPending={pendingEpView}
                onEpViewChange={handleEpViewChange}
              />
            )}

            {activeTab === 'notificaciones' && (
              <NotificationsTab settings={settings} onChange={handleChange} onTestSound={testSound} />
            )}

            {activeTab === 'atajos' && <ShortcutsTab settings={settings} onChange={handleChange} />}
          </div>
        </div>
      </div>

      <SettingsFooter
        isDirty={isDirty}
        isSaved={isSaved}
        isSaving={saveSettings.isPending}
        onRestore={handleRestore}
        onSave={handleSave}
      />
      <Dialog
        open={showRestoreConfirm}
        onOpenChange={setShowRestoreConfirm}
        title="¿Restablecer ajustes?"
        message="Se restaurarán carpetas, descargas, tema, colores, notificaciones y atajos a los valores de fábrica. Esta acción se guarda automáticamente."
        confirmLabel="Restablecer"
        danger={true}
        onConfirm={confirmRestore}
      />
      <Dialog
        open={showRestartConfirm}
        onOpenChange={(open) => {
          if (!restartLoading) setShowRestartConfirm(open);
        }}
        title="Reiniciar para aplicar"
        message={`Esto aplicará: ${restartItems.join(', ')}.${restartHasDownloads ? ' Hay descargas en curso, se interrumpirán.' : ''}`}
        confirmLabel="Reiniciar ahora"
        cancelLabel="Más tarde"
        confirmLoading={restartLoading}
        icon={<RefreshCw className="w-5 h-5 text-primary" />}
        onConfirm={handleRestartNow}
      />
    </div>
  );
}
