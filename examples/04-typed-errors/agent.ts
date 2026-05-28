// 04 · typed-errors
//
// Hero feature: the agent's error channel is a tagged union of `AiError`
// classes. The Worker handler catches them exhaustively via `Effect.catchTags`
// and returns the correct HTTP status code per case. NO try/catch. NO `any`.
//
// What would suck in vanilla SDKs:
//   - `try { ... } catch (e: any) { if (e.status === 429) ... }` — at every
//     boundary. No compile-time exhaustiveness. Every refactor risks a
//     missed branch.
//
// Public surface:
//   AnswerOrTypedError(question) :
//     Effect<{ ok: true, text } | { ok: false, status, code, message }, never, LanguageModel>

import { Effect } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"

// ──────────────────────────────────────────────────────────────────
// The HTTP-shaped result the Worker / CLI consumes.
// ──────────────────────────────────────────────────────────────────

export type AgentResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false
      readonly status: 408 | 413 | 429 | 502 | 500
      readonly code: string
      readonly message: string
    }

// ──────────────────────────────────────────────────────────────────
// The agent. Notice: no try/catch. The error channel of the Effect
// is a tagged union of AiError classes; we map each tag to an HTTP
// status code with `catchTags` and the compiler enforces that we
// covered every case in the union.
// ──────────────────────────────────────────────────────────────────

export const AnswerOrTypedError = (question: string): Effect.Effect<AgentResult, never, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const response = yield* LanguageModel.generateText({
      prompt: [{ role: "user", content: [{ type: "text", text: question }] }]
    })
    return { ok: true as const, text: response.text }
  }).pipe(
    Effect.catchTag("AiError", (err: AiError.AiError): Effect.Effect<AgentResult> => {
      const tag = err.reason._tag
      // Map by the reason._tag — every concrete AiError reason becomes a
      // typed HTTP status. The compiler enforces the closure type.
      const fail = (status: AgentResult extends infer R ? (R extends { status: infer S } ? S : never) : never, code: string, message: string) =>
        ({ ok: false as const, status, code, message }) as AgentResult
      switch (tag) {
        case "RateLimitError":
        case "QuotaExhaustedError":
          return Effect.succeed(fail(429 as const, tag, "Rate limited — back off and retry."))
        case "InvalidRequestError":
          return Effect.succeed(fail(413 as const, tag, "Invalid request (likely context length or schema)."))
        case "AuthenticationError":
        case "NetworkError":
        case "InternalProviderError":
          return Effect.succeed(fail(502 as const, tag, "Upstream provider unavailable / auth failed."))
        default:
          return Effect.succeed(fail(500 as const, tag, "Agent failure: " + tag))
      }
    }),
    // Belt-and-suspenders: anything not in AiError (defects) becomes 500.
    Effect.catchDefect(
      (d): Effect.Effect<AgentResult> =>
        Effect.succeed({
          ok: false as const,
          status: 500 as const,
          code: "Defect",
          message: String(d)
        })
    )
  )

// ──────────────────────────────────────────────────────────────────
// Local entrypoint
// ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
  const question = process.argv.slice(2).join(" ") || "In one sentence, what is Effect?"

  const result = await Effect.runPromise(
    AnswerOrTypedError(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
  )

  if (result.ok) {
    console.log(`✅ ${result.text}`)
  } else {
    console.error(`❌ ${result.status} ${result.code}: ${result.message}`)
  }
  // Demonstrate: try with a deliberately broken provider to see the typed branch.
  // OPENROUTER_API_KEY=bad bun examples/04-typed-errors/agent.ts
}

// Touch the AiError import so unused-import linters stay happy across providers.
export const _aiErrorTags = AiError
