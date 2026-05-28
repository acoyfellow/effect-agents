# 01 · parallel-research

> Structured concurrency + retry + deadlines + structured output, in one Effect program.

## Run me

```sh
# Offline contract smoke (no creds; <1s)
bun run smoke 01

# Real LLM (pick one provider)
OPENROUTER_API_KEY=sk-or-...   bun examples/01-parallel-research/agent.ts "What is Effect v4?"

# Against a deployed Worker
curl -sS -X POST "$EFFECT_AGENTS_URL/01" \
  -H 'content-type: application/json' \
  -d '{"question":"What is Effect v4?"}'
```

## What it does

The agent calls three flaky tools in parallel (synthetic 30 % failure rate). Each tool is wrapped in `Effect.retry(Schedule.exponential)` + `Effect.timeout`, so the whole turn is deterministic regardless of which lookups flake. The final answer is `LanguageModel.generateObject({ schema })`, so the result is a typed, schema-validated `{ answer, sources, confidence }` — no `JSON.parse`-and-pray.

## Effect features showcased

- `Effect.timeout` for per-tool deadlines
- `Effect.retry({ schedule: Schedule.exponential })` for transparent flake handling
- `Toolkit.toLayer({...})` for dependency-injected tool handlers
- `LanguageModel.generateObject({ schema })` for typed structured output

## Without Effect

~3× the LOC, hand-rolled `Promise.all`, `AbortController`, retry loops, and Zod parse — with no compile-time guarantee that handlers return the right shape.
