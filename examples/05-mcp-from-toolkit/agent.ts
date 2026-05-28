// 05 · mcp-from-toolkit
//
// Hero feature: define a Toolkit ONCE. Expose it as BOTH:
//   (a) an internal agent toolkit (LanguageModel calls tools directly), AND
//   (b) a public MCP server (HTTP endpoint that any MCP client can connect to).
//
// Same value. Same handlers. Two surfaces. This is the unification that
// vanilla SDK + MCP server frameworks can't give you.
//
// Public surface:
//   SharedToolkit                 — the Toolkit value.
//   makeSharedToolkitLayer()      — Layer<HandlersFor<SharedToolkit>>.
//   AgentUsingSharedToolkit(q)    — Effect<{ text }, _, LanguageModel>.
//   mcpServerLayer                — Layer that serves the toolkit as MCP/HTTP.
//   mcpServerHandler              — (Request) => Promise<Response>.

import { Effect, Layer, Schema } from "effect"
import { LanguageModel, McpServer, Tool, Toolkit } from "effect/unstable/ai"
import { HttpRouter } from "effect/unstable/http"

// ──────────────────────────────────────────────────────────────────
// One tool. Trivial on purpose — the point is reuse, not depth.
// ──────────────────────────────────────────────────────────────────

const RollDice = Tool.make("RollDice", {
  description: "Roll N dice with S sides each. Returns the rolls and the sum.",
  parameters: Schema.Struct({
    n: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
    sides: Schema.Number.check(Schema.isGreaterThanOrEqualTo(2), Schema.isLessThanOrEqualTo(1000))
  }),
  success: Schema.Struct({
    rolls: Schema.Array(Schema.Number),
    sum: Schema.Number
  })
}).annotate(Tool.Readonly, true)

const FlipCoin = Tool.make("FlipCoin", {
  description: "Flip a fair coin.",
  parameters: Schema.Struct({}),
  success: Schema.Struct({ result: Schema.Literals(["heads", "tails"]) })
}).annotate(Tool.Readonly, true)

export const SharedToolkit = Toolkit.make(RollDice, FlipCoin)

export const SharedToolkitLayer = SharedToolkit.toLayer({
  RollDice: ({ n, sides }) =>
    Effect.sync(() => {
      const rolls: number[] = Array.from({ length: n as number }, () => 1 + Math.floor(Math.random() * (sides as number)))
      const sum = rolls.reduce((a, b) => a + b, 0)
      return { rolls, sum }
    }),
  FlipCoin: () =>
    Effect.sync(
      () => ({ result: (Math.random() < 0.5 ? "heads" : "tails") as "heads" | "tails" })
    )
})

// ──────────────────────────────────────────────────────────────────
// Surface (a): an agent that uses the toolkit internally.
// ──────────────────────────────────────────────────────────────────

export const AgentUsingSharedToolkit = (question: string) =>
  Effect.gen(function* () {
    const response = yield* LanguageModel.generateText({
      prompt: [
        {
          role: "system",
          content:
            "You roll dice and flip coins on request. Always call the right tool; never make up results."
        },
        { role: "user", content: [{ type: "text", text: question }] }
      ],
      toolkit: SharedToolkit
    })
    return { text: response.text }
  }).pipe(Effect.provide(SharedToolkitLayer))

// ──────────────────────────────────────────────────────────────────
// Surface (b): an MCP HTTP server exposing the same toolkit. Any MCP
// client (Claude Desktop, the MCP CLI, agent frameworks) can connect.
// ──────────────────────────────────────────────────────────────────

export const mcpServerLayer = McpServer.layerHttp({
  name: "effect-agents:dice-and-coins",
  version: "0.0.1",
  path: "/mcp"
}).pipe(Layer.provide(McpServer.toolkit(SharedToolkit)), Layer.provide(SharedToolkitLayer))

/**
 * (Request) => Promise<Response> — drop into any web platform.
 * For local Bun: `Bun.serve({ fetch: mcpServerHandler })`.
 * For CF Worker: `export default { fetch: mcpServerHandler }`.
 */
export const { handler: mcpServerHandler } = HttpRouter.toWebHandler(mcpServerLayer, { disableLogger: true })

// ──────────────────────────────────────────────────────────────────
// Local entrypoint: by default, run the agent. Pass `serve` to start
// the MCP HTTP server instead.
//
//   bun examples/05-mcp-from-toolkit/agent.ts "Roll 3d6"
//   bun examples/05-mcp-from-toolkit/agent.ts serve
// ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const cmd = process.argv[2]
  if (cmd === "serve") {
    const port = Number(process.env.PORT ?? 8787)
    const server = Bun.serve({ port, fetch: (req) => mcpServerHandler(req) })
    console.log(`🔌 MCP server listening on http://localhost:${server.port}/mcp`)
    console.log(`   tools: ${Object.keys(SharedToolkit.tools).join(", ")}`)
    console.log(`   try:   curl -sS -X POST http://localhost:${server.port}/mcp -H 'content-type: application/json' -d '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "1" } } })}'`)
  } else {
    const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
    const question = process.argv.slice(2).join(" ") || "Roll 4d6 and tell me the sum."
    console.log(`❓ ${question}\n`)
    const result = await Effect.runPromise(
      AgentUsingSharedToolkit(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
    )
    console.log(`✅ ${result.text}`)
  }
}
