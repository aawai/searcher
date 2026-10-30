---
type: concept
title: Offline-First 与 Local Draft 持久化架构
domain: engineering
created: 2026-09-25
updated: 2026-10-28
sources:
  - sources/SRC-2026-10-28-003
  - sources/SRC-2026-10-28-005
---

# Offline-First 与 Local Draft 持久化架构

## 范围

Offline-first 将应用外壳、业务数据与未同步草稿分别设计；外壳离线可用不意味着全部业务操作都可离线执行。Web 平台中 Cache Storage 适合网络资源，IndexedDB 适合结构化数据；本地写入可能失败或被浏览器清理，不能将其当作不可丢失的备份。见 [web.dev 离线数据](/sources/SRC-2026-10-28-005.md) 和 [存储配额](/sources/SRC-2026-10-28-003.md)。

## Searcher 的具体边界

- [笔记契约](../../../docs/documents.md#保存)要求登录；网络失败保留 IndexedDB 设备草稿，重开可恢复或放弃，版本不一致须显式解决冲突。草稿按账号和笔记隔离；退出后重新登录同一账号可恢复，不是未登录访客也可编辑笔记。
- [外观契约](../../../docs/appearance.md#偏好存储)中匿名外观保存在当前设备且不上传；登录用户偏好使用账号隔离的设备缓存和云端同步。设备写入失败不应被描述为无条件成功保存。
- [Service Worker 路由](../../../web/src/pwa/sw-policy.ts)不拦截 API；其 shell 回退不提供离线 API，详见 [PWA Service Worker Update Lifecycle](/concepts/pwa-service-worker-update-lifecycle.md)。

> 旧描述称访客可离线执行所有便签编辑并保证不丢失；这与当前笔记需登录的契约及浏览器存储清理边界不符，已更正。本轮没有实测离线或故障场景。

## 关联

- [Browser Storage Persistence and Eviction](/concepts/browser-storage-persistence-and-eviction.md)
- [IndexedDB 本地存储引擎](/entities/indexeddb-本地存储引擎.md)
- [HTTP Cache and Service Worker Boundaries](/concepts/http-cache-and-service-worker-boundaries.md)
