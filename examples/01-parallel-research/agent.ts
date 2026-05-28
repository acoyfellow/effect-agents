// 01 · parallel-research
//
// Hero feature: structured concurrency + retry + deadlines + structured output.
//
// The agent answers a research question by:
//   1. Asking the model to call N research tools in parallel.
//   2. Each tool is fake-flaky (30% transient failure rate by design).
//   3. `Effect.retry(Schedule.exponential)` makes each tool resilient.
//   4. `Effect.timeout` caps every individual lookup.
//   5. The final answer is produced by `generateObject`, not `generateText`,
//      so we get a typed, schema-validated `{ answer, sources, confidence }`.
//
// What would suck in vanilla SDKs:
//   - Promise.all + AbortController + while-retry-loop + Zod.parse + custom
//     errors per failure mode. Easily 3× the LOC. No compile-time guarantee
//     the model's structured output matches your shape.
//
// Public surface:
//   ParallelResearchAgent(question) :
//     Effect<{ answer, sources, confidence }, AgentError, LanguageModel>

import { Duration, Effect, Schedule, Schema } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"

// ──────────────────────────────────────────────────────────────────
// 1. A tiny synthetic "knowledge base" — three sources with overlap
//    so the model has a real reason to call multiple tools.
// ──────────────────────────────────────────────────────────────────

const FAKE_INDEX = {
  arxiv: [
    "2401.04088: Mixtral 8x7B — sparse mixture-of-experts language model",
    "2310.06825: Mistral 7B — efficient transformer inference",
    "2106.09685: LoRA — low-rank adaptation of large language models"
  ],
  hackernews: [
    "HN 38932: 'Show HN: Effect v4 beta is wild, structured concurrency for TS'",
    "HN 37104: 'Mixtral is the first OSS MoE that actually works'",
    "HN 39501: 'Effect Schema vs Zod: when types are values'"
  ],
  docs: [
    "effect.website/docs/concurrency — Effect.forEach with `{ concurrency: n }`",
    "effect.website/docs/schedule — exponential, spaced, recurs, jittered",
    "effect.website/docs/schema — codec, decode, encode, refinements"
  ]
}

// ──────────────────────────────────────────────────────────────────
// 2. Tools — pure data definitions. Handlers are wired below.
// ──────────────────────────────────────────────────────────────────

const SearchArxiv = Tool.make("SearchArxiv", {
  description: "Search the arxiv index for papers matching a query.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ source: Schema.Literal("arxiv"), hits: Schema.Array(Schema.String) })
})

const SearchHackerNews = Tool.make("SearchHackerNews", {
  description: "Search HN for discussion threads matching a query.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ source: Schema.Literal("hackernews"), hits: Schema.Array(Schema.String) })
})

const SearchDocs = Tool.make("SearchDocs", {
  description: "Search the project documentation for a query.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ source: Schema.Literal("docs"), hits: Schema.Array(Schema.String) })
})

const ResearchKit = Toolkit.make(SearchArxiv, SearchHackerNews, SearchDocs)

// ──────────────────────────────────────────────────────────────────
// 3. Handlers — every lookup is fake-flaky and the worst is slow.
//    Retry + timeout make this deterministic.
// ──────────────────────────────────────────────────────────────────

const flakyLookup = (kind: keyof typeof FAKE_INDEX, query: string) =>
  Effect.gen(function* () {
    // 30% transient flake. Retry erases this.
    if (Math.random() < 0.3) {
      yield* Effect.fail(new Error(`transient: ${kind} index unreachable`))
    }
    // 20% slow. Timeout caps it.
    if (Math.random() < 0.2) yield* Effect.sleep(Duration.seconds(20))
    const q = query.toLowerCase()
    return FAKE_INDEX[kind].filter((line) => line.toLowerCase().includes(q.split(" ")[0] ?? q))
  }).pipe(
    Effect.timeout("3 seconds"),
    Effect.retry({ schedule: Schedule.exponential("100 millis"), times: 3 }),
    // Surface the failure as a tool result instead of crashing the whole turn:
    Effect.orElseSucceed(() => [])
  )

const ResearchKitLayer = ResearchKit.toLayer({
  SearchArxiv: ({ query }) =>
    Effect.map(flakyLookup("arxiv", query), (hits) => ({ source: "arxiv" as const, hits })),
  SearchHackerNews: ({ query }) =>
    Effect.map(flakyLookup("hackernews", query), (hits) => ({ source: "hackernews" as const, hits })),
  SearchDocs: ({ query }) => Effect.map(flakyLookup("docs", query), (hits) => ({ source: "docs" as const, hits }))
})

// ──────────────────────────────────────────────────────────────────
// 4. Structured output — typed, schema-validated final answer.
// ──────────────────────────────────────────────────────────────────

const ResearchAnswer = Schema.Struct({
  answer: Schema.String,
  sources: Schema.Array(Schema.Literals(["arxiv", "hackernews", "docs"])),
  confidence: Schema.Literals(["low", "medium", "high"])
})
export type ResearchAnswer = typeof ResearchAnswer.Type

// ──────────────────────────────────────────────────────────────────
// 5. The agent itself: one `generateObject` call with the toolkit.
// ──────────────────────────────────────────────────────────────────

export const ParallelResearchAgent = (question: string) =>
  Effect.gen(function* () {
    const result = yield* LanguageModel.generateObject({
      prompt: [
        {
          role: "system",
          content:
            "You are a research assistant. For any question, you MUST call ALL THREE search tools " +
            "(SearchArxiv, SearchHackerNews, SearchDocs) before answering, with a query you derive from the user question. " +
            "Then synthesize a concise answer. Mark confidence high only if at least 2 sources returned hits."
        },
        { role: "user", content: [{ type: "text", text: question }] }
      ],
      toolkit: ResearchKit,
      schema: ResearchAnswer
    })

    return result.value
  }).pipe(Effect.provide(ResearchKitLayer), Effect.timeout("60 seconds"), Effect.scoped)

// ──────────────────────────────────────────────────────────────────
// Local entrypoint: `bun examples/01-parallel-research/agent.ts`
// ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
  const question = process.argv.slice(2).join(" ") || "What is Effect v4 and why does it matter?"
  console.log(`❓ ${question}\n`)
  const result = await Effect.runPromise(
    ParallelResearchAgent(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
  )
  console.log(`✅ answer:     ${result.answer}`)
  console.log(`   sources:    ${result.sources.join(", ")}`)
  console.log(`   confidence: ${result.confidence}`)
}
