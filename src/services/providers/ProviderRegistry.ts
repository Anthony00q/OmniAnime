import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProviderCapabilities, ProviderModule } from './AnimeProvider';

export function isProviderModule(value: unknown): value is ProviderModule {
  if (!value || typeof value !== 'object') return false;
  const mod = value as Partial<ProviderModule>;
  const caps = mod.capabilities as Partial<ProviderCapabilities> | undefined;
  return (
    typeof mod.id === 'string' &&
    !!mod.id.trim() &&
    typeof mod.label === 'string' &&
    !!mod.label.trim() &&
    typeof mod.icon === 'string' &&
    !!mod.icon.trim() &&
    typeof mod.create === 'function' &&
    !!caps &&
    typeof caps.search === 'boolean' &&
    typeof caps.homeFeed === 'boolean' &&
    typeof caps.schedule === 'boolean' &&
    typeof caps.episodeLinks === 'boolean'
  );
}

export interface ProviderDiscovery {
  modules: ProviderModule[];
  // Carpetas de proveedor cargadas (todas las que traen index).
  folders: string[];
  // Carpetas descartadas por no cumplir el contrato (deben ser siempre 0).
  skipped: string[];
}

// Descubre `providers/<nombre>/index.*` por convención: sin imports fijos,
// añadir proveedor es añadir su carpeta. El orden es alfabético por carpeta.
export function discoverProviderModules(): ProviderDiscovery {
  const dir = __dirname;
  const modules: ProviderModule[] = [];
  const folders: string[] = [];
  const skipped: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { modules, folders, skipped };
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const indexJs = path.join(dir, entry.name, 'index.js');
    const indexTs = path.join(dir, entry.name, 'index.ts');
    const indexPath = fs.existsSync(indexJs) ? indexJs : fs.existsSync(indexTs) ? indexTs : null;
    if (!indexPath) continue;
    folders.push(entry.name);
    try {
      const loaded: Record<string, unknown> = require(indexPath);
      const found = Object.values(loaded).filter(isProviderModule);
      if (found.length === 1) modules.push(found[0]);
      else skipped.push(entry.name);
    } catch {
      skipped.push(entry.name);
    }
  }
  return { modules, folders, skipped };
}

export interface ProviderRegistry {
  readonly modules: readonly ProviderModule[];
  get(id: string): ProviderModule | undefined;
}

export function createProviderRegistry(): ProviderRegistry {
  const modules = discoverProviderModules().modules;
  const byId = new Map(modules.map((mod) => [mod.id, mod]));
  return {
    modules,
    get: (id: string) => byId.get(id),
  };
}
