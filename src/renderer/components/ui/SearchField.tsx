import type { ChangeEventHandler, FocusEventHandler, FormEventHandler, KeyboardEventHandler, RefObject } from 'react';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';

interface SearchFieldProps {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  ariaLabel?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onClear?: () => void;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaActiveDescendant?: string;
  role?: 'combobox' | 'searchbox';
  ariaHasPopup?: 'listbox' | 'menu' | 'tree' | 'grid' | 'dialog' | 'true';
  ariaAutoComplete?: 'none' | 'inline' | 'list' | 'both';
  className?: string;
  inputClassName?: string;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel = placeholder,
  inputRef,
  onSubmit,
  onKeyDown,
  onFocus,
  onClear,
  ariaControls,
  ariaExpanded,
  ariaActiveDescendant,
  role,
  ariaHasPopup,
  ariaAutoComplete,
  className,
  inputClassName,
}: SearchFieldProps) {
  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    onSubmit?.(event);
  };

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange(event);
  };

  return (
    <form role="search" onSubmit={handleSubmit} className={clsx('search-field group relative', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role={role}
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-activedescendant={ariaActiveDescendant}
        aria-haspopup={ariaHasPopup}
        aria-autocomplete={ariaAutoComplete}
        autoComplete="off"
        className={clsx(
          'h-11 w-full rounded-full border border-border/70 bg-surface pl-11 pr-11 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 placeholder:select-none hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20',
          '[&::-webkit-search-cancel-button]:hidden',
          inputClassName,
        )}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar búsqueda"
          className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
