import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useId } from 'react';

interface CustomSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
}

export function CustomSwitch({ checked, onChange, label, ariaLabel }: CustomSwitchProps) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      {label && (
        <label htmlFor={id} className="cursor-pointer select-none text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={ariaLabel || label || 'Cambiar opción'}
        className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors bg-muted-foreground/20 data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none translate-x-0.5 data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    </div>
  );
}
