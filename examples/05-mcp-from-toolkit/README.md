# 05 · mcp-from-toolkit

> One `Toolkit` value. Two surfaces. Same source of truth.

## Run me

```sh
# Offline contract smoke (no creds; <1s)
bun run smoke 05

# Real LLM as agent
OPENROUTER_API_KEY=sk-or-...   bun examples/05-mcp-from-toolkit/agent.ts "Roll 4d6 and a coin."

# Run the MCP server locally on http://localhost:8787/mcp
bun examples/05-mcp-from-toolkit/agent.ts serve

# Against a deployed Worker (agent surface)
curl -sS -X POST "$EFFECT_AGENTS_URL/05" \
  -H 'content-type: application/json' \
  -d '{"question":"Roll 3d6."}'

# Against a deployed Worker (MCP surface — initialize handshake)
curl -sS -X POST "$EFFECT_AGENTS_URL/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## What it does

The toolkit is just two tools — `RollDice` and `FlipCoin` — but the punchline is reuse. The *exact same `Toolkit` value* is:

- Passed to `LanguageModel.generateText({ toolkit })` so the agent can call them.
- Wrapped in `McpServer.layerHttp({ name, path }) + McpServer.toolkit(toolkit)` so any MCP client (Claude Desktop, the MCP CLI, agent frameworks) can list and invoke them over HTTP.

The smoke + probe do an `initialize` + `tools/list` handshake and assert the returned tool names match the toolkit definition exactly.

## Effect features showcased

- `effect/unstable/ai/McpServer.layerHttp` — full MCP server in one layer
- `McpServer.toolkit(toolkit)` — promote any `Toolkit` to an MCP-exposed surface
- `HttpRouter.toWebHandler(layer)` → `(Request) => Promise<Response>` — drop into Bun, Worker, anything

## Without Effect

MCP server frameworks live in a different stack from your agent code. Here it's literally `McpServer.toolkit(toolkit)`. The agent and the MCP server cannot drift.
