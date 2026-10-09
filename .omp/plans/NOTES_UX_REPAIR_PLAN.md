# 便签交互与样式修复计划

## 目标、依据与完成定义

修复便签长文编辑操作不可达、历史无即时反馈、编辑宽度两极化、小触点、卡片点击冲突、工具栏过密、列表辨识不足和重复嵌套边框。保留当前视觉方向与业务契约，不重新设计便签产品。

实页依据：2026-10-08 当前工作树 production
build，隔离账号/SQLite，390×844、768×1024、1440×900，light/dark，Zen/Widgets。已观察新建、Live/Source、长文保存、历史、首页固定、卡片双击和
Widgets 最大化。390px 长文编辑器高约1480px、颜色位于 y≈1651；1440px 历史插入
y≈1669；Zen Panel 宽400px；Widgets
最大化编辑器宽约1406px；首页展开/更多触点24px、色点触点16px；双击标题打开编辑器而非明确折叠；默认列表仅标题。数字用于证明问题，不作为新布局尺寸。

本次计划阶段未实现产品修复。上轮未完成失败/冲突、完整键盘和 axe
验收，不能将这些状态写成已通过；实施阶段必须补齐。完整交付必须完成下述全部工作包及验收，不以第一批或仅编译通过结项。

## 可行性核实

| 工作           | 已确认的实现依据                                                                                                         | 判断与风险                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 长文滚动与宽度 | WorkspaceSurface 有 expanded 属性；workspace.css 已有展开规则；NotesWorkspace 与 DesktopWorkspaces 都嵌入同一 NoteEditor | 可在既有 Host 内实现；重点验证 flex 高度链、Source 内部滚动及低高度窗口                                       |
| 历史子视图     | NoteEditor 已有 versions GET、restore POST、mutationQueue、IndexedDB 草稿与版本冲突处理                                  | 不需要新 API；现有 restore 没有统一经过 mutationQueue，必须在本次恢复路径统一提交顺序，避免旧响应覆盖恢复结果 |
| 工具栏收纳     | NoteMarkdownToolbar 已通过同一 onCommand 执行15个命令，现有 shadcn menu 可复用                                           | 无新编辑框架；Portal 焦点、selection、IME 和 blur-save 是必要风险边界                                         |
| 卡片与触控     | NoteCard 为列表、FloatingNotes、ControlledNotes 共用；已有44px control-touch-target Token                                | 一处修复覆盖调用方；需同时保住拖动手柄、代码滚动和卡片预览                                                    |
| 摘要/匹配片段  | NotesWorkspace 已取得 title/body/updatedAt，客户端搜索基于 canonical Markdown；仓库已有 remark + remark-gfm              | 无后端字段或新依赖；不得将 Documents-only module 引入 Notes，也不得把 parser 提升到 Home initial graph        |

可行性结论：现有技术栈与数据契约足够实现，未发现外部阻塞条件。此结论基于代码能力和已运行实页，不代表拟议修复已经通过运行验证。

## 范围与不变量

- 覆盖 Zen/Widgets 的便签编辑、便签根列表/搜索，以及首页
  FloatingNotes/ControlledNotes 的共用卡片交互。
- 不改 Notes API、数据库 schema、10,000字符限制、1500ms autosave、IndexedDB
  设备草稿、版本/snapshot策略、置顶/首页固定分组与排序语义。
- 不引入编辑器框架、第二套 Markdown parser、全屏 Dialog 或自制
  Button/Menu/Tabs/AlertDialog。
- 不修改 Documents 用户行为、桌面窗口拖动/Snap/Dock/Overview 规则、移动 Sheet
  外部几何、壁纸或全局视觉方向。
- 仅在统一通用编辑几何 Token 时迁移 Documents 现有消费者，值保持不变，不重排
  Documents 界面。
- 与 [#109](https://github.com/aawai/searcher/issues/109) 独立：#109负责 Widgets
  列数、masonry、二维拖拽和排序；本计划负责卡片内容/交互、编辑器和历史。摘要增高后必须兼容其动态高度测量，但不实现或改写其布局算法。两者无硬性先后依赖；集成后验收卡片动态高度。
- 不改变不同 Host 之间既有跨断点挂载策略。本计划保证同一 Host
  内展开/收起、最大化/还原、历史开关不重建编辑实例；不得承诺现有跨 Host
  切换天然保留 undo。

## 锁定交互决策

### A. 编辑器布局与滚动

1. 正常可用高度下，Host chrome不变；NoteEditor内部为顶部操作区 +
   正文滚动区。顶部包含标题、Live/Source、保存状态、历史、颜色与格式工具栏。颜色不再放在正文末尾。
2. Live正文使用独立纵向滚动容器；Source
   textarea占同一正文区域并使用其原生内部滚动。禁止 Live 正文与 Host body
   同时出现竞争的纵向滚动条。错误/冲突提示放在操作区后，可读取全文及执行恢复动作。
3. 正文最低可读高度240px。若可用高度小于“实际顶部高度 +
   240px”，NoteEditor整体允许纵向滚动，正文不缩成零；此时不保证全部顶部动作同时固定。不得以裁切提示或缩小触点解决低高度问题。
4. 正常移动布局格式工具栏只能一行；其他顶部控件按现有控件Token回流。失败状态全文必须可读，不要求挤在单行。
5. Live/Source分别记住滚动位置，切换不新增版本；不承诺两个模式的像素位置相等。不得为本任务改写现有模式切换的runtime生命周期。
6. 顶部颜色按钮显示当前颜色名称与色样，打开5项单选菜单；颜色仍属于编辑焦点区之外，dirty草稿先flush，颜色更新遵循同一mutationQueue。

### B. Host展开与阅读宽度

1. Zen >=768px
   的便签编辑头部增加“展开编辑”/“收起编辑”同一切换按钮。默认仍为400px
   Panel；展开宽度为min(900px,
   viewport减两侧现有workspace-inset)，保持右侧非模态Panel。不新增遮罩、不切换route、不更换NoteEditor
   key。
2. 展开状态仅属于当前Host中的便签编辑会话；进入历史继承；返回根列表或关闭工作区重置为默认。<768px不显示该按钮，保留现有Sheet。
3. Widgets
   > =1024px复用既有maximize/restore；768–1023px复用既有constrained展开控件；不增加第二套窗口控制。
4. 所有Host的Live/Source正文居中、最大阅读宽度720px，窄容器填满可用宽度。标题与正文对齐，顶部操作区可占容器宽度。宽表格/代码只在正文内局部横向滚动，不能撑宽页面。
5. 将现有900/720/240px编辑几何提升为通用Token：`--workspace-editor-expanded-width`、`--editor-readable-width`、`--editor-min-content-height`。迁移现有document命名的对应Token所有消费者后删除旧名，不留alias；现有Documents几何不变。Owner为design-system/tokens.css，Host消费900，Notes布局消费720/240。

### C. 历史子视图与恢复

1. 历史是NoteEditor内部子视图，不新增NotesRoute，不卸载当前Live编辑实例或Source
   textarea。编辑区在历史打开时隐藏且不可聚焦；隐藏前记录焦点、选区及滚动位置。历史区域立即可见，不插入正文末尾。
2. 点击历史时，如果IME组合中则不进入；否则进入过渡状态，暂时禁止继续编辑/重复进入。dirty先执行一次manual
   flush，等待mutationQueue完成。保存失败或409则留在编辑视图，展示现有错误/冲突，不继续加载历史；clean不发PATCH。
3. 历史GET在flush成功后执行。加载、失败重试、空状态都占同一历史子视图。版本按version降序；默认选中最新可恢复快照。每项显示版本号、绝对本地时间和标题，预览显示完整标题及只读Markdown正文。
4. 历史内容宽度>=640px时为版本列表+预览两列；<640px时为单列选择列表后接预览。容器宽度而非viewport决定分栏。各区域滚动可键盘到达，不产生页面级横向溢出。
5. 内部“返回编辑”及Escape返回原编辑视图，恢复原焦点/选区/滚动，不发PATCH、不生成新版本。菜单/恢复确认打开时Escape只关闭最上层菜单/确认，不退出历史。
6. Host现有返回按钮仍返回便签根列表，关闭仍关闭工作区/实体窗口；这些行为不被历史冒充或重新定义。历史子视图自身的返回按钮明确命名“返回编辑”，与Host“返回便签列表”区分；实体窗口没有新增根列表返回按钮。
7. “恢复此版本”使用现有AlertDialog，说明将替换当前标题与正文；取消无写入、焦点返回恢复按钮。确认后取消autosave
   timer，将restore加入现有mutationQueue，等待既有在途请求结束，操作期间禁用重复恢复/编辑。
8. 成功后用restore
   DTO统一更新latestNoteRef、draftRef/state、color、父级note及设备草稿；返回编辑并显示已保存，使用服务端返回的版本号，不本地猜测版本。失败保留历史预览与当前草稿，可重试；不得错误显示已保存，不得让恢复前响应覆盖恢复结果。

### D. 工具栏菜单与编辑焦点

1. 以工具栏实际容器inline-size决定两档，阈值640px，不使用Host类型判断。
2. <640px：固定6个入口，依次“标题”“粗体”“斜体”“任务列表”“链接”“更多格式”。标题菜单含H1/H2/H3；更多格式含删除线、行内代码、无序列表、有序列表、引用、代码块、表格、分隔线。
3. =640px：标题仍合并为一个入口，其余12个命令直接显示。合计13个入口；不重复提供同一动作。
4. 全部15个命令在Live/Source可用，shortcut
   catalog不变。沿用现有Button和DropdownMenu，不加入新的格式命令。
5. 工具栏trigger、菜单及Portal属于对应NoteEditor实例的编辑焦点区。不能仅用“editor.contains(activeElement)”判断Portal；实例归属需明确，不能把其他便签菜单当作内部。
6. 打开菜单、键盘选择及执行命令不提前manual-save，不重启1500ms
   debounce；执行命令引起真实内容变化时按现有change语义调度autosave。保留原选区，执行后正文获得焦点；Escape关闭菜单返回trigger且不修改正文。IME组合时不执行命令。
7. 历史、颜色及外部控件仍是外部焦点；保持既有dirty
   flush/clean零提交契约。菜单内部边界不得扩大到整张NoteEditor或整个页面。

### E. 卡片行为与触控

1. 卡片标题成为正式可聚焦Button，鼠标单击或Enter/Space进入编辑；删除article上的单击打开与双击切换处理，不使用延迟单击区分双击。
2. 展开/折叠仅由现有显式按钮控制；拖动仅由既有drag
   handle控制。正文点击、选择文字、滚轮、代码水平滚动不打开编辑、不折叠、不启动拖动。只读任务checkbox仍只读，链接仍走现有安全策略。
3. <768px或any-pointer:coarse时，展开/更多/颜色菜单入口至少44×44px；触控下操作常显，不依赖hover。桌面细指针可保持compact控件，focus-within必须显示动作。
4. 首页/列表展开卡片的颜色点改为当前颜色菜单入口，与编辑器使用相同5项单选语义；compact卡片颜色入口放在更多菜单内，不额外占常驻空间。颜色显示名称和选中状态，不只靠色彩区分。
5. 复用shadcn Button/Menu radio
   items；五种颜色值、卡片纸张背景、固定/置顶/删除行为不变。菜单、焦点环和触点不挤压/遮挡标题。
6. FloatingNotes既有置顶pointer
   guard须排除新标题/菜单触发控件，保留pre原生滚动保护；不能通过stopPropagation覆盖所有正文操作。首页拖动后位置持久化继续有效。

### F. 列表摘要与搜索片段

1. 仅NotesWorkspace根列表/搜索的compact卡片增加一行正文摘要；不修改首页compact卡片的信息密度。全文展开预览维持现有Markdown
   renderer。
2. 正文摘要取Markdown AST可读文本，块间空格分隔，忽略raw
   HTML与图片目标URL，保留链接显示文字、代码内容及列表文字；空正文显示“空白便签”。一行视觉截断，完整title属性不是唯一访问方式。
3. 复用仓库已安装的remark +
   remark-gfm，以一个Notes专用、只读AST摘要分析入口处理正文；不自制Markdown语法剥离器，不复制或替换共享编辑器parser/serializer。通过Notes
   root懒加载，不导入features/documents/editor-content.ts，不把parser加进Home
   initial graph。结果按note
   id/body缓存于当前实例；编辑后失效，删除后清理，不用模块级mutable
   cache。不得每次query按键重新解析全部Markdown。
4. 搜索membership和排序保持现有`trim().toLowerCase()`对title+canonical
   body的包含匹配，不改成全文分词/后端查询。
5. 标题或可读正文匹配时，用React文本节点和mark显示匹配，正文取首次命中前最多20个Unicode
   code points、命中串及后最多60个code
   points，截断端加省略号。标题命中且正文不命中时显示普通摘要。
6. 仅Markdown语法或隐藏URL命中时不丢掉现有搜索结果，显示“匹配Markdown源码”及escaped源码片段，取相同前后范围；禁止dangerouslySetInnerHTML、直接插入不可信HTML或regex未转义query。
7. updatedAt存在时显示绝对本地短日期/时间，不存在时不显示；不增加相对时间timer。时间是次级信息，不抢标题层级。
8. 摘要/更新时间不改变fixed/other分组、拖拽排序、expandedIds和搜索清空行为；须兼容#109对卡片实际高度的测量。

### G. 样式减法与Owner

- 保留Host唯一外框。去掉NoteEditor完整边框/圆角与Live正文重复的卡片框，不去掉正文focus-visible反馈；Source保留正式Textarea语义，不发明无焦点控件。
- 标题、操作区、正文使用semantic spacing和现有type
  scale；模式栏只保留必要分隔，不叠加阴影/装饰背景。格式图标消费共享图标尺寸，不改全站Button尺寸。
- design-system/tokens.css拥有Token；workspace.css拥有Panel展开；notes-workspace.css拥有域内布局/历史/列表适配；notes.css拥有便签chrome和卡片；markdown.css保持canonical正文排版owner。
- 不改变其他Markdown消费者的代码块、inline code、表格排版；Issue
  #138已修复的浮动画布代码滚动不得回退。

## 实施工作包与依赖

1. **M1
   编辑几何与纵向结构（A/B/G）**：建立通用Token并迁移消费者；贯通Workspace/实体window高度链；实现Zen展开、720px阅读宽度、240px最低正文和低高度回流。先验证长文滚动，再删除重复框。不是先换皮再补高度。
2. **M2
   历史子视图与恢复（C）**：保留编辑实例，实现过渡/加载/错误/空态、返回编辑、响应式预览及确认恢复；恢复纳入原mutationQueue，不创建第二队列。依赖M1的正文与历史可用空间。
3. **M3
   菜单和卡片交互（D/E）**：先校准Portal选区/焦点边界，再收纳格式和颜色；统一卡片标题入口、移除双击、补触点。不得先把菜单上线再修保存副作用。
4. **M4
   列表辨识（F）**：接入懒加载AST摘要、缓存、搜索片段与次级更新时间；独立于历史功能，沿用既有分组/DnD。
5. **集成验收**：执行下述完整矩阵，更新文档、CHANGELOG与UI
   checklist。每个工作包应可独立验证/回滚，但Issue只有全部验收后才能关闭。

主要文件：NoteEditor.tsx、NoteMarkdownToolbar.tsx、NoteCard.tsx、FloatingNotes.tsx及ControlledNotes对应调用方、notes.css、NotesWorkspace.tsx、notes-workspace.css、WorkspaceShell.tsx、WorkspaceSurface.tsx、workspace.css、DesktopWorkspaces.tsx中Notes嵌入适配、design-system/tokens.css。实现前对变更的exported
Interface查references，迁移每个调用方；不预设所有文件都必须修改。

## 必须通过的验收

### 外部可观察回归（复用现有测试并补必要缺口）

- [ ] 长文Live滚到中段后操作区可用；Source在同一正文viewport正常滚动；低高度窗口正文>=240px且动作/错误不被裁切。
- [ ] Zen展开/收起及Widgets最大化/还原不丢draft、选区、undo，不发仅由几何变化引起的PATCH；无NoteEditor重新挂载。
- [ ] 历史进入dirty恰好一次manual
      flush，clean零PATCH；在途save后读取正确版本；失败/409留在编辑；列表加载与错误重试即刻可见。
- [ ] 历史返回编辑恢复焦点/选区/滚动，零新版本；取消恢复零POST；成功恢复title/body/color/refs正确；在途旧响应不能覆盖恢复内容；失败保留预览和草稿。
- [ ] 15个格式命令Live/Source均可达；菜单键盘操作保留selection、不会提前flush；两个编辑实例互不干扰；IME期间无格式提交/半成品保存。
- [ ] 标题键盘/鼠标进入编辑；正文选择/滚动不打开；双击不再改变展开；显式展开和首页拖动/持久化/代码原生滚动继续有效。
- [ ] 5种颜色菜单单选、焦点返回、44px触点通过；dirty颜色操作保持现有flush和queue顺序。
- [ ] 普通摘要、空正文、标题匹配、正文匹配、Markdown源码-only匹配、Unicode
      query及带HTML/正则字符输入均正确；membership/排序不变且不执行HTML。
- [ ] 既有固定/取消固定、置顶、排序、展开、删除/回收站及API权限回归不变；与#109集成后摘要高度变化无重叠，不改其列数阈值。

### 实页矩阵（不能由测试/build替代）

- [ ] 390×844、768×1024、1440×900 × light/dark ×
      Zen/Widgets共12组authenticated真实编辑页面截图；每组确认实际theme/layout/active
      editor，不把首页截图当编辑证据。
- [ ] 每组覆盖Live/Source、长文中段、历史；代表组补空便签、加载/失败/冲突/恢复确认、五色、卡片菜单、标题长文案、表格/长代码。
- [ ] 640/960/1280
      viewport临界宽度与工具栏/历史实际内容宽639/640/641px；低高度390×568和1024×600；容器阈值不能用viewport近似替代。
- [ ] wallpaper
      on/off、reduced-motion、guest入口及authenticated业务；guest不得获得账号便签数据。
- [ ] Tab/Shift+Tab、Enter/Space、Escape层级、menu radio、focus
      restoration；正常纵向滚动、代码横向滚动、无页面级overflow及44px触控目标。
- [ ] axe覆盖编辑、历史、菜单和恢复确认的light/dark代表页面；记录console
      warning/error。自动化模拟IME与真实OS输入法验收分开说明。
- [ ] 真机软键盘/物理触控/Safari如不可用必须在结项中标明未验证；不以桌面viewport模拟宣称真机通过。

### 工程门禁与文档

- 先focused契约回归，再模块测试/typecheck/lint/format，最后`deno task test`、`deno task test:workspace`、`deno task test:home-notes`、`deno task check:ui`、`deno task check:bundle`。
- 回归必须使用真实production-app/API/DTO，不能mock保存回显。Bug默认Red→Green；不添加源码文本、CSS字符串或内部wiring测试。不重复执行未变化且证据有效的验收。
- bundle预算与ownership门禁不得放宽；Home不得新增parser/editor同步依赖，Notes不得引入Documents-only
  graph。
- 更新DESIGN_SYSTEM.md、MARKDOWN_EDITOR.md、README.md中受影响使用说明、CHANGELOG.md的Unreleased用户可观察变化，填写UI_REVIEW_CHECKLIST.md证据与未验证项。不改已发布日志，不创建第二套设计规范。

## 结项条件

上述M1–M4及全部可执行验收完成，相关调用方和文档完成迁移，无旧Token别名、旧双击路径、旧历史追加区或底部微型色点路径。不可用真机/品牌浏览器必须明确列出，不得将未测状态算作通过。禁止把只完成样式、只完成某个Host或只通过build作为本Issue完成。
