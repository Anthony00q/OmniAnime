import { Info } from 'lucide-react';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';

export function DownloadHelpIcon({ label, content }: { label: string; content: string }) {
  return (
    <AppTooltip content={content}>
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        data-keep-focus
        data-native-tab
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <Info className="size-full" aria-hidden="true" />
      </span>
    </AppTooltip>
  );
}
