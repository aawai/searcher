---
type: concept
title: Web App Manifest Installation Boundaries
domain: engineering
created: 2026-10-24
updated: 2026-10-24
---

# Web App Manifest 安装边界

## 不同成员解决不同问题

- `id`：应用唯一标识；`start_url`：用户从安装图标启动时打开的 URL。
- `scope`：安装应用页面与子目录的顶层路径，影响浏览器如何呈现离开应用范围的导航。
- `display`：期望的浏览器 UI 显示模式；`icons`、`name`、`short_name`：安装身份呈现。
- `share_target`：让已安装 PWA 注册为系统分享目标；`shortcuts`：应用图标的关键任务入口。

以上定义来自 [MDN 成员参考](/sources/SRC-2026-10-24-005.md)；[原始摘录](../../raw/sources/SRC-2026-10-24-005/extracted.md) 200–263 行。成员参考不是各浏览器支持矩阵，不应由存在某字段推断平台必定提供相应入口。

## 与 Worker 和授权的区别

Manifest 的 scope 描述安装应用的导航范围；Worker scope 来自注册和脚本路径，决定受控客户端。二者是独立机制。[Worker 指南](/sources/SRC-2026-10-24-001.md)、[原始摘录](../../raw/sources/SRC-2026-10-24-001/extracted.md) 278–332 行。

[INFERENCE] Manifest scope 不是访问控制；分享入口和 start_url 仍须经过真实路由与登录鉴权。离线能力来自 [Service Worker](/entities/service-worker-api.md) 和[缓存策略](/concepts/pwa-cache-security-boundary.md)，不能从 manifest 存在推断可离线使用。参考页中的 `serviceworker` 成员专用于 Web Payment Handler 的 JIT Worker，不是通用站点 Worker 注册替代方案。

## 项目关联

[Searcher PWA 合并观察](/sources/obs-2026-10-24-issue-238-pwa-pr-263-264-265-main.md) 记录 manifest、更新提示、GET 分享入口已合并；本轮引用该历史观察，不重新声称已完成浏览器兼容性或分享授权验证。
