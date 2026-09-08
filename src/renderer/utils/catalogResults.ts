interface CatalogResultIdentity {
  id?: unknown;
  slug?: unknown;
}

export function getCatalogResultKey(item: CatalogResultIdentity): string | null {
  const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
  if (slug) return `slug:${slug}`;

  const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id).trim() : '';
  return id ? `id:${id}` : null;
}

export function dedupeCatalogPages<T extends CatalogResultIdentity>(pages: T[][]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const page of pages) {
    for (const item of page) {
      const key = getCatalogResultKey(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(item);
    }
  }

  return result;
}

export function hasNewCatalogItems<T extends CatalogResultIdentity>(lastPage: T[], previousPages: T[][]): boolean {
  const previousKeys = new Set<string>();

  for (const page of previousPages) {
    for (const item of page) {
      const key = getCatalogResultKey(item);
      if (key) previousKeys.add(key);
    }
  }

  return lastPage.some((item) => {
    const key = getCatalogResultKey(item);
    return key !== null && !previousKeys.has(key);
  });
}
