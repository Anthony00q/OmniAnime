import { memo } from 'react';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import animeav1Icon from '../../../../../assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '../../../../../assets/provider-icons/jkanime-32.png';

const PROVIDER_ICONS: Record<string, string> = {
  animeav1: animeav1Icon,
  jkanime: jkanimeIcon,
};

const PROVIDER_NAMES: Record<string, string> = {
  animeav1: 'AnimeAV1',
  jkanime: 'JkAnime',
};

export const ProviderBadge = memo(function ProviderBadge({ providerId }: { providerId?: string }) {
  if (!providerId || !PROVIDER_NAMES[providerId]) {
    return <span className="text-xs text-muted-foreground/40 italic">Desconocido</span>;
  }
  const name = PROVIDER_NAMES[providerId];
  const icon = PROVIDER_ICONS[providerId];
  return (
    <AppTooltip content={`Proveedor de origen: ${name}`}>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/40 bg-secondary/60 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-foreground">
        {icon && (
          <img
            src={icon}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        {name}
      </span>
    </AppTooltip>
  );
});
