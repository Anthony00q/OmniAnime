import { Input, TextField } from 'react-aria-components';

interface CustomInputProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  placeholder?: string;
  disabled?: boolean;
  focusTone?: 'accent' | 'neutral';
  className?: string;
}

export function CustomInput({
  value,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  placeholder,
  disabled = false,
  focusTone = 'accent',
  className = '',
}: CustomInputProps) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      isDisabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={`w-full ${className}`}
    >
      <Input
        data-focus-tone={focusTone}
        placeholder={placeholder}
        className="field-input w-full h-9 rounded-lg border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-text-tertiary transition-[border-color,box-shadow,background-color] hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
      />
    </TextField>
  );
}
