import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { shouldKeepFocusOnMouseClick, shouldSuppressSpace } from '@/utils/focusBlur';
import { settingsAtom, showCloseConfirmAtom } from '@/renderer/store/atoms';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import { viewIdFromPath } from '@/renderer/utils/viewRoutes';

const NAVIGATION_VIEWS = [
  'home',
  'schedule',
  'catalog',
  'details',
  'downloader',
  'history',
  'scanner',
  'player',
  'settings',
];

export function useKeyboardNavigation(): void {
  const { pathname } = useLocation();
  const currentView = viewIdFromPath(pathname) ?? 'home';
  const showCloseConfirm = useAtomValue(showCloseConfirmAtom);
  const settings = useAtomValue(settingsAtom);
  const { setView, navigateToCatalog } = useAppNavigation();

  const closeShortcut = settings?.shortcuts?.close || 'Escape';
  const searchShortcut = settings?.shortcuts?.search || 'F';
  const previousViewShortcut = settings?.shortcuts?.prevView || 'ArrowLeft';
  const nextViewShortcut = settings?.shortcuts?.nextView || 'ArrowRight';

  useEffect(() => {
    const blockTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[role="dialog"], [role="menu"], [data-sonner-toaster]')) return;
      if (target?.closest?.('[data-provider-switcher]')) return;
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, [tabindex], [contenteditable="true"]',
        ),
      )
        .filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            !element.closest('[inert]') &&
            !['hidden', 'collapse'].includes(getComputedStyle(element).visibility) &&
            element.getClientRects().length > 0,
        )
        .sort(
          (left, right) => (left.tabIndex || Number.MAX_SAFE_INTEGER) - (right.tabIndex || Number.MAX_SAFE_INTEGER),
        );
      const index = focusable.indexOf(target as HTMLElement);
      const nextIndex =
        index < 0
          ? e.shiftKey
            ? focusable.length - 1
            : 0
          : (index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      const next = focusable[nextIndex];
      if (next?.closest('[data-provider-switcher]')) return;
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
      if (target.closest?.('[data-sonner-toaster]')) return;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const isProviderFocused = Boolean(target.closest?.('[data-provider-switcher]'));
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

      if (!isInputFocused && !isProviderFocused && !disableShortcuts && !e.ctrlKey && !e.metaKey) {
        const currentIndex = NAVIGATION_VIEWS.indexOf(currentViewValue);

        if (e.key === previousViewShortcut) {
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? NAVIGATION_VIEWS.length - 1 : currentIndex - 1;
          setView(NAVIGATION_VIEWS[prevIndex]);
        } else if (e.key === nextViewShortcut) {
          e.preventDefault();
          const nextIndex = currentIndex >= NAVIGATION_VIEWS.length - 1 ? 0 : currentIndex + 1;
          setView(NAVIGATION_VIEWS[nextIndex]);
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
    setView,
    navigateToCatalog,
  ]);
}
