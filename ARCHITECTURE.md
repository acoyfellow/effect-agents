# ARCHITECTURE

A one-screen map for contributors. Read this *before* the README if you want to extend the repo.

## The shape

```
examples/0X/agent.ts      ← pure Effect.Effect<A, E, LanguageModel> + local CLI
src/model.ts              ← real-LLM Layer (OpenRouter / OpenAI / Workers AI)
src/stub-model.ts         ← scripted Layer for offline tests (no network)
worker/worker.ts          ← one CF Worker hosts all 5 examples behind /01../05
scripts/smoke.ts          ← offline contract harness (uses stub-model)
probes/local.ts           ← real-LLM in-process probes
probes/remote.ts          ← hits a deployed Worker
docs/                     ← Diátaxis quadrants
```

## The contract every example must satisfy

1. **One file.** `examples/0X-name/agent.ts`. No subdirectories.
2. **Exports a pure Effect program.** Its environment requirement is `LanguageModel.LanguageModel` (and nothing else app-specific). Nothing in the file knows about OpenAI vs. Workers AI vs. a stub.
3. **Local CLI at the bottom.** Inside `if (import.meta.main)`, dynamically import `../../src/model.ts` and run the program with `Effect.runPromise`. Argv carries user input. Output goes to stdout.
4. **A `README.md`** with: title, one-liner, run command, Effect features showcased, "vs vanilla SDK" note.

## The two test modes (explanation lives in `docs/explanation/smoke-vs-probe.md`)

| Mode  | Script                | LanguageModel | Network | Asserts                                                           |
| ----- | --------------------- | ------------- | ------- | ----------------------------------------------------------------- |
| Smoke | `scripts/smoke.ts`    | stub          | no      | wiring, types, schema validation, approval contract, MCP handshake |
| Probe (local)  | `probes/local.ts`     | real          | yes     | end-to-end behavior with a real LLM                                |
| Probe (remote) | `probes/remote.ts`    | real (Worker) | yes     | a deployed Worker + Workers AI binding                             |

A change is acceptable to land when **smoke is green**. Probes are for the maintainer / CI before tagging a release.

## How the model `Layer` is composed

```
FetchHttpClient.layer
  → OpenAiClient.layer({ apiUrl, apiKey })         (from @effect/ai-openai-compat)
    → OpenAiLanguageModel.layer({ model })          (= LanguageModel.LanguageModel)
```

`src/model.ts` exports `modelLayer(config)` that returns this. The `config` is one of three providers (OpenRouter, OpenAI, Workers AI) — all OpenAI-compatible, so one path serves all three by varying `apiUrl`.

## Adding a sixth example

See [docs/how-to/add-your-own-agent.md](docs/how-to/add-your-own-agent.md). Short version:

1. Copy an existing example folder.
2. Replace the Effect program. Keep the `LanguageModel` requirement.
3. Add a smoke test in `scripts/smoke.ts`.
4. Wire a `/06` route in `worker/worker.ts` if it has an HTTP surface worth exposing.

## Why no `runtimes/` directory

Earlier versions had `runtimes/local`, `runtimes/worker`, `runtimes/model.ts`. Renamed to `src/` + `worker/` because "runtime" implied a richer abstraction than the two-file `model.ts` + `stub-model.ts` actually warrants. See [docs/explanation/one-file-per-example.md](docs/explanation/one-file-per-example.md) for the philosophy.

## Layout invariants the CI should enforce

- `bun run typecheck` passes.
- `bun run smoke` passes with **zero env vars**.
- Each `examples/0X-name/` has exactly `agent.ts` + `README.md` (and nothing else).
- No example imports `src/stub-model.ts`. Only `scripts/smoke.ts` does.
- No example or runtime imports another example. The Worker is the only place cross-example wiring exists.
