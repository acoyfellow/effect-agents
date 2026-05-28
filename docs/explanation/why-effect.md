# Why effect-agents?

LLM SDKs give you `client.chat.completions.create(...)` and call it a day. Real agents need:

- **bounded concurrency** (don't open 100 parallel HTTP connections to a flaky search API)
- **retries** with exponential backoff (transient failures shouldn't surface to the user)
- **timeouts** per operation (the slowest tool shouldn't pin your worker)
- **interruption** (an HTTP disconnect should cancel every in-flight tool *and* the upstream model HTTP)
- **typed errors** (a rate-limit is not the same shape as a context-overflow is not the same shape as a content-policy block)
- **structured output** (validated against a schema, not `JSON.parse`-and-pray)
- **human-in-the-loop** (some tools shouldn't run without approval — and proving you didn't run them yet is non-trivial)
- **streaming** (token deltas and tool events in one ordered channel)
- **observability** (spans across the whole composition, not just the HTTP call)

Bolting those onto vanilla SDK code is months of careful glue. You end up reinventing a job queue, a backoff library, an abort-controller-propagation scheme, an event-channel format, an approval state machine, and a Zod-decode-or-throw policy — for every project.

## What Effect changes

Effect is a single TypeScript value type — `Effect.Effect<A, E, R>` — that describes a computation with success type `A`, typed failure `E`, and a required *context* `R` (services it needs). Everything above becomes a one-liner combinator on that type:

- `Effect.timeout("3 seconds")` — typed failure on slow operations
- `Effect.retry({ schedule: Schedule.exponential("100 millis") })` — backoff retry, typed
- `Effect.forEach(items, fn, { concurrency: 5 })` — bounded parallelism
- `Effect.catchTag("AiError", err => ...)` — exhaustive typed error handling
- `Stream.Stream<A, E, R>` — typed streams that respect Effect's resource and interruption semantics
- `Effect.provide(layer)` — dependency injection for *services* (a `LanguageModel`, a workspace, a tracer)

## What Effect v4 adds for AI specifically

In v4 (beta), the standard library ships a complete AI module at `effect/unstable/ai`:

- `LanguageModel.LanguageModel` — a service tag. `generateText`, `generateObject`, `streamText`.
- `Tool.make(...)` — typed tool definitions with built-in `needsApproval` (HITL).
- `Toolkit.make(...)` + `.toLayer({ handlers })` — a collection of tools with a Layer of handlers.
- `Chat` (with `layerPersisted`) — durable conversations.
- `Model.make` — turn a provider + model id into a `Layer.Layer<LanguageModel | ...>`.
- `McpServer.layerHttp(...)` — expose any Toolkit as an MCP HTTP server.

Once your agent is `Effect.Effect<A, E, LanguageModel>`, everything else composes.

## What this repo is

Five hero examples. Each one is the smallest possible thing that makes the above viscerally clear:

| # | Hero feature                                                  | What you'd hand-roll without it             |
| - | ------------------------------------------------------------- | ------------------------------------------- |
| 01 | structured concurrency + retry + deadlines + structured output | Promise.all + AbortController + Zod.parse + bespoke errors |
| 02 | Stream + Scope-aware interruption                              | AbortController plumbing through SDK + SSE parser |
| 03 | `needsApproval` HITL                                           | per-project pending-tool-calls table        |
| 04 | typed AiError union → HTTP status                              | `try { ... } catch (e: any) { if (e.status === ...) }` |
| 05 | one `Toolkit` value = agent toolkit + MCP server               | two stacks, one drift problem               |

If reading any one of those `agent.ts` files makes you nod, the pitch worked.

## Honest tradeoffs

Effect has a learning curve. The first time you read `Effect.gen(function*() { const x = yield* ... })` it looks like JavaScript pretending to be Haskell. The mental model clicks fast — usually within a day of writing one program — but it is a model shift.

In exchange you get a value-typed effect system with structured concurrency, typed errors, dependency injection, and an AI module that integrates cleanly with all of it. For real agents (not chat demos), that trade is increasingly worth it.

## Further reading

- Effect homepage: <https://effect.website>
- Effect v4 beta source: <https://github.com/Effect-TS/effect-smol>
- The `effect/unstable/ai` module's tests live at `packages/effect/test/unstable/ai/` in that repo — they're the most useful concise reference for the AI primitives.
