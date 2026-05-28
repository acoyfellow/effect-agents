// Stub `LanguageModel` Layer for offline smoke tests.
//
// Plays back a scripted sequence of response parts so we can exercise every
// example's Effect program without network or API keys. This is the exact
// shape `effect@4.0.0-beta.73`'s own test suite uses — see
// `packages/effect/test/unstable/ai/utils.ts`.
//
// This is NOT a benchmark or a substitute for real model calls. It's a
// contract harness — proves the wiring, the types, and the per-example
// behavior (concurrency, retry, approval, error mapping, MCP) are correct
// even with a deterministic upstream.

import { Effect, Layer, Stream } from "effect"
import { AiError, LanguageModel, type Response } from "effect/unstable/ai"

export type Script = {
  readonly generateText?:
    | Array<Response.PartEncoded>
    | ((opts: LanguageModel.ProviderOptions) => Array<Response.PartEncoded> | Effect.Effect<Array<Response.PartEncoded>>)
  readonly streamText?:
    | Array<Response.StreamPartEncoded>
    | ((
        opts: LanguageModel.ProviderOptions
      ) => Array<Response.StreamPartEncoded> | Stream.Stream<Response.StreamPartEncoded>)
}

/**
 * Build a Layer<LanguageModel> that returns scripted parts.
 *
 * Note: `LanguageModel.make` is itself an `Effect<Service>`, so we lift via
 * `Layer.effect`.
 */
export const stubModelLayer = (script: Script): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (opts) => {
        if (!script.generateText) return Effect.succeed([])
        const v = Array.isArray(script.generateText) ? script.generateText : script.generateText(opts)
        if (Array.isArray(v)) return Effect.succeed(v)
        return v
      },
      streamText: (opts) => {
        if (!script.streamText) return Stream.empty
        const v = Array.isArray(script.streamText) ? script.streamText : script.streamText(opts)
        if (Array.isArray(v)) return Stream.fromIterable(v)
        return v
      }
    })
  )

/**
 * A Layer that always fails with a synthetic `AiError` wrapping a
 * specified reason class. Useful for example 04 (typed error mapping).
 *
 * Kept deliberately narrow — pass a builder fn for the inner reason if you
 * need a fancy one. Default builds `UnknownError`.
 */
export const failingModelLayer = (
  buildReason: () => AiError.AiError["reason"] = () => new AiError.UnknownError({ description: "synthetic" })
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () =>
        Effect.fail(
          new AiError.AiError({ module: "stub", method: "generateText", reason: buildReason() })
        ),
      streamText: () =>
        Stream.fail(
          new AiError.AiError({ module: "stub", method: "streamText", reason: buildReason() })
        )
    })
  )

// ──────────────────────────────────────────────────────────────────
// Helper builders for common parts (read like English).
// ──────────────────────────────────────────────────────────────────

export const text = (text: string): Response.PartEncoded => ({ type: "text", text })

export const toolCall = (id: string, name: string, params: Record<string, unknown>): Response.PartEncoded => ({
  type: "tool-call",
  id,
  name,
  params,
  providerExecuted: false
})

// Note: in effect@4.0.0-beta.73 the schema parser requires `response` as an
// explicit key on FinishPartEncoded (set to undefined when absent), not omitted.
export const finish = (reason: "stop" | "length" | "content-filter" | "tool-calls" = "stop"): Response.PartEncoded =>
  ({
    type: "finish",
    reason,
    usage: {
      inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: undefined, reasoning: undefined }
    },
    response: undefined
  }) as Response.PartEncoded

export const finishStream = (
  reason: "stop" | "length" | "content-filter" | "tool-calls" = "stop"
): Response.StreamPartEncoded =>
  ({
    type: "finish",
    reason,
    usage: {
      inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: undefined, reasoning: undefined }
    },
    response: undefined
  }) as Response.StreamPartEncoded

export const textDelta = (delta: string, id = "td"): Response.StreamPartEncoded => ({
  type: "text-delta",
  delta,
  id
})

export const textStart = (id = "td"): Response.StreamPartEncoded => ({ type: "text-start", id })
export const textEnd = (id = "td"): Response.StreamPartEncoded => ({ type: "text-end", id })

export const toolCallStream = (
  id: string,
  name: string,
  params: Record<string, unknown>
): Response.StreamPartEncoded => ({
  type: "tool-call",
  id,
  name,
  params,
  providerExecuted: false
})

/** Builder for a `RateLimitError` reason (use with `failingModelLayer`). */
export const rateLimit = () => new AiError.RateLimitError({})
/** Builder for an `AuthenticationError` reason. */
export const authError = () => new AiError.AuthenticationError({ kind: "InvalidKey" })
