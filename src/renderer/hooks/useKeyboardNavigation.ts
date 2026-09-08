import { useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  currentViewAtom,
  previousViewAtom,
  selectedAnimeAtom,
  settingsAtom,
  showCloseConfirmAtom,
  navigateToCatalogAtom,
} from '../store/atoms';

const NAVIGATION_VIEWS = ['home', 'catalog', 'details', 'downloader', 'history', 'scanner', 'player', 'settings'];

export function useKeyboardNavigation(): void {
  const [currentView, setCurrentView] = useAtom(currentViewAtom);
  const [previousView, setPreviousView] = useAtom(previousViewAtom);
  const [, setSelectedAnime] = useAtom(selectedAnimeAtom);
  const showCloseConfirm = useAtomValue(showCloseConfirmAtom);
  const settings = useAtomValue(settingsAtom);
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);

  const closeShortcut = settings?.shortcuts?.close || 'Escape';
  const searchShortcut = settings?.shortcuts?.search || 'F';
  const previousViewShortcut = settings?.shortcuts?.prevView || 'ArrowLeft';
  const nextViewShortcut = settings?.shortcuts?.nextView || 'ArrowRight';

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

        if (currentViewValue === 'details') {
          setSelectedAnime(null);
          setCurrentView(previousView || 'home');
          return;
        }

        if (currentViewValue === 'settings') {
          setCurrentView(previousView || 'home');
          return;
        }
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
    previousView,
    setCurrentView,
    setPreviousView,
    setSelectedAnime,
    navigateToCatalog,
  ]);
}
