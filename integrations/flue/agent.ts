// integrations/flue — the smallest Flue agent whose body is an Effect program.
//
// Flue handles the webhook trigger and the response shape. The agent itself
// runs inside `Effect.gen` and is executed with a single `Effect.runPromise`.
// That one line is the only seam between the two systems.
//
// Mirrors flue-snippets/examples/effect-hello.
//   https://github.com/acoyfellow/flue-snippets/tree/main/examples/effect-hello

import type { FlueContext } from "@flue/sdk/client"
import { Effect } from "effect"

interface Env {
  AI: { run: (model: string, args: unknown) => Promise<{ response: string }> }
}

export const triggers = { webhook: true }

// The agent — pure Effect. Inputs are plain values; output is a string.
const greet = (name: string, ai: Env["AI"]) =>
  Effect.gen(function* () {
    const out = yield* Effect.tryPromise({
      try: () =>
        ai.run("@cf/moonshotai/kimi-k2.6", {
          prompt: `Greet ${name} in one short, friendly sentence. No preamble.`
        }),
      catch: (e) => new Error(`Workers AI call failed: ${String(e)}`)
    })
    return out.response.trim()
  }).pipe(Effect.timeout("30 seconds"))

export default async function ({ payload, env }: FlueContext & { env: Env }) {
  const name = typeof payload.name === "string" ? payload.name : "world"
  const greeting = await Effect.runPromise(greet(name, env.AI))
  return { greeting }
}
