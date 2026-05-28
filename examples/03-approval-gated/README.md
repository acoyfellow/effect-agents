# 03 · approval-gated

> First-class human-in-the-loop. `Tool.make({ needsApproval: true })` — and that's the whole API.

## Run me

```sh
# Offline contract smoke (no creds; <1s)
bun run smoke 03

# Real LLM — approve flow (file gets deleted)
OPENROUTER_API_KEY=sk-or-...   bun examples/03-approval-gated/agent.ts approve notes.md

# Real LLM — deny flow (file preserved)
OPENROUTER_API_KEY=sk-or-...   bun examples/03-approval-gated/agent.ts deny notes.md

# Against a deployed Worker — two-turn protocol
TURN1=$(curl -sS -X POST "$EFFECT_AGENTS_URL/03" \
  -H 'content-type: application/json' \
  -d '{"instruction":"Please delete notes.md."}')
curl -sS -X POST "$EFFECT_AGENTS_URL/03/decide" \
  -H 'content-type: application/json' \
  -d "{\"pending\": $(echo "$TURN1" | jq .result), \"approved\": true}"
```

## What it does

Two tools: `ListFiles` (free) and `DeleteFile` (`needsApproval: true`). When the model decides to call the destructive tool, the agent emits a `tool-approval-request` part and **stops**. No side effect runs. The caller decides on a subsequent turn by replaying the conversation plus a `tool-approval-response` part with `approved: true | false`.

The smoke + probe both assert three claims:

1. After turn 1, the file is still there → **no side effect on pending**.
2. After turn 2 with `approved: true`, the file is gone → side effect runs exactly once.
3. After turn 2 with `approved: false`, the file is preserved → denial is honored.

## Effect features showcased

- `Tool.make({ needsApproval: true })` — also accepts a function for dynamic gating
- `Prompt.toolApprovalResponsePart({ approvalId, approved })` for the decision
- Conversation replay as a value — no hidden state machine

## Without Effect

Every framework reinvents pending-tool-calls tables, threads approval ids through bespoke protocols, and risks missed gates. Here it's a single field on the `Tool` value, type-checked.
