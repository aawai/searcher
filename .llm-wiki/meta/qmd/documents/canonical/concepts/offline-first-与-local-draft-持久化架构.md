---
type: concept
title: Offline-First 与 Local Draft 持久化架构
created: 2026-09-25
updated: 2026-09-25
---

# Offline-First 与 Local Draft 持久化架构

## 概述

**Offline-First（离线优先）与 Local Draft 持久化** 是 [[entities/searcher-项目]]
保障用户数据安全与提升加载性能的核心设计。在网络离线、弱网或者未登录状态下，用户的所有操作（包括便签编辑、草稿记录、离线偏好）均能无缝执行而不发生白屏崩溃。

## 核心架构原则

1. **双层状态镜像（In-Memory + Async IndexedDB）**：
   - 界面始终以内存中的响应式运行时状态为单一可信源；
   - 将本地持久化作为异步备份镜像写入，彻底隔离无痕浏览模式或存储满额报错对 UI
     的致命影响。
2. **草稿防丢失与会话失效保护**：
   - 便签编辑过程中每步变动先写入本地 IndexedDB 草稿仓；
   - 当检测到服务端登录态失效时，自动弹窗保护未同步草稿，禁止粗暴清空，并在重新登录后走乐观锁版本对比与恢复。
3. **避免主线程卡顿（Anti-Monolithic Storage）**：
   - 不将整个单体状态树作为单个大对象写入，避免浏览器在主线程执行大量 Structured
     Clone 引起界面掉帧；
   - 按独立条目或分块原子写入。
