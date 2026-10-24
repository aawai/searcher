---
type: entity
title: Service Worker API
category: tool
created: 2026-10-24
updated: 2026-10-24
---

# Service Worker API

Service Worker 是独立于页面主线程、无 DOM 访问能力的事件驱动执行环境，可拦截受控客户端的请求；运行要求 secure context，localhost 可用于本地开发。注册范围默认取脚本所在目录，不是任意站点根路径。[MDN 原始摘录](../../raw/sources/SRC-2026-10-24-001/extracted.md)

## 边界

- 注册成功、安装成功、激活、当前页面已受控是不同状态；首次激活默认不接管已经打开且未受控的文档。[MDN 指南](/sources/SRC-2026-10-24-001.md)
- Worker 可服务多个页面，不应把 Worker 全局变量当作每个页面独占的状态。[MDN 指南](/sources/SRC-2026-10-24-001.md)
- Service Worker 的安装不同于用户把 PWA 安装到设备；即使没有安装 PWA，Worker 仍可安装和激活。[缓存指南](/sources/SRC-2026-10-24-002.md)

## 关联

- [生命周期与更新](/concepts/service-worker-update-lifecycle.md)
- [PWA 缓存与身份隔离](/concepts/pwa-cache-security-boundary.md)
- [Manifest 安装边界](/concepts/web-app-manifest-installation-boundaries.md)

原始摘录链接相对于当前页面；平台事实不等于 Searcher 当前实现已验证。
