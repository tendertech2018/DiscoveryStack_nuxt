// Test/build process guard. Only loopback TCP fixtures may open sockets.
// No Unix sockets (including an existing local DB) or external TCP connections.
const net = require('node:net')
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const parameters = Array.isArray(args[0]) ? args[0] : args
  const first = parameters[0]
  const options = first && typeof first === 'object' && !Array.isArray(first) ? first : null
  const host = options?.host ?? options?.hostname ?? (typeof parameters[1] === 'string' ? parameters[1] : 'localhost')
  const port = options?.port ?? first
  if (options?.path || !Number.isFinite(Number(port)) || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw Object.assign(new Error('OFFLINE_ACCEPTANCE_NETWORK_BLOCKED'), { code: 'OFFLINE_ACCEPTANCE_NETWORK_BLOCKED' })
  }
  return originalConnect.apply(this, args)
}
