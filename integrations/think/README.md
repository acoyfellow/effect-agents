# Think + Effect

> The smallest Think DO whose custom tool body is an Effect program.

Think handles the DO state, the chat protocol, the tool-call lifecycle, and the assistant-answer streaming. The custom tool's body is an `Effect.gen(...)` block executed with one `Effect.runPromise(...)` call. That single line is the only seam.

## The seam

```ts
execute: async ({ name }) => {
  const greeting = await Effect.runPromise(greetEffect(name))
  return { greeting }
}
```

The `execute` function is just an async function — Think doesn't care what runs inside it. Run an Effect program; the tool result reaches the assistant answer like any other tool.

## Composition

| | What Think gives you | What Effect gives you |
| --- | --- | --- |
| DO state | per-session SQLite, chat memory, the tool-call protocol | — |
| Tool body | tool registration via `tool()` from the `ai` SDK | typed errors, timeouts, retries, structured concurrency |
| Scaling up | more tools, hooks (`afterToolCall`), audit | scaling the *body* of each tool — concurrency, branching, structured output, all composable |

If you want to see what *real* Effect agents look like — concurrency, retry, streaming, approval flows, typed errors, MCP — see the [five agents in this repo](../../examples/).

## Live in the Think repo

This file is also shipped as a runnable example in [`think-snippets/examples/effect-hello`](https://github.com/acoyfellow/think-snippets/tree/main/examples/effect-hello), where it deploys via Alchemy under the personal-account guard, runs an end-to-end probe that drives a real chat turn against the deployed Worker, and asserts the Effect-baked literal reaches the assistant answer.

```sh
# from acoyfellow/think-snippets, with CLOUDFLARE_PERSONAL_* set
bash examples/effect-hello/run-e2e.sh
```
