import { useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { shouldKeepFocusOnMouseClick, shouldSuppressSpace } from '../../utils/focusBlur';
import {
  currentViewAtom,
  previousViewAtom,
  settingsAtom,
  showCloseConfirmAtom,
  navigateToCatalogAtom,
} from '../store/atoms';

const NAVIGATION_VIEWS = ['home', 'catalog', 'details', 'downloader', 'history', 'scanner', 'player', 'settings'];

export function useKeyboardNavigation(): void {
  const [currentView, setCurrentView] = useAtom(currentViewAtom);
  const [, setPreviousView] = useAtom(previousViewAtom);
  const showCloseConfirm = useAtomValue(showCloseConfirmAtom);
  const settings = useAtomValue(settingsAtom);
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);

  const closeShortcut = settings?.shortcuts?.close || 'Escape';
  const searchShortcut = settings?.shortcuts?.search || 'F';
  const previousViewShortcut = settings?.shortcuts?.prevView || 'ArrowLeft';
  const nextViewShortcut = settings?.shortcuts?.nextView || 'ArrowRight';

  useEffect(() => {
    const blockTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const target = e.target as HTMLElement | null;
      // El diálogo necesita su Tab para ciclar el foco; fuera no hace nada.
      if (target?.closest?.('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      e.stopPropagation();
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return;
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return;
      if (active.closest?.('[role="dialog"], [role="menu"]')) return;
      active.blur();
    };
    const blockIdleSpace = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target || target === document.body || shouldSuppressSpace(target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', blockTab, true);
    window.addEventListener('keydown', blockIdleSpace, true);
    return () => {
      window.removeEventListener('keydown', blockTab, true);
      window.removeEventListener('keydown', blockIdleSpace, true);
    };
  }, []);

  useEffect(() => {
    // Los botones click-only sueltan el foco tras el clic de ratón.
    const blurClickResidual = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('button, [role="button"], a[href]') as HTMLElement | null;
      if (!el || shouldKeepFocusOnMouseClick(el)) return;
      el.blur();
    };
    window.addEventListener('click', blurClickResidual, true);
    return () => {
      window.removeEventListener('click', blurClickResidual, true);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCloseConfirm) return;

      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const disableShortcuts = document.querySelector('.disable-shortcuts') !== null;
      const currentViewValue = currentView;

      if (e.key === closeShortcut) {
        if (isInputFocused) {
          target.blur();
          return;
        }

        const closeEvent = new CustomEvent('close-modals', { cancelable: true });
        window.dispatchEvent(closeEvent);
        if (closeEvent.defaultPrevented) return;

        // Escape nunca navega entre vistas.
        if (e.defaultPrevented) return;
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === searchShortcut.toUpperCase() && !disableShortcuts) {
        e.preventDefault();
        navigateToCatalog();
        return;
      }

      if (!isInputFocused && !disableShortcuts && !e.ctrlKey && !e.metaKey) {
        const currentIndex = NAVIGATION_VIEWS.indexOf(currentViewValue);

        if (e.key === previousViewShortcut) {
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? NAVIGATION_VIEWS.length - 1 : currentIndex - 1;
          if (currentViewValue !== 'details' && currentViewValue !== 'settings') {
            setPreviousView(currentViewValue);
          }
          setCurrentView(NAVIGATION_VIEWS[prevIndex]);
        } else if (e.key === nextViewShortcut) {
          e.preventDefault();
          const nextIndex = currentIndex >= NAVIGATION_VIEWS.length - 1 ? 0 : currentIndex + 1;
          if (currentViewValue !== 'details' && currentViewValue !== 'settings') {
            setPreviousView(currentViewValue);
          }
          setCurrentView(NAVIGATION_VIEWS[nextIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    showCloseConfirm,
    closeShortcut,
    searchShortcut,
    previousViewShortcut,
    nextViewShortcut,
    currentView,
    setCurrentView,
    setPreviousView,
    navigateToCatalog,
  ]);
}
