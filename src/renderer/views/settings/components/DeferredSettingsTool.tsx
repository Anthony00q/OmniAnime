import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '@/renderer/components/Dialog';

interface SettingsTool<P extends object> {
  read: () => ComponentType<P> | null;
  load: () => Promise<ComponentType<P>>;
  preload: () => void;
}

export function createSettingsTool<P extends object>(loadComponent: () => Promise<ComponentType<P>>): SettingsTool<P> {
  let component: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const load = () => {
    if (component) return Promise.resolve(component);
    pending ??= Promise.resolve()
      .then(loadComponent)
      .then(
        (loaded) => {
          component = loaded;
          return loaded;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
    return pending;
  };
  return {
    read: () => component,
    load,
    preload: () => {
      void load().catch(() => {});
    },
  };
}

export function DeferredSettingsTool<P extends object>({
  tool,
  title,
  icon,
  onClose,
  children,
}: {
  tool: SettingsTool<P>;
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: (component: ComponentType<P>) => ReactNode;
}) {
  const [state, setState] = useState({ tool, component: tool.read(), failed: false });
  const [attempt, setAttempt] = useState(0);
  const Component = tool.read() ?? (state.tool === tool ? state.component : null);
  const failed = state.tool === tool && state.failed;

  useEffect(() => {
    const cached = tool.read();
    if (cached) {
      setState((previous) =>
        previous.tool === tool && previous.component === cached && !previous.failed
          ? previous
          : { tool, component: cached, failed: false },
      );
      return;
    }
    let cancelled = false;
    void tool.load().then(
      (component) => {
        if (!cancelled) setState({ tool, component, failed: false });
      },
      () => {
        if (!cancelled) setState({ tool, component: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tool, attempt]);

  if (Component) return children(Component);

  return (
    <Dialog
      open
      title={title}
      icon={icon}
      message={failed ? 'No se pudo abrir la herramienta.' : 'Cargando herramienta.'}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      iconTone="neutral"
      showFooter={failed}
      confirmLabel="Reintentar"
      closeOnConfirm={false}
      onConfirm={() => {
        setState({ tool, component: null, failed: false });
        setAttempt((value) => value + 1);
      }}
    >
      {!failed && (
        <div role="status" aria-label="Cargando herramienta" className="flex justify-center py-4">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </Dialog>
  );
}
