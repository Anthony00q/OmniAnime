interface FocusableProbe {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: ((selector: string) => unknown) | null;
  getAttribute?: ((name: string) => string | null) | null;
}

// Los botones click-only sueltan el foco tras el clic de ratón.
const KEEP_FOCUS_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="separator"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[data-theme-id]',
  '[data-preset-hex]',
  '[data-keep-focus]',
  '[data-drag-handle]',
  '.search-field',
].join(',');

export function shouldKeepFocusOnMouseClick(el: FocusableProbe | null | undefined): boolean {
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  try {
    return el.closest?.(KEEP_FOCUS_SELECTOR) != null;
  } catch {
    return false;
  }
}

// Espacio inerte sin control enfocado.
export function shouldSuppressSpace(el: FocusableProbe | null | undefined): boolean {
  if (!el || el.tagName === undefined) return true;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return false;
  return !shouldKeepFocusOnMouseClick(el);
}
