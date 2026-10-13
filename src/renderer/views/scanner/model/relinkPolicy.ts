interface ScannerRelinkSource {
  metaSlug?: string | null;
  providerId?: string | null;
  hasProviderMetadata?: boolean;
}

export function resolveScannerRelinkProvider(folder: ScannerRelinkSource, activeProvider: string): string | null {
  if (activeProvider !== 'animeav1' && activeProvider !== 'jkanime') return null;
  const hasLink = Boolean(folder.metaSlug);
  const hasUnknownOrigin = !hasLink && (folder.hasProviderMetadata === false || !folder.providerId);
  if (hasUnknownOrigin) return activeProvider;
  const providerId = folder.providerId || 'animeav1';
  return providerId === activeProvider ? providerId : null;
}
