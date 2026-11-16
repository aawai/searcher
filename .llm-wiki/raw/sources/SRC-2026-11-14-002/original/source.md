# Message Conversion
URL: /docs/api-reference/external-store/message-conversion

Convert external message formats into assistant-ui's message and thread state for the external store runtime.

> For AI agents: a documentation index is available at [llms.txt](/llms.txt). Use `.md` for canonical markdown pages; `.mdx` is kept as a backwards-compatible alias on supported URL paths.

## API Reference

### getExternalStoreMessages

```
const getExternalStoreMessages: <T>(input: { messages: readonly ThreadMessage[]; } | ThreadMessage | ThreadMessage["content"][number]) => T[];
```

### useExternalMessageConverter

- `options`: `{ callback: useExternalMessageConverter.Callback<T>; messages: T[]; isRunning: boolean; joinStrategy?: JoinStrategy | undefined; metadata?: useExternalMessageConverter.Metadata | undefined; getMetadataKey?: useExternalMessageConverter.GetMetadataKey<T> | undefined; }`

  - `callback`: `useExternalMessageConverter.Callback<T>`

  - `messages`: `T[]`

  - `isRunning`: `boolean`

  - `joinStrategy?`: `JoinStrategy | undefined`

  - `metadata?`: `useExternalMessageConverter.Metadata | undefined`

    - `toolStatuses?`: `Record<string, ToolExecutionStatus>`

    - `error?`: `ReadonlyJSONValue`

    - `cancelledMessageIds?`: `ReadonlySet<string>`

      - `forEach`: `(callbackfn: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: any) => void`
      - `has`: `(value: string) => boolean`
      - `size`: `number`
      - `entries`: `() => SetIterator<[string, string]>`
      - `keys`: `() => SetIterator<string>`
      - `values`: `() => SetIterator<string>`

    - `messageTiming?`: `Record<string, MessageTiming>`

  - `getMetadataKey?`: `useExternalMessageConverter.GetMetadataKey<T> | undefined` — Returns the metadata dependency for one message. The value must change whenever metadata read by the callback for that message changes and remain stable while those values are unchanged. Prefer a primitive or an object whose identity is preserved across renders. Defaults to the complete metadata object identity.

### bindExternalStoreMessage

> [!tip]
>
> **Experimental.** Shipped 2026-02-25; it may change in any release.

Attach the original external store message(s) to a ThreadMessage or message part. This is a no-op if the target already has a bound message. Use `getExternalStoreMessages` to retrieve the bound messages later.

```
const bindExternalStoreMessage: <T>(target: object, message: T | T[]) => void;
```

### unstable_convertExternalMessages

> [!tip]
>
> **Experimental.** Shipped 2025-01-26; it may change in any release.

```
const unstable_convertExternalMessages: <T extends WeakKey>(messages: T[], callback: useExternalMessageConverter.Callback<T>, isRunning: boolean, metadata: useExternalMessageConverter.Metadata, cache?: ExternalMessageConversionCache) => ThreadMessage[];
```

### unstable_createExternalMessageConversionCache

> [!tip]
>
> **Experimental.** Shipped 2026-09-15; it may change in any release.

Creates a cache for plain external message conversion. Pass the same cache on every call for one message list, and a source message that has not changed since the previous call converts to the same `ThreadMessage` object.

Entries are keyed by source message identity and rebuilt whenever `callback` or `metadata` is a different object than on the previous call, so keep both referentially stable.

```
const unstable_createExternalMessageConversionCache: () => ExternalMessageConversionCache;
```

### unstable_createMessageConverter

> [!tip]
>
> **Experimental.** Shipped 2025-02-02; it may change in any release.

```
const unstable_createMessageConverter: <T extends object>(callback: useExternalMessageConverter.Callback<T>) => { useThreadMessages: ({ messages, isRunning, joinStrategy, metadata, }: { messages: T[]; isRunning: boolean; joinStrategy?: JoinStrategy | undefined; metadata?: useExternalMessageConverter.Metadata; }) => ThreadMessage[]; toThreadMessages: (messages: T[], isRunning?: boolean, metadata?: useExternalMessageConverter.Metadata) => ThreadMessage[]; toOriginalMessages: (input: ThreadRuntimeState | ThreadMessage | ThreadMessage["content"][number]) => unknown[]; toOriginalMessage: (input: ThreadRuntimeState | ThreadMessage | ThreadMessage["content"][number]) => {}; useOriginalMessage: () => {}; useOriginalMessages: () => unknown[]; };
```