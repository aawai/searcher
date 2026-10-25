# Shared Markdown Editor：Documents consumer contract

## Owner 与边界

`web/src/features/markdown-editor/` 是唯一 framework adapter、parser、serializer、command、transaction origin 与 lifecycle owner；使用 Milkdown CommonMark + GFM + history，不加载 framework theme。类型入口 `types.ts` 不加载 runtime。

`web/src/features/documents/DocumentEditor.tsx` 是唯一编辑 consumer，拥有 canonical Markdown、1500ms autosave、手动保存、mutation queue、409 冲突与历史恢复。资产、outline、paper、pagination 与 print 由 `features/documents/` 拥有，不进入 shared runtime。

设备草稿的 key、读写、清除及退出发现统一由 `features/documents/document-session.ts` 拥有，key 为 `text:document:draft:<userId>:<documentId>`，复用 local 层 FIFO 与事务提交语义。

编辑器按需 lazy 加载，使用共享 LoadingState 展示首开加载状态；不把编辑器业务实现放进首页入口 chunk。编辑 consumer 仅负责挂载/销毁、受控正文替换、selection/command 与 composition bridge。首页笔记、工作区列表、冲突与历史版本使用只读 Markdown 视图，不创建编辑实例。

## 正文与事件

- 打开、Live/Source 切换不序列化正文，不改变版本；Source textarea 直接编辑 canonical Markdown。实际 Live 编辑后才接受 shared serializer 的 Markdown。
- 初始化与 `replaceMarkdown` 的 programmatic transaction 不回流为用户编辑；通过 `appliedBody` 区分用户回显和外部替换。
- 中文 composition 期间不执行格式命令、不保存半成品；结束后等待 ProseMirror 完成 DOM handler，再发布最终正文。composition 期间的外部正文替换延后应用。
- `preserveSoftBreaks: true` 使软换行与硬换行在编辑与只读预览中均可见，保留节点属性与序列化语义。
- 标题、当前 Live/Source 正文和格式工具栏属于同一实例的编辑焦点区域；鼠标、Tab/Shift+Tab、标题 Enter 的内部移动不保存、不重启 1500ms debounce。模式 Tab 是明确的不保存例外，不把整个编辑器容器当作内部区域。
- 真正移至历史、颜色或外部控件时，仅 dirty 草稿执行一次 manual flush，并取消 autosave timer；恢复的本地 dirty 草稿即使没有 timer 也可通过离开区域提交。clean 离开不 PATCH；Ctrl/Cmd+S 保持显式 manual 保存语义。
- 延迟 blur 读取最终 focus、当前 canonical draft、accepted server document 与 composition ref；跨实例焦点不是内部移动，卸载取消待执行的 blur 判断并提交非组合态、无冲突的 dirty 草稿。同一草稿已有进行中请求时不重复提交，新编辑排在现有队列之后。标题中文 composition 期间也不提交或执行 Enter 跳转；组合态关闭将当前编辑内容保留为设备草稿。
- 较早保存请求成功后，仅在当前草稿仍等于提交内容时删除本地副本；否则保留当前草稿并更新基准版本，避免标题保存覆盖后来输入的正文。
- `/api/documents/events` 的具名 `document.updated` 事件只携带 `documentId`、`version`、`updatedAt`；编辑器等待本地 mutation queue 后比较版本，必要时 GET 最新笔记，不把失效通知当成完整 DTO。自己保存的广播与过期版本不触发冲突。clean 草稿静默同步并显示已保存；dirty 草稿进入冲突、停止 autosave，历史入口不得绕过冲突。读取失败保留草稿并提示重新打开重试。
- 每个 consumer 拥有独立 handle、selection、history 与计时器；异步初始化在卸载后完成时立即 destroy。解析/初始化失败保留正文并切换 Source。
- 格式菜单的 trigger、Portal 与内容通过编辑实例 owner 标记归属对应编辑实例；跨实例菜单仍是外部焦点。窄容器为标题、粗体、斜体、任务、链接、更多六个入口，宽容器将更多命令直接展示，15 个命令与 shortcut catalog 不变。
- 历史进入时临时禁止继续输入；dirty 恰好一次 manual flush，clean 零 PATCH，等待原 mutation queue 后 GET。历史隐藏而不卸载当前编辑实例，返回使用 layout effect 在下一次输入前恢复焦点/选区/滚动；取消恢复无写入，确认 restore 共用原 queue。成功统一接受服务端 DTO、版本与颜色，清除设备草稿；失败保留历史预览和现有草稿。

正文与 API 限制见 [笔记 · 实体与生命周期](../documents.md#实体与生命周期)。Live task checkbox 是用户编辑；首页笔记、冲突与历史版本中的 checkbox 只读。

## 设备草稿

- 草稿按账号与笔记隔离保存在 `searcher-client` IndexedDB 的 `state` store，恢复、保存、清除共用同一笔记的本地 FIFO 锁；不引入跨标签页锁。关闭编辑器的云端提交由 DocumentEditor mutation queue 拥有。
- 账号隔离的 canonical 草稿即使版本落后也可恢复，进入显式冲突而不自动覆盖云端；未解决冲突的关闭/重开保留原草稿版本基线。
- 归属网络检查或 IndexedDB 失败不当作“无草稿”。退出保留登录态并提示重试，恢复失败保留原数据、暂停编辑并提供恢复重试。AppState 的会话对象身份是 auth epoch，同账号重新登录也换 epoch；旧异步结果不能提示或注销新会话。
- 取消退出不清草稿；确认退出保留同账号恢复能力。正常同步只清对应账号/笔记的副本，清理等待期间出现新输入则保留新草稿。关闭时同步失败或处于组合态、冲突时，设备草稿仍供恢复；账号失效不启动新请求。当前账号退出检查校验存储结构，不额外请求云端版本。
- 旧版便签草稿（`note:draft:*`）不再读取、不迁移、不作为归属证明；升级后被清理。合并后不提供降级到旧版本的路径，需要回滚时使用升级前备份（见 [部署 · 升级：便签并入笔记](../deployment.md#升级便签并入笔记)）。

## Presentation

`markdown.css` 定义 canonical 标题、列表、引用、inline/pre code、table、link 与 HR；`document-editor.css` 定义编辑 chrome、focus ring 与可编辑 task layout。Live 明确消费 `--font-body-line-height`，不继承 Tabs panel 的 control 行高。结构 CSS 仅负责 ProseMirror whitespace、selection 与 overflow，不拥有产品 typography。

操作区与正文滚动分离；阅读宽度 720px，最低正文 240px，低高度允许整个编辑器滚动。Live/Source 各自记录滚动位置，模式切换的既有 runtime 生命周期不变。展开/收起编辑不更换编辑器 key；跨 Host 断点挂载策略不在此契约内。

工作区列表的 `features/workspace/note-summary.ts` 只读分析入口复用 remark/remark-gfm AST，不替换共享 editor parser/serializer。列表动态加载并按当前实例 id/body 缓存结果，query 变化只生成文本节点/mark 片段；隐藏 URL 或 Markdown 语法匹配回退到 escaped 源码，不执行 HTML。

资料库列表对服务端摘要做标题去重时，只静态导入无依赖的 `features/workspace/note-list-snippet.ts`。该字符串处理入口不得通过 `note-summary.ts` 的静态依赖引入 remark/unified；列表摘要行为不变，Markdown parser 仍留在异步加载图中。

Documents 的格式状态观察保留在 `features/documents/editor-extensions.ts`，只读取当前实例的 selection / stored marks / document，通过 consumer callback 更新工具栏 `aria-pressed`，不改变 canonical Markdown、history 或 transaction origin。其 More 菜单 Portal 以实例 owner 关联编辑焦点边界；roving tabindex、单行滚动与触屏 header 由 Documents consumer 和 `document-editor.css` 拥有，不导入共享 runtime 的初始依赖图。visualViewport 缩小时，consumer 在布局更新后依据实际工具栏、正文与选区几何调整滚动，保持工具栏可见且光标位于其下方；监听与 RAF 随实例清理。不修改正文、选区或共享 runtime。

## Bundle gate

`deno task check:bundle` 使用 production manifest 的静态依赖闭包，扣除 initial graph 后计算 gzip（level 9）。renderer vendor 与 parser vendor 分离，编辑器不为只读 React renderer/sanitizer 支付下载成本。

下表为合并前 #108 阶段（便签与笔记双 consumer）的测量快照，合并后需重新测量：

| JS graph                  | #108 前 raw / gzip（bytes） | #108 后 raw / gzip（bytes） |
| ------------------------- | --------------------------: | --------------------------: |
| Home initial              |             812354 / 250645 |             813707 / 251076 |
| Shared editor async       |             510641 / 157716 |             460548 / 141117 |
| Editor consumer increment |                      不存在 |                 2919 / 1529 |

Shared async gzip 限制 153600 bytes（150 KiB）；编辑 consumer 增量限制 40960 bytes（40 KiB）。CI 同时拒绝 initial graph 中的 editor/Markdown runtime，以及 framework package 多版本重复。

首页任务勾选的 saver 仅在首次勾选时动态加载；其 `paper-tasks.ts` → `note-summary.ts` 的 remark/unified 解析链不得由首页静态导入。后续勾选复用同一个 saver，保持逐笔记的乐观更新、1500ms 合并保存与冲突重放。

## 验证入口

- `deno task test`：共享 round-trip fixtures、origin、commands 与多实例等契约。
- `deno task test:workspace`：工作区行为与笔记 Live/Source/focus E2E，覆盖真实 PATCH/version/history、标题/正文/工具栏内部移动、dirty 离开、debounce、草稿恢复、失败重试、多实例、在途旧请求保留新草稿，以及 IME、undo/redo、本地 Ctrl/Cmd+K、任务编辑、409 云端替换、历史恢复、9500 字正文与超限草稿。
- `deno task check:ui`：Design Token 与 owner 门禁。
- `deno task check:bundle`：上述 byte budget、lazy 与 consumer 隔离门禁。
- 实页矩阵、computed-style parity、Chromium composition 与重复销毁后的 DOM/listener 测量，依据 [UI 验收清单](../design/UI_CHECKLIST.md) 的实页矩阵执行，结果写入 PR 描述。
