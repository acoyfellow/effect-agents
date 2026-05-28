# 02 · streaming-tools

> `Stream<StreamPart, …>` + fiber interruption: the consumer owns the lifecycle.

## Run me

```sh
# Offline contract smoke (no creds; <1s)
bun run smoke 02

# Real LLM (pick one provider)
OPENROUTER_API_KEY=sk-or-...   bun examples/02-streaming-tools/agent.ts "Tell me about user u_alice."

# Against a deployed Worker (NDJSON stream)
curl -sS -N -X POST "$EFFECT_AGENTS_URL/02" \
  -H 'content-type: application/json' \
  -d '{"question":"Tell me about user u_alice."}'
```

## What it does

The agent streams response parts — `text-delta`, `tool-call`, `tool-result`, `finish` — through a single Effect `Stream`. The same value powers the local CLI (interleaved tokens + tool calls printed to stdout) and the Worker endpoint `POST /02` (NDJSON over a Web `ReadableStream`).

If the consumer disconnects (HTTP abort, killed fiber), every upstream fiber — the model HTTP call AND in-flight tool handlers — is interrupted in finite time via Effect's `Scope`. No leaked sockets. No orphan tool runs.

## Effect features showcased

- `LanguageModel.streamText` returning `Stream`
- `Stream.tap` / `Stream.runDrain` for back-pressure-safe consumption
- `Scope`-based resource safety: cancellation propagates upstream automatically
- Convert an Effect `Stream` into a web `ReadableStream<Uint8Array>` to expose over HTTP

## Without Effect

AbortController plumbing threaded through OpenAI SDK + tool execution loop + SSE parser. Cancellation correctness is a perennial bug.
