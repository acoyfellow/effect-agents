# How to point an example at OpenRouter

OpenRouter ships an OpenAI-compatible API and exposes hundreds of models behind a single key. It's the lowest-friction provider for examples in this repo.

## Get a key

1. Sign up at <https://openrouter.ai>.
2. Create a key at <https://openrouter.ai/keys>.
3. Optionally pre-load a few dollars of credit (some free models work without credit; most don't).

## Set the env var

```sh
export OPENROUTER_API_KEY=sk-or-v1-...
```

That alone is enough. `src/model.ts`'s `providerFromEnv()` picks it up automatically.

## Optionally override the model

The default is `openai/gpt-4o-mini`. Override per-run:

```sh
EFFECT_AGENTS_MODEL=anthropic/claude-3.5-sonnet \
  bun examples/01-parallel-research/agent.ts "What is LoRA?"
```

OpenRouter's full model list is at <https://openrouter.ai/models>.

## Run any example

```sh
bun examples/01-parallel-research/agent.ts "What is LoRA?"
bun examples/02-streaming-tools/agent.ts  "Tell me about u_alice."
bun examples/03-approval-gated/agent.ts   approve notes.md
bun examples/04-typed-errors/agent.ts
bun examples/05-mcp-from-toolkit/agent.ts "Roll 4d6."
```

## Cost note

The examples are tiny prompts. A full `bun run probe:local` pass against `gpt-4o-mini` costs well under one US cent.

## Troubleshooting

| Symptom                                          | Likely cause                                         |
| ------------------------------------------------ | ---------------------------------------------------- |
| `AuthenticationError` mapped to 502              | bad / expired key                                    |
| `RateLimitError` mapped to 429                   | hit OpenRouter's free-tier ceiling — add credit      |
| Tool calls produce empty `text` field in the response | model declined to verbalize after tool call; not an error |
| Schema validation fails inside `generateObject`  | weaker model couldn't conform; switch to gpt-4o-mini |
