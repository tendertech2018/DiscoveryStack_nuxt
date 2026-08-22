import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = readFileSync(resolve(process.cwd(), 'scripts/preflight-growth-ledger.mjs'), 'utf8')

describe('Growth Ledger deployment migration preflight', () => {
  it('keeps Netlify deployment from applying production database migrations automatically', () => {
    const netlifyConfig = readFileSync(resolve(process.cwd(), '../netlify.toml'), 'utf8')
    expect(netlifyConfig).toContain('pnpm db:preflight-growth-ledger && pnpm build')
    expect(netlifyConfig).not.toContain('pnpm db:migrate')
  })

  it('allows an already-migrated schema only when Drizzle history contains the exact migration hash', () => {
    expect(script).toContain("SELECT hash FROM __drizzle_migrations WHERE hash = ? LIMIT 1")
    expect(script).toContain("state: 'already_migrated'")
  })

  it('fails closed when the Growth Ledger migration has not been applied yet', () => {
    expect(script).toContain('Growth Ledger schema has not been migrated')
    expect(script).not.toContain("state: 'ready_to_migrate'")
  })

  it('keeps partial schema states fail-closed rather than applying a repair inside request handling', () => {
    expect(script).toContain('Growth Ledger schema is partial')
    expect(script).not.toContain('server/api')
  })
})
