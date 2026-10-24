---
type: concept
title: Service Worker Update Lifecycle
domain: engineering
created: 2026-10-24
updated: 2026-10-24
---

# Service Worker 更新生命周期

## 状态与不变量

1. `install` 使用 `event.waitUntil()` 声明异步准备是否成功；拒绝会使新 Worker 安装失败，已有 active Worker 可继续工作。[MDN](/sources/SRC-2026-10-24-001.md)、[web.dev](/sources/SRC-2026-10-24-003.md)
2. 更新 Worker 通常在 waiting 状态等旧 Worker 不再控制客户端；仅刷新一个页面可能因新旧文档重叠而无法解除等待。[web.dev](/sources/SRC-2026-10-24-003.md)
3. `skipWaiting()` 跳过等待而非安装，可能令旧页面后续请求转由新 Worker 处理；`clients.claim()` 则让已激活 Worker 接管未受控客户端。它们不是可互换的开关，也不应作为无条件样板。[web.dev](/sources/SRC-2026-10-24-003.md)
4. `activate` 可清理过期缓存，但 Cache Storage 是 origin 级存储，只能删除本应用命名前缀下的旧版本。[web.dev](/sources/SRC-2026-10-24-003.md)

## 更新提示的设计推导

[INFERENCE] 对有编辑状态和动态 chunk 的 Searcher，应把 waiting 检测、用户接受更新、controllerchange 与安全重载作为显式协议，不能把 Worker 激活当成页面资源已经升级。官方文章提出用户交互后通过 postMessage 请求 skipWaiting；具体项目协议尚未在本轮代码中审计。

## 来源矛盾：脚本 URL

> ⚠️ **Contradiction：** [OWASP](/sources/SRC-2026-10-24-004.md) 建议 `sw.<hash>.js`，而 [web.dev](/sources/SRC-2026-10-24-003.md) 建议保持稳定 Worker URL，避免旧缓存 HTML 无法发现新注册 URL。两者确有冲突，不能合并为一致建议。

[INFERENCE] 本 Wiki 采用稳定 Worker URL、版本化资源缓存的选择；该选择依据 web.dev 对更新锁死路径的解释。HTTPS、控制范围限制、敏感响应排除仍分别遵循 OWASP；不把这项 URL 分歧扩大为对安全清单其他建议的否定。[OWASP 原始摘录](../../raw/sources/SRC-2026-10-24-004/extracted.md) 363–370 行。

## 关联与证据

- [Service Worker API](/entities/service-worker-api.md)
- [缓存安全边界](/concepts/pwa-cache-security-boundary.md)
- [近期 PWA 合并记录](/sources/obs-2026-10-24-issue-238-pwa-pr-263-264-265-main.md)
- [MDN 原始摘录](../../raw/sources/SRC-2026-10-24-001/extracted.md)
- [web.dev 原始摘录](../../raw/sources/SRC-2026-10-24-003/extracted.md)

web.dev 原文标注 2016-09-29；本页仅采用与本轮 MDN 资料一致的生命周期原则，不把旧文的浏览器实现细节当作当前兼容性保证。
