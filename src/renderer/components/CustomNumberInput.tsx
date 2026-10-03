import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Group, Input, NumberField } from 'react-aria-components';

interface CustomNumberInputProps {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function CustomNumberInput({
  value,
  onChange,
  min = 0,
  icon,
  ariaLabel,
  disabled = false,
  className = '',
  inputClassName = '',
}: CustomNumberInputProps) {
  const parsed = value.trim() === '' ? NaN : Number(value);
  const numberValue = Number.isFinite(parsed) ? parsed : undefined;

  return (
    <NumberField
      value={numberValue}
      onChange={(n) => onChange(Number.isFinite(n) ? String(n) : '')}
      minValue={min}
      isDisabled={disabled}
      aria-label={ariaLabel}
      formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
      className={`w-full ${className}`}
    >
      <Group className="group relative flex items-center w-full">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary pointer-events-none">
            {icon}
          </span>
        )}
        <Input
          className={`field-input w-full rounded-lg border border-border text-foreground pr-10 transition-[border-color,box-shadow] hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 ${
            icon ? 'pl-9' : ''
          } [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${inputClassName}`}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col">
          <Button
            slot="increment"
            aria-label="Incrementar"
            className="flex h-4 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            slot="decrement"
            aria-label="Decrementar"
            className="flex h-4 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </span>
      </Group>
    </NumberField>
  );
}
