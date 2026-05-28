# effect-agents

> Five hero examples of effectful AI agents built on **[Effect v4 (beta)](https://github.com/Effect-TS/effect-smol)**. Pure Effect programs; one local entrypoint per example; one Cloudflare Worker hosts all five.

```sh
git clone https://github.com/acoyfellow/effect-agents
cd effect-agents
bun install
bun run smoke      # all 5 examples green — no API key required
```

## The gallery

| # | Example | Effect hero |
|---|---|---|
| 01 | [parallel-research](examples/01-parallel-research/)  | `concurrency` + `Schedule.exponential` + `generateObject` |
| 02 | [streaming-tools](examples/02-streaming-tools/)      | `Stream` + `Scope` interruption                            |
| 03 | [approval-gated](examples/03-approval-gated/)        | `Tool.make({ needsApproval })`                              |
| 04 | [typed-errors](examples/04-typed-errors/)            | `Effect.catchTag` over `AiError`                            |
| 05 | [mcp-from-toolkit](examples/05-mcp-from-toolkit/)    | `McpServer.layerHttp` reuses your `Toolkit`                 |

## Run one against a real LLM

```sh
export OPENROUTER_API_KEY=sk-or-...    # or OPENAI_API_KEY, or CLOUDFLARE_*
bun examples/01-parallel-research/agent.ts "What is LoRA?"
```

## Docs

Organised by user need ([Diátaxis](https://diataxis.fr/)):

- [**Tutorials**](docs/tutorials/) — learning by doing
- [**How-to guides**](docs/how-to/) — goal-oriented recipes
- [**Reference**](docs/reference/) — facts you look up
- [**Explanation**](docs/explanation/) — why the repo is shaped this way
- [**ARCHITECTURE.md**](ARCHITECTURE.md) — contributors' map

## Versions

Pinned to `effect@4.0.0-beta.73` + `@effect/ai-openai-compat@4.0.0-beta.73`. v4 is **beta**; expect churn until 4.0.0 final.

## License

MIT
