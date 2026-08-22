import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = readFileSync(resolve(process.cwd(), 'scripts/preflight-growth-ledger.mjs'), 'utf8')

describe('Growth Ledger deployment migration preflight', () => {
  it('allows an already-migrated schema only when Drizzle history contains the exact migration hash', () => {
    expect(script).toContain("SELECT hash FROM __drizzle_migrations WHERE hash = ? LIMIT 1")
    expect(script).toContain("state: 'already_migrated'")
  })

  it('keeps partial schema states fail-closed rather than applying a repair inside request handling', () => {
    expect(script).toContain('Growth Ledger schema is partial')
    expect(script).not.toContain('server/api')
  })
})
