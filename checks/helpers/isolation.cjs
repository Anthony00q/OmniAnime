const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function validateIsolatedRoot(input, token) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || typeof token !== 'string' || !token) {
    throw new Error('Electron de pruebas requiere una raíz y un token propios.');
  }
  const root = path.resolve(input);
  const parent = fs.realpathSync.native(path.join(os.tmpdir(), 'opencode'));
  if (path.dirname(root) !== parent || !path.basename(root).startsWith('omnianime-electron-')) {
    throw new Error('La raíz de pruebas no está en el directorio temporal autorizado.');
  }
  const marker = JSON.parse(fs.readFileSync(path.join(root, 'harness.json'), 'utf8'));
  if (marker.token !== token || fs.realpathSync.native(root) !== root) {
    throw new Error('No se pudo verificar el perfil aislado de pruebas.');
  }
  return root;
}

module.exports = { validateIsolatedRoot };
