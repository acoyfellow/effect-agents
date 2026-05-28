#!/usr/bin/env bun
// Probes. Each probe is a live, no-mocks check that an example does what it
// says. Two modes:
//
//   1. Local mode (default): import the example's Effect program and run it
//      in-process, with the model layer wired from process.env.
//
//   2. Remote mode: set EFFECT_AGENTS_URL=https://...workers.dev and the
//      probes hit the deployed Worker endpoints instead.
//
//   bun probes/run.ts 01
//   bun probes/run.ts all
//   EFFECT_AGENTS_URL=https://...workers.dev bun probes/run.ts all

import { Effect, Stream } from "effect"

import { ParallelResearchAgent } from "../examples/01-parallel-research/agent.ts"
import { StreamingToolsAgent } from "../examples/02-streaming-tools/agent.ts"
import {
  decide,
  makeInMemoryWorkspace,
  requestAction
} from "../examples/03-approval-gated/agent.ts"
import { AnswerOrTypedError } from "../examples/04-typed-errors/agent.ts"
import { AgentUsingSharedToolkit, mcpServerHandler } from "../examples/05-mcp-from-toolkit/agent.ts"
import { modelLayer, providerFromEnv } from "../src/model.ts"

const REMOTE = process.env.EFFECT_AGENTS_URL

const ok = (msg: string) => console.log(`  ✓ ${msg}`)
const info = (msg: string) => console.log(`  · ${msg}`)
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`)
  throw new Error(msg)
}

const post = async (path: string, body: unknown) => {
  if (!REMOTE) throw new Error("REMOTE mode needs EFFECT_AGENTS_URL")
  const resp = await fetch(`${REMOTE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  const text = await resp.text()
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { _raw: text }
  }
  return { status: resp.status, body: parsed, raw: text }
}

// ──────────────────────────────────────────────────────────────────
// 01 — parallel research: assert structured answer shape.
// ──────────────────────────────────────────────────────────────────

const probe01 = async () => {
  console.log("\n[01] parallel-research")
  const question = "What is LoRA and why does it matter?"
  let result: { answer: string; sources: ReadonlyArray<string>; confidence: string }

  if (REMOTE) {
    const r = await post("/01", { question })
    if (r.status !== 200 || !r.body.ok) fail(`/01 returned ${r.status}: ${r.raw}`)
    result = r.body.result
  } else {
    result = await Effect.runPromise(
      ParallelResearchAgent(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
    )
  }

  if (typeof result.answer !== "string" || result.answer.length === 0) fail("answer empty")
  ok(`answer (${result.answer.length} chars): "${result.answer.slice(0, 80)}…"`)
  if (!Array.isArray(result.sources)) fail("sources missing")
  ok(`sources: [${result.sources.join(", ")}]`)
  if (!["low", "medium", "high"].includes(result.confidence)) fail(`bad confidence: ${result.confidence}`)
  ok(`confidence: ${result.confidence}`)
}

// ──────────────────────────────────────────────────────────────────
// 02 — streaming-tools: assert we see text-delta parts AND a finish.
// ──────────────────────────────────────────────────────────────────

const probe02 = async () => {
  console.log("\n[02] streaming-tools")
  const question = "Tell me about user u_alice in 2 sentences."
  let textDeltas = 0
  let finished = false
  let toolCall = false

  if (REMOTE) {
    const resp = await fetch(`${REMOTE}/02`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question })
    })
    if (!resp.body) fail("no response body")
    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const part = JSON.parse(line)
        if (part.type === "text-delta") textDeltas++
        else if (part.type === "tool-call") toolCall = true
        else if (part.type === "finish") finished = true
      }
    }
  } else {
    await Effect.runPromise(
      StreamingToolsAgent(question).pipe(
        Stream.tap((part) =>
          Effect.sync(() => {
            const p = part as any
            if (p.type === "text-delta") textDeltas++
            else if (p.type === "tool-call") toolCall = true
            else if (p.type === "finish") finished = true
          })
        ),
        Stream.runDrain,
        Effect.provide(modelLayer(providerFromEnv()))
      )
    )
  }

  if (textDeltas === 0) fail("no text-delta parts received")
  ok(`received ${textDeltas} text-delta parts`)
  if (toolCall) ok("model called LookupUser tool")
  else info("model did not call LookupUser (allowed; depends on model)")
  if (!finished) fail("no finish part")
  ok("stream finished cleanly")
}

// ──────────────────────────────────────────────────────────────────
// 03 — approval-gated: assert no-side-effect-on-pending, side-effect-on-approve.
// ──────────────────────────────────────────────────────────────────

const probe03 = async () => {
  console.log("\n[03] approval-gated")
  const initial = ["notes.md", "README.md", "todo.md"]

  // Round A: approve → file is gone.
  if (REMOTE) {
    const r1 = await post("/03", { instruction: "Please delete notes.md.", files: initial })
    if (!r1.body.ok || r1.body.result.kind !== "pending") fail(`/03 expected pending, got ${r1.raw}`)
    ok(`turn 1 pending, approvalId=${r1.body.result.approvalId}`)
    if (!r1.body.filesBefore.includes("notes.md")) fail("notes.md should still exist after turn 1")
    ok("no side effect after turn 1 (notes.md still present)")

    const r2 = await post("/03/decide", { pending: r1.body.result, approved: true, files: initial })
    if (!r2.body.ok) fail(`/03/decide failed: ${r2.raw}`)
    // Worker uses a fresh workspace per request, but the assertion that
    // the approve branch did NOT throw and returned a "done" result is what
    // we care about. The Worker also returns filesAfter.
    if (r2.body.result.kind !== "done") fail("turn 2 should be done")
    ok(`turn 2 done: "${r2.body.result.text.slice(0, 60)}…"`)
    info(`Worker workspace filesAfter: [${r2.body.filesAfter.join(", ")}]`)
  } else {
    const ws = makeInMemoryWorkspace(initial)
    const Layer = modelLayer(providerFromEnv())

    const pending = await Effect.runPromise(
      requestAction(ws, "Please delete notes.md.").pipe(Effect.provide(Layer))
    )
    if (pending.kind !== "pending") { fail(`expected pending, got ${pending.kind}`); return }
    ok(`turn 1 pending, approvalId=${pending.approvalId} toolCall=${pending.toolName}(${JSON.stringify(pending.params)})`)

    const filesBefore = await Effect.runPromise(ws.list())
    if (!filesBefore.includes("notes.md")) fail("notes.md should still exist after turn 1")
    ok(`no side effect after turn 1 (workspace=${JSON.stringify(filesBefore)})`)

    const approved = await Effect.runPromise(decide(ws, pending, true).pipe(Effect.provide(Layer)))
    if (approved.kind !== "done") fail("expected done after approval")
    ok(`turn 2 (approved) done: "${approved.text.slice(0, 60)}…"`)

    const filesAfter = await Effect.runPromise(ws.list())
    if (filesAfter.includes("notes.md")) fail(`notes.md should be GONE after approve; workspace=${JSON.stringify(filesAfter)}`)
    ok(`side effect happened after approve (workspace=${JSON.stringify(filesAfter)})`)

    // Round B: deny on a fresh workspace → file stays.
    const ws2 = makeInMemoryWorkspace(initial)
    const pending2 = await Effect.runPromise(
      requestAction(ws2, "Please delete README.md.").pipe(Effect.provide(Layer))
    )
    if (pending2.kind !== "pending") { fail("round B expected pending"); return }
    const denied = await Effect.runPromise(decide(ws2, pending2, false).pipe(Effect.provide(Layer)))
    if (denied.kind !== "done") fail("round B expected done after deny")
    const filesAfter2 = await Effect.runPromise(ws2.list())
    if (!filesAfter2.includes("README.md"))
      fail(`README.md should still exist after deny; workspace=${JSON.stringify(filesAfter2)}`)
    ok(`deny preserved README.md (workspace=${JSON.stringify(filesAfter2)})`)
  }
}

// ──────────────────────────────────────────────────────────────────
// 04 — typed-errors: assert happy path returns { ok:true, text }.
// (Forcing an error path is provider-specific; we just exercise the type.)
// ──────────────────────────────────────────────────────────────────

const probe04 = async () => {
  console.log("\n[04] typed-errors")
  const question = "Reply with the single word: pong."

  if (REMOTE) {
    const r = await post("/04", { question })
    if (!r.body.ok || !r.body.result.ok) fail(`/04 unexpected: ${r.raw}`)
    ok(`happy path ok=true, text="${r.body.result.text.slice(0, 60)}"`)
  } else {
    const result = await Effect.runPromise(
      AnswerOrTypedError(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
    )
    if (!result.ok) { fail(`expected ok, got ${result.code}: ${result.message}`); return }
    ok(`happy path text="${result.text.slice(0, 60)}…"`)
  }
}

// ──────────────────────────────────────────────────────────────────
// 05 — mcp-from-toolkit: assert (a) the agent answers, (b) the MCP server
//      responds to `initialize` and returns the same tool names.
// ──────────────────────────────────────────────────────────────────

const probe05 = async () => {
  console.log("\n[05] mcp-from-toolkit")
  const question = "Roll 5d6 and tell me the sum."

  // (a) agent
  if (REMOTE) {
    const r = await post("/05", { question })
    if (!r.body.ok) fail(`/05 failed: ${r.raw}`)
    ok(`agent answered: "${r.body.result.text.slice(0, 60)}…"`)
  } else {
    const result = await Effect.runPromise(
      AgentUsingSharedToolkit(question).pipe(Effect.provide(modelLayer(providerFromEnv())))
    )
    if (!result.text) fail("agent returned empty text")
    ok(`agent answered: "${result.text.slice(0, 60)}…"`)
  }

  // (b) MCP — initialize + tools/list
  const base = REMOTE ?? "http://localhost:0" // sentinel; local mode uses in-process handler
  const mcpUrl = `${base}/mcp`

  const callMcp = async (body: unknown, sessionId?: string): Promise<{ status: number; sessionId: string | null; body: any }> => {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" }
    if (sessionId) headers["Mcp-Session-Id"] = sessionId
    if (REMOTE) {
      const r = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(body) })
      return { status: r.status, sessionId: r.headers.get("Mcp-Session-Id"), body: await r.json().catch(() => ({})) }
    }
    const req = new Request(mcpUrl, { method: "POST", headers, body: JSON.stringify(body) })
    const r = await mcpServerHandler(req)
    return { status: r.status, sessionId: r.headers.get("Mcp-Session-Id"), body: await r.json().catch(() => ({})) }
  }

  const init = await callMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "effect-agents-probe", version: "0.0.1" }
    }
  })
  if (init.status !== 200) fail(`mcp initialize HTTP ${init.status}`)
  if (!init.sessionId) { fail("mcp initialize did not return Mcp-Session-Id"); return }
  const sessionId: string = init.sessionId
  ok(`mcp initialize ok, session=${sessionId.slice(0, 8)}…`)

  const list = await callMcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId)
  if (list.status !== 200) fail(`mcp tools/list HTTP ${list.status}`)
  const tools = (list.body.result?.tools ?? []) as Array<{ name: string }>
  const names = tools.map((t) => t.name).sort()
  ok(`mcp tools/list returned: [${names.join(", ")}]`)
  if (!names.includes("RollDice") || !names.includes("FlipCoin")) fail("expected RollDice + FlipCoin in MCP tool list")
  ok("same Toolkit value exposed both as agent toolkit AND MCP server")
}

// ──────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────

const all: Record<string, () => Promise<void>> = {
  "01": probe01,
  "02": probe02,
  "03": probe03,
  "04": probe04,
  "05": probe05
}

const target = process.argv[2] ?? "all"
const ids = target === "all" ? Object.keys(all) : [target]

console.log(`effect-agents probes  mode=${REMOTE ? `remote (${REMOTE})` : "local"}`)
for (const id of ids) {
  const fn = all[id]
  if (!fn) {
    console.error(`unknown probe: ${id}`)
    process.exit(2)
  }
  try {
    await fn()
  } catch (err) {
    console.error(`\n❌ probe ${id} FAILED:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
console.log("\n✅ all green")
