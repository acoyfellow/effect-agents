# How to use Cloudflare Workers AI

Workers AI has an [OpenAI-compatible endpoint](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), so the same `@effect/ai-openai-compat` provider works without code changes.

## Prerequisites

- A Cloudflare account.
- An API token with **Workers AI: Read** permission. Create one at <https://dash.cloudflare.com/profile/api-tokens>.

## Set the env vars

```sh
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
```

When both are set and `OPENROUTER_API_KEY` / `OPENAI_API_KEY` are unset, `src/model.ts` routes all `LanguageModel` requests through:

```
https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1
```

## Choose a model

Default is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Override:

```sh
EFFECT_AGENTS_MODEL=@cf/meta/llama-3.1-8b-instruct \
  bun examples/01-parallel-research/agent.ts "What is LoRA?"
```

The full Workers AI model catalogue lives at <https://developers.cloudflare.com/workers-ai/models/>. Pick a model that supports the OpenAI Responses API.

## Run

```sh
bun examples/04-typed-errors/agent.ts "Reply with the single word: pong."
```

## When the deployed Worker uses this

When you `bun run worker:deploy`, the Worker reads its own `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (set as Wrangler vars) and points the same `@effect/ai-openai-compat` client at the same Workers AI endpoint. No extra secrets.

See [how to deploy the Worker](deploy-the-worker.md).

## Troubleshooting

| Symptom                                  | Likely cause                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Direct `curl` to the endpoint returns `{"code":10000,"message":"Authentication error"}` | the token lacks the **Workers AI: Read** scope             |
| Smaller models fail `generateObject`     | use Llama 3.3 70B or larger; structured output needs reasoning headroom          |
| Streaming returns no `text-delta` parts  | not every Workers AI model supports streaming yet — check the model's docs page  |
