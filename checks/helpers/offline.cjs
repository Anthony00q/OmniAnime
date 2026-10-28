const net = require('node:net');

function isLoopbackHost(host) {
  return ['127.0.0.1', '::1', '[::1]'].includes(host);
}

function installOfflineGuard() {
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options =
      typeof first === 'object' && first !== null
        ? first
        : { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
    if (!options.path && !isLoopbackHost(options.host || 'localhost')) {
      const error = new Error('Red externa bloqueada por el harness de pruebas.');
      error.code = 'OMNI_TEST_NETWORK_BLOCKED';
      throw error;
    }
    return connect.apply(this, args);
  };
}

module.exports = { isLoopbackHost, installOfflineGuard };
