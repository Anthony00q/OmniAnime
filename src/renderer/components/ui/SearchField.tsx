import type { FocusEventHandler, KeyboardEventHandler, RefObject } from 'react';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Button, Group, Input, SearchField as AriaSearchField } from 'react-aria-components';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onSubmit?: (value: string) => void;
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
  return (
    <AriaSearchField
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      aria-label={ariaLabel}
      className={clsx('search-field group relative', className)}
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <Group>
        <Input
          ref={inputRef}
          placeholder={placeholder}
          role={role}
          aria-controls={ariaControls}
          aria-expanded={ariaExpanded}
          aria-activedescendant={ariaActiveDescendant}
          aria-haspopup={ariaHasPopup}
          aria-autocomplete={ariaAutoComplete}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          className={clsx(
            'search-input h-11 w-full rounded-full border border-border/70 bg-surface pl-11 pr-11 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] hover:border-border-strong placeholder:text-muted-foreground/60 placeholder:select-none focus:outline-none',
            '[&::-webkit-search-cancel-button]:hidden',
            inputClassName,
          )}
        />
        {value && onClear && (
          <Button
            onPress={() => onClear()}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </Group>
    </AriaSearchField>
  );
}
