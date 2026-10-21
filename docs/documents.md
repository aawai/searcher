# 笔记

笔记（`documents`）是长篇 Markdown
文档，带笔记本、图片资产、纸张设置与版本历史；与便签 （`notes`，见
[便签](notes.md)）是独立实体，路由与搜索独立。所有功能需要登录。

## 入口与 Host

登录后的“笔记”入口复用 Workspace Host（形态见
[首页与工作区](workspace.md#host-形态)）。点击标题或创建笔记后打开编辑器：

| Host               | 编辑器呈现                                                   |
| ------------------ | ------------------------------------------------------------ |
| Widgets >=1024px   | 保留 Library，打开独立笔记窗口；同一笔记重复打开只恢复并聚焦 |
| Widgets 768–1023px | 单一 constrained surface                                     |
| 移动端             | Sheet                                                        |
| Zen                | 展开 Panel                                                   |

笔记窗口复用拖动、缩放、最小化、Snap、Dock、总览与沉浸式；保存同步列表摘要，移至回收站关闭对应窗口。

## Library

- 视图：全部 / 最近 / 收藏、笔记本筛选、跨笔记本搜索与加载更多。
- 笔记操作：新建、重命名、收藏、移动、移至回收站。
- 笔记本最多两层，可创建、重命名、移动、同级上移/下移；删除笔记本保留笔记并将子笔记本提升为根。

### 展示标题

DTO 的 `displayTitle` 是服务端派生展示值，依次取：trimmed `title` → 首个非空
heading/paragraph 的纯文本前 100 字 → “无标题笔记”。

- `title` 仍为 canonical 字段，不回写 fallback。
- 列表和搜索只返回摘要，不返回正文。无标题记录的派生在服务端读取正文；已有标题的列表记录只读取正文前
  300 字生成 snippet。

## 编辑

编辑、分页和 Markdown 源码三种视图共用一份 Markdown 正文；编辑与分页共用同一
editor、选区和 undo history，只改变排版。视图偏好仅在当前设备按账号与笔记隔离。

- 标题单独保存，不自动插入 H1。
- 格式工具栏支持标题、强调、列表/任务、引用、链接、代码、表格、分隔线、分页符与图片。工具栏只有一个
  Tab 入口，方向键切换按钮，格式状态可由读屏读取；移动端保持单行横向滚动。
- 大纲在编辑/分页视图显示，点击定位正文光标。
- 纸张设置、打印、复制与导出位于“更多笔记操作”。
- 字数按 CJK 字符和英文/数字单词统计，排除 Markdown 语法；阅读时间按每分钟 300
  字/词向上取整。

### 保存

- 输入后 1500ms
  自动保存，中文组合输入结束后才保存；离开编辑区域、切换视图或关闭工作区时提交待保存内容。
- Ctrl/Cmd+S 手动保存。
- 网络失败时保留 IndexedDB
  本地草稿，重开可恢复或放弃；旧版本草稿须显式解决冲突。
- 历史恢复创建新版本，不倒退版本号。

### 冲突处理

409 冲突对话框可对比本地与云端版本（便签与笔记共用）：

- “用云端版本”“用我的版本”须通过独立二次确认弹窗，明确说明覆盖方向。
- “另存副本”不需要二次确认。
- “暂不处理”（Esc
  同效）关闭弹窗、不修改任一版本；冲突可从编辑器头部“处理冲突”重新打开。
- 失败时显示错误并保留本地修改。

### 图片

- 支持 PNG/JPEG/WebP，最大 10 MiB；上传成功后才插入 `asset://<assetId>`。
- 复制与 `.md` 导出保留正文原文及 internal asset
  ref，不附加标题，不是可独立移植的图片包；完整资产须通过数据库备份保留。

### 分页、纸张与打印

- 分页视图的纸张自上而下居中排列，使用正文外层的同一个滚动区；跨页编辑、选区及撤销属于唯一编辑器。
- 窄窗口和移动端统一缩放纸张，不改正文 Token，不保留横向滚动 strip。
- 自动分页不写回 Markdown；切换纸张或视图不会把自动断页写进正文。手动
  `<!-- pagebreak -->` 保留首部、连续和末尾空白页。
- 纸张设置支持 A4/Letter、横向/纵向和四边 5–50 mm 边距，按笔记保存到服务器。
- 打印使用独立的无应用 chrome
  排版，标题仅在首个非空白页出现；正文、图片、代码、表格和手动分页参与打印，
  自动分页由浏览器决定，不承诺与编辑视图逐像素一致。

## API

所有 `/api/documents*`、`/api/document-notebooks*` 请求需要登录；跨 owner
与不存在均返回 404。

### 列表与搜索

| 方法 | 路径                                                                                      | 说明                   |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------- |
| GET  | `/api/documents?scope=all\|recent\|favorite\|notebook&notebookId=...&limit=50&cursor=...` | 列表                   |
| GET  | `/api/documents/search?q=...`                                                             | 搜索；空搜索返回空列表 |
| GET  | `/api/documents/trash`                                                                    | 回收站                 |

三者返回 `{ items, nextCursor }`，每项仅包含 summary，不返回完整 body。`limit`
为 1–100；cursor 绑定 user/scope 或 query。

### 实体与生命周期

| 方法        | 路径                                           | 说明                                                                              |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| POST        | `/api/documents`                               | 创建                                                                              |
| GET / PATCH | `/api/documents/:id`                           | 读取 / 更新；PATCH 必须提交当前 `version`，冲突返回 409 与 `data.currentDocument` |
| DELETE      | `/api/documents/:id?version=N`                 | 软删除                                                                            |
| POST        | `/api/documents/:id/restore`                   | 从回收站恢复                                                                      |
| DELETE      | `/api/documents/:id/permanent`                 | 永久删除，级联清理资产                                                            |
| GET         | `/api/documents/:id/versions`                  | 版本历史                                                                          |
| POST        | `/api/documents/:id/versions/:version/restore` | 恢复历史版本；body 提交当前 `version`，创建新版本、不回滚计数                     |

- `title` 最大 200 characters，Markdown body 最大 1,000,000
  characters，create/update JSON 请求最大 8 MiB；超限拒绝、不截断。
- 内容变化的 autosave snapshot 间隔 10 分钟，每篇笔记仅保留最近 100 个；`manual`
  / `conflict_resolution` / `restore` / `system` 快照不参与清理。title/body
  未改变不生成内容快照。

### 笔记本

| 方法           | 路径                               |
| -------------- | ---------------------------------- |
| GET / POST     | `/api/document-notebooks`          |
| PATCH / DELETE | `/api/document-notebooks/:id`      |
| POST           | `/api/document-notebooks/:id/move` |
| PUT            | `/api/document-notebooks/reorder`  |

最多两层，允许同名。删除不删除笔记：直接笔记转为未分类，子笔记本提升为
root。排序提交目标 parent scope 的完整 ids。

### 图片资产

| 方法         | 路径                                          |
| ------------ | --------------------------------------------- |
| POST         | `/api/documents/:id/assets`（multipart file） |
| GET / DELETE | `/api/documents/:id/assets/:assetId`          |

- 仅 PNG/JPEG/WebP，校验 MIME 与 magic bytes，最大 10 MiB。
- 读取同时校验 document/asset/owner；正文仍引用的资产不能直接删除。
- bytes 存于 SQLite BLOB，`storage_ref`
  不公开；软删除保留资产，永久删除级联清理。

### 纸张设置

`GET/PUT /api/documents/:id/settings`：仅同步
`a4`/`letter`、`portrait`/`landscape` 与四边 5–50 mm margins（默认 20
mm）；不保存 view、sidebar、outline 等设备 UI 状态。
