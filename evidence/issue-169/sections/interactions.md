# #169 交互、草稿与焦点复审

## 范围、证据口径与裁决摘要

- 基线：`main@0c8d36d2f0203f5289ab981bad0913d8bc241b29`；工作树 `/home/aawei/searcher/.worktrees/issue-169`。本分工读取 Git diff（空）、源码、现行 Issue 与测试，不修改生产代码，不执行 build/lint/tests/formatter/浏览器复现，不发布 GitHub 变更。
- 下文路径均相对此工作树；“覆盖”仅表示测试源码包含断言，**不是本轮已通过**。父进程的 full E2E 结果须另行关联；真机 IME/软键盘和列出的 fault-injection 场景不得由静态阅读代签。
- **#175 应纠正为 By Design**：普通自由窗口不因 Escape 关闭，既有 #85 §11、#91 Window Menu/Accessibility 及明确 E2E 一致。900px 受限窗口的正确观测是可见性/`mode`/焦点，而不是 `.desktop-window` 数量。
- **#174 的“切换后草稿静默丢失 / P1 已确认”证据不成立**：Zen edge `open` 不关闭 Apps domain、不清路由；AppSessionProvider 位于 presenter 外。是否要求“数据仍完整保留的临时隐藏”也弹确认，属于窄化后的合同解释问题，不能再与破坏性离开混为一谈。真正 close/back/导航替换仍应测试保护。
- **前轮便签“1500ms 内关闭需产品决定 unmount flush”应撤回**：DESIGN_SYSTEM.md:83–93 明确规定卸载不补发延迟保存，既有 E2E 刻意断言关闭后不 PATCH、重开恢复草稿。不是 Needs Decision，更不是已确认丢数据。
- 另发现 **便签登出草稿提醒的 key producer/consumer 确定不一致**（下文 I-1），影响提醒而非已证明的数据丢失；其余异常组合列出触发与缺失证据，不把尚未运行的风险冒充 Confirmed loss。

## 现行合同（不是因 Issue 关闭而推断正确）

| 合同 | 对本审计的约束 |
|---|---|
| [#85](https://github.com/aawai/searcher/issues/85) §2/§10/§11 | Core 分 domain 保存 route/stack/query，Host 决定可见性；已经存在/最小化的 surface 打开只 focus/restore，保留 nested route；dirty close/switch 不能绕过保护；AlertDialog → menu/popover → Overview → Zen Panel；普通 Widgets Window 不因 Escape 直接关闭。 |
| [#91](https://github.com/aawai/searcher/issues/91) | 明文 ordinary Window 不因 Escape 意外关闭；Overview Escape 退出；最小化窗口仍在 Overview。没有“自由窗口都要新增 Escape owner”的要求。 |
| [#141](https://github.com/aawai/searcher/issues/141) A1/A4 与补充 §1.4 | AppSession 保存在 presenter 之上；纯展示变化不询问，真正结束/离开 dirty 表单才询问；提交成功清会话，失败保留，账号切换立即隔离。Apps 的逐层 Escape 是新明确领域例外，并非让 Notes/Documents 跟随 Apps 关闭。 |
| README.md:35,51–59 | 受限同一 active surface、切换保持草稿；Dock Open/Focus/Restore 不重置 nested route；Close 返回 Dock；note entity 复用 NoteEditor；沉浸先关内部弹层再退出，不恢复为跨账号/跨 Host 状态。 |
| README.md:19–25 | 本段是 **Documents 长文笔记**（不是便签）：1500ms、组合输入后保存、离开/视图切换/关闭提交、本地恢复、stale 草稿显式冲突。不能拿该段覆盖便签的独立卸载合同。 |
| DESIGN_SYSTEM.md:83–93,118–123 | **Notes 便签**：标题/正文/工具栏同 focus boundary，模式 Tab 例外；真正离开 dirty 才 manual flush，卸载不补发延迟保存；本地草稿、autosave、mutation queue 属 NoteEditor；历史先 flush/await queue，失败留编辑；返回恢复选区/焦点/滚动。 |
| DESIGN_SYSTEM.md:180–196 | catalog 为单一键位/平台/可编辑 guard 定义，监听仍归各业务组件，不存在需新增的全局 dispatcher；本地编辑 > 当前页面 > Home global > 浏览器；Escape/普通导航不列为产品快捷键目录。 |

## Host + AppSession 实际状态迁移

| 动作/条件 | 实际生产端 → 消费端 | 草稿与可见性结果 |
|---|---|---|
| Zen edge open A→B | ZenLayout.tsx:201–230 → SearchHome.tsx:357–361 → workspace-host.ts:57–85 | 已 open 的 A 不 close；B 只设 open/active，若 B 已 open 保留 route，否则 root；切回 A 保留其 route。仅 presenter 子树换掉，AppSessionProvider 不卸载。 |
| Widgets Dock 打开已有/最小化 domain | SearchHome.tsx:363–399 → Host activate 与 Desktop `OPEN`（desktop-state.ts:174–196） | 不重置 nested route；OPEN 对 minimized 恢复再置顶。受限 inactive window 用隐藏类保留挂载（DesktopWorkspaces.tsx:316–332,483–505；desktop.css:159–160）。 |
| 进入 Apps create/edit | SearchHome.tsx:479–499 → Provider:23–33 → useAppSession.ts:34–51,204–275 | sessionKey=`user:route:appId`；只 key 变更初始化，编辑基线是 entry 快照，不随 apps props 更新；当前 activeKind/窗口形态不参与 key。 |
| 脏 Apps Back/Cancel/Close/真正路由替换 | SearchHome.tsx:271–295 → pendingAction → :1321–1351 → applyWorkspace | submitting 拒绝离开；dirty 先确认；继续编辑/Escape 保留；明确放弃才执行动作。`onSaved` :500–508 直接 apply back，避免成功保存被旧 dirty 拦截。 |
| domain close | SearchHome.tsx:217–233 → workspace-host.ts:88–110 | route 重置 root、stack 清空，当前 active 清空，query 保留；自由桌面 CLOSE 删除窗口，受限 MINIMIZE 保留 DOM identity，但 **不代表 domain route 未重置**。 |
| 单开导航 navigate 到另一 domain | SearchHome.tsx:235–267 → Host domain dispatch :124–181 | mobile/Zen 明确 close 其他 open domains，属可能结束 AppSession 的路径；requestWorkspace 在之前检查 affected Apps dirty。与 edge open 的临时隐藏不是同一迁移。 |
| viewport/presenter 切换 | SearchHome.tsx:142–150,1207–1316；useAppSession.ts:204–275 | Provider 仍在分支之上；AppForm 可重挂但 sessionKey 不变。Apps 草稿跨 Sheet/Window 保留。便签是另一 owner，可能卸载后从 IndexedDB 恢复，不能套用 Apps 内存规则。 |
| Style 切换 | useDesktopLayout.ts:67–73,121–144,146–200；SearchHome.tsx:1207–1316 | Desktop runtime 随 active user/style key RESET/按用户恢复，几何与 domain 分离；AppSession 是否保留看 domain route/key，不应把 Desktop RESET 直接等同草稿清空。 |
| 路由离开 Home（Settings/Ask/当前页搜索） | App.tsx:264–285,370–410；SearchHome.tsx:621–645；Provider 卸载 | Apps 仅 React 会话，无跨刷新存储；本次作用域未发现 AppSession 的全站路由 blocker。Documents destroy 会尝试 flush；便签取消 timer，保留已提交本地写入。需按 I-2 明确“全站离开”合同，不能声称 Host guard 覆盖所有 URL 导航。 |
| 登出/换账号 | SearchHome.tsx:453–467,479–499；useAppSession.ts:62–82；useDesktopLayout.ts:121–144,274–278 | Host transient reset；新用户 key 不继承表单，旧 controllers abort，响应还须 isCurrent revision/alive/key 检查。Notes 列表取数有 active/user 闭包（SearchHome.tsx:525–601）；Desktop render-owner 不匹配立即给空 state。便签本地 draft key 不含 user，但 note id 是实体身份，不能仅据此推断跨账号泄漏。 |

### #174 的精确纠错与剩余问题

`openWorkspace` 直 dispatch 是事实，但“直 dispatch ⇒ form 卸载 ⇒ 丢草稿”漏掉 Provider 与 Host reducer 两个关键消费者。Zen apps/create 输入 X → edge 便签 → edge 应用：Apps route 仍 create、sessionKey 仍相同、X 仍由 Provider 保有。证据链：SearchHome.tsx:357–361 → workspace-host.ts:57–85（不改其他 model/open）→ SearchHome.tsx:479–499 → :1207–1210（Provider 外置）→ useAppSession.ts:204–275。

合同要分三层：①纯 presenter 重挂/隐藏不应弹保护（#141 明文）；②close/back/目标 app id 更换会结束当前会话，dirty 必须确认；③#85 的 dirty switch 如果也要求“临时隐藏且可恢复”的 edge switch 弹窗，需要产品明确解释。建议父进程将 #174 现有 P1/Confirmed loss 撤回，以 **Not Reproduced（所报损失）+ Needs Decision（是否所有保留态 switch 也确认）** 回填；不要先修成每次 Dock/edge focus 都提示的回归。

最小运行证据：Zen 1440 和 390，create/edit 分别填写 URL/name/未提交图标 URL，edge 来回；保存、取消、真实 Close、确认放弃分别记录 field、route、dialog、请求数。若数据保留，无权写 Confirmed loss；若合同决定所有 switch 确认，单独记录 UX 期望，不夸大为数据已丢。

## Escape 实际优先级与焦点保护

这不是编号全局 dispatcher。实际由 window capture 的 Apps coordinator、React 本地处理、Base UI 弹层和 document bubble 的 presenter/沉浸处理组合完成；“P0/P6”只是前轮描述，不能当正式优先级 API。

| 事件阶段/场景 | 实际处理及保护 | 焦点/退出结果 |
|---|---|---|
| Apps window capture | workspace-escape.ts:17–46；SearchHome.tsx:1186–1205 仅前台 active Apps 启用，沉浸时禁用；IME/defaultPrevented 放行；owned dialog 只 dismiss；owned expanded popup/overlay/boundary 放行 | pending dialog Escape 只取消确认；后续 Sheet `escapeManaged` 取消自身默认 dismiss，避免一键两层（WorkspaceSurface.tsx:188–195）。 |
| Apps 领域层 | SearchHome.tsx:332–355 的 appsEscapeIntent 结果：query → arrange → folder → form back → root close | clear query focus search；finish arrange focus 入口；folder 返回 tile，缺失 fallback search；form 回入口记录 appEntryFocus（:184–216）。#141 A4 明确允许 Apps root 收起，不能推广至普通窗口。 |
| 内部 Notes 历史 | NoteEditor.tsx:676–686,861–866；history boundary 让 Apps capture/Sheet 放行 | React preventDefault/stopPropagation 返回编辑；:565–595 恢复 selection、scroll、元素 focus。restoreConfirm 存在时不由历史先退。 |
| menu/popover/dialog/AlertDialog | WorkspaceSurface.tsx:109–121,203–225；DesktopWorkspaces.tsx:267–277；useDocumentImmersion.ts:177–191 | presenter/沉浸让弹层先处理。FolderNameDialog target 在 role=dialog 内已有 Apps capture 放行，不能仅因 hasDialog 未枚举它认定误关。 |
| 沉浸 Escape（document bubble） | useDocumentImmersion.ts:172–195，只在无可见 overlay、未 defaultPrevented、非 composing 时 exit | 不 CLOSE、无 geometry dispatch；:88–112 恢复进入沉浸按钮及正文滚动，composition 时 deferred focus。选择其他 Dock/window/Overview 先 exit(false)（DesktopWorkspaces.tsx:362–392,555–581）。 |
| Overview | DesktopOverview.tsx:38–43 为 Base UI Dialog；DesktopWorkspaces.tsx:610–619 returnFocus | Escape 只退出总览，回 Dock 总览入口；选择 preview restore/focus 目标，不由 finalFocus 抢回 Dock（:362–392）。 |
| Zen Panel（document bubble） | WorkspaceSurface.tsx:102–123，非 apps 用 onEscape；有 overlay 放行 | 收起工作区；root 初始 Close，nested 初始 Back（:87–101）。WorkspaceShell.tsx:78–107 保存实际 opener，关闭回 opener；已移除时 fallback workspace trigger。不是默认抢 Search。 |
| mobile Sheet | WorkspaceSurface.tsx:185–225；modal focus trap、初始 chrome :228–239 | Escape 先弹层/内部 boundary，再领域 onEscape；X/backdrop/swipe 为真正 close 并走 guard，不等于逐层 Apps Escape。finalFocus=false 由 Shell 唯一恢复。 |
| 768–1023 constrained Notes/Documents | DesktopWorkspaces.tsx:259–296 → onClose → SearchHome.tsx:217–233 → MINIMIZE | 窗口 hidden，DOM 数量不变是成功可接受结果；desktop-state.ts:275–293 保留 identity，desktop.css:155–156 display:none；DesktopWorkspaces.tsx:225–235 回 Dock。 |
| >=1024 ordinary Notes/Document window | DesktopWorkspaces.tsx:260–267 明确忽略非 constrained 的 Escape | **不关闭 By Design**（#85/#91）；用 Close/window menu 操作，不新增 owner。Apps 有明确领域例外，沉浸也仅退出沉浸。 |

### 快捷键 catalog 与消费者闭环

`shortcut-catalog.ts:19–99` 列出 `/`、Mod+K 聚焦搜索、Mod+Enter 新标签、Ask Mod+F、便签 S/B/I/K/Shift+X；`:199–223` 统一精确修饰键、IME/defaultPrevented 和 editable 检查。Search 的 document bubble handler（SearcherSearchInput.tsx:120–134）先排除 editable；便签正文 capture（NoteEditor.tsx:289–324）消费 Mod+K 插链接并 stopPropagation；Ask 页面 handler 在 ConversationWorkspace.tsx:105–115 挂载/清理，含 composer 符合页面语义。Settings 说明消费 catalog（ShortcutsSettings.tsx:131–137），不应另建列表或把 Escape 普通导航补入 catalog。

注意 Documents 的快捷键/IME实现不是此 catalog 消费者，见 I-5；不可把便签测试通过（或存在）外推成 Documents 组合输入也正确。

## 草稿/焦点保护矩阵（云端、本地、内存分开）

| 编辑域/动作 | 内存 / 本地 | 云端与恢复 | 焦点/危险离开 |
|---|---|---|---|
| Apps resize/minimize/Dock/edge 暂藏 | Provider 内存 session，非本地草稿存储；useAppSession.ts:204–275 | 不自动创建/保存 App；操作异步由 session owner 持有 | 纯 presentation 不询问；旧响应 revision 检查 :62–82,336–353；有效 close/back dirty 确认。 |
| Apps save success / failure / discard | 成功 onSaved back 导致 key 清空；失败保留字段错误；显式确认放弃后导航 | executeSave :518–590；单次提交 savePending | 取消业务确认回 submit trigger（:594–601）；back 回进入项。 |
| Note 每次编辑/IME | NoteEditor.tsx:207–241：先更新 draftRef/state，异步 setLocal `note:draft:<id>`；IME 暂停 timer | 非 composing 1500ms autosave；不是“同步落盘”，必须等待事务完成才算 durable | 标题、正文、toolbar、所属 portal 属一个 boundary，模式 Tab 例外；:244–270 defer 检查最终 focus。 |
| Note 真正 blur / history / color | dirty 才 manual flush，submittedDraftRef 去重；composing/内部移动不 flush | save/color/restore 同 mutationQueue（:392–497,605–666）；history 等 queue，失败/409 留编辑 | history 返回恢复 focus/scroll/selection；颜色先 flush 再 patch。 |
| Note Close/unmount <1500ms | :202–205 取消 debounce/blur timer；已 enqueue IndexedDB 写入不因组件卸载取消 | **不补 PATCH**；重开 :147–175 恢复 stored.version>=server.version，显示 unsynced；恢复本身不启动新 autosave | 已有明确不 unmount flush 合同，不另开“是否需要 unmount flush”决策。 |
| Note 保存成功时又有新编辑 | :416–435 只在 ref 与请求 data 一致才 deleteLocal，否则更新本地草稿 version | 避免旧响应删除较新正文，队列下一请求用最新 latestNoteRef.version | 对应 notes-focus.test.ts:329–382 的 immediate-close 回归。 |
| Note 冲突/历史恢复 | :511–540 useCloud 等 queue，选择 local/merge 按 conflict version；:629–666 restore 进入同 queue | restore 成功同时换 latest/draft/ref/color、清本地、onSaved；失败仍在历史显示错误 | history/restore 各自 Escape 层次，不触发工作区同键关闭。 |
| Document 编辑 | document-session.ts:98–105,438–475：user+doc 隔离 IndexedDB，立即 enqueue 写入 | 1500ms；:291–346 等 inFlightSavePromise；dirty 新编辑保存后再 debounce | onDirtyChange **不是一般 dirty**，只有 dirty/error 且 localDraftError（DocumentEditor.tsx:222–232）；本地成功时允许关闭。 |
| Document blur / view switch / unmount | DocumentEditor.tsx:138–141,574–582,107–118 | blur/切模式 save；destroy :812–848 等在途，dirty 再 executeSave，失败持久化；网络 error/conflict不应冒称云端已成功 | entity requestClose :53–63 仅 unsafeDraft 警告；本地已保存而网络未保存不必弹“必丢”确认。 |
| Document recover/conflict | session :361–429 offer 不同内容草稿；:501–550 stale apply 保留旧版本并 conflict，不静默覆盖服务端 | `server/local/new` 显式解决，restore 先 save 并拒绝 error/conflict（:718–733） | beforeunload :234–252 仅 dirty/error + localDraftError 阻止；异步请求发起不能等同浏览器卸载时已 durable。 |

IndexedDB 层 `lib/local.ts:35–80` 按 key 串行 read/write/delete，set/delete Promise 在事务 oncomplete 才 resolve。它支持“enqueue 写入不会因编辑器取消 timer 被取消”，不证明浏览器被杀/Quota/存储故障时数据必定落盘。

## 可疑点、最小复现与尚需证据（不扩大为静态 Confirmed 数据丢失）

| ID / 裁决 | 代码事实与影响边界 | 最小复现及缺失证据 |
|---|---|---|
| I-1 **Confirmed（静态 guard 接线缺陷，非 loss）** | AppState.logout 扫 `draft:<userId>:`（state.tsx:455–464），实际便签只写 `note:draft:<noteId>`（NoteEditor.tsx:136,216–220），因此真实便签草稿不可能命中该提醒。App.tsx:343–366 明确已有“有未同步的便签草稿”UI 合同。该消费者没有 fallback 扫描实际前缀。 | 登录 A，断网/阻止 note PATCH，编辑并等对应 IDB tx 完成；点退出，记录无“有未同步的便签草稿”提醒；重新登录 A 重开同 note 验证仍恢复。需运行证据证明 UI 路径，不得把无提醒写为草稿消失。建议父进程去重后独立跟踪提醒失效，P2。不要以直接扫全部 note keys 的方式泄漏其他账号提醒，需确定 owner-aware 方案。 |
| I-2 **Confirmed（运行后更新）** | 实际 Settings Link 离开 Home 无确认，返回 Apps/create 字段为空；#141 真实离开保护适用。 | 最终证据 `interactions/apps-route-loss.json`；跟踪 C2/#174。原 edge switch 仍保留，不能把两种路径混为一谈。 |
| I-3 **未验证**：便签 close + IndexedDB 不可用 | 异常本地写失败与关闭组合需要 fault injection。 | 未执行该组合，不裁决数据丢失，也不记 Not Reproduced/通过。 |
| I-4 **未验证 / Needs Decision**：过期便签草稿 | Notes 与 Documents 的 stale draft 合同可能不同。 | 未执行多会话版本冲突组合，不裁决已丢失或已安全处理；需明确恢复合同及实验。 |
| I-5 **未验证**：Documents 真实 IME | 静态疑点不等于原生 composition 失败。 | 无真实输入法设备；不能由 synthetic event 或计时器测试代签。 |
| I-6 **未验证**：Documents 本地失败加 conflict/saving | 多故障交叉组合未运行。 | 不由单个 dirty boolean 断言数据丢失。 |

这些新增候选均是审计范围内的失败路径；其存在不为 #174/#175 原报告提供追认依据。I-1 可以静态确认提醒不可达；I-2 需要合同裁定；I-3–I-6 均缺特定运行证据，不应直接创建“已确认数据丢失”的修复 Issue。

## 既有 E2E → #169 交互条目映射

**以下全部仅阅读，运行状态统一为“本分工未运行；待父进程结果关联”。** 表中标出的源码覆盖不代表真机/新候选有 coverage。

| #169 交互条目 | 既有测试位置与实际断言 | 仍缺证据 |
|---|---|---|
| Apps 跨 Host 草稿、业务确认、最小化/恢复 | `web/e2e/apps-session.test.ts:5–142`：完整字段/icon input/AlertDialog 跨 767/768/1023/1024/390/1440，maximize/minimize，取消继续编辑与明确放弃；`apps-interactions.test.ts:172–339` real upload/pending save；`apps-races.test.ts:5–末` obsolete fetch/failed save | #174 Zen edge 往返且不 ending session 的专门证据；全站 route/换账号 dirty 与旧请求组合。 |
| Apps dirty Back/Close/save | `workspace.test.ts:318–462` clean Back 无确认、dirty 导航确认、保存；`workspace-shell.test.ts:382–502` failed add/edit 保留并重试；`apps-session.test.ts:123–142` dirty Cancel | 不要只跑 clean route 冒称 dirty switch/route 已验收。 |
| Escape 层级、IME 放行、菜单优先 | `apps-interactions.test.ts:59–169` query/arrange/folder/menu/mobile IME；`workspace-shell.test.ts:719–850` keyboard+menu focus+ordinary Notes Escape不关闭+800px Escape隐藏并回 Dock | 普通 document/note entity 对话框组合、连续 Escape 一键一层；新 unsafe draft 场景。 |
| Zen Panel/Sheet opener 恢复 | `workspace-shell.test.ts:851–954` 1440/390 root Close 初始焦点、nested Back、menu优先、第二 Escape 关闭、回实际 Apps edge opener 而非当前 Notes；`:504–718` viewport/theme/mode bounded chrome、focus trap/Body | opener 被删/权限变更 fallback、新边界宽度、真机软键盘后的焦点。 |
| constrained inactive DOM 与草稿/单 active | `workspace-matrix.test.ts:1598–1729` 768 single-active、hidden inactive、no drag/resize、presets、nested note、无 Overview；`workspace-shell.test.ts:821–844` 800 Escape hidden/Dock focus | 900px 同样需看 isVisible/mode，不以 count判失败；同时脏 Apps/Docs 的隐藏/恢复运行快照。 |
| Overview restore/focus | `workspace-matrix.test.ts:1112–1144` Overview 选择并恢复、关闭回 Dock；生产 `DesktopOverview.tsx:38–43` 的 Dialog 是 Escape owner | Overview Escape/finalFocus 明确运行记录，含 minimized entities，不推导为所有浏览器通过。 |
| Note focus/autosave/关闭恢复 | `notes-focus.test.ts:88–242` clean不PATCH、dirty title/body一起自动保存、内部focus不重启timer、history/color单次manual、显式S；`:243–298` title IME、卸载不PATCH/本地恢复；`:299–383` retry/旧response不删新draft；`:384–末` 两实例只flush实际离开的dirty实例 | IDB failure/进程终止/旧version draft；该测试强有力否定前轮“unmount取消timer本身就是缺陷”。 |
| Note 即关重开/冲突/版本 | `workspace.test.ts:464–605` <1500ms Close→reopen local→下一次编辑autosave；`:648–后续` real server conflict；`notes-live-editing.test.ts:58–78,134–224` IME/cloud replace/限长拒绝/restore；`notes-history.test.ts:46–149` manual→history、取消/恢复+version、失败/409留编辑、Escape返回 | stale local note、offline logout提醒实际key、Close+IDB failure。 |
| Documents Host/短屏/保存 | `documents.test.ts:155–298` 四宽度两style/theme mode/overflow、390x400 typed save；`document-host-boundaries.test.ts:50–后续` #158 Zen/short host；`document-immersion.test.ts:288–357` 普通/沉浸dirty blur对照请求数一致 | unsafeDraft+localDraftError 的 Host close/route、conflict/saving分支；真机composition。 |
| 沉浸 Escape/弹层优先/错误保留 | `document-immersion.test.ts:169–174,249–287` Escape退出且同Editor/selection；`:358–408` history Escape先关dialog保留沉浸，network retry/409不退出 | 实际软键盘+IME退沉浸 deferred focus；不能用普通窗口 count判断沉浸是否退出。 |
| shortcut catalog 可发现性与 runtime 优先级 | `settings-shortcuts.test.ts:50–233` guest/direct/platform sr keycaps/390-768-1440；`shortcuts-search.test.ts:43–114` editable不抢焦点/精确mod，`:115–232` late suggestions/commands/new-tab；`shortcuts-notes-ask.test.ts:161–320` note K不抢search、B/I/strike/S、Ask F限页面 | Documents并未由这组便签catalog测试覆盖；真实macOS Cmd仅格式/模拟平台不等于真实设备键盘。 |
| route/账号切换/桌面恢复 | `workspace-shell.test.ts:1351–1416` query跨presenter、logout清transient；`workspace-matrix.test.ts:1207–1594` persistence/identity/style；`navigation.test.ts:338–507` appearance logout/expiry | 这些不等于 dirty Apps全站离开、便签logout草稿提醒、IDB故障恢复已测；须单列I-1/I-2/I-6。 |

补充 unit（不是 E2E，也未本轮运行）：`features/documents/document-session.test.ts:247–273` user/doc隔离，`:383–575` equal/stale/new draft offer与stale apply conflict，`:631–752` debounce/显式setComposing timer，`:792–951` error/conflict/in-flight保留。它们用 MemoryDraftStorage，不证明真实 IndexedDB 故障下 Host guard 或真实IME事件接线。

## 建议父进程发布时的修订顺序

1. 在 #169 回填及 #175 中优先纠正普通窗口 Escape 与受限 count 的误判，链接 #85/#91 和 `workspace-shell.test.ts:821–844`；不创建或实施补owner修复。
2. 在 #174 删除“静态已确认丢失”“P1 confirmed loss”及直接给 openWorkspace套guard的既定方案；写清 Provider/Host retention 和保留态切换的合同疑问，保留真实破坏性 Close/Back保护验收。
3. 将便签 unmount flush 的 Needs Decision 改成 By Design，引用 DESIGN_SYSTEM.md:87–90 和 `notes-focus.test.ts:270–298`；异常IDB路径另列，不借异常推翻正常合同。
4. I-1 去重并由父进程决定独立提醒修复Issue；I-2/I-3–I-6按上表补合同或运行证据后裁决。所有生产改动、GitHub发布与测试结果均由父进程负责，本分工没有执行或宣称通过。
