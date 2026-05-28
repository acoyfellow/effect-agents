# 04 · typed-errors

> The agent's error channel is a tagged union of `AiError` classes. The handler matches them exhaustively. No `try/catch`. No `any`.

## Run me

```sh
# Offline contract smoke (no creds; <1s)
bun run smoke 04

# Real LLM — happy path
OPENROUTER_API_KEY=sk-or-...   bun examples/04-typed-errors/agent.ts

# Real LLM — force a failure path
OPENROUTER_API_KEY=sk-this-is-bad bun examples/04-typed-errors/agent.ts

# Against a deployed Worker (status code reflects the typed error reason)
curl -sS -i -X POST "$EFFECT_AGENTS_URL/04" \
  -H 'content-type: application/json' \
  -d '{"question":"Reply with the single word: pong."}'
```

## What it does

`LanguageModel.generateText` fails into `AiError`, which carries a `reason` whose `_tag` is one of `RateLimitError | QuotaExhaustedError | AuthenticationError | NetworkError | InternalProviderError | ContentPolicyError | InvalidRequestError | StructuredOutputError | ToolNotFoundError | …`. The agent uses `Effect.catchTag("AiError", …)` and pattern-matches `reason._tag` to map each case to a precise HTTP status and a stable error code.

The Worker handler returns those codes directly: 429 on rate limits, 502 on upstream auth/network/internal-provider, 500 on tool/output failures. The full mapping is in [reference/worker-endpoints.md](../../docs/reference/worker-endpoints.md#status-code-contract-for-04).

## Effect features showcased

- `Effect.catchTag` over typed error union
- `AiError` discriminated union from `effect/unstable/ai/AiError`
- `Effect.catchDefect` belt-and-suspenders for the defect channel

## Without Effect

`try { … } catch (e: any) { if (e.status === 429) … }` at every boundary. No compile-time exhaustiveness. Every refactor risks a missed branch.
