import { useCallback, useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { AppUpdateCheckResult, AppUpdateState } from '../../types/appUpdate';
import {
  appUpdateAvailableAtom,
  appUpdateDismissedAtom,
  appUpdateErrorAtom,
  appUpdateModalOpenAtom,
  appUpdatePercentAtom,
  appUpdatePhaseAtom,
} from '../store/atoms';

// Check único tras el handoff del splash: no bloquea el arranque,
// el modal solo se abre si hay versión nueva y no se descartó en la sesión.
const POST_SPLASH_CHECK_DELAY_MS = 2500;

function readCheckResult(result: unknown): AppUpdateCheckResult | null {
  if (!result || typeof result !== 'object') return null;
  return result as AppUpdateCheckResult;
}

export function useAppUpdate() {
  const setAvailable = useSetAtom(appUpdateAvailableAtom);
  const setModalOpen = useSetAtom(appUpdateModalOpenAtom);
  const [dismissed, setDismissed] = useAtom(appUpdateDismissedAtom);
  const setPhase = useSetAtom(appUpdatePhaseAtom);
  const setPercent = useSetAtom(appUpdatePercentAtom);
  const setError = useSetAtom(appUpdateErrorAtom);
  const modalOpen = useAtomValue(appUpdateModalOpenAtom);
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;
  const checkedRef = useRef(false);

  const applyAvailable = useCallback(
    (version: string, notes?: string) => {
      setAvailable({ version, notes });
      setError(null);
      if (!dismissedRef.current) setModalOpen(true);
    },
    [setAvailable, setError, setModalOpen],
  );

  useEffect(() => {
    const onStatus = (state: AppUpdateState) => {
      if (!state || typeof state.kind !== 'string') return;
      switch (state.kind) {
        case 'available':
          if (state.version) applyAvailable(state.version, state.notes);
          break;
        case 'downloading':
          setPhase('downloading');
          if (typeof state.percent === 'number') setPercent(state.percent);
          break;
        case 'downloaded':
          setPhase('downloaded');
          setPercent(100);
          break;
        case 'error':
          setError(state.message || 'Error de actualización.');
          break;
        default:
          break;
      }
    };
    window.api.on('app-update-status', onStatus);
    return () => {
      window.api.removeListener('app-update-status', onStatus);
    };
  }, [applyAvailable, setError, setPercent, setPhase]);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    const timer = setTimeout(() => {
      void window.api
        .invoke('app-update-check')
        .then((result: unknown) => {
          const check = readCheckResult(result);
          if (check?.ok && check.available && check.version) {
            applyAvailable(check.version, check.notes);
          }
        })
        .catch(() => {});
    }, POST_SPLASH_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [applyAvailable]);

  const openModal = useCallback(() => {
    setModalOpen(true);
  }, [setModalOpen]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setModalOpen(false);
  }, [setDismissed, setModalOpen]);

  const startDownload = useCallback(async () => {
    setError(null);
    setPercent(0);
    setPhase('downloading');
    try {
      const result = (await window.api.invoke('app-update-download')) as { ok?: boolean; message?: string } | null;
      if (!result?.ok) {
        setError(result?.message || 'No se pudo descargar la actualización.');
        setPhase('idle');
      }
    } catch {
      setError('No se pudo descargar la actualización.');
      setPhase('idle');
    }
  }, [setError, setPercent, setPhase]);

  const install = useCallback(async () => {
    try {
      const result = (await window.api.invoke('app-update-install')) as { ok?: boolean; message?: string } | null;
      if (!result?.ok) {
        setError(result?.message || 'No se pudo instalar la actualización.');
      }
    } catch {
      setError('No se pudo instalar la actualización.');
    }
  }, [setError]);

  return { modalOpen, dismiss, openModal, startDownload, install };
}
