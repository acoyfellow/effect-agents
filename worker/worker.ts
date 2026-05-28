// One Cloudflare Worker hosting all five examples behind a single fetch
// handler. Each example is just an Effect program; the Worker provides the
// shared `LanguageModel` Layer (Workers AI via OpenAI-compat) and dispatches
// by URL path.
//
//   POST /01  body: { question }                -> structured research answer
//   POST /02  body: { question }                -> SSE-like NDJSON stream
//   POST /03  body: { instruction }             -> turn 1, returns pending or done
//   POST /03/decide  body: { pending, approved }-> turn 2
//   POST /04  body: { question }                -> { ok, text } | { ok:false, status, code }
//   POST /05  body: { question }                -> agent uses dice/coin toolkit
//   *    /mcp ...                               -> MCP HTTP transport for #5
//   GET  /health
//
// Run locally:  bun run worker:dev
// Deploy:       alchemy deploy (alchemy.run.ts is sibling to this file)

import { Effect, Layer, Stream } from "effect"
import { modelLayer, type ProviderConfig } from "../src/model.ts"

// Static landing assets bundled into the Worker at build time.
// `wrangler.jsonc` rules { type: "Text" } maps these globs to string imports.
import landingHtml from "./static/index.html"
import ogSvg from "./static/og.svg"
import faviconSvg from "./static/favicon.svg"
import robotsTxt from "./static/robots.txt"
import sitemapXml from "./static/sitemap.xml"

import { ParallelResearchAgent } from "../examples/01-parallel-research/agent.ts"
import {
  StreamingToolsAgent,
  streamToNdjson
} from "../examples/02-streaming-tools/agent.ts"
import {
  decide as approvalDecide,
  makeInMemoryWorkspace,
  requestAction as approvalRequest,
  type PendingResult
} from "../examples/03-approval-gated/agent.ts"
import { AnswerOrTypedError } from "../examples/04-typed-errors/agent.ts"
import {
  AgentUsingSharedToolkit,
  mcpServerHandler
} from "../examples/05-mcp-from-toolkit/agent.ts"

export interface Env {
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_API_TOKEN: string
  EFFECT_AGENTS_MODEL?: string
}

const providerFromEnv = (env: Env): ProviderConfig => ({
  kind: "workers-ai",
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: env.CLOUDFLARE_API_TOKEN,
  model: env.EFFECT_AGENTS_MODEL
})

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers }
  })

const readJson = async <T = Record<string, unknown>>(req: Request): Promise<T> => {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Static landing page + SEO surfaces. Served with sensible caching.
    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/" || path === "/index.html") {
        return new Response(landingHtml as unknown as string, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=3600"
          }
        })
      }
      if (path === "/og.svg") {
        return new Response(ogSvg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400"
          }
        })
      }
      if (path === "/favicon.svg" || path === "/favicon.ico") {
        return new Response(faviconSvg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400"
          }
        })
      }
      if (path === "/robots.txt") {
        return new Response(robotsTxt, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" }
        })
      }
      if (path === "/sitemap.xml") {
        return new Response(sitemapXml, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" }
        })
      }
    }

    if (path === "/health") {
      return json({
        ok: true,
        repo: "effect-agents",
        examples: ["01", "02", "03", "04", "05"],
        provider: "workers-ai-openai-compat"
      })
    }

    // MCP transport for example 05 — forward straight to the McpServer handler.
    if (path.startsWith("/mcp")) return mcpServerHandler(request)

    const ModelLayer: Layer.Layer<any> = modelLayer(providerFromEnv(env))

    try {
      if (request.method === "POST" && path === "/01") {
        const body = await readJson<{ question?: string }>(request)
        const result = await Effect.runPromise(
          ParallelResearchAgent(body.question ?? "What is Effect v4?").pipe(Effect.provide(ModelLayer))
        )
        return json({ ok: true, example: "01", result })
      }

      if (request.method === "POST" && path === "/02") {
        const body = await readJson<{ question?: string }>(request)
        const ndjson = await Effect.runPromise(
          streamToNdjson(StreamingToolsAgent(body.question ?? "Tell me about u_alice.").pipe(Stream.provide(ModelLayer)))
        )
        return new Response(ndjson, {
          headers: { "content-type": "application/x-ndjson; charset=utf-8" }
        })
      }

      if (request.method === "POST" && path === "/03") {
        const body = await readJson<{ instruction?: string; files?: string[] }>(request)
        const ws = makeInMemoryWorkspace(body.files ?? ["notes.md", "README.md", "todo.md"])
        const pending = await Effect.runPromise(
          approvalRequest(ws, body.instruction ?? "Please delete notes.md.").pipe(Effect.provide(ModelLayer))
        )
        const filesBefore = await Effect.runPromise(ws.list())
        return json({ ok: true, example: "03", result: pending, filesBefore })
      }

      if (request.method === "POST" && path === "/03/decide") {
        const body = await readJson<{ pending?: PendingResult; approved?: boolean; files?: string[] }>(request)
        if (!body.pending) return json({ ok: false, error: "missing pending" }, { status: 400 })
        const ws = makeInMemoryWorkspace(body.files ?? ["notes.md", "README.md", "todo.md"])
        const final = await Effect.runPromise(
          approvalDecide(ws, body.pending, body.approved === true).pipe(Effect.provide(ModelLayer))
        )
        const filesAfter = await Effect.runPromise(ws.list())
        return json({ ok: true, example: "03", result: final, filesAfter })
      }

      if (request.method === "POST" && path === "/04") {
        const body = await readJson<{ question?: string }>(request)
        const result = await Effect.runPromise(
          AnswerOrTypedError(body.question ?? "What is Effect?").pipe(Effect.provide(ModelLayer))
        )
        const status = result.ok ? 200 : result.status
        return json({ ok: true, example: "04", result }, { status })
      }

      if (request.method === "POST" && path === "/05") {
        const body = await readJson<{ question?: string }>(request)
        const result = await Effect.runPromise(
          AgentUsingSharedToolkit(body.question ?? "Roll 3d6 and a coin flip.").pipe(Effect.provide(ModelLayer))
        )
        return json({ ok: true, example: "05", result })
      }
    } catch (err) {
      return json({ ok: false, error: String(err) }, { status: 500 })
    }

    return json({ ok: false, error: "Not found", path }, { status: 404 })
  }
} satisfies ExportedHandler<Env>
