import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { reportRendererError } from '@/renderer/utils/rendererErrorReporting';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  closeOnConfirm?: boolean;
  dismissDisabled?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  showFooter?: boolean;
  className?: string;
  icon?: React.ReactNode;
  iconTone?: 'action' | 'neutral' | 'warning';
  hideDefaultIcon?: boolean;
  headerAlign?: 'start' | 'center';
  onOpenAutoFocus?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>['onOpenAutoFocus'];
  onPointerDownOutside?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>['onPointerDownOutside'];
  onEscapeKeyDown?: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>['onEscapeKeyDown'];
}

export function Dialog({
  open,
  onOpenChange,
  title,
  message,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  confirmDisabled = false,
  confirmLoading,
  closeOnConfirm = true,
  dismissDisabled = false,
  onConfirm,
  onCancel,
  showFooter = true,
  className,
  icon,
  iconTone = 'action',
  hideDefaultIcon = false,
  headerAlign = 'start',
  onOpenAutoFocus,
  onPointerDownOutside,
  onEscapeKeyDown,
}: DialogProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!dismissDisabled) onOpenChange(value);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-background/85 backdrop-blur-sm z-[9999] animate-in fade-in" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-[9999] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/70 bg-popover shadow-2xl animate-in zoom-in-95 duration-200 select-none ${className || 'max-w-sm'}`}
          onPointerDownOutside={(event) => {
            if (dismissDisabled) event.preventDefault();
            onPointerDownOutside?.(event);
          }}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={(event) => {
            if (dismissDisabled) event.preventDefault();
            onEscapeKeyDown?.(event);
          }}
        >
          <div className="p-6 disable-shortcuts">
            <div className={`flex gap-4 mb-4 ${headerAlign === 'center' || !message ? 'items-center' : 'items-start'}`}>
              {!hideDefaultIcon && (
                <div
                  aria-hidden="true"
                  data-dialog-icon-tone={danger ? 'danger' : iconTone}
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    danger
                      ? 'bg-destructive/15 text-destructive-fg'
                      : iconTone === 'warning'
                        ? 'bg-warning/10 text-warning'
                        : iconTone === 'neutral'
                          ? 'bg-secondary/60 text-muted-foreground'
                          : 'bg-secondary/60 text-primary'
                  }`}
                >
                  {icon ||
                    (danger || iconTone === 'warning' ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <Info className="w-5 h-5" />
                    ))}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title className="font-semibold text-base text-foreground leading-snug break-words [overflow-wrap:anywhere]">
                  {title}
                </DialogPrimitive.Title>
                {message && (
                  <DialogPrimitive.Description className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                    {message}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>

            {children}

            {showFooter && (
              <div className="flex flex-wrap justify-end gap-3 mt-6">
                <button
                  type="button"
                  disabled={dismissDisabled}
                  onClick={() => {
                    if (dismissDisabled) return;
                    onCancel?.();
                    onOpenChange(false);
                  }}
                  className="min-h-11 px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  disabled={confirmDisabled || !!confirmLoading}
                  aria-busy={confirmLoading || undefined}
                  onClick={async () => {
                    if (confirmDisabled || confirmLoading) return;
                    try {
                      await onConfirm?.();
                    } catch (err) {
                      reportRendererError('ui:dialog', err);
                      return;
                    }
                    if (closeOnConfirm) onOpenChange(false);
                  }}
                  className={`relative inline-flex min-h-11 min-w-24 items-center justify-center px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed ${
                    danger
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : 'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)]'
                  }`}
                >
                  {confirmLoading && (
                    <Loader2 aria-hidden="true" className="absolute left-2.5 w-3.5 h-3.5 animate-spin" />
                  )}
                  <span className={confirmLoading === undefined ? undefined : 'px-3'}>{confirmLabel}</span>
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
