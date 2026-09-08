import { memo } from 'react';
import { RotateCcw, Save, Loader2 } from 'lucide-react';

interface SettingsFooterProps {
  isDirty: boolean;
  isSaved: boolean;
  isSaving: boolean;
  onRestore: () => void;
  onSave: () => void;
}

export const SettingsFooter = memo(function SettingsFooter({
  isDirty,
  isSaved,
  isSaving,
  onRestore,
  onSave,
}: SettingsFooterProps) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-background/85 backdrop-blur-md p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/20 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <RotateCcw className="w-4 h-4" />
          Restaurar por defecto
        </button>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {isDirty ? 'Cambios pendientes' : 'Sincronizado'}
        </span>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-sm font-bold shadow-md transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed ${
          isSaved
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 hover:shadow-lg active:scale-[0.98]'
        }`}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {isSaving ? 'Guardando...' : isSaved ? '¡Guardado!' : isDirty ? 'Guardar cambios' : 'Guardar cambios'}
      </button>
    </div>
  );
});
