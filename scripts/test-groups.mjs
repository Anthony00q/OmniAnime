import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function collect(root, directory) {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return collect(root, file);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [file] : [];
  });
}

export function discoverTests(root) {
  /** @type {{ ci: string[], local: string[], build: string[], tooling: string[] }} */
  const groups = { ci: collect(root, 'checks/unit'), local: [], build: [], tooling: [] };
  for (const file of collect(root, 'tests')) {
    if (file.startsWith('tests/diagnostics/') || file.startsWith('tests/external/')) continue;
    const group = file.startsWith('tests/tooling/') ? 'tooling' : file.startsWith('tests/build/') ? 'build' : 'local';
    groups[group].push(file);
  }
  for (const files of Object.values(groups)) files.sort();
  return groups;
}
