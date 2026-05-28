// 03 · approval-gated
//
// Hero feature: Tool.make({ needsApproval: true }) — a tool that REFUSES to
// execute until the caller approves it on a subsequent turn. This is
// human-in-the-loop, first-class in the type system.
//
// What would suck in vanilla SDKs:
//   - Every approval flow is bolt-on. You build a "pending tool calls" table,
//     thread approval ids through your protocol, and remember to gate side
//     effects. Easy to get wrong. Easy to forget. Hard to audit.
//
// Public surface:
//   ApprovalGatedAgent.requestDelete(filename) — turn 1
//   ApprovalGatedAgent.approve({ approvalId, approved, prevMessages, filename }) — turn 2
//
//   Returns { kind: "pending", approvalId } | { kind: "done", text }

import { Effect, Schema } from "effect"
import { LanguageModel, Prompt, Tool, Toolkit } from "effect/unstable/ai"

// ──────────────────────────────────────────────────────────────────
// In-memory "workspace". Real Worker version would back this with a DO.
// ──────────────────────────────────────────────────────────────────

export interface Workspace {
  readonly list: () => Effect.Effect<ReadonlyArray<string>>
  readonly remove: (name: string) => Effect.Effect<boolean>
}

export const makeInMemoryWorkspace = (initial: ReadonlyArray<string>): Workspace => {
  const files = new Set(initial)
  return {
    list: () => Effect.sync(() => [...files].sort()),
    remove: (name: string) => Effect.sync(() => files.delete(name))
  }
}

// ──────────────────────────────────────────────────────────────────
// Tools — two of them. ListFiles is free; DeleteFile needs approval.
// ──────────────────────────────────────────────────────────────────

const ListFiles = Tool.make("ListFiles", {
  description: "List the files in the workspace.",
  parameters: Schema.Struct({}),
  success: Schema.Struct({ files: Schema.Array(Schema.String) })
})

const DeleteFile = Tool.make("DeleteFile", {
  description: "Permanently delete a file from the workspace. Destructive.",
  parameters: Schema.Struct({ name: Schema.String }),
  success: Schema.Struct({ deleted: Schema.Boolean, name: Schema.String }),
  // ★ first-class human-in-the-loop. Set to a function to gate dynamically.
  needsApproval: true
}).annotate(Tool.Destructive, true)

export const ApprovalKit = Toolkit.make(ListFiles, DeleteFile)

export const makeApprovalKitLayer = (ws: Workspace) =>
  ApprovalKit.toLayer({
    ListFiles: () => Effect.map(ws.list(), (files) => ({ files })),
    DeleteFile: ({ name }) => Effect.map(ws.remove(name), (deleted) => ({ deleted, name }))
  })

// ──────────────────────────────────────────────────────────────────
// Turn 1: ask the model to delete a file. Because DeleteFile is gated,
// the model emits a tool-call AND a tool-approval-request part, then
// stops. NO SIDE EFFECT happens.
// ──────────────────────────────────────────────────────────────────

export type PendingResult = {
  readonly kind: "pending"
  readonly approvalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly params: Record<string, unknown>
  readonly messages: ReadonlyArray<Prompt.Message>
}

export type DoneResult = {
  readonly kind: "done"
  readonly text: string
}

const userMsg = (text: string): Prompt.Message =>
  Prompt.userMessage({ content: [Prompt.textPart({ text })] })

export const requestAction = (
  ws: Workspace,
  instruction: string
): Effect.Effect<PendingResult | DoneResult, unknown, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const messages: Array<Prompt.Message> = [
      Prompt.systemMessage({
        content:
          "You are a workspace assistant. Use ListFiles to see what's there. " +
          "Use DeleteFile to remove files when asked. Reply briefly after."
      }),
      userMsg(instruction)
    ]

    const response = yield* LanguageModel.generateText({
      prompt: messages,
      toolkit: ApprovalKit
    })

    // Look for a pending approval request.
    for (const part of response.content as ReadonlyArray<any>) {
      if (part.type === "tool-approval-request") {
        // Find the matching tool-call to pull params from.
        const call = (response.content as ReadonlyArray<any>).find(
          (p) => p.type === "tool-call" && p.id === part.toolCallId
        )
        return {
          kind: "pending" as const,
          approvalId: part.approvalId,
          toolCallId: part.toolCallId,
          toolName: call?.name ?? "<unknown>",
          params: (call?.params ?? {}) as Record<string, unknown>,
          // The caller will replay these messages + their decision in turn 2.
          messages: [...messages, ...promptFromResponse(response.content as ReadonlyArray<any>)]
        }
      }
    }

    return { kind: "done" as const, text: response.text }
  }).pipe(Effect.provide(makeApprovalKitLayer(ws)))

// ──────────────────────────────────────────────────────────────────
// Turn 2: caller decides. Replay messages + append a
// tool-approval-response. The agent re-runs; on approve, the tool
// actually executes and the model continues. On deny, the tool is
// reported as denied and the model wraps up without side effect.
// ──────────────────────────────────────────────────────────────────

export const decide = (
  ws: Workspace,
  pending: PendingResult,
  approved: boolean
): Effect.Effect<DoneResult, unknown, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const decisionMessage = Prompt.toolMessage({
      content: [Prompt.toolApprovalResponsePart({ approvalId: pending.approvalId, approved })]
    } as any) as Prompt.Message

    const response = yield* LanguageModel.generateText({
      prompt: [...pending.messages, decisionMessage],
      toolkit: ApprovalKit
    })

    return { kind: "done" as const, text: response.text || (approved ? "(done)" : "(denied)") }
  }).pipe(Effect.provide(makeApprovalKitLayer(ws)))

// ──────────────────────────────────────────────────────────────────
// Helper: convert response parts back to prompt parts for replay.
// ──────────────────────────────────────────────────────────────────

const promptFromResponse = (parts: ReadonlyArray<any>): Array<Prompt.Message> => {
  // Group all model-side parts into a single assistant message so the
  // approval-response in the next turn correctly resolves the request.
  const assistantContent: Array<any> = []
  for (const p of parts) {
    if (p.type === "text") {
      assistantContent.push(Prompt.textPart({ text: p.text as string }))
    } else if (p.type === "tool-call") {
      assistantContent.push(
        Prompt.makePart("tool-call", {
          id: p.id,
          name: p.name,
          params: p.params,
          providerExecuted: p.providerExecuted ?? false
        })
      )
    } else if (p.type === "tool-approval-request") {
      assistantContent.push(
        Prompt.makePart("tool-approval-request", {
          approvalId: p.approvalId,
          toolCallId: p.toolCallId
        })
      )
    }
  }
  return assistantContent.length
    ? [Prompt.assistantMessage({ content: assistantContent } as any) as Prompt.Message]
    : []
}

// ──────────────────────────────────────────────────────────────────
// Local entrypoint — drives the full request → approve OR deny flow.
// ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { modelLayer, providerFromEnv } = await import("../../src/model.ts")
  const decision = (process.argv[2] ?? "approve") as "approve" | "deny"
  const file = process.argv[3] ?? "notes.md"

  const ws = makeInMemoryWorkspace(["notes.md", "README.md", "todo.md"])
  const Layer = modelLayer(providerFromEnv())

  console.log(`📂 workspace: ${(await Effect.runPromise(ws.list())).join(", ")}`)

  const pending = await Effect.runPromise(
    requestAction(ws, `Please delete ${file}.`).pipe(Effect.provide(Layer))
  )

  if (pending.kind === "done") {
    console.log(`✅ agent finished without approval: ${pending.text}`)
    process.exit(0)
  }

  console.log(`⏸  pending approval: tool=${pending.toolName} params=${JSON.stringify(pending.params)}`)
  console.log(`📂 workspace AFTER turn 1: ${(await Effect.runPromise(ws.list())).join(", ")}  (unchanged — proves no side effect)`)

  const final = await Effect.runPromise(
    decide(ws, pending, decision === "approve").pipe(Effect.provide(Layer))
  )
  console.log(`✅ turn 2 (${decision}): ${final.text}`)
  console.log(`📂 workspace AFTER turn 2: ${(await Effect.runPromise(ws.list())).join(", ")}`)
}
