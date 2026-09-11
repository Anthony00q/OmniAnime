import { useEffect, useState, useRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

interface CustomSelectOption {
  value: string;
  label: string;
  badge?: string;
}

interface CustomSelectProps {
  value: string | number;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  allowClear?: boolean;
  selectedValues?: string[];
  toggle?: boolean;
  ariaLabel?: string;
}

export function CustomSelect({
  value,
  options,
  onChange,
  className,
  placeholder = 'Seleccionar...',
  allowClear = false,
  toggle = false,
  selectedValues,
  ariaLabel,
}: CustomSelectProps) {
  const selectedValue = String(value);
  const selectedOption = options.find((o) => o.value === selectedValue);
  const selectableOptions = options.filter((option) => option.value !== '');
  const savedValueRef = useRef(selectedValue);

  const [internalValue, setInternalValue] = useState(selectedValue || '__empty__');

  useEffect(() => {
    setInternalValue(selectedValue || '__empty__');
  }, [selectedValue]);

  const handleOpenChange = (open: boolean) => {
    if (open && (allowClear || toggle)) {
      savedValueRef.current = selectedValue;
      setInternalValue('__empty__');
    } else if (!open) {
      setInternalValue(selectedValue || '__empty__');
    }
  };

  const handleValueChange = (newValue: string) => {
    if (newValue === '__empty__') return;
    if (allowClear && newValue === savedValueRef.current) {
      onChange(toggle ? newValue : '');
    } else {
      onChange(newValue);
    }
  };

  return (
    <SelectPrimitive.Root value={internalValue} onValueChange={handleValueChange} onOpenChange={handleOpenChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={clsx(
          'inline-flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm text-foreground h-10',
          'hover:bg-secondary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/50',
          'data-[placeholder]:text-muted-foreground/60',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="min-w-0 flex-1 truncate text-left">
          {selectedValues && selectedValues.length > 0
            ? `${selectedValues.length} ${selectedValues.length === 1 ? 'seleccionado' : 'seleccionados'}`
            : (selectedOption?.label ?? placeholder)}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[9999] max-h-60 overflow-y-auto rounded-xl border border-border/70 bg-popover shadow-2xl motion-origin-popper animate-in fade-in zoom-in-95 duration-150"
        >
          <SelectPrimitive.Viewport className="flex flex-col gap-0.5 p-1.5">
            {selectableOptions.map((option) => {
              const isCurrentlySelected =
                selectedValues && selectedValues.length > 0
                  ? selectedValues.includes(option.value)
                  : selectedValue !== '' && option.value === selectedValue;
              return (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-lg px-3 pr-8 py-2.5 text-sm outline-none cursor-pointer select-none',
                    'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    isCurrentlySelected && 'text-primary bg-primary/10',
                    'focus:bg-secondary focus:text-foreground',
                  )}
                >
                  {isCurrentlySelected && <Check className="absolute right-2 h-4 w-4 text-primary" />}
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.badge && (
                    <span className="ml-auto shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wider text-primary">
                      {option.badge}
                    </span>
                  )}
                </SelectPrimitive.Item>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
