# Stub model reference

`src/stub-model.ts` exposes a deterministic `Layer<LanguageModel.LanguageModel>` for offline tests. This is the same shape `effect@4.0.0-beta.73`'s own test suite uses — see `packages/effect/test/unstable/ai/utils.ts` in `effect-smol`.

## API

### `stubModelLayer(script: Script): Layer<LanguageModel.LanguageModel>`

Builds a Layer that returns scripted response parts.

```ts
type Script = {
  generateText?:
    | Array<Response.PartEncoded>
    | ((opts: LanguageModel.ProviderOptions) =>
        Array<Response.PartEncoded> | Effect.Effect<Array<Response.PartEncoded>>)
  streamText?:
    | Array<Response.StreamPartEncoded>
    | ((opts: LanguageModel.ProviderOptions) =>
        Array<Response.StreamPartEncoded> | Stream.Stream<Response.StreamPartEncoded>)
}
```

When passing a function, you can return different responses per call — useful for multi-turn flows.

### `failingModelLayer(buildReason?): Layer<LanguageModel.LanguageModel>`

Returns a Layer whose `generateText` and `streamText` always fail with a synthetic `AiError` wrapping the supplied reason. Default reason is `UnknownError`.

```ts
import { failingModelLayer, rateLimit, authError } from "../src/stub-model.ts"

const lim = failingModelLayer(rateLimit)    // 429-equivalent
const ae  = failingModelLayer(authError)    // 502-equivalent
```

## Part builders

| Builder                                | What it produces                                          |
| -------------------------------------- | --------------------------------------------------------- |
| `text(s)`                              | `{ type: "text", text: s }`                               |
| `toolCall(id, name, params)`           | A tool-call part (non-streaming)                          |
| `finish(reason?)`                      | A finish part with the required encoded shape             |
| `textStart(id?)`, `textDelta(s, id?)`, `textEnd(id?)` | Streaming text part triplet                |
| `toolCallStream(id, name, params)`     | Streaming tool-call part                                  |
| `finishStream(reason?)`                | Streaming finish part                                     |

## Quirk worth knowing

In `effect@4.0.0-beta.73` the schema parser requires `response: undefined` as an **explicit key** on `FinishPartEncoded`, not omitted. The `finish()` and `finishStream()` builders set this for you. If you hand-roll a finish part, do likewise:

```ts
{
  type: "finish",
  reason: "stop",
  usage: { ... },
  response: undefined    // ← must be present, even if undefined
}
```

This may change in later betas.

## Example: scripting a multi-turn approval flow

See `scripts/smoke.ts`'s `smoke03` for the canonical pattern — alternating per-call responses with a closure-captured counter.
