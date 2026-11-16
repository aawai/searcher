---
type: concept
title: React External Store Snapshot Contract
domain: engineering
created: 2026-11-15
updated: 2026-11-15
---

## React 契约

[React useSyncExternalStore 官方参考](/sources/SRC-2026-11-15-003.md)规定：`subscribe` 接收变更回调并返回取消订阅函数；`getSnapshot` 在数据未变时必须返回 `Object.is` 相等的不可变快照，可变 store 应缓存快照并在变化时生成新快照。改变 `subscribe` 函数身份会触发重新订阅。

在非阻塞 Transition 提交前 React 再次读取快照；若值发生变化，会重新以阻塞更新执行，以保证屏幕上读取一致。若使用服务端渲染，`getServerSnapshot` 在服务端和 hydration 期间返回相同初始值。React 建议尽可能使用内建 state，此 Hook 主要用于已有非 React store 和浏览器 API。

## 关联

[React 19 Framework](/entities/react-19-framework.md)；[ExternalStoreRuntime and Branchable Message Repository](/concepts/externalstoreruntime-and-branchable-message-repository.md)。后者是 assistant-ui 的运行时接口；此处是 React Hook 的独立契约，不据此推断项目运行时采用该 Hook。
