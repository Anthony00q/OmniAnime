import { useEffect, useState, type ReactNode } from 'react';

export function HistoryDeferredDetails({ expanded, children }: { expanded: boolean; children: () => ReactNode }) {
  const [hasOpened, setHasOpened] = useState(expanded);

  useEffect(() => {
    if (expanded) setHasOpened(true);
  }, [expanded]);

  return expanded || hasOpened ? children() : null;
}
