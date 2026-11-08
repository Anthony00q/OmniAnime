import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '@/renderer/store/atoms';

export function useScannerDirectories(): string[] {
  const settings = useAtomValue(settingsAtom);
  return useMemo(() => {
    const outputDirs = settings?.outputDirs;
    const configuredDirs = Array.isArray(outputDirs)
      ? outputDirs.filter((dir: unknown): dir is string => typeof dir === 'string' && dir.trim().length > 0)
      : [];
    if (configuredDirs.length > 0) return configuredDirs.slice(0, 3);
    return settings?.defaultOutputDir ? [settings.defaultOutputDir] : [];
  }, [settings?.defaultOutputDir, settings?.outputDirs]);
}
