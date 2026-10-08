import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoLibraryView, useAppShell } from '@/renderer/App';
import { activeProviderAtom } from '@/renderer/store/atoms';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  const { onSelectAnime } = useAppShell();
  const activeProvider = useAtomValue(activeProviderAtom);
  return (
    <ViewPanel scope="ui:library" titlebarOffset={false} animateEntry={false}>
      <MemoLibraryView isActive onSelectAnime={onSelectAnime} activeProvider={activeProvider} />
    </ViewPanel>
  );
}
