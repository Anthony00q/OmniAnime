const { app, session, shell, dialog, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { installOfflineGuard } = require('../helpers/offline.cjs');
const { validateIsolatedRoot } = require('../helpers/isolation.cjs');

const workspace = path.resolve(__dirname, '../..');
let root;
let origin;
try {
  root = validateIsolatedRoot(process.env.OMNI_TEST_ROOT, process.env.OMNI_TEST_TOKEN);
  origin = new URL(process.env.OMNIANIME_DEV_SERVER_URL);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('Renderer no autorizado.');
} catch {
  process.stderr.write('No se inicia Electron: perfil de pruebas no autorizado o inválido.\n');
  app.exit(1);
}
installOfflineGuard();
process.chdir(root);
app.setName(`OmniAnime pruebas ${process.env.OMNI_TEST_TOKEN}`);
app.setAppPath(workspace);
for (const name of ['appData', 'userData', 'sessionData', 'downloads', 'temp', 'logs', 'crashDumps']) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
fs.writeFileSync(
  path.join(app.getPath('userData'), 'settings.json'),
  JSON.stringify({
    defaultOutputDir: app.getPath('downloads'),
    outputDirs: [app.getPath('downloads')],
    notificationsSound: false,
    notifyOnComplete: false,
    minimizeToTrayOnClose: false,
  }),
);
shell.openExternal = async () => {
  throw new Error('Acción externa bloqueada en pruebas.');
};
shell.openPath = async () => 'Acción externa bloqueada en pruebas.';
shell.showItemInFolder = () => {};
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async () => ({ canceled: true });
Notification.prototype.show = () => {};
app.relaunch = () => {
  throw new Error('Reinicio bloqueado en pruebas.');
};

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
globalThis.__omniHarness = {
  token: process.env.OMNI_TEST_TOKEN,
  readLoop: () => ({ p95Ms: loop.percentile(95) / 1e6, maxMs: loop.max / 1e6 }),
  resetLoop: () => loop.reset(),
};
app.on('will-quit', () => loop.disable());
function isolateSession(current) {
  current.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed =
      ['file:', 'data:', 'omni-media:', 'devtools:'].includes(url.protocol) || url.origin === origin.origin;
    callback({ cancel: !allowed });
  });
  current.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
app.on('session-created', isolateSession);
app.whenReady().then(() => isolateSession(session.defaultSession));
require(path.join(workspace, 'dist/main/main.js'));
