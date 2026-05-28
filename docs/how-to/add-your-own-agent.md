# How to add your own agent

Add a sixth example without breaking anything.

## Step 1 — copy an existing folder

```sh
cp -R examples/04-typed-errors examples/06-my-agent
```

(04 is the smallest. Start there for non-tool agents; copy 01 if you want tools.)

## Step 2 — replace the Effect program

Open `examples/06-my-agent/agent.ts`. The contract is:

- Export a function that returns `Effect.Effect<MyResult, MyError, LanguageModel.LanguageModel>`.
- Do **not** import a specific provider. Only import from `effect/unstable/ai` and `effect`.
- Keep the `if (import.meta.main)` local CLI block at the bottom — it imports `../../src/model.ts` dynamically and runs your program against whichever provider env is set.

A minimal skeleton:

```ts
import { Effect } from "effect"
import { LanguageModel } from "effect/unstable/ai"

export const MyAgent = (input: string) =>
  Effect.gen(function* () {
    const r = yield* LanguageModel.generateText({
      prompt: [{ role: "user", content: [{ type: "text", text: input }] }]
    })
    return { answer: r.text }
  })

if (import.meta.main) {
  const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
  const out = await Effect.runPromise(
    MyAgent(process.argv.slice(2).join(" ") || "Say hi.").pipe(
      Effect.provide(modelLayer(providerFromEnv()))
    )
  )
  console.log(out.answer)
}
```

## Step 3 — write a per-example README

Match the structure of `examples/04-typed-errors/README.md`:

- One-liner about the Effect hero feature
- Run command
- "Effect features showcased" bullet list
- "Without Effect" note

## Step 4 — add a smoke test

Open `scripts/smoke.ts`. Add a `smoke06` function following the shape of the others. Use `stubModelLayer({ generateText: [...] })` from `src/stub-model.ts` to script the upstream. Register it:

```ts
const tests: Record<string, () => Promise<void>> = {
  "01": smoke01,
  "02": smoke02,
  "03": smoke03,
  "04": smoke04,
  "05": smoke05,
  "06": smoke06,    // new
}
```

Run `bun run smoke 06` to drive only your new test until it passes.

## Step 5 — (optional) expose it on the Worker

If the example has a useful HTTP surface, wire a `POST /06` route in `worker/worker.ts`. Import your `MyAgent` from `../examples/06-my-agent/agent.ts`. Follow the pattern of `/04`.

If you do this, also add a `probe06` case to `probes/run.ts` so `probe:local` and `probe:remote` cover it.

## Step 6 — re-typecheck and re-smoke

```sh
bun run typecheck
bun run smoke
```

Both must stay green.

## Naming convention

`examples/<NN>-<kebab-name>/` where `NN` is the next two-digit number. The number is just an ordering hint for the README gallery; nothing depends on it programmatically.
