#!/usr/bin/env bun
// Remote probes against a deployed effect-agents Worker.
//
// Hits the `/01..05` + `/mcp` endpoints and asserts the same contracts the
// in-process `probes/local.ts` checks, but at the network seam. Useful to
// verify a deploy + the OpenAI-compatible Workers AI binding.
//
//   EFFECT_AGENTS_URL=https://effect-agents.<you>.workers.dev \
//     bun probes/remote.ts            # all
//   EFFECT_AGENTS_URL=...  bun probes/remote.ts 03   # one

if (!process.env.EFFECT_AGENTS_URL) {
  console.error("set EFFECT_AGENTS_URL=https://<worker>.workers.dev")
  process.exit(2)
}
await import("./run.ts")

export {}
