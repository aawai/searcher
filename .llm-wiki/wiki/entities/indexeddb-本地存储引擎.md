---
type: entity
title: IndexedDB 本地存储引擎
category: tool
created: 2026-09-25
updated: 2026-10-28
sources: [sources/SRC-2026-10-28-003, sources/SRC-2026-10-28-005]
---

# IndexedDB 本地存储引擎

## 概述

**IndexedDB** 是浏览器提供的异步结构化对象存储，支持对象仓库、索引和事务；适合存放不直接对应 URL 的业务数据。Cache Storage 则适合网络请求与响应，见 [web.dev 离线数据](/sources/SRC-2026-10-28-005.md)。

## Searcher 使用边界

[设备草稿契约](../../../docs/documents.md#设备草稿)规定笔记草稿按账号与笔记隔离；[外观契约](../../../docs/appearance.md#偏好存储)规定匿名外观与账号缓存独立。缓存网络资源由 [Service Worker](/concepts/pwa-service-worker-update-lifecycle.md) 的 Cache Storage 负责，不能笼统说网络快照均存于 IndexedDB。

[本地存储实现](../../../web/src/lib/local.ts)使用 `searcher-client` 数据库和 `state` object store，写入在事务 `complete` 时确认，并处理 `error` / `abort`。应用升级数据库结构时应在版本升级事务中管理 schema；项目当前实现的版本与具体迁移以源码为准。

## 持久化限制

异步 API 不代表无限容量或永不失败。配额不足、存储被禁用、无痕会话结束以及浏览器驱逐都可能影响本地数据；`persist()` 可请求降低自动驱逐风险，但不能取代备份。见 [Browser Storage Persistence and Eviction](/concepts/browser-storage-persistence-and-eviction.md)。

## 关联

- [Offline-First 与 Local Draft 持久化架构](/concepts/offline-first-与-local-draft-持久化架构.md)
- [Searcher 项目](/entities/searcher-项目.md)
