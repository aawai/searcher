---
type: concept
title: Upload Validation Defense in Depth
domain: engineering
created: 2026-11-02
updated: 2026-11-02
sources:
  - sources/SRC-2026-11-02-003
  - sources/SRC-2026-11-02-005
---

# Upload Validation Defense in Depth

## 来源原则

[OWASP File Upload Cheat Sheet](/sources/SRC-2026-11-02-003.md)（[raw](../../raw/sources/SRC-2026-11-02-003/extracted.md) 第 227–241、267 行）：没有单一手段足够，需叠加——扩展名/类型白名单、不信任 `Content-Type`、服务端生成文件名、大小限制、授权、隔离存储、内容处理、依赖更新、CSRF 防护。其中：

- `Content-Type` 由用户提供，可伪造；文件签名校验“绕过常见且容易”，不应单独使用（第 300、306–310 行）。
- 图片应**解码后重编码**并去元数据，但重写不保证清除恶意内容，图像处理器自身处理不受信输入，需限制格式与资源（第 333 行）。
- 公开提供文件时用 id → 文件名映射的 handler，而非直接暴露目录（第 237 行）。

## Searcher 各上传入口（2026-11-02 读码）

| 入口 | 已观察到的校验 | 位置 |
| --- | --- | --- |
| 壁纸 | 读取魔数，仅放行 PNG/JPEG/WebP/AVIF，显式拒绝 SVG；读取时 `Cache-Control: private, no-cache`、ETag、`X-Content-Type-Options: nosniff`，需登录 | `features/wallpaper/service.ts`（`validateRasterMagicBytes`）、`wallpaper.route.ts` 第 117–140 行 |
| 文档图片 | 测试名称声明：PNG/JPEG/WebP 放行；声明类型与魔数不符、SVG、GIF 拒绝；恰好 10 MiB 通过，超 1 字节拒绝；读取头含 `nosniff`、`no-store`；DTO 不暴露 `storageRef` | `features/documents/assets.test.ts`、`documents.route.ts` 第 505–506 行 |
| 应用图标 | `sharp` 解码，`limitInputPixels: 4096*4096`，**重新编码**为 256 px；以 SHA-256 去重；`GET` 带 `nosniff`、长缓存；URL 抓取限时、限体积（2 MiB）、`redirect: "error"`、先做 `validateUrlForSafeFetch` | `features/webapp-icons/presentation.ts`、`service.test.ts`、`webapp-icons.route.ts` 第 38–39 行、`fetcher.ts` 第 133–200 行 |
| AI 附件 | 校验声明 MIME 与魔数一致（`detectImageMimeFromBytes`），不一致抛 `AttachmentValidationError` | `features/ai/attachments.ts` 第 68–71 行 |
| 备份 ZIP（管理员） | 见 [Archive Extraction](/concepts/archive-extraction-zip-slip-and-decompression-limits.md) | `features/system/service.ts` |

对照 OWASP：项目的**服务端存储名**由系统生成（图标为内容哈希，壁纸/文档为 id；具体命名函数未逐个读取，属推断），路由受登录与 Origin 检查保护（见 [CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)），读取侧统一 `nosniff`，上传位于数据库旁的目录或 SQLite 内、不在静态资源目录下（`web/dist`）。

## 差异与未决问题

- OWASP 建议“图片重编码”：图标做到了；**壁纸与文档图片在已读代码中只见魔数校验，未见重编码**。魔数校验被来源明确列为“常见且易绕过”。是否存在解码步骤（例如壁纸取色/焦点流程里使用 `sharp`）未检索确认；是否需要为这两个入口补重编码，需要产品/安全层面的决定。
- 壁纸和文档图片以 `nosniff` 与带认证的读取路径缓解了内容嗅探与公开暴露，但没有 CSP `sandbox` 一类的响应头（未在这些路由中检索到）；对 AVIF/WebP 等光栅格式风险有限，来源也未对此给出结论。
- 本页是读码整理，不是安全审计，也未对每个入口做上传实测。

## 关联

- [Archive Extraction: Zip Slip and Decompression Limits](/concepts/archive-extraction-zip-slip-and-decompression-limits.md)
- [CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)
- [Content Security Policy Strict Deployment](/concepts/content-security-policy-strict-deployment.md)
- [Session Security and Isolation](/concepts/session-security-and-isolation.md)
- [SSRF and Outbound Fetch Boundaries](/concepts/ssrf-and-outbound-fetch-boundaries.md)：图标 URL 抓取的 `validateUrlForSafeFetch` 细节与已验证边界。
