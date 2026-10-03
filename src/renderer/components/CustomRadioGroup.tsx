import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ReactNode } from 'react';

interface CustomRadioGroupProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function CustomRadioGroup({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  children,
}: CustomRadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
    >
      {children}
    </RadioGroupPrimitive.Root>
  );
}

interface CustomRadioProps {
  value: string;
  disabled?: boolean;
}

export function CustomRadio({ value, disabled = false }: CustomRadioProps) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      disabled={disabled}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
