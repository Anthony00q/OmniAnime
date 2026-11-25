import { memo } from 'react';
import { Check, RotateCcw, Save, Loader2 } from 'lucide-react';

interface SettingsFooterProps {
  isDirty: boolean;
  isSaved: boolean;
  isSaving: boolean;
  canSave: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export const SettingsFooter = memo(function SettingsFooter({
  isDirty,
  isSaved,
  isSaving,
  canSave,
  onRestore,
  onDiscard,
  onSave,
}: SettingsFooterProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/30 bg-background px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          onClick={onRestore}
          data-native-tab
          data-keep-focus
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-motion-micro) hover:border-border hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <RotateCcw className="w-4 h-4" />
          Restablecer
        </button>
        <span role="status" className="text-xs text-muted-foreground">
          {isSaving
            ? 'Guardando…'
            : isDirty
              ? canSave
                ? 'Cambios sin guardar'
                : 'Corrige el color de acento'
              : isSaved
                ? 'Cambios guardados'
                : ''}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {isDirty && (
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            data-native-tab
            data-keep-focus
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            Descartar cambios
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || isSaving}
          data-native-tab
          data-keep-focus
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] disabled:bg-secondary disabled:text-muted-foreground"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : !isDirty && isSaved ? (
            <Check className="size-4 text-success" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Guardar cambios
        </button>
      </div>
    </div>
  );
});
