# Worker endpoints

The unified Worker at `worker/worker.ts` exposes the following routes. All accept JSON requests (where applicable) and return JSON responses.

| Method | Path             | Body                                          | Notes                                                                  |
| ------ | ---------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/health`        | —                                             | `{ ok, repo, examples, provider }`                                     |
| POST   | `/01`            | `{ question?: string }`                       | Structured `{ answer, sources, confidence }`                           |
| POST   | `/02`            | `{ question?: string }`                       | `application/x-ndjson` stream of `StreamPart`s                         |
| POST   | `/03`            | `{ instruction?: string, files?: string[] }`  | Turn 1 — returns `{ result: PendingResult \| DoneResult, filesBefore }` |
| POST   | `/03/decide`     | `{ pending: PendingResult, approved: boolean, files?: string[] }` | Turn 2 — returns `{ result: DoneResult, filesAfter }`     |
| POST   | `/04`            | `{ question?: string }`                       | `{ result: { ok:true, text } \| { ok:false, status, code, message } }` — HTTP status matches `result.status` on failure |
| POST   | `/05`            | `{ question?: string }`                       | `{ result: { text } }`                                                 |
| any    | `/mcp`           | JSON-RPC 2.0 (MCP protocol)                   | Standard MCP HTTP transport for example 05                             |

## Status code contract for `/04`

`/04` is the typed-error example. The HTTP status code reflects the Effect program's mapped `AiError` reason:

| Inner reason `_tag`                                       | HTTP status |
| --------------------------------------------------------- | ----------- |
| —                                                         | 200         |
| `RateLimitError` / `QuotaExhaustedError`                  | 429         |
| `InvalidRequestError`                                     | 413         |
| `AuthenticationError` / `NetworkError` / `InternalProviderError` | 502  |
| any other reason or a defect                              | 500         |

## `/02` NDJSON stream events

Each line is a JSON object with a `type` field, one of:

| `type`         | Other fields                                       |
| -------------- | -------------------------------------------------- |
| `text-delta`   | `text: string`                                     |
| `tool-call`    | `name: string`, `params: Record<string, unknown>`  |
| `tool-result`  | `name`, `result`, `isFailure: boolean`             |
| `finish`       | `reason: "stop" \| "length" \| ...`                |
| `error`        | `error: string`                                    |

## `/mcp` MCP transport

Standard Model Context Protocol HTTP transport. Initialise:

```sh
curl -sS -X POST "$WORKER/mcp" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

The response includes an `Mcp-Session-Id` header. Replay it on subsequent calls (`tools/list`, `tools/call`, etc.).

## Health response shape

```json
{
  "ok": true,
  "repo": "effect-agents",
  "examples": ["01", "02", "03", "04", "05"],
  "provider": "workers-ai-openai-compat"
}
```
