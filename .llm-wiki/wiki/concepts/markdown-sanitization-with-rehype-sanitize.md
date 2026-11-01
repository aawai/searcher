---
type: concept
domain: engineering
title: Markdown Sanitization with rehype-sanitize
created: 2026-11-01
updated: 2026-11-01
sources:
  - sources/SRC-2026-11-01-003
---

# Markdown Sanitization with rehype-sanitize

[README](/sources/SRC-2026-11-01-003.md)（[raw](../../raw/sources/SRC-2026-11-01-003/extracted.md) 第 206–208、633–639 行）的模型是**白名单**：丢弃 schema 未允许的节点与属性，默认 `defaultSchema` 对齐 GitHub。三条规则决定它是否真的安全：

1. **位置**：放在最后一个不安全步骤之后；其后的插件产出都不再受保护（第 638–639 行）。
2. **扩展即放宽**：KaTeX、高亮等插件注入的 class/内联样式会被默认 schema 移除；放行 class 就是放宽白名单，示例只给 `code` 追加指定的 `language-*`（第 484–590 行）。
3. **`id`/`name` 加 `user-content-` 前缀**防 DOM clobbering（第 398–399 行），代价是页内锚点失效，需要自己写 hash 重写脚本（第 422–482 行）。

## Searcher 的实际用法（2026-11-01 读取 `web/src`）

`rehype-sanitize@6.0.0`、`react-markdown@10.1.0`（`deno.jsonc` 第 61、67 行）。两处渲染都用**默认配置**，没有自定义 schema：

| 文件 | remark 插件 | rehype 插件 |
| --- | --- | --- |
| `components/searcher/NoteMarkdown.tsx` 第 175–181 行 | `remarkGfm`、`remarkBreaks` | `rehypeSanitize` |
| `features/ask/AssistantMarkdown.tsx` 第 87–115 行 | `remarkGfm` | `rehypeSanitize` |

- 渲染链中没有 `rehype-raw`：2026-11-01 在 `web/src`、`src`、`deno.jsonc` 检索 `rehype-raw|rehypeRaw|allowDangerousHtml|skipHtml` 均无结果，所以 Markdown 内嵌的原始 HTML 不会被解析成元素；sanitize 是对 mdast→hast 结果的第二道防线，不是唯一一道。本页未验证 react-markdown 10 对原始 HTML 的具体处理（转义或忽略），该判断只依据渲染链里没有会解析原始 HTML 的 rehype 插件。
- 排序满足规则 1：`components` 覆盖（`a`、`pre`、`table`、`li`、`input`、`CodeBlock`）发生在 hast→React 渲染阶段，在 sanitize 之后；它们改变的是呈现与事件，不引入新 HTML 字符串。链接统一 `target="_blank"` 与 `rel="noopener noreferrer"`。
- `NoteMarkdown` 的任务列表覆盖依赖 `li.task-list-item` 与 `input[type=checkbox]`；`AssistantMarkdown.CodeBlock` 依赖 `code` 的 `language-*` class（第 19 行）。这些节点是否被默认 schema 放行，是读码推断，未单独跑 sanitize 输出确认。
- 锚点前缀的副作用：若将来在笔记或回答中加入标题锚点（`#heading` 内部链接），默认 schema 会给 `id` 加 `user-content-` 前缀，需要实现 README 描述的 hash 重写，否则链接会静默失效。本页未检索现有代码是否已有此类链接。

## 关联

- [XSS Sanitization and Trusted Types](/concepts/xss-sanitization-and-trusted-types.md)：sanitize 是上下文编码之外的一层，CSP/Trusted Types 是后备。
- [Content Security Policy Strict Deployment](/concepts/content-security-policy-strict-deployment.md)
- [Hono Security Middleware vs API Guard](/concepts/hono-security-middleware-vs-api-guard.md)
- 编辑器侧 Markdown 契约见仓库 `docs/editor/`（Milkdown），本页不涉及。
