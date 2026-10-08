# Shared Markdown Editor：Notes consumer contract

## Owner 与边界

`web/src/features/markdown-editor/` 是唯一 framework
adapter、parser、serializer、command、transaction origin 与 lifecycle
owner；使用 Milkdown CommonMark + GFM + history，不加载 framework
theme。类型入口 `types.ts` 不加载 runtime。Documents
的资产、outline、paper、pagination 与 print 保留在 Documents consumer，不进入
Notes 编辑依赖图。

`NoteEditor.tsx` 拥有 canonical Markdown、1500ms autosave、手动保存、IndexedDB
草稿、mutation queue、409 冲突与历史恢复。`NoteLivePreviewEditor.tsx` 是 lazy
consumer，仅负责挂载/销毁、受控正文替换、selection/command 与 composition
bridge。Home、NoteCard、FloatingNotes 和 Notes 根列表继续使用只读
`NoteMarkdown`，不创建编辑实例。

## 正文与事件

- 打开、Live/Source 切换不序列化正文，不改变版本；Source textarea 直接编辑
  canonical Markdown。实际 Live 编辑后才接受 shared serializer 的 Markdown。
- 初始化与 `replaceMarkdown` 的 programmatic transaction 不回流为用户编辑；通过
  `appliedBody` 区分用户回显和外部替换。
- 中文 composition 期间不执行格式命令、不保存半成品；结束后等待 ProseMirror 完成
  DOM handler，再发布最终正文。composition 期间的外部正文替换延后应用。
- `preserveSoftBreaks: true` 仅改变 Notes hardbreak node 的 DOM
  presentation，让软换行和硬换行均可见；保留节点属性与序列化语义。Documents
  默认行为不变。
- 工具栏与正文属于同一 focus composite。模式切换不
  flush；真正离开组合区域才提交脏正文。延迟 blur 必须读取当前 canonical draft 与
  accepted server note，不能使用旧 render 的保存状态。
- 较早保存请求成功后，仅在当前草稿仍等于提交内容时删除本地副本；否则保留当前草稿并更新基准版本，避免标题保存覆盖后来输入的正文。
- 每个 consumer 拥有独立 handle、selection、history
  与计时器；异步初始化在卸载后完成时立即 destroy。解析/初始化失败保留正文并切换
  Source。

Notes API、schema、版本持久化和 10,000 characters 限制未改变。Live task checkbox
是用户编辑；卡片、冲突与历史版本 checkbox 只读。

## Presentation

`markdown.css` 定义 canonical 标题、列表、引用、inline/pre code、table、link 与
HR；`notes.css` 定义 Notes chrome、focus ring 与可编辑 task layout。Live
明确消费 `--font-body-line-height`，不继承 Tabs panel 的 control 行高。结构 CSS
仅负责 ProseMirror whitespace、selection 与 overflow，不拥有产品 typography。

## Bundle gate

`deno task check:bundle` 使用 production manifest 的静态依赖闭包，扣除 initial
graph 后计算 gzip（level 9）；Notes-only 增量再扣除 shared runtime
graph。renderer vendor 与 parser vendor 分离，编辑器不为只读 React
renderer/sanitizer 支付下载成本。

| JS graph                    | #108 前 raw / gzip（bytes） | #108 后 raw / gzip（bytes） |
| --------------------------- | --------------------------: | --------------------------: |
| Home initial                |             812354 / 250645 |             813707 / 251076 |
| Shared editor async         |             510641 / 157716 |             460548 / 141117 |
| Notes-only editor increment |                      不存在 |                 2919 / 1529 |

Shared async gzip 限制 153600 bytes（150 KiB）；Notes 增量限制 40960 bytes（40
KiB）。CI 同时拒绝 initial graph 中的 editor/Markdown runtime、Notes graph 中的
Documents-only modules，以及 framework package 多版本重复。

## 验证入口

- `deno task test`：共享 round-trip fixtures、origin、commands 与多实例等契约。
- `deno task test:workspace`：原工作区行为与 Notes Live/Source
  E2E，覆盖无副作用切换、IME、undo/redo、本地 Ctrl/Cmd+K、任务编辑、409
  云端替换、历史恢复、9500 字正文与超限草稿。
- `deno task check:ui`：Design Token 与 owner 门禁。
- `deno task check:bundle`：上述 byte budget、lazy 与 consumer 隔离门禁。
- 实页矩阵、computed-style parity、Chromium composition 与 20 次销毁后的
  DOM/listener 测量见 `UI_REVIEW_CHECKLIST.md` 的 #108 验收记录。
