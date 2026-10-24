---
type: source
title: Service Worker 脚本 URL 的官方资料冲突
status: insight
category: architecture
created: 2026-10-24
updated: 2026-10-24
slug: service-worker-script-url-source-conflict
---

# Service Worker 脚本 URL 的官方资料冲突

本轮捕获的 OWASP HTML5 Security Cheat Sheet 在 Offline Applications 中建议 sw.<hash>.js；web.dev 生命周期文章则明确建议保持 Worker URL 稳定，并说明旧缓存 HTML 永远注册旧 URL 的更新锁死路径。不能以两者都是权威资料为由合并成一致建议。Wiki 保留双方原始摘录，采用稳定 Worker URL、版本化资源缓存的设计选择，并标注这是基于更新机制的推导而非本轮项目实现审计。关联：[OWASP 来源](/sources/SRC-2026-10-24-004.md)、[web.dev 来源](/sources/SRC-2026-10-24-003.md)、[更新生命周期](/concepts/service-worker-update-lifecycle.md)。

*Category: architecture*

---
*Captured: 2026-10-24*

## Related

_Add links to related pages._
