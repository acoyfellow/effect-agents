# Smoke vs probe

This repo has *two* test surfaces. They serve different audiences. Both are intentional.

## Smoke (`scripts/smoke.ts`)

- **Provider:** stub Layer (`src/stub-model.ts`). Scripted response parts. No network.
- **Audience:** anyone with a fresh clone. No API key needed.
- **Asserts:** the *contracts* of each example — wiring, schema validation, approval no-side-effect-on-pending, error mapping, MCP handshake.
- **Cost:** none.
- **Speed:** sub-second.
- **What it doesn't catch:** real provider quirks, real network failures, real Worker deploys.

The smoke test is what makes this repo **adoptable**. A user lands on the README, runs `bun run smoke`, sees five green checkmarks in <1s, and trusts the rest of the repo.

## Probe (`probes/local.ts`)

- **Provider:** real LLM, picked from process.env (OpenRouter / OpenAI / Workers AI).
- **Audience:** the maintainer, before tagging a release. Or CI with secrets.
- **Asserts:** end-to-end behavior — the model actually calls tools, the structured output decoder actually parses real model output, the approval flow actually round-trips.
- **Cost:** pennies per full pass.
- **Speed:** ~30s for a full pass.

## Remote probe (`probes/remote.ts`)

- **Provider:** the same code, but the agent runs *inside* a deployed Worker. `probes/remote.ts` hits the Worker's HTTP endpoints (`/01`...`/05`, `/mcp`).
- **Audience:** the maintainer right after `bun run worker:deploy`. Or a deploy gate in CI.
- **Asserts:** the deploy bundled correctly, the Workers AI binding works, the MCP transport survives the network seam.
- **Cost:** pennies + a tiny CF invocation count.
- **Speed:** ~30s.

## Why not just write one test mode

Each mode catches a class of failure the others don't:

| Failure                                  | Smoke catches it? | Probe local | Probe remote |
| ---------------------------------------- | ----------------- | ----------- | ------------ |
| Wiring / type errors                     | ✓                 | ✓           | ✓            |
| Schema misalignment with provider output | ✗                 | ✓           | ✓            |
| Real provider rate limits / auth         | ✗                 | ✓           | ✓            |
| Worker bundling                          | ✗                 | ✗           | ✓            |
| Wrangler binding misconfiguration        | ✗                 | ✗           | ✓            |

Smoke is for *adoption* — it must be green for anyone, instantly. Probes are for *confidence* — they exist for the maintainer.

## What CI should run

- On every PR: `bun run typecheck && bun run smoke`. No secrets needed.
- On main + release tag: `bun run probe:local` (requires `OPENROUTER_API_KEY` secret).
- On `worker:deploy`: `bun run probe:remote` against the freshly deployed Worker.
