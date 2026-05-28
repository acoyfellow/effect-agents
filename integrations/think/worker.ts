// integrations/think — the smallest Think DO whose custom tool body is an
// Effect program.
//
// The tool registration is pure Think (via the `ai` SDK's `tool()` factory).
// The tool's `execute` function runs an `Effect.gen` block and resolves with
// `Effect.runPromise`. That one line is the only seam between Think (the host)
// and Effect (the body).
//
// Mirrors think-snippets/examples/effect-hello.
//   https://github.com/acoyfellow/think-snippets/tree/main/examples/effect-hello

import { Think } from "@cloudflare/think"
import { getAgentByName } from "agents"
import { tool } from "ai"
import { createWorkersAI } from "workers-ai-provider"
import { z } from "zod"
import { Effect } from "effect"

export interface Env {
  AI: Ai
  Greeter: DurableObjectNamespace<Greeter>
}

interface UIMessageChunk {
  type: string
  delta?: string
  text?: string
}

interface StreamCallback {
  onEvent: (json: string) => void
  onDone?: () => void
  onError?: (message: string) => void
}

// The Effect program — pure, no Think, no `ai` SDK, no env.
// Inputs are plain values; output is a string.
const greetEffect = (name: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep("50 millis") // proves the Effect actually runs
    if (!name.trim()) {
      return yield* Effect.fail(new Error("name is required"))
    }
    return `Hello, ${name.trim()}! Welcome to Think + Effect.`
  }).pipe(Effect.timeout("5 seconds"))

export class Greeter extends Think<Env> {
  getModel() {
    return createWorkersAI({ binding: this.env.AI })("@cf/moonshotai/kimi-k2.6")
  }

  getSystemPrompt() {
    return [
      "You are a greeting assistant.",
      "When the user gives you a name to greet, you MUST call the `greet` tool with that name.",
      "Reply with exactly the tool result and nothing else."
    ].join(" ")
  }

  getTools() {
    return {
      greet: tool({
        description: "Greet a person by name. Returns a friendly greeting string.",
        inputSchema: z.object({
          name: z.string().min(1).max(120).describe("The name of the person to greet.")
        }),
        // The seam between Think (the host) and Effect (the body).
        execute: async ({ name }) => {
          const greeting = await Effect.runPromise(greetEffect(name))
          return { greeting }
        }
      })
    }
  }
}
