// 02 · streaming-tools
//
// Hero feature: Stream<StreamPart, _, _> from the model, with interruptible
// fibers underneath. The caller gets tokens AND tool events as they happen;
// if the consumer goes away (HTTP disconnect, abort), every in-flight fiber
// — the upstream HTTP call, the tool handlers — is interrupted cleanly.
//
// What would suck in vanilla SDKs:
//   - Hand-rolling AbortController plumbing through OpenAI SDK + tool execution
//     loop + SSE parsing.
//   - Tool calls running detached from the stream lifecycle, leaking sockets
//     after the client disconnects.
//
// Public surface:
//   StreamingToolsAgent(question) :
//     Stream<StreamPart, _, LanguageModel>
//
//   streamToText(stream) — convenience: flattens to a plain ReadableStream<Uint8Array>
//   of NDJSON lines so the local CLI and the Worker can both consume it.

import { Effect, Schema, Stream } from "effect"
import { LanguageModel, Tool, Toolkit, type Response } from "effect/unstable/ai"

// ──────────────────────────────────────────────────────────────────
// One tool: lookup a user by id. Slow on purpose so you can SEE the
// streaming text interleave with the tool-call → tool-result events.
// ──────────────────────────────────────────────────────────────────

const FAKE_USERS = {
  u_alice: { id: "u_alice", name: "Alice Chen", title: "Engineer" },
  u_bob: { id: "u_bob", name: "Bob Vance", title: "Refrigeration Specialist" }
} as const

const LookupUser = Tool.make("LookupUser", {
  description: "Look up a user by their internal id (format u_<name>).",
  parameters: Schema.Struct({ id: Schema.String }),
  success: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    title: Schema.String
  }),
  failure: Schema.Struct({ reason: Schema.String })
})

const Kit = Toolkit.make(LookupUser)

const KitLayer = Kit.toLayer({
  LookupUser: ({ id }) =>
    Effect.gen(function* () {
      // Simulate a slow DB so the stream visibly pauses on tool calls.
      yield* Effect.sleep("400 millis")
      const user = (FAKE_USERS as Record<string, (typeof FAKE_USERS)[keyof typeof FAKE_USERS]>)[id]
      if (!user) return yield* Effect.fail({ reason: `unknown id: ${id}` })
      return user
    })
})

// ──────────────────────────────────────────────────────────────────
// The agent returns a Stream. Whoever consumes it owns the lifetime;
// if their fiber dies, all upstream work is interrupted.
// ──────────────────────────────────────────────────────────────────

export const StreamingToolsAgent = (question: string) =>
  LanguageModel.streamText({
    prompt: [
      {
        role: "system",
        content:
          "You are a helpful directory assistant. If the user mentions a user id (format u_<name>), " +
          "you MUST call LookupUser. Then narrate the result conversationally over multiple sentences " +
          "so the response visibly streams."
      },
      { role: "user", content: [{ type: "text", text: question }] }
    ],
    toolkit: Kit
  }).pipe(Stream.provide(KitLayer))

// ──────────────────────────────────────────────────────────────────
// Convenience: turn the Effect Stream into an NDJSON Web ReadableStream
// so the same agent can power both a local CLI and a Worker fetch handler.
// ──────────────────────────────────────────────────────────────────

export const streamToNdjson = <R>(
  stream: Stream.Stream<Response.StreamPart<any>, any, R>
): Effect.Effect<ReadableStream<Uint8Array>, never, R> =>
  Effect.sync(() => {
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const pump = stream.pipe(
          Stream.tap((part) =>
            Effect.sync(() => {
              const line = `${JSON.stringify(simplify(part))}\n`
              controller.enqueue(encoder.encode(line))
            })
          ),
          Stream.runDrain
        )
        try {
          await Effect.runPromise(pump as Effect.Effect<void, unknown, never>)
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      }
    })
  })

// Trim each stream part to the bits a human cares about.
const simplify = (part: Response.StreamPart<any>): Record<string, unknown> => {
  const p = part as any
  switch (p.type) {
    case "text-delta":
      return { type: "text-delta", text: p.delta }
    case "tool-call":
      return { type: "tool-call", name: p.name, params: p.params }
    case "tool-result":
      return { type: "tool-result", name: p.name, result: p.result, isFailure: p.isFailure }
    case "finish":
      return { type: "finish", reason: p.reason }
    case "error":
      return { type: "error", error: String(p.error) }
    default:
      return { type: p.type }
  }
}

// ──────────────────────────────────────────────────────────────────
// Local entrypoint
// ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
  const question = process.argv.slice(2).join(" ") || "Tell me about user u_alice."
  process.stdout.write(`❓ ${question}\n\n`)

  await Effect.runPromise(
    StreamingToolsAgent(question).pipe(
      Stream.tap((part) =>
        Effect.sync(() => {
          const p = part as any
          if (p.type === "text-delta") process.stdout.write(p.delta)
          else if (p.type === "tool-call") process.stdout.write(`\n  ⚙️  ${p.name}(${JSON.stringify(p.params)})`)
          else if (p.type === "tool-result") process.stdout.write(` ⇒ ${JSON.stringify(p.result)}\n`)
          else if (p.type === "finish") process.stdout.write(`\n\n✅ finish (${p.reason})\n`)
        })
      ),
      Stream.runDrain,
      Effect.provide(modelLayer(providerFromEnv()))
    )
  )
}
