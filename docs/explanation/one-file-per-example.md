# One file per example

Each `examples/<NN-name>/` contains exactly:

```
agent.ts       (~100–220 lines)
README.md      (~25 lines)
```

That's it. No subdirectories. No `index.ts`, no `tools/`, no `schemas/`, no `prompts/`. Why?

## Reading speed is a feature

A new visitor lands on the README, sees the gallery table, clicks `[parallel-research]`, and lands on `examples/01-parallel-research/agent.ts`. They should be able to read the whole example in one screen-and-a-half *with no jumping between files*. That's how patterns transfer.

If the example needed three files to be intelligible, it would be the wrong example to ship.

## The constraint forces good size

If an example gets too big to fit in one file, it's not a "hero example" anymore — it's an application. We move it out of `examples/` and into a separate repo before it becomes the latter.

The five current examples land at 100–220 LOC each. That's the sweet spot: small enough to read in one go, large enough to demonstrate a non-trivial Effect feature with real structure.

## The Worker is the only cross-example seam

`worker/worker.ts` imports from all five examples. Nothing else does. Examples do not import each other. The Worker exists because mounting all five behind one fetch handler is genuinely useful — but it is *not* an example. It is a *runtime*.

## What ships in each file

By convention (not enforcement), every example file has these sections in order, separated by horizontal-rule comments:

1. A docstring at the top explaining the hero feature, what it would suck to do without Effect, and the public surface.
2. Schema / tool definitions.
3. Tool handlers / Layer construction.
4. The exported agent function.
5. The local CLI block (`if (import.meta.main)`).

The smoke test sits in `scripts/smoke.ts` separately — the *example* file should not contain test code. We don't want a reader to scroll past 200 lines of assertions to get to the next concept.

## What this constraint implies

- We will *never* add a tutorial-style multi-file example to `examples/`. Multi-file examples live in `docs/tutorials/` as prose with embedded code blocks, or in a separate scaffold repo.
- We will not add a sixth example just because it's interesting; it has to fit, and the gallery has to read as one continuous narrative of "what Effect gives you for free."

## Where complexity goes when it spills

If a future example legitimately needs shared code (e.g. a workspace abstraction used by both approval-gated and another approval example), that shared code goes in `src/`. We've already done this for `src/model.ts`. The rule of thumb: anything imported by **two or more** examples belongs in `src/`. Anything imported by exactly one example stays in that example's file.
