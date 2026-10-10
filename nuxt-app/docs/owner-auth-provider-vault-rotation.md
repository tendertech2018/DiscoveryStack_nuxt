# Owner authentication and provider-vault rotation

This runbook covers the server-only settings introduced by the owner-authentication hardening. Never place their values in source control, browser runtime config, screenshots, or support logs.

## Owner session signing

Set one request-time server secret, preferably `NUXT_SESSION_SECRET`; `JWT_SECRET` remains a compatibility alias. The exact value must be 32–4096 UTF-8 bytes with no surrounding whitespace. A missing or invalid value makes owner session issuance fail closed with HTTP 503. Rotating it invalidates existing owner sessions, so plan a fresh OAuth sign-in after rotation.

## Temporary password fallback

The password-only route is a short-lived break-glass fallback, not the production identity provider. It is inert unless all of these are true:

- `OWNER_SIMPLE_LOGIN_ENABLED=true` exactly;
- `OWNER_SIMPLE_LOGIN_PASSWORD` is an independent random 32–4096 byte secret;
- `OWNER_OPEN_ID` (or the compatibility alias `NUXT_OWNER_OPEN_ID`) names an **existing** database user whose role is already `admin`;
- `NUXT_DISCOVERYSTACK_PRIVATE_ORIGIN` is the exact public HTTPS origin serving the form.

The route no longer creates users or promotes roles. POST requests require the exact configured Origin and, when supplied by the browser, `Sec-Fetch-Site: same-origin`. Its in-process limiter uses the transport peer address and ignores arbitrary `X-Forwarded-For` values. A multi-replica deployment must additionally enforce a shared rate limit at its trusted edge. Disable the fallback by removing `OWNER_SIMPLE_LOGIN_ENABLED` as soon as OAuth acceptance is complete.

Before routing production traffic, check the configured identity against the actual database `admin` row and complete a fresh sign-in. An environment variable or green database probe is not proof that this identity has admin authority. A new OAuth user remains an ordinary `user`; this hardening does not bootstrap or promote an owner.

## Independent provider-vault key

New provider credentials require an independent primary key:

```text
NUXT_PROVIDER_VAULT_KEY_ID=key-2026-q4
NUXT_PROVIDER_VAULT_KEY=<independent random value, 32–4096 bytes>
```

New writes use `v2.<key-id>.<iv>.<tag>.<ciphertext>` AES-256-GCM envelopes whose authenticated data includes the version and key ID. They never use the session-signing secret.

Generate independent secrets for session signing, password fallback, provider-vault encryption and backups. Do not reuse a former session secret as a new vault key or fallback password. Runtime configuration fails closed when the new vault primary equals the current session secret, any explicitly configured legacy session secret, or the active fallback password. It intentionally allows the current session secret to appear again in its decrypt-only legacy list and does not reject previous-v2 read keys needed for rotation. Check backup and other unloaded historical roles privately in the secret manager during deployment acceptance without logging any values.

During a vault-key rotation, keep the former key available only for reads:

```text
NUXT_PROVIDER_VAULT_PREVIOUS_KEYS_JSON={"key-2026-q3":"<former independent vault key>"}
```

Deploy the new primary plus the old read key, verify existing credentials can be read, then re-enter each stored provider credential through the owner settings so it is written with the new primary. Remove the previous key only after every stored envelope has been rewritten and verified. Keep at most eight previous keys.

Existing `v1` rows remain readable through the current session secret during the transition. If the session secret must rotate before all rows are rewritten, temporarily provide the exact former value explicitly:

```text
NUXT_PROVIDER_VAULT_LEGACY_SESSION_SECRETS_JSON=["<former session secret used by v1>"]
```

This legacy list is decrypt-only; new writes fail closed until `NUXT_PROVIDER_VAULT_KEY` is configured. After re-entering and verifying all provider credentials, remove the legacy list. Keep at most eight legacy secrets. A malformed key ID, weak key, duplicate ID, damaged ciphertext, or missing decryption key always produces the same generic 503 and never falls back to returning ciphertext or a raw secret.

## Rollback compatibility

After the first `v2` credential write, a pre-hardening image that only reads `v1` is no longer a compatible rollback target. Keeping the former keys does not teach the old binary to read the new envelope. Preserve a verified `v2`-capable image and its required keyring before further releases. If a problem occurs before such a fallback exists, pause affected provider automation and roll forward to a corrected `v2`-capable release. Do not overwrite provider rows or restore the production database merely to downgrade; either action requires a separate approved recovery plan.
