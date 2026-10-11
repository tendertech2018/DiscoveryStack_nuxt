import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const guard = fileURLToPath(new URL('../scripts/operations/offline-network-guard.cjs', import.meta.url))
describe('offline acceptance socket boundary', () => {
  it.each(["{host:'example.test',port:443}", "{path:'/tmp/existing-database.sock'}", "{host:'192.0.2.1',port:3306}"])( 'rejects non-fixture connections %s before I/O', target => {
    const result = spawnSync(process.execPath, ['--require', guard, '-e', `try { require('node:net').connect(${target}); process.exit(1) } catch (error) { process.stdout.write(error.code) }`], { env: { PATH: process.env.PATH }, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('OFFLINE_ACCEPTANCE_NETWORK_BLOCKED')
  })
  it('passes loopback arguments unchanged to the transport', () => {
    // Stub before installing guard so no socket is actually opened.
    const code = `const net=require('node:net'); net.Socket.prototype.connect=function(options){return options.host}; require(${JSON.stringify(guard)}); if(new net.Socket().connect({host:'127.0.0.1',port:4311})!=='127.0.0.1')process.exit(1)`
    expect(spawnSync(process.execPath, ['-e', code], { env: { PATH: process.env.PATH } }).status).toBe(0)
  })
})
