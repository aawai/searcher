---
type: entity
title: IndexedDB 本地存储引擎
created: 2026-09-25
updated: 2026-09-25
---

# IndexedDB 本地存储引擎

## 概述

**IndexedDB** 是浏览器原生提供的底层异步 NoSQL 键值与对象存储数据库。在
[[entities/searcher-项目]]
的前端架构中，它作为离线优先与用户草稿暂存的基础设施，负责存储本地未同步便签草稿、未登录访客偏好、本地搜索历史以及网络资源离线快照。

## 关键约束与工程实践

- **全异步无阻塞**：不同于同步阻塞主线程的 `localStorage`，IndexedDB
  采用异步事务，支持高并发读写大容量结构化数据。
- **防御式容错与降级**：严格捕获 `QuotaExceededError`
  与无痕模式限制，并与内存运行时状态保持解耦，确保存储降级时主搜索界面依然可用。
- **版本迁移管理**：通过严格的 `onupgradeneeded` 升级回调对本地对象仓库（Object
  Store）进行模式演进。
