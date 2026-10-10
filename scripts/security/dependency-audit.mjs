import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exceptions never hide an entire package, severity, version range, or graph.
// A new advisory, dependency path, package version, or expiry fails the gate.
export function evaluateAudit(report, { app, exceptions = [], now = new Date() }) {
  if (!report || typeof report.advisories !== 'object' || !report.advisories
    || Array.isArray(report.advisories) || !report.metadata?.vulnerabilities) {
    throw new Error('The registry did not return a valid pnpm audit report.')
  }
  const relevant = exceptions.filter(item => item.app === app)
  const expired = relevant.filter(item => !/^\d{4}-\d{2}-\d{2}$/.test(item.expires)
    || !Number.isFinite(Date.parse(`${item.expires}T00:00:00Z`))
    || now.getTime() >= Date.parse(`${item.expires}T00:00:00Z`))
  const findings = []
  for (const advisory of Object.values(report.advisories)) {
    if (!advisory.github_advisory_id || !advisory.module_name || !advisory.findings?.length) {
      throw new Error('An audit advisory has no verifiable identity or dependency paths.')
    }
    for (const finding of advisory.findings) {
      if (!finding.version || !finding.paths?.length) throw new Error('An audit finding has no version or dependency path.')
      for (const path of finding.paths) {
        const exception = relevant.find(item => item.advisory === advisory.github_advisory_id
          && item.module === advisory.module_name && item.version === finding.version
          && item.paths.includes(path) && !expired.includes(item))
        findings.push({ advisory: advisory.github_advisory_id, module: advisory.module_name,
          severity: advisory.severity, version: finding.version, path,
          acceptedUntil: exception?.expires ?? null })
      }
    }
  }
  const counts = Object.values(report.metadata.vulnerabilities)
  if (!counts.length || counts.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Audit vulnerability totals are missing or invalid.')
  }
  const count = counts.reduce((sum, value) => sum + value, 0)
  if (count > 0 && findings.length === 0) {
    throw new Error('Audit vulnerability totals cannot be reconciled with the findings.')
  }
  return { ok: expired.length === 0 && findings.every(item => item.acceptedUntil),
    vulnerabilities: report.metadata.vulnerabilities, findings,
    expired: expired.map(item => item.advisory) }
}

function main() {
  const { name: app } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  if (!['discoverystack-nuxt', 'discoverystack-public-site'].includes(app)) {
    throw new Error('Run the security audit from nuxt-app or public-site.')
  }
  const exceptions = JSON.parse(readFileSync(new URL('./dependency-audit-exceptions.json', import.meta.url), 'utf8'))
  const pnpm = process.env.npm_execpath
  const result = pnpm && /pnpm/i.test(pnpm)
    ? spawnSync(process.execPath, [pnpm, 'audit', '--json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
    : spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error || ![0, 1].includes(result.status)) throw new Error('The registry audit could not complete; the security gate fails closed.')
  const evaluation = evaluateAudit(JSON.parse(result.stdout), { app, exceptions })
  console.log(JSON.stringify({ app, ...evaluation }, null, 2))
  process.exitCode = evaluation.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
