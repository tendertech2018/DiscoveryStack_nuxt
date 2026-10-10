import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

const image = process.argv[2]
if (!image || image.startsWith('-')) throw new Error('Usage: node scripts/security/container-smoke.mjs <local-image>')
const name = `discoverystack-smoke-${randomBytes(6).toString('hex')}`
function docker(args, { required = true } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 })
  if (required && (result.error || result.status !== 0)) throw new Error(`Docker ${args[0]} failed: ${result.stderr || result.error?.message}`)
  return result
}
let created = false
try {
  // No provider/DB credentials and no network interface except container loopback.
  docker(['run', '--detach', '--name', name, '--network', 'none', '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--tmpfs', '/app/.data:rw,noexec,nosuid,uid=1000,gid=1000,size=16m', image])
  created = true
  const probe = `
    const assert = await import('node:assert/strict');
    const fs = await import('node:fs');
    assert.notEqual(process.getuid(), 0, 'Runtime must not run as root');
    for (const p of ['/app/.env', '/app/node_modules', '/usr/bin/g++', '/usr/bin/make', '/usr/bin/python3']) assert.equal(fs.existsSync(p), false, 'Unexpected runtime file: ' + p);
    const forbidden = new Set(['node-forge', 'braces', 'simple-git', '@nuxt']);
    function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      assert.equal(forbidden.has(e.name), false, 'Build-only dependency in runtime: ' + e.name);
      if (e.isDirectory()) walk(p + '/' + e.name);
    } }
    walk('/app/.output/server/node_modules');
    // Nitro traces the ESM entry used by the application, not unused CJS files.
    const { default: sharp } = await import('sharp');
    for (const format of ['png', 'webp', 'avif']) {
      const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#fff' } }).toFormat(format).toBuffer();
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 2); assert.equal(metadata.height, 2);
    }
    const health = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(2000) });
    assert.equal(health.status, 200); assert.match(health.headers.get('cache-control') || '', /no-store/);
    assert.equal((await health.json()).status, 'ok');
    const ready = await fetch('http://127.0.0.1:3000/api/ready', { signal: AbortSignal.timeout(3000) });
    assert.equal(ready.status, 503, 'Unconfigured database must not be ready');
    const body = await ready.json(); assert.equal(body.status, 'not_ready'); assert.equal(body.checks.database, 'fail');
    console.log('PASS: non-root, isolated, read-only runtime; no toolchain/build dependencies; native PNG/WebP/AVIF codecs; healthy but not DB-ready');
  `
  let last
  for (let attempt = 0; attempt < 30; attempt++) {
    last = docker(['exec', '--workdir', '/app/.output/server', name, 'node', '--input-type=module', '-e', probe], { required: false })
    if (last.status === 0) { console.log(last.stdout.trim()); break }
    if (docker(['inspect', '--format', '{{.State.Running}}', name]).stdout.trim() !== 'true') break
    await setTimeout(1000)
  }
  if (last?.status !== 0) throw new Error(`Container acceptance failed: ${last?.stderr || 'no response'}`)
} finally {
  if (created) docker(['rm', '--force', name], { required: false })
}
