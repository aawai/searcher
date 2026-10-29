---
type: concept
title: Browser Storage Persistence and Eviction
domain: engineering
created: 2026-10-28
updated: 2026-10-28
sources:
  - sources/SRC-2026-10-28-003
  - sources/SRC-2026-10-28-004
  - sources/SRC-2026-10-28-005
---

# Browser Storage Persistence and Eviction

浏览器本地数据通常按 origin 管理，能够跨页面重启保留不等于不会丢失，也不等于账号隔离或备份。

## 配额与清理

IndexedDB、Cache API 等通常默认使用 best-effort 存储：配额不足会使写入失败，存储压力可能触发整个 origin 的驱逐，IndexedDB 与 Cache 数据可能一起删除。无痕模式通常在会话结束后删除数据；浏览器还可能对嵌入的第三方 origin 分区。`navigator.storage.estimate()` 是估算，不保证后续写入成功。见 [MDN 配额与清理](/sources/SRC-2026-10-28-003.md)。

`navigator.storage.persist()` 请求持久存储，返回 `false` 表示未获准；获准可防止存储压力驱逐，但用户仍能清除站点数据。该方法需要安全上下文且不能在 Worker 内调用；`persisted()` 是只读查询。见 [MDN persist()](/sources/SRC-2026-10-28-004.md) 和 [web.dev 离线数据](/sources/SRC-2026-10-28-005.md)。

两份来源对 Safari 不活跃站点的主动清理与持久授权的关系未明确给出一致的具体条件：MDN 单独描述了跟踪防护下的清理，web.dev 将持久授权概括为避免自动驱逐。不要据此承诺所有 Safari 版本或私密浏览场景均不会清理；应按目标浏览器和策略验证。配额具体数值也随浏览器及版本变化，不宜当作跨浏览器保证。

## 与 Searcher 的关系

[笔记契约](../../../docs/documents.md#设备草稿)规定 IndexedDB 草稿按账号与笔记隔离，网络失败时可恢复，退出后重新登录同一账号可恢复；[外观契约](../../../docs/appearance.md#偏好存储)规定匿名外观只存设备且与账号缓存分开。这是应用层键与恢复策略，不是浏览器替应用区分账号；浏览器清理或用户删除数据时，本地唯一的未同步内容仍可能丢失。

[当前本地存储实现](../../../web/src/lib/local.ts)在 IndexedDB 事务完成时才确认写入；[草稿检查](../../../web/src/features/documents/local-drafts.ts)按用户 ID 构造键并验证记录。本轮未执行浏览器驱逐、跨账号或故障注入验证，也未断言应用调用了 `persist()`。

## 关联

- [IndexedDB 本地存储引擎](/entities/indexeddb-本地存储引擎.md)
- [Offline-First 与 Local Draft 持久化架构](/concepts/offline-first-与-local-draft-持久化架构.md)
- [HTTP Cache and Service Worker Boundaries](/concepts/http-cache-and-service-worker-boundaries.md)
- [PWA Service Worker Update Lifecycle](/concepts/pwa-service-worker-update-lifecycle.md)
