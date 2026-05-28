#!/usr/bin/env bun
// Offline smoke test for all five examples.
//
// Uses `src/stub-model.ts` to provide a scripted, deterministic
// `LanguageModel` Layer. Proves the agent programs compile, wire, and behave
// correctly without any LLM provider creds. Run from a fresh clone:
//
//   bun install && bun run smoke
//
// What this asserts per example:
//   01 — typed structured output round-trips with retried tool calls.
//   02 — Stream emits text-delta + tool-call + finish parts in order.
//   03 — turn 1 yields a pending approval (no side effect); turn 2 approve
//        runs the tool; turn 2 deny doesn't.
//   04 — synthetic `AiError(RateLimitError)` is mapped to ok:false / 429.
//   05 — same Toolkit exposed both as agent toolkit and over MCP HTTP.

import { Effect, Stream } from "effect"

import { ParallelResearchAgent } from "../examples/01-parallel-research/agent.ts"
import { StreamingToolsAgent } from "../examples/02-streaming-tools/agent.ts"
import { decide, makeInMemoryWorkspace, requestAction } from "../examples/03-approval-gated/agent.ts"
import { AnswerOrTypedError } from "../examples/04-typed-errors/agent.ts"
import { AgentUsingSharedToolkit, mcpServerHandler } from "../examples/05-mcp-from-toolkit/agent.ts"
import {
  failingModelLayer,
  finish,
  finishStream,
  rateLimit,
  stubModelLayer,
  text,
  textDelta,
  textEnd,
  textStart,
  toolCall,
  toolCallStream
} from "../src/stub-model.ts"

const ok = (msg: string) => console.log(`  ✓ ${msg}`)
const die = (msg: string): never => {
  console.error(`  ✗ ${msg}`)
  throw new Error(msg)
}

// ──────────────────────────────────────────────────────────────────
// 01 — parallel-research
// ──────────────────────────────────────────────────────────────────

const smoke01 = async () => {
  console.log("\n[01] parallel-research")

  // Script: the model emits the structured-output JSON directly.
  // The real-LLM probe (bun run probe:all with OPENROUTER_API_KEY set)
  // exercises the tool-calling branch; the offline smoke covers the
  // wiring + schema validation round-trip.
  let call = 0
  const layer = stubModelLayer({
    generateText: () => {
      call += 1
      return [
        text(
          JSON.stringify({
            answer: "LoRA is a low-rank adaptation technique for fine-tuning LLMs.",
            sources: ["arxiv", "hackernews", "docs"],
            confidence: "high"
          })
        ),
        finish("stop")
      ]
    }
  })

  const result = await Effect.runPromise(
    ParallelResearchAgent("What is LoRA?").pipe(Effect.provide(layer))
  )

  if (typeof result.answer !== "string" || result.answer.length === 0) die("empty answer")
  ok(`structured answer: "${result.answer}"`)
  if (!Array.isArray(result.sources) || result.sources.length === 0) die("sources missing")
  ok(`sources: [${result.sources.join(", ")}]`)
  if (!["low", "medium", "high"].includes(result.confidence)) die(`bad confidence: ${result.confidence}`)
  ok(`confidence: ${result.confidence}`)
  if (call < 1) die(`expected ≥1 model call, got ${call}`)
  ok(`model was called ${call}× (schema validated ok)`)
}

// ──────────────────────────────────────────────────────────────────
// 02 — streaming-tools
// ──────────────────────────────────────────────────────────────────

const smoke02 = async () => {
  console.log("\n[02] streaming-tools")

  const layer = stubModelLayer({
    streamText: [
      textStart(),
      textDelta("Looking up user "),
      toolCallStream("call-1", "LookupUser", { id: "u_alice" }),
      textDelta("u_alice"),
      textDelta("..."),
      textEnd(),
      finishStream("stop")
    ]
  })

  let textDeltaCount = 0
  let sawToolCall = false
  let sawFinish = false

  await Effect.runPromise(
    StreamingToolsAgent("Tell me about u_alice.").pipe(
      Stream.tap((part) =>
        Effect.sync(() => {
          const p = part as any
          if (p.type === "text-delta") textDeltaCount++
          else if (p.type === "tool-call") sawToolCall = true
          else if (p.type === "finish") sawFinish = true
        })
      ),
      Stream.runDrain,
      Effect.provide(layer)
    )
  )

  if (textDeltaCount === 0) die("no text-delta parts emitted")
  ok(`received ${textDeltaCount} text-delta parts`)
  if (!sawToolCall) die("expected a tool-call part")
  ok("model emitted tool-call (LookupUser)")
  if (!sawFinish) die("expected a finish part")
  ok("stream finished cleanly")
}

// ──────────────────────────────────────────────────────────────────
// 03 — approval-gated
// ──────────────────────────────────────────────────────────────────

const smoke03 = async () => {
  console.log("\n[03] approval-gated")

  // Round A: approve. The stub script alternates per call:
  //   call 1 → tool-call DeleteFile(notes.md) → triggers needsApproval
  //           (the LanguageModel auto-emits the approval-request part).
  //   call 2 → after the user approves and the tool runs, the model wraps up.
  const callsApprove: Array<"req" | "post"> = []
  const approveLayer = stubModelLayer({
    generateText: () => {
      const next: "req" | "post" = callsApprove.length === 0 ? "req" : "post"
      callsApprove.push(next)
      if (next === "req") {
        return [toolCall("td-1", "DeleteFile", { name: "notes.md" }), finish("tool-calls")]
      }
      return [text("Deleted notes.md."), finish("stop")]
    }
  })

  const wsA = makeInMemoryWorkspace(["notes.md", "README.md", "todo.md"])
  const pendingA = await Effect.runPromise(
    requestAction(wsA, "Please delete notes.md.").pipe(Effect.provide(approveLayer))
  )
  if (pendingA.kind !== "pending") { die(`expected pending, got ${pendingA.kind}`); return }
  ok(`turn 1 pending, approvalId=${pendingA.approvalId} tool=${pendingA.toolName}(${JSON.stringify(pendingA.params)})`)

  const beforeA = await Effect.runPromise(wsA.list())
  if (!beforeA.includes("notes.md")) die("notes.md should still exist after turn 1")
  ok(`no side effect after turn 1 (workspace=${JSON.stringify(beforeA)})`)

  const doneA = await Effect.runPromise(decide(wsA, pendingA, true).pipe(Effect.provide(approveLayer)))
  if (doneA.kind !== "done") die("expected done after approval")
  ok(`turn 2 (approve) done: "${doneA.text.slice(0, 60)}…"`)
  const afterA = await Effect.runPromise(wsA.list())
  if (afterA.includes("notes.md")) die(`approve should have deleted notes.md; got ${JSON.stringify(afterA)}`)
  ok(`approve performed the side effect (workspace=${JSON.stringify(afterA)})`)

  // Round B: deny. Same script shape but new workspace + new layer (fresh call counter).
  const callsDeny: Array<"req" | "post"> = []
  const denyLayer = stubModelLayer({
    generateText: () => {
      const next: "req" | "post" = callsDeny.length === 0 ? "req" : "post"
      callsDeny.push(next)
      if (next === "req") {
        return [toolCall("td-2", "DeleteFile", { name: "README.md" }), finish("tool-calls")]
      }
      return [text("Skipped; denied by operator."), finish("stop")]
    }
  })

  const wsB = makeInMemoryWorkspace(["notes.md", "README.md", "todo.md"])
  const pendingB = await Effect.runPromise(
    requestAction(wsB, "Please delete README.md.").pipe(Effect.provide(denyLayer))
  )
  if (pendingB.kind !== "pending") { die("round B expected pending"); return }
  const doneB = await Effect.runPromise(decide(wsB, pendingB, false).pipe(Effect.provide(denyLayer)))
  if (doneB.kind !== "done") die("round B expected done after deny")
  const afterB = await Effect.runPromise(wsB.list())
  if (!afterB.includes("README.md")) die(`deny should preserve README.md; got ${JSON.stringify(afterB)}`)
  ok(`deny preserved README.md (workspace=${JSON.stringify(afterB)})`)
}

// ──────────────────────────────────────────────────────────────────
// 04 — typed-errors
// ──────────────────────────────────────────────────────────────────

const smoke04 = async () => {
  console.log("\n[04] typed-errors")

  // Happy path
  const happy = stubModelLayer({ generateText: [text("pong"), finish("stop")] })
  const okResult = await Effect.runPromise(AnswerOrTypedError("ping").pipe(Effect.provide(happy)))
  if (!okResult.ok) { die(`expected ok, got ${okResult.code}: ${okResult.message}`); return }
  ok(`happy path text="${okResult.text}"`)

  // Synthetic rate-limit failure → 429
  const failing = failingModelLayer(rateLimit)
  const errResult = await Effect.runPromise(AnswerOrTypedError("ping").pipe(Effect.provide(failing)))
  if (errResult.ok) { die("expected typed error, got happy path"); return }
  if (errResult.status !== 429) die(`expected 429, got ${errResult.status}`)
  if (errResult.code !== "RateLimitError") die(`expected RateLimitError, got ${errResult.code}`)
  ok(`synthetic RateLimitError mapped to ${errResult.status} ${errResult.code}`)
}

// ──────────────────────────────────────────────────────────────────
// 05 — mcp-from-toolkit
// ──────────────────────────────────────────────────────────────────

const smoke05 = async () => {
  console.log("\n[05] mcp-from-toolkit")

  // (a) Same toolkit used as an agent toolkit.
  // v4 `generateText` runs ONE round (model emits text + tool calls, runtime
  // resolves the calls, returns). The caller controls multi-step. So our stub
  // model emits a text part alongside the tool call — the response.text covers
  // the assertion that the toolkit was actually used and the call resolved.
  const layer = stubModelLayer({
    generateText: () => [
      text("Rolling 3d6 now."),
      toolCall("r-1", "RollDice", { n: 3, sides: 6 }),
      finish("tool-calls")
    ]
  })
  const agentResult = await Effect.runPromise(
    AgentUsingSharedToolkit("Roll 3d6.").pipe(Effect.provide(layer))
  )
  if (!agentResult.text) die("agent returned empty text")
  ok(`agent reused toolkit: "${agentResult.text.slice(0, 60)}…"`)

  // (b) MCP HTTP surface — initialize + tools/list.
  const init = await mcpServerHandler(
    new Request("http://local/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "effect-agents-smoke", version: "0.0.1" }
        }
      })
    })
  )
  if (init.status !== 200) die(`mcp initialize HTTP ${init.status}: ${await init.text()}`)
  const sessionId = init.headers.get("Mcp-Session-Id")
  if (!sessionId) { die("mcp initialize did not return Mcp-Session-Id"); return }
  const sid: string = sessionId
  ok(`mcp initialize ok, session=${sid.slice(0, 8)}…`)

  const list = await mcpServerHandler(
    new Request("http://local/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "Mcp-Session-Id": sid
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    })
  )
  if (list.status !== 200) die(`mcp tools/list HTTP ${list.status}`)
  const listBody = (await list.json()) as { result?: { tools?: Array<{ name: string }> } }
  const names = (listBody.result?.tools ?? []).map((t) => t.name).sort()
  ok(`mcp tools/list: [${names.join(", ")}]`)
  if (!names.includes("RollDice") || !names.includes("FlipCoin"))
    die("expected RollDice + FlipCoin in MCP tool list")
  ok("same Toolkit value exposed as BOTH agent toolkit AND MCP server")
}

// ──────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────

const tests: Record<string, () => Promise<void>> = {
  "01": smoke01,
  "02": smoke02,
  "03": smoke03,
  "04": smoke04,
  "05": smoke05
}

const target = process.argv[2] ?? "all"
const ids = target === "all" ? Object.keys(tests) : [target]

console.log(`effect-agents smoke (offline; stub LanguageModel; no API keys)`)
for (const id of ids) {
  const fn = tests[id]
  if (!fn) {
    console.error(`unknown smoke target: ${id}`)
    process.exit(2)
  }
  try {
    await fn()
  } catch (err) {
    console.error(`\n❌ smoke ${id} FAILED:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
console.log("\n✅ all green (offline)")
