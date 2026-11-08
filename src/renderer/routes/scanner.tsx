import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoScannerView } from '@/renderer/App';
import { ScannerLoadingView } from '@/renderer/views/scanner/components/ScannerSkeleton';

export const Route = createFileRoute('/scanner')({
  component: ScannerRoute,
});

function ScannerRoute() {
  return (
    <ViewPanel scope="ui:scanner" animateEntry={false} loadingFallback={<ScannerLoadingView />}>
      <MemoScannerView />
    </ViewPanel>
  );
}
