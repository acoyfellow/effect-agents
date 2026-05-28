#!/usr/bin/env bun
// In-process probes against the real `LanguageModel` Layer.
//
// Reads provider creds from process.env (OPENROUTER_API_KEY |
// OPENAI_API_KEY | CLOUDFLARE_*) and asserts each example behaves as
// documented when wired to a real LLM. Fails loudly if no creds are set.
//
//   OPENROUTER_API_KEY=sk-or-... bun probes/local.ts            # all
//   OPENROUTER_API_KEY=sk-or-... bun probes/local.ts 03         # one
//
// For end-to-end against a deployed Worker, use `probes/remote.ts`.

delete process.env.EFFECT_AGENTS_URL
await import("./run.ts")

export {}
