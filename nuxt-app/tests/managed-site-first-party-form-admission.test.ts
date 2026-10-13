import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admitManagedSiteGenerationOutput, computeManagedSiteProviderManifestHash } from '../server/managed-sites/live-connectors/generation-artifact'
import { renderManagedSiteContactForm } from '../server/managed-sites/live-connectors/blueprint'

const endpoint = `https://forms.acme.taipei/api/managed-sites/site-forms/${'a'.repeat(64)}/submit`
const form = renderManagedSiteContactForm({ kind: 'contact_form', formEndpoint: endpoint })
const expected = { requestFingerprint: 'b'.repeat(64), providerKey: 'first_party_confirmed_studio' }
const authority = { ...expected, firstPartyContactForm: { endpoint, path: 'src/pages/index.astro' as const } }
function payload(content: string) {
  const files = [{ path: 'src/pages/index.astro', mediaType: 'text/astro', content, sha256: createHash('sha256').update(content).digest('hex') }]
  return { schemaVersion: 'managed-site-generation-provider-response-v1', ...expected, providerModel: 'confirmed-copy-v1', providerRequestId: 'test-only', files, manifestHash: computeManagedSiteProviderManifestHash(files as any) }
}
afterEach(() => vi.unstubAllEnvs())

describe('exact first-party form admission without relaxing arbitrary form rejection', () => {
  it('rejects actionable forms by default, admits only explicitly authorized exact compiler markup', () => {
    vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', 'https://forms.acme.taipei')
    expect(() => admitManagedSiteGenerationOutput(payload(form), expected)).toThrow('externally actionable')
    expect(admitManagedSiteGenerationOutput(payload(form), authority).files[0]!.content).toBe(form)
    expect(() => admitManagedSiteGenerationOutput(payload(form), { ...authority, firstPartyContactForm: { ...authority.firstPartyContactForm, path: 'src/pages/contact.astro' } })).toThrow('externally actionable')
  })
  it.each([
    form.replace('method="post"', 'method="get"'),
    form.replace(endpoint, endpoint.replace('a'.repeat(64), 'c'.repeat(64))),
    form.replace('maxlength="160"', 'maxlength="99999"'),
    form + form,
    form + '<button formaction="https://attacker.acme.taipei">Send</button>',
    form + '<form method="post" action="https://attacker.acme.taipei"></form>',
    form.replace('class="contact-form"', 'class="contact-form" onsubmit="alert(1)"'),
  ])('rejects altered, duplicate or additional active markup', content => {
    vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', 'https://forms.acme.taipei')
    expect(() => admitManagedSiteGenerationOutput(payload(content), authority)).toThrow()
  })
  it('fails closed when the first-party origin is absent or has changed', () => {
    vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', '')
    expect(() => admitManagedSiteGenerationOutput(payload(form), authority)).toThrow()
    vi.stubEnv('DISCOVERYSTACK_MANAGED_SITE_FORM_INGEST_ORIGIN', 'https://other.acme.taipei')
    expect(() => admitManagedSiteGenerationOutput(payload(form), authority)).toThrow()
  })
})
