import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { reportRendererError } from '../utils/rendererErrorReporting';

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
  onConfirm?: () => void;
  onCancel?: () => void;
  showFooter?: boolean;
  className?: string;
  icon?: React.ReactNode;
  hideDefaultIcon?: boolean;
  headerAlign?: 'start' | 'center';
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
  confirmLoading = false,
  onConfirm,
  onCancel,
  showFooter = true,
  className,
  icon,
  hideDefaultIcon = false,
  headerAlign = 'start',
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-background/85 backdrop-blur-sm z-[9999] animate-in fade-in" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-[9999] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/70 bg-popover shadow-2xl animate-in zoom-in-95 duration-200 select-none ${className || 'max-w-sm'}`}
        >
          <div className="p-6 disable-shortcuts">
            <div className={`flex gap-4 mb-4 ${headerAlign === 'center' ? 'items-center' : 'items-start'}`}>
              {!hideDefaultIcon && (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    danger ? 'bg-destructive/15' : 'bg-primary/15'
                  }`}
                >
                  {icon || <AlertTriangle className={`w-5 h-5 ${danger ? 'text-destructive-fg' : 'text-primary'}`} />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title className="font-bold text-base text-foreground leading-tight truncate">
                  {title}
                </DialogPrimitive.Title>
                {message && (
                  <DialogPrimitive.Description className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {message}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>

            {children}

            {showFooter && (
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    onCancel?.();
                    onOpenChange(false);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  disabled={confirmDisabled || confirmLoading}
                  onClick={async () => {
                    if (confirmDisabled || confirmLoading) return;
                    try {
                      await onConfirm?.();
                    } catch (err) {
                      reportRendererError('ui:dialog', err);
                      return;
                    }
                    onOpenChange(false);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed min-w-[148px] ${
                    danger
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {confirmLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
