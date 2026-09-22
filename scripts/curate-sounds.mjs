// Genera el catálogo desde uisfx.
// Uso: node scripts/curate-sounds.mjs <package-uisfx>
import * as fs from 'node:fs';
import * as path from 'node:path';

const pkgRoot = process.argv[2];
if (!pkgRoot) {
  console.error('Uso: node scripts/curate-sounds.mjs <package-uisfx>');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'manifest.json'), 'utf8'));
const assetsDir = path.resolve('assets/sounds');
const dataPath = path.resolve('src/utils/soundCatalogData.ts');

const SELECTION = {
  inicio: [
    ['minimal', 'queued', 'En cola'],
    ['soft', 'start', 'Inicio'],
    ['glass', 'play', 'Arranque'],
    ['scifi', 'send', 'Envío'],
    ['zen', 'open', 'Apertura'],
    ['mechanical', 'connect', 'Conexión'],
    ['studio', 'forward', 'Avance'],
    ['dreamy', 'wake', 'Despertar'],
  ],
  exito: [
    ['minimal', 'success', 'Éxito'],
    ['soft', 'complete', 'Completo'],
    ['glass', 'check', 'Verificado'],
    ['scifi', 'achievement', 'Logro'],
    ['zen', 'reward', 'Recompensa'],
    ['mechanical', 'checkpoint', 'Hito'],
    ['studio', 'badge', 'Insignia'],
    ['dreamy', 'level-up', 'Subida de nivel'],
  ],
  error: [
    ['minimal', 'error', 'Error'],
    ['soft', 'warning', 'Aviso'],
    ['glass', 'blocked', 'Bloqueo'],
    ['scifi', 'invalid-drop', 'Rechazo'],
    ['zen', 'cancel', 'Cancelación'],
    ['mechanical', 'disconnect', 'Desconexión'],
    ['studio', 'delete', 'Borrado'],
    ['dreamy', 'retry', 'Reintento'],
  ],
  info: [
    ['minimal', 'info', 'Info'],
    ['soft', 'notification', 'Notificación'],
    ['glass', 'mention', 'Mención'],
    ['scifi', 'reaction', 'Reacción'],
    ['zen', 'toggle-on', 'Activado'],
    ['mechanical', 'focus', 'Foco'],
    ['studio', 'copy', 'Copia'],
    ['dreamy', 'unlock', 'Desbloqueo'],
  ],
};

const PACK_LABELS = {
  minimal: 'Minimal',
  soft: 'Soft',
  glass: 'Glass',
  scifi: 'Sci-fi',
  zen: 'Zen',
  mechanical: 'Mechanical',
  studio: 'Studio',
  dreamy: 'Dreamy',
};

const REF_VOLUME = 0.2;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

fs.rmSync(assetsDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const entries = [];
for (const [group, items] of Object.entries(SELECTION)) {
  for (const [pack, cue, cueLabel] of items) {
    const id = `${pack}-${cue}`;
    const asset = manifest.assets.find((a) => a.pack === pack && a.cue === cue);
    if (!asset) throw new Error(`sin asset: ${pack}/${cue}`);
    const src = path.join(pkgRoot, asset.files.ogg.path);
    const dest = path.join(assetsDir, `${id}.ogg`);
    fs.copyFileSync(src, dest);
    entries.push({
      id,
      label: `${PACK_LABELS[pack]} · ${cueLabel}`,
      group,
      gainTrim: Math.round(clamp(asset.defaultVolume / REF_VOLUME, 0.5, 1.5) * 1000) / 1000,
      durationSec: asset.duration,
      bytes: asset.files.ogg.bytes,
      source: `uisfx@${manifest.version} ${pack}/${cue}`,
    });
  }
}

const outManifest = {
  schemaVersion: 1,
  license: 'CC0-1.0',
  source: `uisfx@${manifest.version} (https://github.com/romainsimon/uisfx) — audio CC0-1.0`,
  generated: 'scripts/curate-sounds.mjs',
  sounds: entries,
};
fs.writeFileSync(path.join(assetsDir, 'manifest.json'), JSON.stringify(outManifest, null, 2) + '\n', 'utf8');

fs.writeFileSync(
  path.join(assetsDir, 'LICENSE-sounds.md'),
  [
    '# Licencia de los sonidos incluidos',
    '',
    `Origen: paquete npm \`uisfx@${manifest.version}\` (https://github.com/romainsimon/uisfx)`,
    '',
    'Los archivos `.ogg` de esta carpeta están dedicados al dominio público bajo la',
    'Creative Commons CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/legalcode).',
    '',
    'Se pueden copiar, modificar, distribuir y usar, incluso comercialmente, sin permiso.',
    'La atribución se agradece pero no es obligatoria.',
    '',
    'SPDX-License-Identifier: CC0-1.0',
    '',
    'Cada sonido indica su origen en `manifest.json` (campo `source`).',
    '',
  ].join('\n'),
  'utf8',
);

const ts = `// Generado por scripts/curate-sounds.mjs — no editar a mano.
// Audio CC0-1.0 (uisfx@${manifest.version}); ver assets/sounds/LICENSE-sounds.md.
import type { SoundCatalogEntry } from './soundCatalog';

export const SOUND_CATALOG: readonly SoundCatalogEntry[] = ${JSON.stringify(entries.map(({ id, label, group, gainTrim }) => ({ id, label, group, gainTrim })), null, 2)};
`;
fs.writeFileSync(dataPath, ts, 'utf8');

const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
console.log(`OK: ${entries.length} sonidos, ${(totalBytes / 1024).toFixed(1)} KB en assets/sounds`);
