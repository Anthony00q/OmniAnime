import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoScannerView } from '@/renderer/App';

export const Route = createFileRoute('/scanner')({
  component: ScannerRoute,
});

function ScannerRoute() {
  return (
    <ViewPanel scope="ui:scanner">
      <MemoScannerView />
    </ViewPanel>
  );
}
