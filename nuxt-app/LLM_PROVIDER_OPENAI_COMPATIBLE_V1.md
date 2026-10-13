# OpenAI-compatible LLM Provider V1

## Purpose and boundary

This server-only layer provides one injectable, SDK-free chat-completions transport for GEO base-draft generation and the managed-site one-sentence edit planner. The two features have independent switches. Unset switches preserve deterministic behavior, and no provider response or credential is logged or persisted.

Allowed HTTPS endpoints are limited to the exact chat-completions paths for:

- `dashscope-intl.aliyuncs.com` and `dashscope.aliyuncs.com`;
- workspace hosts with one `ws-<lowercase-alphanumeric-id>` label in `ap-southeast-1`, `us-east-1`, `cn-beijing`, `cn-hongkong`, `eu-central-1`, or `ap-northeast-1`; the six regional workspace URLs follow [Alibaba Cloud's OpenAI-compatible Chat reference, updated 2026-09-28](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions). Ports, authentication, query/fragment components, arbitrary workspace labels, extra labels and noncanonical paths remain blocked; this allowlist is configuration validation, not a successful credential or provider-call proof.
- `api.openai.com`.

Base URLs ending in `/compatible-mode/v1` or `/v1` are normalized to their matching `/chat/completions` URL. Query strings, fragments, userinfo, explicit ports, lookalike hosts, cross-family paths, redirects, and unapproved regions fail closed.

## Configuration names

- Shared provider: `NUXT_LLM_ENDPOINT`, `NUXT_LLM_API_KEY`, `NUXT_LLM_MODEL`.
- GEO switch: `NUXT_CONTENT_DRAFT_PROVIDER=openai_compatible`.
- Editor switch: `NUXT_PAGE_EDITOR_AI_PROVIDER=openai_compatible`.
- Optional editor-specific model: `NUXT_PAGE_EDITOR_AI_MODEL`.
- Legacy GEO fallback names remain supported: `NUXT_GEOFLOW_QWEN_ENDPOINT`, `NUXT_GEOFLOW_QWEN_API_KEY`, `NUXT_GEOFLOW_QWEN_MODEL`, `NUXT_GEOFLOW_QWEN_CREDENTIAL_REFERENCE`, `NUXT_AUTOGEO_BAILIAN_ENDPOINT`, `NUXT_AUTOGEO_BAILIAN_API_KEY`, `NUXT_AUTOGEO_BAILIAN_MODEL`. The legacy provider value `autogeo_bailian_qwen` aliases `openai_compatible`.
- Real-provider test gate: `DS_RUN_REAL_LLM_TESTS=1`.

OpenAI endpoints require an explicit shared or editor model; the legacy `qwen-plus` default is used only for Bailian endpoints.

## Failure semantics and tests

GEO provider output remains a draft and still passes the existing source-bound safety gate. A safety-blocked draft is held for human review with no automatic retry.

An editor provider timeout, transport failure, malformed output, forbidden operation, or failed dry run returns `clarification_required`, no operations, and `AI 暫時無法處理這個要求，請換個說法再試一次。`. The reserved daily budget is released and this fallback proposal is not stored, so it cannot be applied. Rule-based unrelated and dangerous refusals never call the provider.

With the editor switch enabled, incomplete or non-allow-listed `NUXT_LLM_*` configuration is treated as `not_configured`: it uses the same fallback with `AI_PLANNER_FAILURE:not_configured`, consumes no quota, and is not persisted.

Planner-provided warnings are sanitized and can never carry the reserved `AI_PLANNER_UNAVAILABLE` or `AI_PLANNER_FAILURE:*` markers; only the server-side fallback emits them, so provider output cannot make a request skip the budget commit or the stored proposal record.

`pnpm test` uses mocked fetch implementations and makes no provider call. `pnpm test:real-llm` is explicitly opt-in and covers a minimal completion, editor planning, and GEO base draft.

## Manual test

1. Set the three `NUXT_LLM_*` variables in the deployment secret/configuration system, then enable only the desired feature switch.
2. For the editor, submit one bounded sentence, inspect the structured proposal, and confirm that nothing changes until the customer explicitly applies a stored `proposed` proposal. For GEO, manually trigger one base draft and inspect provider provenance plus the human-review gate.
3. Run `pnpm test:real-llm` in an isolated test environment, record only status/provenance metadata, then unset the feature switch to verify deterministic fallback.

## Website Studio Claude transport (2026-10-13)

The website studio additionally supports native Claude Messages through `server/llm-provider/anthropic.ts` and the studio-only selector `website-studio.ts`. This does not modify the OpenAI-compatible endpoint allowlist, GEO/content drafting, the page editor, training, or visibility probes.

- Set `NUXT_MANAGED_SITE_STUDIO_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in the private API host's secret settings. Without the explicit switch, the existing provider selection is unchanged. When Claude is selected but its configuration is incomplete, fail closed without borrowing a Qwen key or calling another provider.
- The default is `claude-sonnet-5-5`. Optional `ANTHROPIC_MODEL=claude-sonnet-4-6` supports that explicitly selected alternative. Optional `ANTHROPIC_WORKSPACE_ID` supports keys requiring a workspace. Unsupported model IDs fail closed.
- Fixed `https://api.anthropic.com/v1/messages`, `x-api-key`, API version `2023-06-01`, separate top-level system prompt, no SDK, tools, redirects, sampling parameters or automatic retries. Sonnet 5.5 uses `thinking.type=between_tools`; 4.6 uses `disabled`. Each call has a 12,288 output-token cap, 90-second whole-response deadline and bounded response bytes. These bounds are not an account-wide monetary budget.
- Only a completed assistant text message from the requested model is admitted. Refusal, truncation, unexpected blocks, invalid JSON and oversized output fail. The same studio copy/strategy validators, customer confirmation, immutable build and deployment gates apply. A failed revision never overwrites the existing draft.
- No secret storage endpoint or new database field is introduced. The account owner pastes the key directly into Render. Never read back the value into logs, screenshots, chat, source or the public Astro build. Saving a key is not credential validation; generation requests consume provider usage after activation. Real calls require separate authorized acceptance.

Official references checked for this implementation: [Messages API](https://platform.claude.com/docs/en/api/messages/create), [authentication](https://platform.claude.com/docs/en/manage-claude/authentication), [Sonnet 5.5 thinking change](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5#turn-off-up-front-thinking-with-between_tools). Local tests inject a fake transport; no real Claude request is part of the default suite.
