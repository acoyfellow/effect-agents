# Flue + Effect

> The smallest Flue agent whose body is an Effect program.

Flue handles the webhook trigger and the response shape. The agent itself is an `Effect.Effect<string, Error>` executed with one `Effect.runPromise(...)` call. That single line is the only seam between the two systems.

## The seam

```ts
const greeting = await Effect.runPromise(greet(name, env.AI))
```

Everything above that line is Flue. Everything below it is Effect.

## Composition

| | What Flue gives you | What Effect gives you |
| --- | --- | --- |
| HTTP boundary | webhook trigger, JSON response shape | — |
| Agent body | — | `Effect.gen`, typed errors, `Effect.timeout`, retries, structured concurrency |
| Scaling up | adding more triggers, durable runs, observability | adding more combinators (`Effect.retry`, `Effect.forEach({ concurrency })`, structured output, MCP) |

If you want to see what *real* Effect agents look like — concurrency, retry, streaming, approval flows, typed errors, MCP — see the [five agents in this repo](../../examples/).

## Live in the Flue repo

This file is also shipped as a runnable example in [`flue-snippets/examples/effect-hello`](https://github.com/acoyfellow/flue-snippets/tree/main/examples/effect-hello), where it deploys via the host repo's Alchemy harness and runs an end-to-end probe against a real Cloudflare Worker.

```sh
# from acoyfellow/flue-snippets
bash examples/effect-hello/run-e2e.sh
```
