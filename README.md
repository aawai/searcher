# Searcher

基于 Deno、Hono、React、SQLite
的单进程搜索主页。首页以普通搜索为主；登录后可管理 APP、Markdown 便签、AI
问答、壁纸和跨设备偏好。管理员由交互式 CLI 创建，不存在默认管理员。

## 主页外观

在“设置 → 外观 → 主页工作区风格”切换 Zen（极简呼吸）与 Widgets（空间轻桌面）。Zen 不显示品牌大标题；“显示 Searcher 标题”仅控制 Widgets 的大标题。切换工作区或标题开关不会改变搜索框的纵向锚点，匿名与登录状态保持一致；个人内容仍须登录。

匿名外观偏好仅在当前页面会话有效，刷新后恢复默认，不写入 localStorage 或 IndexedDB。登录后的设备外观缓存按用户 ID 隔离，共享偏好由云端同步；退出登录或会话失效后恢复匿名默认外观。升级时删除旧的未关联账号外观缓存，登录后重新读取当前账号缓存与云端偏好。

主页以搜索为主操作、Bento（5:3 容器网格）为内容层、Dock / 边缘入口为轻量导航。桌面端（>=768px）采用右侧非模态侧边工作区（Workspace，400px 宽度、使用 solid 表面、避让顶栏），移动端（<768px）采用模态底部 Sheet。工作区收敛全部应用与便签的管理、编辑与分类；破坏性确认保留模态 Dialog。壁纸位于底层，材质与阴影由 `web/src/design-system/tokens.css` 中的 `--surface-l0…l3`、`--surface-workspace`、`--shadow-l1…l3` 和导航 Token 管理，与 z-index 层级分开；hero 使用显式 grid 行而非隐藏标题占位。

## APP 使用

Zen 布局下，登录后首页搜索框下方显示固定网站：PC 从搜索框左边界起排，移动端将整组图标居中，均按容器宽度自动换行；展开文件夹后，内部应用从左侧起排。首页保留 64px 方形占位，图标之间的行列间距均为 6px。在“设置 → 搜索”可选择显示 8、12、16 个或全部，在“设置 → 外观”可调整图标大小。右键网站图标（触屏长按；键盘菜单键或 Shift+F10）可打开操作菜单，包括首页的“编辑布局”；编辑时可拖动带提示的图标，键盘可用方向键排序。不显示悬浮省略号按钮或图标下方的左右移动按钮。
应用的完整管理动作收敛在工作区内。Widgets 首页只提供固定应用启动及“在工作区中管理”；Zen 保留启动器的轻量交互。应用工作区根视图只直接展示常用网站，文件夹与未分组作为导航入口；“全部网站”打开文件夹图块与未分组网站的完整浏览视图。搜索名称或网址返回网站，搜索文件夹名只返回文件夹，不展开成员；清空搜索恢复根视图。文件夹、未分组、添加及编辑视图的 Back 返回进入前的工作区上下文，不使用浏览器 history；Close 收起整个工作区。删除文件夹保留成员网站并移至未分组。
在“设置 → 外观 → 控件形状”选择“默认”或“胶囊”：默认使用小圆角；胶囊联动搜索框、内部搜索引擎与提交按钮，以及常规单行输入框、按钮和控件内图标。便签编辑器的标题、正文与预览，以及其他多行编辑区、卡片、APP 图标、头像与状态指示保持正常圆角。

在“设置 → 外观 → 壁纸与背景效果”上传本地图片后，上传控件下方按时间倒序展示最近 5 张缩略图。点击缩略图可放大预览，再选择“设为壁纸”；关闭预览不会更换壁纸。登录用户的图片保存在服务端，上传第 6 张时自动移除最早的一张；访客的上传历史只在当前设置页面有效。清除壁纸或恢复默认效果不会删除已上传的历史图片。

底部 Dock（Widgets）与边缘入口（Zen）打开同一 Workspace：桌面使用 400px 非模态右侧栏，移动端使用模态底部 Sheet。Header 和底部 Switcher 固定，内容区独立滚动；根视图可切换应用/便签，嵌套表单或便签编辑器隐藏 Switcher，Back 返回上一级，Close 收起整个工作区。应用表单关闭或返回时保护未保存修改；便签使用本地草稿、自动保存、冲突处理和版本历史。Widgets 首页只展示至多 5 张主页固定便签，采用稳定轻微叠放，窄屏和窄容器回退为单列；不会覆盖 Zen FloatingNotes 的桌面坐标。

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

浏览器路由回归使用已固定的 Playwright 1.56.1。首次安装 Chromium 后运行：

```sh
deno run -A npm:playwright@1.56.1 install chromium
deno task test:routing
```

`test:routing` 先构建生产前端，再启动隔离的真实 Hono 服务、内存数据库与临时资源目录，验证直访/刷新、登录与注册回跳、Tab history、非法路由和 320px 页面导航；不连接开发实例或使用真实账户。
## UI Contract 与门禁

UI 变更遵循 [Design Principles](DESIGN_PRINCIPLES.md)、[Design System](DESIGN_SYSTEM.md) 和 [UI Review Checklist](UI_REVIEW_CHECKLIST.md)。复用 `PageShell`、`PageHeader` 和 Searcher semantic components；`/design-lab` 覆盖正式组件、交互状态和响应式预览，但不能替代真实业务页面验收。既有 UI 计划和 Spec Pack 是历史设计资料；当前 UI 规则、存量迁移边界及 advisor 裁决见 Design System，实际验收和未覆盖项见 Checklist。baseline 通过不表示历史样式债务、focus 语义或所有业务流程已清零。

```sh
deno task check:ui
deno test -A scripts/ui-guard/
# 迁移旧样式后，仅删除已经解决的历史 allowance
deno task check:ui --update
```

门禁按文件、rule 和具体值计数；已有文件中新加的 raw spacing/font/shadow/radius、arbitrary Tailwind 或 inline presentation 同样失败。runtime geometry 与 domain-specific value 例外只限明确的 owner 和表达式，见 `scripts/ui-guard/exceptions.ts`。`--update` 不接受新增或数量增加的违规；CI 运行检查和门禁回归测试。390/768/1440、light/dark 与真实页面交互证据按 checklist 人工验收。

## AI Provider transport

Provider 仍使用 OpenAI-compatible Chat Completions API，支持自定义 Base URL；
模型通过该地址下的 `/models` 自动发现，聊天请求发送到 `/chat/completions`。
后端 `src/features/ai/client.ts` 使用固定版本的 OpenAI 官方 npm SDK；SDK 类型不进入
`AiService`、共享 DTO 或前端的 `meta/token/done/error` SSE 协议。

模型发现和聊天均禁用自动 retry，不自动切换 Provider 或模型。Base URL
继续由 Searcher 校验，并拒绝 HTTP 重定向。为接近原 transport 无请求超时的行为，
SDK 等待响应头的 timeout 显式设为运行时 timer 安全上限（约 24.8 天），
不使用 SDK 默认的 10 分钟；该 timer 不限制流式正文读取。

Abort 会取消上游请求，已输出的内容保留并标记为 `interrupted`。Provider HTTP
错误、SSE error 消息或损坏的 SSE JSON 转换为 Searcher 错误事件；
已输出的内容保留并标记为 `failed`，不会误报为完成。
`AiServiceDeps.fetchFn` 继续支持注入 custom fetch，便于独立验证 Provider contract。

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
Key。管理员密码只在真实终端交互输入；重置使用
`deno task admin:reset -- <username>`。

同一服务先处理 `/api` 与 `/api/*`，再处理 `/assets` 与 `/assets/*`；其余 GET/HEAD 返回 SPA shell。Settings/Admin 子页面可直访、刷新和分享；未知普通页面由 React 显示统一 404（shell HTTP 状态为 200），未知 API 返回 JSON 404，缺失 assets 返回静态 404，非 GET/HEAD 不回退 HTML。反向代理应将页面请求交给 Searcher，不自行维护前端 URL 白名单。

前端路径统一由 `web/src/app/routes.ts` 维护。`/settings/search` replace 到 `/settings`，未知 Settings/Admin 子路径显示 404。登录与注册保留经过校验的站内 `next`（含 query）；无来源或外部目标返回首页。Settings/Admin 内部 Tab replace 当前 history entry，外部进入具体 Tab 保留正常 entry；二级页面 breadcrumb 提供稳定的上层与首页目标。

数据目录需要持久本地磁盘，单进程运行。数据库采用
WAL；不要在服务运行中直接复制单个 `.sqlite` 文件当备份。管理员后台可导出包含
`manifest.json`、`database.sqlite`、系统设置和 `assets/`（壁纸、图标）的
ZIP；还原前会校验 SQLite 完整性及迁移版本，并在数据库旁保存恢复前 ZIP
快照。还原后重新加载页面，必要时重启服务。备份不包含
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
