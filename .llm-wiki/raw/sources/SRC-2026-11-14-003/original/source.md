# External Store Runtime
URL: /docs/api-reference/external-store/runtime

Runtime components, options, and adapters for using assistant-ui with externally owned chat state.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

## API Reference

### ExternalStoreAdapter

- `unstable_persistsHistory?`: `boolean | undefined` (experimental) — The runtime writes its messages to the thread list's history adapter itself, so \`useExternalStoreRuntime\` does not copy them.

- `isDisabled?`: `boolean | undefined` — Whether the entire thread is disabled. When \`true\`, the composer input cannot be typed into, attachments cannot be added, sends (including direct \`composer.send()\` calls) are blocked, and messages cannot be edited. For a narrower gate that keeps the input usable but blocks only sending, use \`isSendDisabled\`.

- `isSendDisabled?`: `boolean | undefined` — Whether sending new messages is currently disabled. When \`true\`, the thread composer's input remains usable but \`send()\` becomes a no-op and the thread composer's \`canSend\` is \`false\`. Use this to gate sending on external React state (e.g. while tool config is loading) without disabling the input itself the way \`isDisabled\` does. Edit composers (saving message edits) intentionally ignore this flag.

- `isRunning?`: `boolean | undefined` — Whether the thread is running. When provided, this value flows directly to \`thread.isRunning\`, letting the application keep the thread in a running state even after the last assistant message has completed (for example while non-message stream chunks like suggestions or metadata updates are still arriving). When omitted, \`thread.isRunning\` falls back to the last-message-status heuristic.

- `canResume?`: `boolean | undefined` — Opt in only while an interrupted run has a resumable checkpoint. Requires onResume; do not set this for cancellation that permanently ends a run. Resuming must preserve the existing message and tool execution state.

- `activeRunId?`: `string | undefined` — The current run's id, kept through \`cancelRun\` so its late calls can be discarded.

- `isLoading?`: `boolean | undefined`

- `hasEarlier?`: `boolean | undefined` — Whether messages exist before the first one in \`messages\`, for a host that opens a long thread on its latest page. Only takes effect together with \`onLoadEarlier\`.

- `onLoadEarlier?`: `(() => Promise<void>) | undefined` — Loads the page before the first message; the host prepends it to \`messages\` (stable message ids keep rendered rows and scroll position in place). The runtime runs one call at a time, reports \`thread.isLoadingEarlier\` until the returned promise settles, and logs a rejection instead of passing it to the caller.

- `messages?`: `readonly T[]`

- `messageRepository?`: `ExportedMessageRepository`

  - `headId?`: `string | null`
  - `messages`: `Array<{ message: ThreadMessage; parentId: string | null; runConfig?: RunConfig; }>`

- `unstable_messageRepositoryInstance?`: `MessageRepository | undefined` (experimental) — An externally owned message repository instance. When provided, the thread runtime adopts it as its branch store and swaps to it atomically whenever a different instance is passed, so hosts that route multiple conversations through one runtime keep each conversation's history and branches isolated in its own instance. Omit it to keep the runtime's own repository. When \`unstable_enableToolInvocations\` is true, frontend tool executions belong to the instance as well: a runtime mounted with an instance whose tools are still executing takes them over, so it reports them as running, stops them on cancel, and resumes their human input requests.

  - `messages`: `Map<string, RepositoryMessage>`

    - `clear`: `() => void`
    - `delete`: `(key: string) => boolean`
    - `forEach`: `(callbackfn: (value: { children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }, key: string, map: Map<string, { children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }>) => void, thisArg?: any) => void`
    - `get`: `(key: string) => ({ children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; })`
    - `has`: `(key: string) => boolean`
    - `set`: `(key: string, value: { children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }) => Map<string, { children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }>`
    - `size`: `number`
    - `entries`: `() => MapIterator<[string, { children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }]>`
    - `keys`: `() => MapIterator<string>`
    - `values`: `() => MapIterator<{ children: string[]; next: (RepositoryParent & { prev: (RepositoryParent & any) | null; current: ThreadMessage; level: number; }) | null; } & { prev: ({ children: string[]; next: (RepositoryParent & any) | null; } & any) | null; current: ThreadMessage; level: number; }>`

  - `head`: `RepositoryMessage | null`

    - `children`: `string[]`

    - `next`: `RepositoryMessage | null`

      - `children`: `string[]`
      - `next`: `RepositoryMessage | null`
      - `prev`: `RepositoryMessage | null`
      - `current`: `ThreadMessage`
      - `level`: `number`

    - `prev`: `RepositoryMessage | null`

      - `children`: `string[]`
      - `next`: `RepositoryMessage | null`
      - `prev`: `RepositoryMessage | null`
      - `current`: `ThreadMessage`
      - `level`: `number`

    - `current`: `ThreadMessage`

      - `status?`: `ThreadAssistantMessage["status"]`
      - `metadata`: `{ /** @deprecated Experimental since 2025-05-20. Not scheduled for removal; the API may change in any release. */ readonly unstable_state?: ReadonlyJSONValue | undefined; /** @deprecated Experimental since 2025-01-27. Not scheduled for removal; the API may change in any release. */ readonly unstable_annotations?: readonly ReadonlyJSONValue[] | undefined; /** @deprecated Experimental since 2025-01-04. Not scheduled for removal; the API may change in any release. */ readonly unstable_data?: readonly ReadonlyJSONValue[] | undefined; readonly steps?: readonly ThreadStep[] | undefined; readonly submittedFeedback?: | { readonly type: "positive" | "negative"; readonly comment?: string; } | undefined; readonly timing?: MessageTiming | undefined; readonly isOptimistic?: boolean; readonly modality?: MessageModality | undefined; readonly custom: Record<string, unknown>; }`
      - `attachments?`: `ThreadUserMessage["attachments"]`
      - `id`: `string`
      - `createdAt`: `Date`
      - `role`: `"system"`
      - `content`: `readonly [TextMessagePart]`

    - `level`: `number`

  - `root`: `RepositoryParent`

    - `children`: `string[]`

    - `next`: `RepositoryMessage | null`

      - `children`: `string[]`
      - `next`: `RepositoryMessage | null`
      - `prev`: `RepositoryMessage | null`
      - `current`: `ThreadMessage`
      - `level`: `number`

  - `updateLevels`: `(message: RepositoryMessage, newLevel: number) => void`

  - `selectPathTo`: `(message: RepositoryMessage) => void`

  - `performOp`: `(newParent: RepositoryMessage | null, child: RepositoryMessage, operation: "cut" | "link" | "relink") => void`

  - `_messages`: `CachedValue<readonly ThreadMessage[]>`

    - `_value`: `T | null`
    - `func`: `() => T`
    - `value`: `readonly ThreadMessage[]`
    - `dirty`: `() => void`

  - `headId`: `string | null`

  - `canonicalHeadId`: `string | null`

  - `getMessages`: `(headId?: string) => readonly ThreadMessage[]`

  - `addOrUpdateMessage`: `(parentId: string | null, message: ThreadMessage) => void`

  - `getMessage`: `(messageId: string) => { parentId: string | null; message: ThreadMessage; index: number; }`

  - `deleteMessage`: `(messageId: string, replacementId?: string | null | undefined) => void`

  - `hasChildren`: `(messageId: string) => boolean`

  - `getBranches`: `(messageId: string) => string[]`

  - `evictOffBranchOptimisticMessages`: `(previousHead: RepositoryMessage | null, currentHead: RepositoryMessage | null) => void` — Evicts optimistic messages (\`metadata.isOptimistic\`) on the branch the head just moved away from. Only that branch is walked, so an optimistic message added off the head branch (such as the server-id copy that replaces a client-id placeholder before the head moves to it) is kept until a \`switchToBranch\` or \`resetHead\` moves the head off the branch it is on. Keeps a client→server id swap from leaving a phantom sibling.

  - `switchToBranch`: `(messageId: string) => void`

  - `setHead`: `(messageId: string | null, pruneChildren: boolean) => void`

  - `resetHead`: `(messageId: string | null) => void`

  - `clear`: `() => void`

  - `export`: `() => ExportedMessageRepository`

  - `exportedHeadId`: `() => string | null` — The head as it would be if the optimistic messages were deleted. An optimistic head resolves to a leaf of the exported tree, so an import returns to the branch that was visible instead of the one its persisted ancestor selects.

  - `exportedChild`: `(parent: RepositoryParent) => RepositoryMessage | null`

  - `import`: `({ headId, messages }: ExportedMessageRepository) => void`

- `suggestions?`: `readonly ThreadSuggestion[] | undefined`

- `state?`: `ReadonlyJSONValue | undefined`

- `extras?`: `unknown`

- `setMessages?`: `((messages: readonly T[]) => void) | undefined` — Applies a message list the runtime rewrote, and is what tells the runtime a removal it makes will survive the next snapshot. Without it, cancelling a run leaves a trailing user message in the thread and the composer untouched; an adapter that removes that message itself owns handing it back, because the runtime cannot see a removal it did not make.

- `onVoiceTranscript?`: `((message: ThreadMessage) => void) | undefined` — Called with each message a voice session adds to the thread: every finalized transcript, and every text message typed into a session that takes typed text (it carries no \`metadata.modality\`). The host appends it to its own messages under the same id, which is how the runtime knows the host carries it. A message that finalizes while \`isLoading\` is true is delivered once loading ends, to the callback on the adapter current at that moment, and is not delivered at all when the conversation changed while it waited. A host that routes conversations through one runtime is recognized by its \`unstable_messageRepositoryInstance\`; one that swaps only its \`messages\` cannot be told apart from a load finishing. A host that does not implement this callback keeps these messages for the session only.

- `unstable_onBranchChange?`: `((event: ExternalStoreBranchChange) => void) | undefined` (experimental) — Fires when the user explicitly switches branches via the runtime's \`switchToBranch\` action (e.g. a BranchPicker click). It does not fire on adapter resync, \`append\`, edit/regenerate, content-only updates, or while the thread is running. Consecutive switches that resolve to the same canonical head are de-duped. \`headId\` is the canonical (persisted) head of the now-visible branch — optimistic/transient ids are never surfaced. \`visibleMessageIds\` lists the visible path in order. This complements \`setMessages\` rather than replacing it: switching still requires \`setMessages\`, and this callback does not on its own enable branch switching.

- `onImport?`: `((messages: readonly ThreadMessage[]) => void) | undefined`

- `onExportExternalState?`: `(() => any) | undefined`

- `onLoadExternalState?`: `((state: any) => void) | undefined`

- `onNew`: `(message: AppendMessage) => Promise<void>`

- `queue?`: `ExternalThreadQueueAdapter | undefined` — Opt in to message queuing. Typically produced by \`createMessageQueue\`.

  - `items`: `readonly QueueItemState[]`
  - `steerItems`: `readonly QueueItemState[]`
  - `enqueue`: `(message: AppendMessage) => void` — Send a message into the queue lane, processed in order.
  - `steer`: `(message: AppendMessage) => void` — Send a message into the steer lane, processed next.
  - `move`: `(queueItemId: string, placement: QueuePlacement) => void` — Move a queued message between lanes or within a lane. An unanchored move into the steer lane mid-run interrupts — cancels the live run and dispatches the item — when the runtime supports cancellation; a move with \`insertAfter\`/\`insertBefore\` only places the item and never interrupts.
  - `edit`: `(queueItemId: string, message: AppendMessage) => void`
  - `remove`: `(queueItemId: string) => void`

- `onEdit?`: `((message: AppendMessage) => Promise<void>) | undefined`

- `onDelete?`: `((messageId: string) => Promise<void> | void) | undefined` — Removes a message from the host's store. The runtime drops the message from its branches when \`messages\` stops carrying the id, and reads a \`messages\` update that still carries it after every call for it has settled as a declined delete. A host that accepts the delete therefore publishes the removal before the returned promise settles. While a branch switch, \`messages\` can omit ids on another branch. A reload or edit can omit messages after an earlier reply. For deletes pending across those changes, the runtime waits for the promise: a rejection keeps the message and a resolution drops it.

- `onReload?`: `((parentId: string | null, config: StartRunConfig) => Promise<void>) | undefined`

- `onResume?`: `((config: ResumeRunConfig) => Promise<void>) | undefined`

- `onCancel?`: `(() => Promise<void>) | undefined`

- `onRefetchThread?`: `(() => Promise<void>) | undefined` — Re-fetches the thread's state from the backing store, in place; a rejection reaches the \`threads.reloadMainThread()\` caller. Unrelated to \`onReload\`, which re-generates an assistant message. The caller does not stop a run in progress first, so an adapter that can stream owns whatever coordination one needs.

- `onAddToolResult?`: `((options: AddToolResultOptions) => Promise<void> | void) | undefined`

- `onResumeToolCall?`: `((options: { toolCallId: string; payload: unknown }) => void) | undefined`

- `onRespondToToolApproval?`: `((options: RespondToToolApprovalOptions) => Promise<void> | void) | undefined`

- `unstable_onRecordToolInteraction?`: `((options: Unstable_RecordToolInteractionOptions) => Promise<void> | void) | undefined` (experimental) — Stores a user interaction on a tool call part of a message this store owns and exposes it on that part's \`unstable_interactions\`. Without it, recording an interaction rejects and nothing is kept.

- `convertMessage?`: `ExternalStoreMessageConverter<T> | undefined`

- `adapters?`: `ExternalStoreAdapter["adapters"]`

  - `attachments?`: `AttachmentAdapter | undefined`

    - `accept`: `string`
    - `add`: `(state: { file: File; }) => Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>` — Returns the pending attachment for the file, or an async generator yielding successive states of that one attachment. Every yield must have the same id.
    - `remove`: `(attachment: Attachment) => Promise<void>`
    - `send`: `(attachment: PendingAttachment, options?: { signal?: AbortSignal; }) => Promise<CompleteAttachment>`

  - `speech?`: `SpeechSynthesisAdapter | undefined`
    - `speak`: `(text: string) => SpeechSynthesisAdapter.Utterance`

  - `dictation?`: `DictationAdapter | undefined`

    - `listen`: `() => DictationAdapter.Session`
    - `disableInputDuringDictation?`: `boolean`

  - `voice?`: `RealtimeVoiceAdapter | undefined`
    - `connect`: `(options: { abortSignal?: AbortSignal; }) => RealtimeVoiceAdapter.Session`

  - `feedback?`: `FeedbackAdapter | undefined`
    - `submit`: `(feedback: FeedbackAdapterFeedback) => void`

  - `threadList?`: `ExternalStoreThreadListAdapter | undefined` (experimental)

    - `threadId?`: `string | undefined` (experimental)
    - `isLoading?`: `boolean | undefined`
    - `threads?`: `readonly ExternalStoreThreadData<"regular">[] | undefined`
    - `archivedThreads?`: `readonly ExternalStoreThreadData<"archived">[] | undefined`
    - `onSwitchToNewThread?`: `(() => Promise<void> | void) | undefined` (experimental)
    - `onSwitchToThread?`: `((threadId: string) => Promise<void> | void) | undefined` (experimental)
    - `onRename?`: `( threadId: string, newTitle: string, ) => (Promise<void> | void) | undefined`
    - `onUpdateCustom?`: `(( threadId: string, custom: Record<string, unknown> | undefined, ) => Promise<void> | void) | undefined`
    - `onArchive?`: `((threadId: string) => Promise<void> | void) | undefined`
    - `onUnarchive?`: `((threadId: string) => Promise<void> | void) | undefined`
    - `onDelete?`: `((threadId: string) => Promise<void> | void) | undefined`

- `unstable_capabilities?`: `ExternalStoreAdapter["unstable_capabilities"]` (experimental)
  - `copy?`: `boolean | undefined`

- `unstable_enableToolInvocations?`: `boolean | undefined` (experimental) — Opt in to the built-in client-side tool-invocations pipeline (\`streamCall\` / \`execute\` / tool-status tracking) for this thread. Defaults to \`false\` — the runtime does \*not\* drive client-side tool callbacks on its own. Set to \`true\` to have the runtime construct a \`ToolInvocationTracker\` and feed every snapshot through it, so tool callbacks fire automatically for tool-call parts in \`messages\`. Opt-in by default because most external-store runtimes either run tools entirely server-side, or already wire their own client-side dispatch path. Enabling the embedded tracker on top of an existing dispatch path would cause tool callbacks to run twice. When enabled, client-side tool results (from \`execute()\` returning, or from \`streamCall\` resolving) flow back through \`adapter.onAddToolResult\` like any other tool result, with \`modelContent\` populated when present.

- `unstable_isClientToolCall?`: `((toolCall: ToolCallMessagePart) => boolean | undefined) | undefined` (experimental) — Decides whether a tool call's result is produced on the client. Only consulted when \`unstable_enableToolInvocations\` is \`true\`. A provider that runs tools itself answers its own calls, and its result arrives one or more snapshots after the call's arguments complete. In that window the call is complete and result-less, so a registered tool of the same name would otherwise execute locally and produce a result the provider never asked for. An adapter that can tell the two apart supplies this predicate; it is first read when the call is observed live. The predicate is also what licenses running a frontend tool while the provider's run is still open. Without it, ownership is unknown until the run ends, so a registered tool executes only once the run's outcome is known and cannot fire on a call the provider was about to answer or gate. Return \`undefined\` for a call the adapter cannot classify. An initial \`true\` answer marks the call client-owned and is retained. An initial \`false\` answer on a running snapshot permanently skips client execution. An initial \`undefined\` defers ownership and is asked again when the run settles, before the call is handed to the executor. On a settled snapshot, \`false\` defers ownership and holds the call without executing, skipping, or warning, whether read when the entry is created or on a later check. The predicate is asked again on every later settled snapshot. An \`undefined\` answer clears the deferral and allows normal client execution; \`true\` clears the deferral and marks the call client-owned. A call that already has a result only clears the deferral, without asking the predicate again or executing locally.

- `setToolStatuses?`: `((statuses: Record<string, ToolExecutionStatus>) => void) | undefined` — Receives the current per-tool-call execution status map whenever it changes. Only invoked when \`unstable_enableToolInvocations\` is \`true\` — the runtime maintains the map via the embedded tracker. Wire this into local React state and feed it into the converter's \`metadata.toolStatuses\` so the UI can render \`executing\` spinners and human-input prompts.

### ExternalThread

- `0`: `ExternalThreadProps`

  - `messages`: `readonly ExternalThreadMessage[]`

  - `isRunning?`: `boolean`

  - `isLoading?`: `boolean | undefined`

  - `hasEarlier?`: `boolean | undefined` — Whether messages exist before the first one in \`messages\`; takes effect with \`onLoadEarlier\`.

  - `onLoadEarlier?`: `(() => Promise<void>) | undefined` — Loads the page before the first message, which the host prepends to \`messages\`; one call runs at a time.

  - `state?`: `ReadonlyJSONValue | undefined`

  - `extras?`: `unknown`

  - `isSendDisabled?`: `boolean` — Whether sending new messages is currently disabled. When \`true\`, the thread composer's input remains usable but \`send()\` is a no-op and \`composer.canSend\` is \`false\`. Edit composers (saving message edits) intentionally ignore this flag.

  - `onNew?`: `(message: AppendMessage) => void` — Callback for new messages (non-queue runtimes).

  - `onEdit?`: `(message: AppendMessage) => void`

  - `onReload?`: `(parentId: string | null) => void`

  - `onStartRun?`: `() => void`

  - `onCancel?`: `() => void`

  - `onResume?`: `((config: CreateResumeRunConfig) => void | Promise<void>) | undefined` — Resume the existing run from its checkpoint without appending a user message.

  - `canResume?`: `boolean | undefined` — True only while a checkpoint is available; requires onResume.

  - `onRefetchThread?`: `(() => Promise<void>) | undefined` — Handler for re-fetching this thread's state in place, driving \`threads.reloadMainThread()\`. Unrelated to \`onReload\`, which re-generates an assistant message. Presence enables the \`refetchThread\` capability; rejections propagate to the caller.

  - `onAddToolResult?`: `((options: AddToolResultOptions) => void) | undefined`

  - `onResumeToolCall?`: `((options: ResumeToolCallOptions) => void) | undefined` — Callback for resuming a tool call that is waiting for human input.

  - `onLoadExternalState?`: `((state: unknown) => void) | undefined`

  - `attachmentAdapter?`: `AttachmentAdapter | undefined`

    - `accept`: `string`
    - `add`: `(state: { file: File; }) => Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>` — Returns the pending attachment for the file, or an async generator yielding successive states of that one attachment. Every yield must have the same id.
    - `remove`: `(attachment: Attachment) => Promise<void>`
    - `send`: `(attachment: PendingAttachment, options?: { signal?: AbortSignal; }) => Promise<CompleteAttachment>`

  - `feedbackAdapter?`: `FeedbackAdapter | undefined`
    - `submit`: `(feedback: FeedbackAdapterFeedback) => void`

  - `speechAdapter?`: `SpeechSynthesisAdapter | undefined`
    - `speak`: `(text: string) => SpeechSynthesisAdapter.Utterance`

  - `queue?`: `ExternalThreadQueueAdapter` — Queue adapter for runtimes that support message queuing and steering.

    - `items`: `readonly QueueItemState[]`
    - `steerItems`: `readonly QueueItemState[]`
    - `enqueue`: `(message: AppendMessage) => void` — Send a message into the queue lane, processed in order.
    - `steer`: `(message: AppendMessage) => void` — Send a message into the steer lane, processed next.
    - `move`: `(queueItemId: string, placement: QueuePlacement) => void` — Move a queued message between lanes or within a lane. An unanchored move into the steer lane mid-run interrupts — cancels the live run and dispatches the item — when the runtime supports cancellation; a move with \`insertAfter\`/\`insertBefore\` only places the item and never interrupts.
    - `edit`: `(queueItemId: string, message: AppendMessage) => void`
    - `remove`: `(queueItemId: string) => void`

  - `branches?`: `ExternalThreadBranchAdapter` — Branch adapter for runtimes that track sibling variants of messages.

    - `getBranches`: `(messageId: string) => readonly string[]` — Returns the sibling branch ids for a message in display order, including the message's own id. Return an empty array for messages without alternative branches.
    - `switchToBranch`: `(branchId: string) => void` — Makes the given branch the visible one. The runtime is expected to swap the \`messages\` array to the selected branch. May be invoked programmatically while a run is in progress; pending queue items are not cleared, and reconciling them with the new branch is the runtime's responsibility.

  - `onRespondToToolApproval?`: `( options: RespondToToolApprovalOptions, ) => void | Promise<void>` — Callback for tool approval decisions. Absent: responding to an approval throws a capability error.

  - `unstable_onRecordToolInteraction?`: `((options: Unstable_RecordToolInteractionOptions) => void | Promise<void>) | undefined` (experimental)

- `length`: `1`

- `toString`: `() => string`

- `toLocaleString`: `{ (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; }`

- `pop`: `() => ExternalThreadProps`

- `push`: `(...items: ExternalThreadProps[]) => number`

- `concat`: `{ (...items: ConcatArray<ExternalThreadProps>[]): ExternalThreadProps[]; (...items: (ExternalThreadProps | ConcatArray<ExternalThreadProps>)[]): ExternalThreadProps[]; }`

- `join`: `(separator?: string) => string`

- `reverse`: `() => ExternalThreadProps[]`

- `shift`: `() => ExternalThreadProps`

- `slice`: `(start?: number, end?: number) => ExternalThreadProps[]`

- `sort`: `(compareFn?: ((a: ExternalThreadProps, b: ExternalThreadProps) => number) | undefined) => [ExternalThreadProps]`

- `splice`: `{ (start: number, deleteCount?: number): ExternalThreadProps[]; (start: number, deleteCount: number, ...items: ExternalThreadProps[]): ExternalThreadProps[]; }`

- `unshift`: `(...items: ExternalThreadProps[]) => number`

- `indexOf`: `(searchElement: ExternalThreadProps, fromIndex?: number) => number`

- `lastIndexOf`: `(searchElement: ExternalThreadProps, fromIndex?: number) => number`

- `every`: `{ <S>(predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => value is S, thisArg?: any): this is S[]; (predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => unknown, thisArg?: any): boolean; }`

- `some`: `(predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => unknown, thisArg?: any) => boolean`

- `forEach`: `(callbackfn: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => void, thisArg?: any) => void`

- `map`: `<U>(callbackfn: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => U, thisArg?: any) => U[]`

- `filter`: `{ <S>(predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => value is S, thisArg?: any): S[]; (predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => unknown, thisArg?: any): ExternalThreadProps[]; }`

- `reduce`: `{ (callbackfn: (previousValue: ExternalThreadProps, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => ExternalThreadProps): ExternalThreadProps; (callbackfn: (previousValue: ExternalThreadProps, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => ExternalThreadProps, initialValue: ExternalThreadProps): ExternalThreadProps; <U>(callbackfn: (previousValue: U, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => U, initialValue: U): U; }`

- `reduceRight`: `{ (callbackfn: (previousValue: ExternalThreadProps, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => ExternalThreadProps): ExternalThreadProps; (callbackfn: (previousValue: ExternalThreadProps, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => ExternalThreadProps, initialValue: ExternalThreadProps): ExternalThreadProps; <U>(callbackfn: (previousValue: U, currentValue: ExternalThreadProps, currentIndex: number, array: ExternalThreadProps[]) => U, initialValue: U): U; }`

- `find`: `{ <S>(predicate: (value: ExternalThreadProps, index: number, obj: ExternalThreadProps[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: ExternalThreadProps, index: number, obj: ExternalThreadProps[]) => unknown, thisArg?: any): ExternalThreadProps | undefined; }`

- `findIndex`: `(predicate: (value: ExternalThreadProps, index: number, obj: ExternalThreadProps[]) => unknown, thisArg?: any) => number`

- `fill`: `(value: ExternalThreadProps, start?: number, end?: number) => [ExternalThreadProps]`

- `copyWithin`: `(target: number, start: number, end?: number) => [ExternalThreadProps]`

- `entries`: `() => ArrayIterator<[number, ExternalThreadProps]>`

- `keys`: `() => ArrayIterator<number>`

- `values`: `() => ArrayIterator<ExternalThreadProps>`

- `includes`: `(searchElement: ExternalThreadProps, fromIndex?: number) => boolean`

- `flatMap`: `<U, This>(callback: (this: This, value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => U | readonly U[], thisArg?: This | undefined) => U[]`

- `flat`: `<A, D>(this: A, depth?: D | undefined) => FlatArray<A, D>[]`

- `at`: `(index: number) => ExternalThreadProps`

- `findLast`: `{ <S>(predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => unknown, thisArg?: any): ExternalThreadProps | undefined; }`

- `findLastIndex`: `(predicate: (value: ExternalThreadProps, index: number, array: ExternalThreadProps[]) => unknown, thisArg?: any) => number`

- `toReversed`: `() => ExternalThreadProps[]`

- `toSorted`: `(compareFn?: ((a: ExternalThreadProps, b: ExternalThreadProps) => number) | undefined) => ExternalThreadProps[]`

- `toSpliced`: `{ (start: number, deleteCount: number, ...items: ExternalThreadProps[]): ExternalThreadProps[]; (start: number, deleteCount?: number): ExternalThreadProps[]; }`

- `with`: `(index: number, value: ExternalThreadProps) => ExternalThreadProps[]`

### ExternalThreadProps

- `messages`: `readonly ExternalThreadMessage[]`

- `isRunning?`: `boolean`

- `isLoading?`: `boolean | undefined`

- `hasEarlier?`: `boolean | undefined` — Whether messages exist before the first one in \`messages\`; takes effect with \`onLoadEarlier\`.

- `onLoadEarlier?`: `(() => Promise<void>) | undefined` — Loads the page before the first message, which the host prepends to \`messages\`; one call runs at a time.

- `state?`: `ReadonlyJSONValue | undefined`

- `extras?`: `unknown`

- `isSendDisabled?`: `boolean` — Whether sending new messages is currently disabled. When \`true\`, the thread composer's input remains usable but \`send()\` is a no-op and \`composer.canSend\` is \`false\`. Edit composers (saving message edits) intentionally ignore this flag.

- `onNew?`: `(message: AppendMessage) => void` — Callback for new messages (non-queue runtimes).

- `onEdit?`: `(message: AppendMessage) => void`

- `onReload?`: `(parentId: string | null) => void`

- `onStartRun?`: `() => void`

- `onCancel?`: `() => void`

- `onResume?`: `((config: CreateResumeRunConfig) => void | Promise<void>) | undefined` — Resume the existing run from its checkpoint without appending a user message.

- `canResume?`: `boolean | undefined` — True only while a checkpoint is available; requires onResume.

- `onRefetchThread?`: `(() => Promise<void>) | undefined` — Handler for re-fetching this thread's state in place, driving \`threads.reloadMainThread()\`. Unrelated to \`onReload\`, which re-generates an assistant message. Presence enables the \`refetchThread\` capability; rejections propagate to the caller.

- `onAddToolResult?`: `((options: AddToolResultOptions) => void) | undefined`

- `onResumeToolCall?`: `((options: ResumeToolCallOptions) => void) | undefined` — Callback for resuming a tool call that is waiting for human input.

- `onLoadExternalState?`: `((state: unknown) => void) | undefined`

- `attachmentAdapter?`: `AttachmentAdapter | undefined`

  - `accept`: `string`
  - `add`: `(state: { file: File; }) => Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>` — Returns the pending attachment for the file, or an async generator yielding successive states of that one attachment. Every yield must have the same id.
  - `remove`: `(attachment: Attachment) => Promise<void>`
  - `send`: `(attachment: PendingAttachment, options?: { signal?: AbortSignal; }) => Promise<CompleteAttachment>`

- `feedbackAdapter?`: `FeedbackAdapter | undefined`
  - `submit`: `(feedback: FeedbackAdapterFeedback) => void`

- `speechAdapter?`: `SpeechSynthesisAdapter | undefined`
  - `speak`: `(text: string) => SpeechSynthesisAdapter.Utterance`

- `queue?`: `ExternalThreadQueueAdapter` — Queue adapter for runtimes that support message queuing and steering.

  - `items`: `readonly QueueItemState[]`
  - `steerItems`: `readonly QueueItemState[]`
  - `enqueue`: `(message: AppendMessage) => void` — Send a message into the queue lane, processed in order.
  - `steer`: `(message: AppendMessage) => void` — Send a message into the steer lane, processed next.
  - `move`: `(queueItemId: string, placement: QueuePlacement) => void` — Move a queued message between lanes or within a lane. An unanchored move into the steer lane mid-run interrupts — cancels the live run and dispatches the item — when the runtime supports cancellation; a move with \`insertAfter\`/\`insertBefore\` only places the item and never interrupts.
  - `edit`: `(queueItemId: string, message: AppendMessage) => void`
  - `remove`: `(queueItemId: string) => void`

- `branches?`: `ExternalThreadBranchAdapter` — Branch adapter for runtimes that track sibling variants of messages.

  - `getBranches`: `(messageId: string) => readonly string[]` — Returns the sibling branch ids for a message in display order, including the message's own id. Return an empty array for messages without alternative branches.
  - `switchToBranch`: `(branchId: string) => void` — Makes the given branch the visible one. The runtime is expected to swap the \`messages\` array to the selected branch. May be invoked programmatically while a run is in progress; pending queue items are not cleared, and reconciling them with the new branch is the runtime's responsibility.

- `onRespondToToolApproval?`: `( options: RespondToToolApprovalOptions, ) => void | Promise<void>` — Callback for tool approval decisions. Absent: responding to an approval throws a capability error.

- `unstable_onRecordToolInteraction?`: `((options: Unstable_RecordToolInteractionOptions) => void | Promise<void>) | undefined` (experimental)

### ExternalThreadQueueAdapter

The queue surface a runtime exposes so the composer can stay usable during a run and render the pending messages.

- `items`: `readonly QueueItemState[]`
- `steerItems`: `readonly QueueItemState[]`
- `enqueue`: `(message: AppendMessage) => void` — Send a message into the queue lane, processed in order.
- `steer`: `(message: AppendMessage) => void` — Send a message into the steer lane, processed next.
- `move`: `(queueItemId: string, placement: QueuePlacement) => void` — Move a queued message between lanes or within a lane. An unanchored move into the steer lane mid-run interrupts — cancels the live run and dispatches the item — when the runtime supports cancellation; a move with \`insertAfter\`/\`insertBefore\` only places the item and never interrupts.
- `edit`: `(queueItemId: string, message: AppendMessage) => void`
- `remove`: `(queueItemId: string) => void`

### pickExternalStoreSharedOptions

```
const pickExternalStoreSharedOptions: (options: ExternalStoreSharedOptions) => ExternalStoreSharedOptions;
```

### useExternalStoreRuntime

- `store`: `ExternalStoreAdapter<T>`

### useExternalStoreSharedOptions

- `options`: `ExternalStoreSharedOptions`

  - `suggestions?`: `readonly ThreadSuggestion[] | undefined`
  - `isDisabled?`: `boolean | undefined` — Whether the entire thread is disabled. When \`true\`, the composer input cannot be typed into, attachments cannot be added, sends (including direct \`composer.send()\` calls) are blocked, and messages cannot be edited. For a narrower gate that keeps the input usable but blocks only sending, use \`isSendDisabled\`.
  - `isSendDisabled?`: `boolean | undefined` — Whether sending new messages is currently disabled. When \`true\`, the thread composer's input remains usable but \`send()\` becomes a no-op and the thread composer's \`canSend\` is \`false\`. Use this to gate sending on external React state (e.g. while tool config is loading) without disabling the input itself the way \`isDisabled\` does. Edit composers (saving message edits) intentionally ignore this flag.
  - `unstable_capabilities?`: `ExternalStoreSharedOptions["unstable_capabilities"]` (experimental)
    - `copy?`: `boolean | undefined`