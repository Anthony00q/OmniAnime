import { useCallback, useState } from 'react';

export function useHistoryExpansion() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleReason = useCallback((key: string) => {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback((keys: string[]) => setExpandedGroups(new Set(keys)), []);
  const collapseAll = useCallback(() => setExpandedGroups(new Set<string>()), []);
  const clearReasons = useCallback(() => setExpandedReasons(new Set<string>()), []);

  return {
    expandedGroups,
    expandedReasons,
    toggleGroup,
    toggleReason,
    expandAll,
    collapseAll,
    clearReasons,
    setExpandedGroups,
    setExpandedReasons,
  };
}
