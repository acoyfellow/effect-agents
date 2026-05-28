// Shared Effect Layer that exposes a `LanguageModel.LanguageModel` service.
//
// All five examples consume this single tag. The runtime decides which
// provider Layer to plug in:
//
//   - Local (Bun)  : OpenRouter via OpenAI-compatible API. One key, every model.
//   - Worker (CF)  : Cloudflare Workers AI via its OpenAI-compatible endpoint.
//                    Auth comes from the Worker's CLOUDFLARE_API_TOKEN secret,
//                    and routes through the account's compat URL.
//
// The Effect program inside each example never imports a provider directly;
// it only depends on the abstract `LanguageModel.LanguageModel` service.

import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { Layer, Redacted } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

export type ProviderConfig =
  | {
      readonly kind: "openrouter"
      readonly apiKey: string
      readonly model?: string
    }
  | {
      readonly kind: "workers-ai"
      readonly accountId: string
      readonly apiToken: string
      readonly model?: string
    }
  | {
      readonly kind: "openai"
      readonly apiKey: string
      readonly model?: string
    }

const DEFAULTS = {
  openrouter: "openai/gpt-4o-mini",
  "workers-ai": "@cf/moonshotai/kimi-k2.6",
  openai: "gpt-4o-mini"
} as const

/**
 * Returns a Layer that provides `LanguageModel.LanguageModel`.
 *
 * Every example in this repo is the same shape:
 *
 *   const program = Effect.gen(function*() {
 *     const model = yield* LanguageModel.LanguageModel
 *     // ... use model.generateText / streamText / generateObject
 *   })
 *
 *   Effect.runPromise(program.pipe(Effect.provide(modelLayer(...))))
 */
export const modelLayer = (config: ProviderConfig): Layer.Layer<LanguageModel.LanguageModel> => {
  const apiUrl =
    config.kind === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : config.kind === "workers-ai"
        ? `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1`
        : "https://api.openai.com/v1"

  const apiKey =
    config.kind === "workers-ai" ? config.apiToken : config.kind === "openrouter" ? config.apiKey : config.apiKey

  const modelId = config.model ?? DEFAULTS[config.kind]

  const ClientLayer = OpenAiClient.layer({
    apiKey: Redacted.make(apiKey),
    apiUrl
  }).pipe(Layer.provide(FetchHttpClient.layer))

  return OpenAiLanguageModel.layer({ model: modelId }).pipe(Layer.provide(ClientLayer))
}

/** Convenience: read provider config from process.env (local runtime). */
export const providerFromEnv = (): ProviderConfig => {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      kind: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.EFFECT_AGENTS_MODEL
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      kind: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.EFFECT_AGENTS_MODEL
    }
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    return {
      kind: "workers-ai",
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      model: process.env.EFFECT_AGENTS_MODEL
    }
  }
  throw new Error(
    "No provider config in env. Set one of:\n" +
      "  OPENROUTER_API_KEY=sk-or-...   (recommended, single key for every model)\n" +
      "  OPENAI_API_KEY=sk-...\n" +
      "  CLOUDFLARE_ACCOUNT_ID=... + CLOUDFLARE_API_TOKEN=...   (Workers AI)\n" +
      "Optionally override the model with EFFECT_AGENTS_MODEL=..."
  )
}
