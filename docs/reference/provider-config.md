# Provider configuration

`src/model.ts` exposes `providerFromEnv()` and `modelLayer(config)`. The env var priority is:

| Order | Env vars present                                  | Provider          | Default model                              | Endpoint                                                                  |
| ----- | ------------------------------------------------- | ----------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| 1     | `OPENROUTER_API_KEY`                              | OpenRouter        | `openai/gpt-4o-mini`                       | `https://openrouter.ai/api/v1`                                            |
| 2     | `OPENAI_API_KEY`                                  | OpenAI            | `gpt-4o-mini`                              | `https://api.openai.com/v1`                                               |
| 3     | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`  | Workers AI        | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | `https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1`                |

If none of the above is set, `providerFromEnv()` **throws** with a message listing the options. The Worker uses its own `CLOUDFLARE_*` vars directly (no env probing).

## Overrides

| Env var                     | Effect                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `EFFECT_AGENTS_MODEL`       | Overrides the default model id for whichever provider was chosen.   |

## `ProviderConfig` shape

```ts
type ProviderConfig =
  | { kind: "openrouter"; apiKey: string; model?: string }
  | { kind: "openai";     apiKey: string; model?: string }
  | { kind: "workers-ai"; accountId: string; apiToken: string; model?: string }
```

You can call `modelLayer({...})` directly if you don't want env probing:

```ts
import { modelLayer } from "../src/model.ts"

const layer = modelLayer({ kind: "openrouter", apiKey: "sk-or-...", model: "google/gemini-2.5-pro" })
```

## Layer shape produced

```
FetchHttpClient.layer
  → OpenAiClient.layer({ apiUrl, apiKey })           // @effect/ai-openai-compat
    → OpenAiLanguageModel.layer({ model })           // = LanguageModel.LanguageModel
```

Plug into any Effect program with `Effect.provide(modelLayer(config))`.
