# Shared Markdown Editor：Notes consumer contract

## Owner 与边界

`web/src/features/markdown-editor/` 是唯一 framework
adapter、parser、serializer、command、transaction origin 与 lifecycle
owner；使用 Milkdown CommonMark + GFM + history，不加载 framework
theme。类型入口 `types.ts` 不加载 runtime。Documents
的资产、outline、paper、pagination 与 print 保留在 Documents consumer，不进入
Notes 编辑依赖图。

`NoteEditor.tsx` 拥有 canonical Markdown、1500ms autosave、手动保存、mutation
queue、409 冲突与历史恢复。设备草稿的 key、读写、迁移、清除及退出发现统一由
`features/notes/local-drafts.ts` 拥有，复用 local 层 FIFO 与事务提交语义。
NotesWorkspace 按需 lazy 加载 NoteEditor，使用共享 LoadingState
展示首开加载状态；不把编辑器业务实现放进首页入口 chunk。此边界与 Documents
编辑器的现有加载惯例一致，不改变 NoteEditor 实例内的草稿、保存队列或历史。
`NoteLivePreviewEditor.tsx` 是 lazy consumer，仅负责挂载/销毁、受控正文替换、
selection/command 与 composition bridge。Home、NoteCard、FloatingNotes 和 Notes
根列表继续使用只读 `NoteMarkdown`，不创建编辑实例。

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
- 标题、当前 Live/Source 正文和格式工具栏属于同一实例的编辑焦点区域；鼠标、
  Tab/Shift+Tab、标题 Enter 的内部移动不保存、不重启 1500ms debounce。 模式 Tab
  是明确的不保存例外，不把整张 `.note-editor` 当作内部区域。
- 真正移至历史、颜色或外部控件时，仅 dirty 草稿执行一次 manual flush，并取消
  autosave timer；恢复的本地 dirty 草稿即使没有 timer 也可通过离开区域提交。
  clean 离开不 PATCH；Ctrl/Cmd+S 保持显式 manual 保存语义。
- 延迟 blur 读取最终 focus、当前 canonical draft、accepted server note 与
  composition ref；跨实例焦点不是内部移动，卸载取消待执行 blur
  判断并提交非组合态、 无冲突的 dirty
  草稿。同一草稿已有进行中请求时不重复提交，新编辑排在现有队列之后。 标题中文
  composition 期间也不提交或执行 Enter
  跳转；组合态关闭将当前编辑内容保留为设备草稿。
- 较早保存请求成功后，仅在当前草稿仍等于提交内容时删除本地副本；否则保留当前草稿并更新基准版本，避免标题保存覆盖后来输入的正文。
- `/api/notes/events` 的具名 `note.updated` 事件只携带 `noteId`、`version`、
  `updatedAt`；编辑器等待本地 mutation queue 后比较版本，必要时 GET 最新便签，
  不把失效通知当成完整 DTO。自己保存的广播与过期版本不触发冲突。 clean
  草稿静默同步并显示已保存；dirty 草稿进入冲突、停止 autosave，历史入口
  不得绕过冲突。读取失败保留草稿并提示重新打开重试。
- 每个 consumer 拥有独立 handle、selection、history
  与计时器；异步初始化在卸载后完成时立即 destroy。解析/初始化失败保留正文并切换
  Source。
- 格式菜单的 trigger、Portal 与内容通过 `data-note-editor-owner`
  归属对应编辑实例；
  跨实例菜单仍是外部焦点。窄容器为标题、粗体、斜体、任务、链接、更多六个入口，
  宽容器将更多命令直接展示，15个命令与 shortcut catalog 不变。
- 历史进入时临时禁止继续输入；dirty恰好一次manual flush，clean零PATCH，
  等待原mutation queue 后GET。历史隐藏而不卸载当前编辑实例，返回使用layout
  effect
  在下一次输入前恢复焦点/选区/滚动；取消恢复无写入，确认restore共用原queue。
  成功统一接受服务端DTO、版本与颜色，清除设备草稿；失败保留历史预览和现有草稿。

Notes API、schema、版本持久化和 10,000 characters 限制未改变。Live task checkbox
是用户编辑；卡片、冲突与历史版本 checkbox 只读。

## 设备草稿与降级

- `searcher-client` IndexedDB 的 `state` store 仅写
  `note:draft:<userId>:<noteId>`（两段 ID 经 `encodeURIComponent` 编码）。
  恢复、保存、清除共用同 note 的本地 FIFO
  锁；不引入跨标签页锁。关闭编辑器的云端提交由 NoteEditor mutation queue 拥有。
- 旧 `note:draft:<noteId>` 只枚举 key 名。编辑器恢复先用当前鉴权的单 note API
  验证归属；退出发现通过当前账号完整 notes 列表过滤 ID 后才读旧内容， 不信任离线
  notes 缓存作为归属证明。已软删除 note 不在该列表中，其 legacy
  数据原样保留，不触发当前退出提醒。
- 账号隔离的 canonical 草稿即使版本落后也可恢复，进入显式冲突而不自动覆盖云端；
  未解决冲突的关闭/重开保留原草稿版本基线。legacy 草稿仍须字段有效且
  `version >= 当前服务端版本` 才迁移。新旧均可用时 `updatedAt` 较新优先，
  同时间取较高版本。迁移先等待 canonical 写事务完成，再清 legacy；
  任一步失败不删除唯一可恢复副本。新格式只写，不双写。
- 归属网络检查或 IndexedDB 失败不当作“无草稿”。退出保留登录态并提示重试，
  恢复失败保留原数据、暂停编辑并提供恢复重试。AppState 的会话对象身份是 auth
  epoch，同账号重新登录也换 epoch；旧异步结果不能提示或注销新会话。
- 取消退出不清草稿；确认退出保留同账号恢复能力。正常同步只清对应账号/note
  的副本，清理等待期间出现新输入则保留新草稿。关闭时同步失败或处于组合态、冲突时，
  设备草稿仍供恢复；账号失效不启动新请求。当前账号 canonical
  退出检查校验存储结构，不额外请求云端版本。

降级到只识别旧 key 的版本前，必须逐账号执行以下步骤，不能先删新格式草稿：

1. 暂停所有标签页的编辑；导出 `state` 中全部草稿的**原 key 与完整值**，
   保存独立备份，覆盖前同时备份已有 legacy 值。
2. 保持新版本运行，登录对应账号，用鉴权 notes API 确认 note 的归属与当前版本。
   网络或归属验证失败的条目不转换、不删除；在全部必要账号验证完成前停止降级。
3. 将该账号的 canonical 值复制到 `note:draft:<noteId>`。目标已存在时，按上述
   有效版本/时间顺序选取；不同内容的未选中副本必须留在独立备份中，不盲目覆盖。
4. 逐条等待旧 key 的写事务 `complete`，重新读取并核对完整值；任何失败立即停止，
   保留 canonical 与备份。转换过程中关闭新版本编辑器，避免自动迁移回 canonical。
5. 确认所有需恢复的草稿已被旧 reader 可读后才切换旧版本；仍保留 canonical 原 key
   与独立备份，不以清空新 key 作为回滚步骤。旧版本恢复不具备本次账号隔离
   与退出检查修复；需要重新升级时，以备份和同一版本/时间规则核对数据。

## Presentation

`markdown.css` 定义 canonical 标题、列表、引用、inline/pre code、table、link 与
HR；`notes.css` 定义 Notes chrome、focus ring 与可编辑 task layout。Live
明确消费 `--font-body-line-height`，不继承 Tabs panel 的 control 行高。结构 CSS
仅负责 ProseMirror whitespace、selection 与 overflow，不拥有产品 typography。

操作区与正文滚动分离；阅读宽度720px，最低正文240px，低高度允许整个NoteEditor滚动。
Live/Source各自记录滚动位置，模式切换的既有runtime生命周期不变。展开/收起编辑
不更换NoteEditor key；跨Host断点挂载策略不在此契约内。

Notes根列表的`note-summary.ts`只读分析入口复用remark/remark-gfm AST，不替换共享
editor
parser/serializer。根列表动态加载并按当前实例id/body缓存结果，query变化只生成
文本节点/mark片段；隐藏URL或Markdown语法匹配回退到escaped源码，不执行HTML。

Documents 的格式状态观察保留在 `features/documents/editor-extensions.ts`，
只读取当前实例的 selection / stored marks / document，通过 consumer callback
更新工具栏 `aria-pressed`，不改变 canonical Markdown、history 或 transaction
origin。 其 More 菜单 Portal 以实例 owner 关联编辑焦点边界；roving
tabindex、单行滚动与 触屏 header 由 Documents consumer 和 document-editor.css
拥有，不导入 Notes 或 shared runtime 初始依赖图。 visualViewport
缩小时，Documents consumer 在布局更新后依据实际工具栏、正文与
选区几何调整滚动，保持工具栏可见且光标位于其下方；监听与 RAF 随实例清理。
不修改正文、选区或共享 runtime。

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
- `deno task test:workspace`：原工作区行为与 Notes Live/Source/focus
  E2E，覆盖真实 PATCH/version/history、标题/正文/工具栏内部移动、dirty
  离开、debounce、草稿恢复、失败重试、多实例、在途旧请求保留新草稿，以及
  IME、undo/redo、本地 Ctrl/Cmd+K、任务编辑、409 云端替换、历史恢复、 9500
  字正文与超限草稿。
- `deno task check:ui`：Design Token 与 owner 门禁。
- `deno task check:bundle`：上述 byte budget、lazy 与 consumer 隔离门禁。
- 实页矩阵、computed-style parity、Chromium composition 与重复销毁后的
  DOM/listener 测量，依据 [UI 验收清单](../design/UI_CHECKLIST.md)
  的实页矩阵执行，结果写入 PR 描述。
