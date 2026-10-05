import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoHistoryView, useAppShell } from '@/renderer/App';
import { activeProviderAtom } from '@/renderer/store/atoms';

export const Route = createFileRoute('/history')({
  component: HistoryRoute,
});

function HistoryRoute() {
  const { onSelectAnime } = useAppShell();
  const activeProvider = useAtomValue(activeProviderAtom);
  return (
    <ViewPanel scope="ui:history">
      <MemoHistoryView activeProvider={activeProvider} onSelectAnime={onSelectAnime} />
    </ViewPanel>
  );
}
