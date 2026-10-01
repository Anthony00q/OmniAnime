// Única vía a settings/proveedor del renderer: los hooks viven en ./queries
// por dominio y este barrel re-exporta la superficie pública (AGENTS.md §2).
export * from './queries/home';
export * from './queries/catalog';
export * from './queries/providers';
export * from './queries/details';
export * from './queries/anilist';
export * from './queries/jkThumbs';
export * from './queries/queue';
export * from './queries/history';
export * from './queries/library';
export * from './queries/settings';
export * from './queries/storage';
export * from './queries/logs';
