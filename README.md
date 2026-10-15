# Searcher

基于 Deno、Hono、React、SQLite
的单进程搜索主页。首页以普通搜索为主；登录后可管理 APP、Markdown 便签、AI
问答、壁纸和跨设备偏好。管理员由交互式 CLI 创建，不存在默认管理员。
M0A 编辑技术验证入口：`/design-lab/markdown-editor`，仅本地演示，不保存或替换便签。
验证结论、bundle 口径和 #110 输入约束见 [M0A 报告](MARKDOWN_EDITOR_M0A.md)。
共享编辑接口与 consumer/lazy/styling 契约见 [MARKDOWN_EDITOR.md](MARKDOWN_EDITOR.md)；便签默认使用共享 foundation 的 Live Preview，保留 textarea Source Mode。


## 主页外观

在“设置 → 外观 → 主页工作区风格”切换 Zen（极简呼吸）与 Widgets（空间轻桌面）。Zen 不显示品牌大标题；“显示 Searcher 标题”仅控制 Widgets 的大标题。切换工作区或标题开关不会改变搜索框的纵向锚点，匿名与登录状态保持一致；个人内容仍须登录。

登录后的“笔记”入口复用 Workspace Host：Zen 使用右侧 Panel，移动端使用 Sheet，Widgets 使用现有桌面或 constrained 窗口。应用、便签、笔记的路由与搜索独立。Library 支持全部/最近/收藏、笔记本筛选、跨笔记本搜索与加载更多，以及新建、重命名、收藏、移动和移入废纸篓。笔记本最多两层，可创建、重命名、移动、同级上移/下移；删除笔记本保留笔记并将子笔记本提升为根。点击标题或创建笔记后打开编辑器：Widgets 在宽度 >=1024px 时保留 Library 并打开独立笔记窗口，同一笔记重复打开只恢复并聚焦；768–1023px 使用单一 constrained surface，移动端使用 Sheet，Zen 使用展开 Panel。笔记窗口复用拖动、缩放、最小化、Snap、Dock 和总览；保存同步列表摘要，移入废纸篓关闭对应窗口。Desktop layout payload version 3 继续读取 version 1/2 的应用、便签与 Library 记录，storage key 不变；刷新恢复窗口，已失效笔记自动清理，损坏布局回退为空桌面。

Documents DTO 的 `displayTitle` 是服务端派生展示值：依次取 trimmed title、首个非空 heading/paragraph 的纯文本前 100 字、“无标题笔记”。`title` 仍为 canonical 字段，不回写 fallback；列表和搜索只返回摘要，不返回正文。无标题记录的派生在服务端读取正文，已有标题的列表记录继续只读取正文前 300 字以生成 snippet。

### 编辑笔记

连续、页面和源码共用一份 Markdown 正文；连续与页面共用同一 editor、选区和 undo history，只改变排版。标题单独保存，不自动插入 H1。视图偏好仅在当前设备按账号与笔记隔离。格式工具栏支持标题、强调、列表/任务、引用、链接、代码、表格、分隔线、分页符与图片；大纲在连续/页面视图显示，点击定位正文光标。字数按 CJK 字符和英文/数字单词统计，排除 Markdown 语法，阅读时间按每分钟 300 字/词向上取整。

输入后 1500ms 自动保存，中文组合输入结束后才保存；离开编辑区域、切换视图或关闭工作区时提交待保存内容。Ctrl/Cmd+S 手动保存。网络失败时保留 IndexedDB 本地草稿，重开可恢复或放弃；旧版本草稿须显式解决冲突。409 对话框可对比本地与服务器正文，选择保留服务器、覆盖为本地或另存为新文档。历史恢复创建新版本，不倒退版本号。

图片支持 PNG/JPEG/WebP、最大 10 MiB，上传成功后才插入 `asset://<assetId>`。复制与 `.md` 导出保留正文原文及 internal asset ref，不附加标题，也不声称是独立可移植的图片包；备份完整资产仍须使用数据库备份。页面视图自动分页不写回 Markdown；手动 `<!-- pagebreak -->` 保留首部、连续和末尾空白页。纸张设置支持 A4/Letter、横向/纵向和四边 5–50 mm 边距，按文档保存到服务器。打印使用独立的无应用 chrome 排版，标题仅在首个非空白页出现；正文、图片、代码、表格和手动分页参与打印，自动分页由浏览器决定，不承诺与编辑视图逐像素一致。

页面模式的纸张自上而下居中排列，使用正文外层的同一个滚动区；跨页编辑、
选区及撤销仍属于唯一编辑器。窄窗口和移动端统一缩放纸张，不改正文 Token，
不保留横向滚动 strip。切换纸张或连续/页面视图不会把自动断页写进正文。

匿名外观偏好保存在当前设备的 IndexedDB，刷新后恢复；不上传服务器，也不与账号缓存混用。登录后的设备外观缓存按用户 ID 隔离，共享偏好由云端同步；退出登录或会话失效后恢复该设备的匿名外观。升级时删除旧的未关联账号外观缓存，新增光晕与动态字段缺失时使用 canonical defaults。

“设置 → 外观 → 壁纸与背景效果”支持主题光晕强度（0–30%，默认 14%）、动态氛围（关闭 / 呼吸 / 呼吸 + 涟漪，默认呼吸 + 涟漪）和动态强度（0–100%，默认 35%）。壁纸遮罩默认 36%，只控制图片可读性，不压制上层主题光晕；系统 reduced-motion 关闭动画但保留静态光晕，不改变已保存偏好。

 主页以搜索为主操作、Bento 为内容层。Widgets >=1024 的应用与便签是可同时打开的非模态独立窗口，支持标题栏拖动、八向 resize、最小化、最大化与恢复；Task Dock 始终可见，唯一负责工作区导航，不包含 CRUD。窗口打开不会推动或缩小 Search/Bento。768–1023 使用单 active 居中窗口，可选择中等、大尺寸、全屏，不能自由拖动或 resize；切换保持各自表单草稿。Zen >=768 保留 400px 非模态右侧 Panel；<768 两种风格均使用模态底部 Sheet，不显示 DesktopDock。破坏性确认仍使用模态 Dialog；材质、阴影与叠放层级由系统 Token 分别管理。

 宽布局下，两张 Bento 卡片都有内容时保持 5:3 列比，高度各自随内容变化；只有一张有内容时，有内容的卡片占满整行，另一张紧凑空卡片移到下一行。两张都空时保留紧凑提示与新建便签内容动作，不重复 Dock 的 root workspace navigation；窄布局统一使用单列，不强制最小高度。

## APP 使用

Zen 布局下，登录后首页搜索框下方显示固定网站：PC 从搜索框左边界起排，移动端将整组图标居中，均按容器宽度自动换行；展开文件夹后，内部应用从左侧起排。首页保留 64px 方形占位，图标之间的行列间距均为 6px。在“设置 → 搜索”可选择显示 8、12、16 个或全部，在“设置 → 外观”可调整图标大小。右键网站图标（触屏长按；键盘菜单键或 Shift+F10）可打开操作菜单，包括首页的“编辑布局”；编辑时可拖动带提示的图标，键盘可用方向键排序。不显示悬浮省略号按钮或图标下方的左右移动按钮。
 应用的完整管理位于工作区内。Widgets 首页只提供固定应用启动，完整管理通过 Task Dock 的应用入口进入；Zen 保留启动器的轻量交互。应用工作区打开即为完整 Unified Launcher：文件夹与未归组应用在同一 root 网格混排，包括空文件夹。文件夹原地展开，返回恢复原图块的焦点与滚动位置，不切换工作区路由。搜索名称或网址直接返回去重的网站，搜索文件夹名返回文件夹；打开匹配文件夹清空搜索。搜索框以下、Footer 以上的应用内容面（包括最后一行图标下方）支持空白处右键、键盘菜单或触屏长按，菜单提供“新建文件夹”和“整理布局”；搜索结果、空状态和文件夹内联视图保留相同入口。进入整理会清空搜索，整理时菜单改为“完成整理”并禁用“新建文件夹”。空白面保留正常触屏滚动。图块菜单支持改名、大小与删除，删除文件夹不删除成员。整理模式中，App 拖到 Folder 为归组，其他 root 图块拖拽为混排排序，文件夹内拖拽仅改变成员顺序；失败回滚并显示错误。Root 混排以单次 `PUT /api/webapps/reorder` 的 `{ items, groups }` 原子保存，成员移入与移出追加到目标末尾，不改变首页 `pinnedSortOrder`。正常状态保留“添加应用”主操作；整理时隐藏添加入口，通过空白菜单“完成整理”退出。
在“设置 → 外观 → 控件形状”选择“默认”或“胶囊”：默认使用小圆角；胶囊联动搜索框、内部搜索引擎与提交按钮，以及常规单行输入框、按钮和控件内图标。便签编辑器的标题、正文与预览，以及其他多行编辑区、卡片、APP 图标、头像与状态指示保持正常圆角。

在“设置 → 外观 → 壁纸与背景效果”上传图片或应用 HTTPS 图片地址、CSS gradient。地址输入为草稿，点击“应用”才保存；gradient 不支持 URL、变量、动态表达式或外部资源。图片按 `cover` 裁切，每张图片独立保存焦点（0–1，默认中心），构图弹窗提供 Desktop/Mobile 真实效果预览，支持点击、拖动、方向键微调和重置焦点。

登录用户最近 5 张上传图片保存于服务器，上传第 6 张时淘汰最早的一张；历史卡片主操作仅预览，菜单提供设为当前壁纸、调整构图和删除。删除当前壁纸需要单独确认，并同时解除引用、恢复默认背景；清除当前壁纸不删除文件。服务器上传图片使用私有 ETag 缓存，每次读取或条件请求仍需鉴权。HTTPS 与 gradient 只能停止使用，不能删除远端文件。

访客外观及当前本地图片（最大 5 MiB）保存在当前设备/浏览器，刷新后保留；访客上传历史只在当前设置页面有效，不上传服务器。访客与账户缓存隔离，登录不会自动迁移本地图片，只有登录后新上传的图片可以跨设备同步。

Widgets Task Dock 的应用/便签项根据窗口状态执行 Open、Focus 或 Restore + Focus，不重置 nested route；窗口 Close 只收起对应 domain，关闭后聚焦对应 Dock item。Apps/Notes 的 route、Back stack 与搜索 query 独立。所有 surface 只有 Body 滚动，Root Footer 固定；嵌套页 Back 返回上一级，应用表单保护未保存修改，便签保留本地草稿、自动保存、冲突处理和版本历史。Widgets 首页仍最多显示 5 张固定便签。

Widgets >=1024 的便签按 `note:<id>` 打开独立窗口：同一便签重复打开只恢复并聚焦，多份便签可同时编辑；Notes browser 仍保留。窗口复用 NoteEditor 的自动保存、冲突处理和版本历史，删除便签会关闭对应窗口。768–1023、移动端 Sheet 和 Zen 仍在便签工作区内嵌套编辑。

Widgets 窗口布局按登录用户保存在当前设备 IndexedDB（key 仍为 `searcher:desktop-layout:v1:<userId>`，payload v4），包括打开的窗口、正常/还原尺寸、模式和层级。旧 v1–v3 布局自动迁移到 viewport 坐标。普通窗口可贴近视口边界、正文可延伸到 Dock 下方，但标题栏始终可操作；Snap/最大化填满 Header 与 Dock 之间的区域，不保留外围 gap。刷新或切回 Widgets 时按当前视口恢复，切换账号不继承布局；退出只清运行态。无记录、损坏或不支持的版本回到空桌面；IndexedDB 不可用时继续使用内存态，读取失败不覆写旧记录。几何不写入服务端 `note_layouts`，不跨设备同步，也不转换 Zen FloatingNotes 坐标。

同一会话中，临时缩小视口、Header/Dock 测量变化和 768–1023 受限布局只调整当前显示，不覆盖自由桌面最后一次明确摆放的位置与尺寸；恢复视口后回到原位置。若在缩小后的自由桌面主动移动、调整大小或从 Snap/最大化还原，则保留新操作的位置。受限布局的尺寸预设、工作区切换与 Dock 选择不重写自由桌面布局。刷新仍按启动时视口读取 v4 归一化布局，不保证跨会话恢复绝对像素。

Widgets >=1024 的独立长文笔记窗口可通过标题栏“进入沉浸式”覆盖应用视口，保留原编辑器、文档保存流程和窗口布局；便签、Zen、受限窗口与移动 Sheet 不提供此模式。顶部可退出、查看保存/上传状态及最小化/关闭，其他编辑操作仍可访问。底边 12px 热区或可 Tab 聚焦的“显示 Dock”按钮呼出原 Dock；选当前笔记继续编辑，选其他窗口或总览先退出。Escape 先关闭内部弹窗/菜单，再退出沉浸；刷新、账号或 Host 变化不恢复沉浸状态。

首页「随手便签」有两张及以上固定便签时，可拖动把手调整顺序；键盘聚焦把手后按 Space 拿起，方向键移动，Space 放下，Escape 取消。排序立即显示并通过现有 `sortOrder` 同步，刷新或重新登录后保持；仅重排当前可见的固定便签，不改变普通便签与未展示固定便签的相对顺序，也不改变置顶、内容或 Zen 坐标。不能排序的便签展示不提供可操作拖拽把手。

便签工作区根视图默认紧凑显示标题、一行正文摘要与更新时间；点击标题或按 Enter/Space 进入编辑，正文选择与滚动不会打开编辑器，双击不切换展开。展开/折叠仅由显式按钮控制，拖动仅由把手控制。展开状态只在当前工作区生命周期内有效，不参与自动保存，不改变便签版本或首页/Zen 的展开与位置。无搜索词时，“置顶与首页固定”与“其他便签”互斥；搜索覆盖全部便签，每条只展示一次，高亮标题/正文匹配；仅Markdown源码命中时仍保留结果并显示源码片段。首页compact卡片不增加摘要。

Widgets 非移动端的便签工作区按实际列表内容宽度呈现最多三列瀑布流：小于506px为一列，506–766px为两列，767px及以上为三列。展开/折叠、窗口尺寸变化及分组变化按最短列自动重排，不保存卡片坐标或改变业务顺序。“其他便签”支持把手拖拽和键盘排序；置顶/首页固定及搜索结果不可排序。Zen Panel、移动端 Sheet 与首页便签呈现保持不变。

便签默认使用所见即所得 Live Preview，也可切换至 textarea 源码模式；打开、切换模式或接受云端正文不会改写 Markdown 或触发保存，只有实际编辑才序列化。两种模式共用格式工具栏和本地快捷键；Live 任务 checkbox 可编辑，卡片、冲突和历史版本保持只读。标题或正文实际修改后等待 1500ms 自动保存，中文组合输入结束后才保存；标题、正文、工具栏之间的鼠标与键盘焦点移动、标题 Enter 跳转和模式切换不提前提交，也不重启 debounce。真正移至历史、颜色或外部控件时，仅未保存草稿执行一次手动保存；恢复的本地草稿同样适用。Ctrl/Cmd+S 保持显式手动保存；立即关闭不补发延迟保存，草稿留在此设备供重开恢复。云端冲突、覆盖/合并、版本恢复和本地草稿沿用原 Notes contract；Notes 不使用 Documents 分页、资产和 outline 插件。

长文正文独立滚动，标题、模式、保存状态、历史、颜色和单行格式工具栏位于顶部；窄容器通过“标题”和“更多格式”访问全部命令。正文最大阅读宽度720px、最低240px，短窗口允许整个编辑器滚动。Zen桌面便签支持“展开编辑”/“收起编辑”，Widgets沿用既有窗口大小控制；这些几何操作不重建编辑实例。颜色改为带名称与选中状态的五项菜单，触控入口至少44px。

版本历史为内部子视图，进入前等待当前草稿保存及在途请求；保存失败或版本冲突时留在编辑。历史展示版本号、绝对本地时间、标题与完整只读预览；“返回编辑”或Escape恢复原焦点、选区和滚动，Host返回按钮仍返回便签列表。恢复需要确认，将标题和正文替换为选中快照；取消不写入，成功使用服务端返回版本，失败保留当前草稿与预览供重试。

快捷键与搜索快捷命令的完整说明统一在 **设置 → 快捷键**（`/settings/shortcuts`），无需登录即可查阅，按当前平台展示键位与生效上下文。编辑器本地操作优先于首页聚焦搜索，不提供快捷键自定义或同步。开发时在 `web/src/features/shortcuts/shortcut-catalog.ts` 维护逻辑 binding 和命令 target；业务组件保留事件处理归属，页面和上下文提示消费同一 catalog。

### 笔记 API（#102 M1）

`documents`（笔记）与 `notes`（便签）是独立实体。所有 `/api/documents*`、`/api/document-notebooks*` 请求需要登录，跨 owner 与不存在均返回 404。

- 列表：`GET /api/documents?scope=all|recent|favorite|notebook&notebookId=...&limit=50&cursor=...`；搜索：`GET /api/documents/search?q=...`；回收站：`GET /api/documents/trash`。三者返回 `{ items, nextCursor }`，每项仅包含 summary，不返回完整 body；limit 为 1–100，cursor 绑定 user/scope 或 query。空搜索返回空列表。
- 实体：`POST /api/documents`、`GET/PATCH /api/documents/:id`；PATCH 必须提交当前 `version`，冲突返回 409 与 `data.currentDocument`。title 最大 200 characters，Markdown body 最大 1,000,000 characters，create/update JSON 请求最大 8 MiB；超限拒绝、不截断。
- 生命周期：`DELETE /api/documents/:id?version=N` 软删除；`POST /api/documents/:id/restore` 恢复；`DELETE /api/documents/:id/permanent` 永久删除。历史：`GET /api/documents/:id/versions`、`POST /api/documents/:id/versions/:version/restore`（body 提交当前 version），恢复创建新版本、不回滚计数。
- 内容变化的 autosave snapshot 间隔为 10 分钟，每笔记仅保留最近 100 个 snapshot；manual/conflict_resolution/restore/system 不参与清理。未改变 title/body 不生成内容快照。
- 笔记本：`GET/POST /api/document-notebooks`、`PATCH/DELETE /api/document-notebooks/:id`、`POST /api/document-notebooks/:id/move`、`PUT /api/document-notebooks/reorder`。最多两层，允许同名；删除不会删除笔记，直接笔记转为未分类，子笔记本提升为 root。排序提交目标 parent scope 的完整 ids。
- 图片：`POST /api/documents/:id/assets`（multipart file）、`GET/DELETE /api/documents/:id/assets/:assetId`。仅 PNG/JPEG/WebP，校验 MIME 与 magic bytes，最大 10 MiB。Markdown 保存 `asset://<assetId>`；读取同时校验 document/asset/owner，正文引用中的资产不能直接删除。实际 bytes 存于 SQLite BLOB，storage_ref 不公开；软删除保留，永久删除级联清理。
- 纸张：`GET/PUT /api/documents/:id/settings`；仅同步 a4/letter、portrait/landscape 与四边 5–50 mm margins（默认 20 mm），不保存 view/sidebar/outline 等设备 UI 状态。

### AI 应用图标

添加或编辑网站时，在“图标 → AI 生成”选择图片模型及“图片生成协议”：默认 OpenAI Images（`/images/generations`），仅当服务商支持 Gemini 原生接口时选择 Gemini 原生（`v1beta/models/:model:generateContent`）。协议仅用于本次图片请求，不修改 Provider、文本模型配置、模型发现或聊天 SSE。风格包括极简、几何、符号、线性、双色、柔和渐变、柔和 3D 和图形角色。

网站名称为必填上下文，域名从网址提取且只发送 hostname，不发送路径、query 或 fragment。可选“图标语义/用途”最多 300 字，仅用于本次生成，不保存为网站字段。生成前展示 Provider、模型、图片协议、风格及实际发送的名称、域名和用途；取消不发起请求。

每次生成发起三个独立的单图请求：OpenAI Images 使用 `n: 1`、`size: "1024x1024"`；Gemini 原生使用 `responseModalities: ["IMAGE"]`，解析 `inlineData`。Gemini 原生接口从 Base URL 去掉末尾 `/v1`、`/v1beta` 或对应的 `/openai` 后缀，保留代理前缀；模型 ID 仅去掉原生 `models/` 前缀，不推断命名空间。Google 官方域名使用 `x-goog-api-key`，其他代理沿用 Bearer。API 请求字段 `imageProtocol` 可选值为 `openai`、`gemini`，省略时使用 `openai`。

Prompt 以已知官网/品牌图标的核心视觉语言为身份基线，要求单张画布只展示一个图标，并约束 32／48／64px 可读性、单焦点、安全边距和候选差异；实际效果取决于 Provider／模型。选中候选后沿用上传与图片校验流程，文件上限 2 MiB。请求可能产生 Provider 费用；单次上游请求超时仍为 60 秒，失败详情会遮蔽当前 Provider 的 API Key。


## 本地开发

要求 Deno 2.9.7+。在仓库根目录：

```sh
deno install
APP_ORIGIN=http://localhost:5173 deno task dev:api
# 另开终端
deno task dev
```

打开 `http://localhost:5173`。Vite 将 `/api` 代理到
`127.0.0.1:34567`。`deno task test` 运行后端与前端契约测试，`deno task build` 构建生产前端。

本仓库是应用而非可发布的 Deno library，`deno.jsonc` 不声明包 `name` 或 `exports`。生产构建在 `web/vite.config.ts` 按 React runtime、AI 会话、Markdown 与 UI 依赖设置 `manualChunks`，保留 Vite 默认的 500 kB chunk 警告阈值。分包不等于按需加载，也不减少总 JS 体积。

浏览器路由回归使用已固定的 Playwright 1.56.1。首次安装 Chromium 后运行：

```sh
deno run -A npm:playwright@1.56.1 install chromium
deno task test:routing
```

`test:routing` 先构建生产前端，再启动隔离的真实 Hono 服务、内存数据库与临时资源目录，验证直访/刷新、登录与注册回跳、Tab history、非法路由和 320px 页面导航；不连接开发实例或使用真实账户。

`deno task test:workspace` 构建生产前端并运行 Workspace、Shell、Unified Launcher、Notes、首页便签排序、Bento、workspace-contract 与 workspace-matrix 及 Notes Live/Source 两套编辑实页回归（无副作用切换、IME、选区、undo/redo、任务列表、409 和恢复），使用独立内存数据库与临时资源目录。覆盖 loading/error/cache retry、表单与 autosave、状态隔离、真实拖拽与回滚、键盘导航、固定 Header/Footer，以及 #92 的 A–F 分层响应式、主题、壁纸、窗口、持久化与 tablet contract；不会使用真实账户或开发数据库。

`deno task test:documents` 构建生产前端，使用隔离服务、内存数据库和临时图片执行 Documents 的 390×844、768×1024、1024×768、1440×900 × Zen/Widgets × light/dark 三模式矩阵、Library 网络隔离与摘要契约、短屏输入保存，以及 100k Markdown / 200 headings / 50 images / 20 tables / 30 PageBreak 的大文档完整性验收；Bundle CI 自动运行同一套测试。390×400 短屏用于模拟软键盘缩小可用视口，不替代真机输入法测试。
专项门禁同时覆盖文档沉浸的实例/窗口语义、Dock 与 Escape、保存错误/409/上传，以及页面模式的竖向纸张与单一滚动 owner。设置 `E2E_EVIDENCE_DIR=/tmp/searcher-documents-evidence` 后，响应式矩阵在字体与布局完成后保存各 Host/主题/模式的实页截图；截图仍需人工检查，不替代行为断言。

`deno task test:wallpaper` 构建生产前端并运行壁纸 Playwright 链路：偏左/偏右主体构图、双视口裁切、刷新与新设备登录、历史切换、删除及失败保留、URL 草稿、同步故障恢复、匿名持久化与 reduced-motion。使用隔离数据库和临时资源目录；PR/main CI 自动执行该链路、`deno task test` 与既有 UI 门禁。
## UI Contract 与门禁

UI 变更遵循 [Design Principles](DESIGN_PRINCIPLES.md)、[Design System](DESIGN_SYSTEM.md) 和 [UI Review Checklist](UI_REVIEW_CHECKLIST.md)。复用 `PageShell`、`PageHeader` 和 Searcher semantic components；`/design-lab` 覆盖正式组件、交互状态和响应式预览，但不能替代真实业务页面验收。既有 UI 计划和 Spec Pack 是历史设计资料；当前 UI 规则、存量迁移边界及 advisor 裁决见 Design System，实际验收和未覆盖项见 Checklist。baseline 通过不表示历史样式债务、focus 语义或所有业务流程已清零。

```sh
deno task check:ui
deno test -A scripts/ui-guard/
# 迁移旧样式后，仅删除已经解决的历史 allowance
deno task check:ui --update
```

门禁按文件、rule 和具体值计数；已有文件中新加的 raw spacing/font/shadow/radius、arbitrary Tailwind 或 inline presentation 同样失败。runtime geometry 与 domain-specific value 例外只限明确的 owner 和表达式，见 `scripts/ui-guard/exceptions.ts`。`--update` 不接受新增或数量增加的违规；CI 运行检查和门禁回归测试。390/768/1440、light/dark 与真实页面交互证据按 checklist 人工验收。

## AI 问答工作区 (Ask Workspace)

AI 问答工作区（`/ask`）提供多模型对话、多分支推理和个人上下文集成的完整工作台体验：

登录后，Conversation Workspace 直接占据 Topbar 与连接状态提示以下的可用空间，
会话标题位于工作区 Header；不再重复展示页面 breadcrumb / “AI 问答”大标题。
历史与消息各自滚动，输入面板保留在工作区内；移动端通过历史入口打开 Sheet。
未登录时保留页面标题与登录入口。

### 交互架构与数据契约
- **前端原语与 Runtime 适配**：前端基于 `@assistant-ui/react` 提供的标准会话交互原语（Thread、Message、Composer、BranchPicker、附件渲染与平滑滚屏），并通过定制的 `SearcherAssistantRuntimeProvider`（基于 `useExternalStoreRuntime` 与 `ExportedMessageRepository.fromBranchableArray`）建立双向驱动。
- **后端完全掌控与数据驻留**：全部会话数据、分支树持久化、SQLite 数据库表（`ai_conversations`、`ai_messages`、`ai_blobs`、`ai_providers`、`ai_models`）、AES-256-GCM 加密密钥（`ENCRYPTION_KEY`）、模型注册表、能力裁决与鉴权均完全由 Searcher 本地服务掌控。不依赖任何第三方前端云或外部托管会话服务，所有凭证与私有会话均保留在本地。

### 模型能力发现与手动覆写优先级
- **裁决优先级**：模型能力（特别是推理/思考能力 `supportsReasoning`）严格遵循以下优先级判定：
  `手动覆写 (manual) > Provider 发现 (provider) > 内置预设 (preset) > 模型名推断 (inferred) > 未知 (unknown)`。
- **刷新与覆写保护**：在管理员后台刷新 Provider 模型列表（`/api/ai/providers/:id/refresh-models`）仅更新 `metadataJson` 中的 `discovered` 元数据，绝不覆盖管理员显式设置的手动覆写（`overrides.reasoning`）。
- **恢复自动发现**：清除手动覆写后，系统立即平滑回退至自动发现或预设能力，且完整保留已发现的原始元数据。未识别出推理元数据且无预设的模型标记为 `unknown`，绝不擅自推断为 `unsupported`。

### 推理传输格式与严格推理模型
- **规范化推理级别**：支持统一的 8 级推理强度标量：`none`、`auto`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。
- **传输适配器（Reasoning Transport）**：
  - `openai_reasoning_effort`：直接向上游传递标准 `{ reasoning_effort: effort }` 字段。
  - `boolean`：按配置的布尔参数（如 `thinking: boolean`）传递（`effort !== "none"` 为 `true`，`"none"` 为 `false`）。
  - `custom`：依据映射表（`valueMap`）将规范级别转换为服务商专有参数名与取值。
  - `unsupported`：对于配置为不支持推理的模型，若请求显式传入推理强度，后端将抛出 `ReasoningValidationError`（HTTP 400）拒绝请求，严禁隐式静默丢弃。
- **严格推理模型**：对于 OpenAI o1 / o3 等严格推理模型，显式传入 `temperature` 或 `top_p` 采样参数将被直接拒绝（HTTP 400）；在继承用户或全局默认配置时，系统会自动剔除采样参数以确保兼容。

### 生成偏好继承与优先级
- **参数解析层级**：单次请求的生成参数（`reasoningEffort`、`temperature`、`topP`、`maxTokens`）遵循以下继承顺序：
  1. 本次 Composer 显式指定（或局部工具栏选定）
  2. 用户针对该模型保存的专属偏好（`aiGenerationDefaults.models[modelId]`）
  3. 用户的全局默认偏好（`aiGenerationDefaults.default`）
  4. 模型的默认级别（`capability.defaultLevel` 或 `ai_models.default_reasoning_effort`）
  5. `undefined`
- **切换模型自适应**：在 UI 切换模型时，若目标模型支持当前已选推理级别则予以保留；否则按上述顺序回退至目标模型有效支持的默认值或置空，防止向不支持的模型发送无效级别。

### 分支历史、消息编辑与重新生成
- **会话树状存储**：每条消息记录明确的 `id`、`conversationId`、`parentMessageId` 与 `variantGroupId`。
- **上下文精准溯源**：会话上下文构建严格从活跃叶子节点（`activeLeafMessageId`）沿 `parentMessageId` 指针向根部回溯，杜绝基于 `createdAt` 时间戳扁平混排导致的跨分支串话。
- **消息编辑（Fork Branch）**：编辑并重发历史用户提问时，基于原有父节点生成全新分支，保留历史对话轨迹；前端可通过 assistant-ui 分支选择器（`< 1/2 >`）自由回溯和切换分支。
- **重新生成（Variant）**：基于同一父节点重新触发回复生成，作为相同 `variantGroupId` 下的答案变体展示。

### 真实 Token 计量
- **真实数据持久化**：消息维度的 `inputTokens` 与 `outputTokens` 仅在 Provider 返回的 SSE 流式分块（`usage`）中实际包含统计数据时提取并持久化入库。
- **不估算不伪造**：若 Provider 未返回 Token 统计，字段严格保持为 `null`；系统与前端绝不进行任何本地词表估算、倍率猜测或伪造显示。

### 临时会话与草稿管理
- **临时对话（History-off）**：新建对话或当前会话可切换为临时模式；临时对话不进入历史侧边栏。
- **即时销毁**：切换至其他对话或卸载页面时，前端通过带 `keepalive: true` 的 `DELETE /api/ai/conversations/:id/temporary` 触发即时清理，彻底删除临时会话、消息及关联附件。
- **服务端短 TTL 清理**：服务端提供 30 分钟 TTL 兜底机制（`purgeExpiredTemporaryConversations`），自动清理因异常闪退或断网未正常触发前端销毁的过期临时数据。
- **会话级独立草稿（Ephemeral Drafts）**：Composer 输入框草稿按会话 ID 隔离保存在前端内存中；跨会话切换时自动暂存与恢复未发送内容，且不向服务端持久化任何脏数据。

### 附件系统与认证 Blob
- **容量与数量限制**：单条消息最多支持 4 个附件（`MAX_ATTACHMENTS = 4`）。
- **图片附件**：单张上限 5 MiB，支持 PNG、JPEG、WebP。服务端验证 base64 数据大小及文件头与声明 MIME 是否一致；文件头检查不等同于完整图片解码。图片存于 SQLite `ai_blobs`，通过 owner 鉴权的 `/api/ai/blobs/:id` 读取，并以 base64 发送给视觉模型。Blob 响应采用 `Cache-Control: no-store`，删除会话后重新请求返回 404，不从浏览器磁盘缓存重放。
- **文本附件**：界面支持 TXT、Markdown、CSV、JSON，单文件上限 1 MiB；API 同时接受 `text/*`，内容均作为纯文本传给模型，不按 HTML 执行或渲染。
- **请求体策略**：由 Hono `bodyLimit` 作为唯一字节级 enforcement；`POST /api/ai/chat/stream` 限制 32 MiB 以容纳多模态 base64 附件，普通 API 限制默认 64 KiB，图标上传限制 2 MiB + 64 KiB，壁纸与备份上传限制 50 MiB。

### 工具调用与联网搜索
- **只读 Opt-in 工具**：提供便签检索（`lookup_notes`）与应用快捷方式检索（`lookup_apps`），均为严格只读（Read-only）工具，且必须由用户在会话配置中显式勾选启用（`tools: { notes: boolean, apps: boolean }`），未启用的工具调用会被后端主动拦截。
- **SearxNG 联网搜索**：`web_search` 使用 `SEARXNG_URL` 指定的实例，实例须启用 JSON 输出（`search.formats: [..., json]`）。未设置或 URL 无效时禁用联网搜索；配置后的连接失败、超时或 HTTP 错误在工具结果中明确呈现，不伪造搜索结果。返回的 Sources 独立于 Assistant 正文展示。

## AI Provider 架构与传输契约

Provider 使用 OpenAI-compatible Chat Completions API，支持自定义 Base URL；模型通过该地址下的 `/models` 自动发现，聊天请求发送到 `/chat/completions`。后端 `src/features/ai/client.ts` 使用固定版本的 OpenAI 官方 npm SDK；SDK 类型不进入 `AiService`、共享 DTO 或前端的 `meta/token/done/error` SSE 协议。

### 超时边界与重试策略
- **禁用 SDK 自动重试**：模型发现和聊天流式请求均显式设置 `maxRetries: 0`，禁用 SDK 内置的静默重试，避免非预期的多次重复扣费与上游堆积。
- **模型发现超时**：标准 `/v1/models` 端点请求硬超时限制为 15 秒（`DEFAULT_MODELS_TIMEOUT_MS = 15000`）；扩展探针（如 CLIProxyAPIHome `/user/models`）硬超时限制为 5 秒（`DEFAULT_EXTENDED_TIMEOUT_MS = 5000`）。所有发现请求均严格禁止跟随 HTTP 重定向（`redirect: "error"`），防止 API Key 随重定向泄露。
- **流式生成无人工超时**：流式聊天请求连接超时设为运行时 timer 安全上限（约 24.8 天），不设人工截止时间，允许大模型长时间深度思考与生成长篇内容，仅受自然生成结束或用户主动 Abort 控制。
- **中断与错误状态保全**：用户点击停止（Abort）会主动取消上游请求，已流式输出的内容予以保留并标记为 `interrupted`。上游 HTTP 错误、SSE error 消息或损坏的 SSE JSON 会被转换为 Searcher 错误事件，已输出内容标记为 `failed`，绝不误标为完成。
`AiServiceDeps.fetchFn` 支持注入 custom fetch，便于独立验证 Provider contract。
## 部署与管理

```sh
deno task build
NODE_ENV=production APP_ORIGIN=https://example.com deno task start
deno task admin:create -- <username>
```

`APP_ORIGIN` 必须是浏览器访问的精确 origin；非本机 HTTP 不受支持，TLS
由部署环境终止。`PORT` 默认 `34567`，`DATABASE_PATH` 默认
`./data/searcher.sqlite`。AI Provider 的 Key 使用 `ENCRYPTION_KEY`
加密，部署时设置稳定、足够长的密钥并单独保管；丢失密钥后无法解密既有 Provider
Key。`SEARXNG_URL`（可选）配置启用了 JSON 格式输出的 SearXNG 实例地址（如 `http://localhost:8080`），供 Ask 联网搜索调用；未设置时联网搜索自动禁用。管理员密码只在真实终端交互输入；重置使用
`deno task admin:reset -- <username>`。

### Docker / Unraid

仓库提供基于 Deno 2.9.7 的多阶段 Docker 镜像；前端 build stage 使用标准 Deno 镜像，`runtime-deps` 与最终 runtime 使用 `denoland/deno:alpine-2.9.7`。镜像内置
`NODE_ENV=production`、`PORT=34567` 与
`DATABASE_PATH=/app/data/searcher.sqlite`，运行时只需持久化 `/app/data`，
并提供生产环境所需的 `APP_ORIGIN` 与稳定的 `ENCRYPTION_KEY`。最终 runtime 镜像不包含项目级 `node_modules` 或测试文件；Docker 专用的 `deno.runtime.jsonc` 只保留后端运行依赖映射。`scripts/runtime-lock.ts` 校验这些映射与主配置一致，从主 `deno.lock` 提取运行映射及两个入口 module graph 的依赖闭包，保留已锁定的版本与 integrity，再使用 `--frozen` 安装到 Deno 全局 cache。运行时以 `--cached-only` 离线启动，Vite、React、Playwright、Tailwind、shadcn CLI 等前端/构建依赖不会进入 runtime dependency layer。

生产 Hono 仅对已找到的 `/assets/*` 构建文件设置浏览器缓存：文件名以
`-<至少 8 位 base64url 内容哈希>.<扩展名>` 结尾，且扩展名为
`js/css/png/jpg/jpeg/gif/svg/webp/avif/ico/woff/woff2/ttf/otf` 时，返回
`Cache-Control: public, max-age=31536000, immutable`；其余静态文件返回
`no-cache`。该目录只应包含受控 Vite 构建产物，不应放置用户上传文件。
SPA HTML 保持 `no-cache`，缺失 assets 保持 404；API、私有壁纸和应用图标的策略不变。

Docker workflow 的 runtime Smoke 从镜像内 `index.html` 提取真实 JS/CSS
路径并检查强缓存、HTML 与静态 404，失败会阻止同一 workflow 发布镜像，
不构成其他独立 workflow 的发布门禁。部署后在 Chrome Network 关闭
`Disable cache`，首次访问后在同一会话新标签页访问，检查哈希 JS/CSS 的
memory/disk cache 或等效缓存来源；HTML/API 仍可请求网络。升级镜像后普通导航应取得
新的 HTML 引用并能加载变化的哈希资源；使用反向代理/CDN 时，应比对容器直连与
正式域名的 `Cache-Control`，避免代理覆盖源站策略。

本仓库保持 Private；GitHub Actions 在 PR、`main`、`v*` tag 和手动触发时均构建并 smoke-test `linux/amd64` 镜像，只有非 PR 事件会在验证成功后发布同一镜像到
`ghcr.io/aawai/searcher`；同一 ref 的新运行会取消旧运行，防止旧构建覆盖 `latest`。GHCR 首次创建 package 时默认是 Private；首次成功发布后，
在 GitHub 的 `searcher` package 设置中将 **Change visibility** 改为 **Public**。
GitHub 不允许 Public package 再改回 Private，因此该操作只需执行一次，并应在确认镜像
可以公开分发后进行。Public GHCR 镜像支持匿名 pull，Unraid 不需要 GitHub PAT。

**公开源码边界：镜像包含运行所需的后端源码与前端构建产物。将 package 设为 Public 后，任何人均可匿名提取这些文件；Private 仓库不意味着镜像中的源码保密。**

Unraid 推荐配置：

```text
Repository:      ghcr.io/aawai/searcher:latest
Network Type:    bridge

Port:
  Host Port:      34567（可改为任意未占用端口）
  Container Port: 34567

Path:
  Host Path:      /mnt/user/appdata/searcher
  Container Path: /app/data

Variables:
  APP_ORIGIN=https://search.example.com
  ENCRYPTION_KEY=<固定随机密钥>
  SEARXNG_URL=<可选>
```

`APP_ORIGIN` 必须与浏览器实际访问的 origin 完全一致。非 loopback 地址必须使用
HTTPS，可由 Unraid 上的 Nginx Proxy Manager、SWAG 或其他反向代理终止 TLS。
`ENCRYPTION_KEY` 不应在容器重建或升级时变化；否则已经保存的 AI Provider Key
无法解密。若 Searcher 与 SearXNG 位于同一自定义 Docker network，可将
`SEARXNG_URL` 配置为类似 `http://searxng:8080` 的容器内地址。

镜像默认以 `deno` 用户（UID/GID `1000:1000`）运行，不在启动时自动修改挂载目录权限。Docker 新建 named volume 会继承镜像内 `/app/data` 的属主；Unraid bind mount 则使用宿主目录的权限。首次部署或从旧 root 镜像升级前，先停止容器、备份数据，再仅对 Searcher 的数据目录执行：

```sh
mkdir -p /mnt/user/appdata/searcher
chown -R 1000:1000 /mnt/user/appdata/searcher
chmod -R u+rwX /mnt/user/appdata/searcher
```

也可在 Unraid Extra Parameters 中指定 `--user=<UID>:<GID>` 使用宿主机的非 root 用户（例如 `--user=99:100`），并将上述属主调整为相同 UID/GID。`docker exec` 会沿用该运行用户。镜像不支持通过 `PUID` / `PGID` 环境变量更改用户；不要用 `chmod 777` 或恢复 root 运行绕过目录权限问题。

创建管理员时可在 Unraid 终端执行：

```sh
docker exec -it searcher deno run -A --cached-only src/commands/admin.ts create <username>
```

重置已有管理员密码：

```sh
docker exec -it searcher deno run -A --cached-only src/commands/admin.ts reset <username>
```

以上命令均交互式输入并确认密码；不要将密码写入命令行。容器的 runtime 配置不包含开发 tasks，因此容器内直接调用 CLI 入口，而不是 `deno task admin:create` / `deno task admin:reset`。

同一服务先处理 `/api` 与 `/api/*`，再处理 `/assets` 与 `/assets/*`；其余 GET/HEAD 返回 SPA shell。Settings/Admin 子页面可直访、刷新和分享；未知普通页面由 React 显示统一 404（shell HTTP 状态为 200），未知 API 返回 JSON 404，缺失 assets 返回静态 404，非 GET/HEAD 不回退 HTML。反向代理应将页面请求交给 Searcher，不自行维护前端 URL 白名单。

前端路径统一由 `web/src/app/routes.ts` 维护。`/settings/search` replace 到 `/settings`，未知 Settings/Admin 子路径显示 404。登录与注册保留经过校验的站内 `next`（含 query）；无来源或外部目标返回首页。Settings/Admin 内部 Tab replace 当前 history entry，外部进入具体 Tab 保留正常 entry；二级页面 breadcrumb 提供稳定的上层与首页目标。

数据目录需要持久本地磁盘，单进程运行。数据库采用
WAL；不要在服务运行中直接复制单个 `.sqlite` 文件当备份。管理员后台可导出包含
`manifest.json`、`database.sqlite`、系统设置和 `assets/`（壁纸、图标）的
ZIP；还原前校验 SQLite 完整性、迁移版本，以及壁纸 manifest、文件集合、字节大小、图片类型、每用户配额和偏好引用的存在性/所属用户。旧 manifest 缺少焦点时按中心恢复；非法焦点、缺失或额外文件、跨用户或悬挂引用均阻止还原。数据库旁保存恢复前 ZIP 快照，备份与恢复协调壁纸写入锁。还原后重新加载页面，必要时重启服务。备份不包含
`ENCRYPTION_KEY`；跨部署恢复时须另行提供与原实例相同的密钥才能使用既有 AI
Provider Key。不要将备份 ZIP、密钥或 `data/` 提交到 Git。

前端使用 Tailwind CSS 与语义 CSS token。基础交互组件位于
`web/src/components/ui/`，来自 shadcn/ui 的 Base UI 版本并按品牌 token
调整；`web/components.json` 记录 registry 配置。业务组合组件位于
`web/src/components/searcher/`，`/design-lab` 用于检查正式组件与主题。

### 前端样式维护

- `web/src/design-system/tokens.css` 定义颜色、材质、圆角、阴影，以及共享的
  `--space-*`、`--font-*`、`--layout-*`、`--control-*` 和
  `--elevation-*`。通用页面、表单、卡片和控件优先消费这些 Token；调整布局时不要重复写入相同固定尺寸。
- `web/src/styles/global.css` 保留页面骨架、通用控件与跨业务公共规则；
  Zen / Widgets 专属布局归入 `web/src/features/home-layouts/home-layouts.css`，
  网站图标和文件夹网格归入 `web/src/components/searcher/launcher.css`。
  `web/src/main.tsx` 按首页布局、全局样式、Launcher 的顺序加载，保持公共交互状态和网格覆盖的级联关系。
- 页面横向留白在 767px 以下切换为 16px，通用卡片内边距在 640px 以下切换为
  16px；触屏常规控件使用 44px 点击目标。不要把所有不同用途的尺寸合并成同一个 Token。
- 稳定布局使用语义 class 或 Tailwind 标准 utility；壁纸、拖拽变换和瀑布流位置等
  runtime 值保留 inline style。图标尺寸和 Launcher 方格等组件内部几何继续由组件维护。
- 渲染层只消费 `zen | widgets`；旧风格仅在输入边界通过
  `normalizeStylePreset` 映射。样式调整后构建前端，并实页检查两种布局、设置、登录和网站面板的浅深色与壁纸组合。

完整产品规格见
[`Searcher-v1-Final-React-shadcn-Spec-Pack/`](Searcher-v1-Final-React-shadcn-Spec-Pack/README.md)。
