# Run the five examples in 5 minutes

> A guided lesson. We'll get the offline smoke harness green, then run one example against a real LLM, then peek at the Worker.

You don't need an API key for the first part. You will need one for the real-LLM part — OpenRouter is the cheapest and fastest to obtain.

## What we'll do together

1. Clone the repo and install with one command.
2. Run all five examples offline — every contract green, no creds.
3. Get a free OpenRouter key and run one example against a real model.
4. See the same five examples behind a single Cloudflare Worker.

By the end you'll know which Effect feature each example showcases and where to look in the source.

## Step 1 — clone and install

```sh
git clone https://github.com/acoyfellow/effect-agents
cd effect-agents
bun install
```

You'll see `effect@4.0.0-beta.73` and `@effect/ai-openai-compat@4.0.0-beta.73` resolve. That's it for dependencies.

## Step 2 — offline smoke

```sh
bun run smoke
```

You should see, in under a second:

```
[01] parallel-research
  ✓ structured answer: "LoRA is a low-rank adaptation technique for fine-tuning LLMs."
  ✓ sources: [arxiv, hackernews, docs]
  ✓ confidence: high
…
✅ all green (offline)
```

Five examples. Five checkmarks. No network.

**What just happened.** `scripts/smoke.ts` provided a *stub* `LanguageModel` Layer (see `src/stub-model.ts`) that replays scripted response parts. Every example's Effect program ran end-to-end — concurrency, retries, approval flow, error mapping, MCP handshake — all against a deterministic upstream.

The point: your examples never knew the model was fake. They only know they require a `LanguageModel.LanguageModel` service.

## Step 3 — pick a real model

Grab a free OpenRouter key at <https://openrouter.ai/keys>, then:

```sh
export OPENROUTER_API_KEY=sk-or-...
bun examples/01-parallel-research/agent.ts "What is LoRA?"
```

You'll see something like:

```
❓ What is LoRA?

✅ answer:     LoRA (Low-Rank Adaptation) is a technique…
   sources:    arxiv, hackernews, docs
   confidence: high
```

The model decided to call all three tools, the (synthetic, flaky) handlers retried and timed out as needed, and the final answer is a schema-validated object — not a `JSON.parse`-and-pray.

Try the others:

```sh
bun examples/02-streaming-tools/agent.ts  "Tell me about user u_alice."
bun examples/03-approval-gated/agent.ts   approve notes.md
bun examples/04-typed-errors/agent.ts
bun examples/05-mcp-from-toolkit/agent.ts "Roll 4d6 and a coin."
```

Each one is **one file**, ~100–200 lines, in `examples/`. Read them in any order.

## Step 4 — the unified Worker

The same five Effect programs are mounted behind one Cloudflare Worker at `worker/worker.ts`:

```text
POST /01           parallel-research
POST /02           streaming-tools (NDJSON)
POST /03           approval-gated turn 1 (returns pending)
POST /03/decide    approval-gated turn 2
POST /04           typed-errors
POST /05           mcp-from-toolkit
*    /mcp          MCP HTTP transport (#5)
GET  /health
```

Local dev (uses your `CLOUDFLARE_*` env for Workers AI):

```sh
bun run worker:dev
```

Deploy (when you're ready): see [How to deploy the Worker](../how-to/deploy-the-worker.md).

## What to read next

- **Why does Effect make this nicer?** → [Why effect-agents](../explanation/why-effect.md)
- **What's the difference between smoke and probe?** → [Smoke vs probe](../explanation/smoke-vs-probe.md)
- **How do I add my own example?** → [Add your own agent](../how-to/add-your-own-agent.md)
- **The contributors' map** → [ARCHITECTURE.md](../../ARCHITECTURE.md)
