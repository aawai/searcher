---
type: concept
title: Deno Permission Boundaries
domain: engineering
created: 2026-10-26
updated: 2026-10-26
---

## 权限模型

[Deno 官方来源](/sources/SRC-2026-10-26-002.md)（[raw](../../raw/sources/SRC-2026-10-26-002/extracted.md)，第 222–399 行）规定敏感 I/O 默认拒绝；按路径、host、环境变量收窄 allow，deny 优先。模块共享同线程权限，因此权限不是依赖之间的隔离边界。

初始静态模块图加载与运行时 I/O 是两个边界：未授予普通网络权限，不等于禁止所有模块获取。文档是动态更新的；具体版本应核对对应运行时。

## 逃逸风险

- 子进程不继承父 Deno 沙箱；allow-run=deno 或 shell 可绕过原限制。
- FFI 和 Node-API native code 可直接执行系统调用。
- revoke 降为 prompt，不是 deny；无人值守场景配合 no-prompt。

关联：[Deno Runtime](/entities/deno-runtime.md)、[Session Security and Isolation](/concepts/session-security-and-isolation.md)。运行时权限与会话/owner 校验保护不同边界，不能互相替代；未据此修改部署参数。
