# How to deploy the Worker

One Cloudflare Worker hosts all five examples behind a single `fetch` handler. Two deploy paths are supported.

## Path A — Wrangler (default, simplest)

```sh
# One-time: log in
bunx wrangler login

# Local dev (binds to localhost:8787, hot-reloads the Worker)
bun run worker:dev

# Deploy
bun run worker:deploy
```

The Worker reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from Wrangler vars. Set them as secrets if they aren't already:

```sh
bunx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config worker/wrangler.jsonc
bunx wrangler secret put CLOUDFLARE_API_TOKEN  --config worker/wrangler.jsonc
```

## Path B — Alchemy

If you already use [Alchemy](https://alchemy.run) for declarative CF deploys:

```sh
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  npx alchemy deploy worker/alchemy.run.ts --stage personal
```

That's the only thing `worker/alchemy.run.ts` is for. Pick one path; ignore the other.

## Endpoints once deployed

See the [Worker endpoints reference](../reference/worker-endpoints.md).

## Verify the deploy

```sh
EFFECT_AGENTS_URL=https://effect-agents.<you>.workers.dev \
  bun run probe:remote
```

This drives every endpoint and asserts the same contracts the offline smoke test checks, but over the network. A pass means your deploy + Workers AI binding + MCP transport all work.

## Tear down

```sh
bunx wrangler delete --config worker/wrangler.jsonc
# or, if using alchemy:
npx alchemy destroy worker/alchemy.run.ts --stage personal
```
