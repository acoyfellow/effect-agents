// Optional: deploy the Worker via Alchemy.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
//   npx alchemy deploy worker/alchemy.run.ts --stage personal
//
// This is a thin wrapper. The Worker auths itself against Workers AI's
// OpenAI-compat endpoint using the same CF token used to deploy.

import alchemy from "alchemy"
import { Worker } from "alchemy/cloudflare"

const STAGE = process.env.STAGE ?? "local"
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
if (!accountId || !apiToken) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.")
}

const app = await alchemy("effect-agents", { stage: STAGE })

const worker = await Worker(`effect-agents-${STAGE}`, {
  entrypoint: "worker.ts",
  compatibilityDate: "2026-05-21",
  compatibility: "node",
  bindings: {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    EFFECT_AGENTS_MODEL: process.env.EFFECT_AGENTS_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
  }
})

console.log(worker.url)
await app.finalize()
