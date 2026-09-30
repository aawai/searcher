# Searcher

基于 Deno、Hono、React、SQLite
的单进程搜索主页。首页以普通搜索为主；登录后可管理 APP、Markdown 便签、AI
问答、壁纸和跨设备偏好。管理员由交互式 CLI 创建，不存在默认管理员。

## 主页外观

在“设置 → 外观 → 主页工作区风格”切换 Zen（极简呼吸）与 Widgets（空间轻桌面）。Zen 不显示品牌大标题；“显示 Searcher 标题”仅控制 Widgets 的大标题。切换工作区或标题开关不会改变搜索框的纵向锚点，匿名与登录状态保持一致；个人内容仍须登录。

主页以搜索为主操作、Bento 为内容层、Dock / 边缘入口为轻量导航。壁纸位于底层，Sheet / Dialog 使用不透明表面。材质与阴影由 `web/src/design-system/tokens.css` 中的 `--surface-l0…l3`、`--shadow-l1…l3` 和导航 Token 管理，与 z-index 层级分开；hero 使用显式 grid 行而非隐藏标题占位。

## APP 使用

登录后，首页搜索框下方显示固定网站：PC 从搜索框左边界起排，移动端将整组图标居中，均按容器宽度自动换行；展开文件夹后，内部应用从左侧起排。首页保留 64px 方形占位，图标之间的行列间距均为 6px。在“设置 → 搜索”可选择显示 8、12、16 个或全部，在“设置 → 外观”可调整图标大小。右键网站图标（触屏长按；键盘菜单键或 Shift+F10）可打开操作菜单，包括首页的“编辑布局”；编辑时可拖动带提示的图标，键盘可用方向键排序。不显示悬浮省略号按钮或图标下方的左右移动按钮。

在“设置 → 外观 → 控件形状”选择“默认”或“胶囊”：默认使用小圆角；胶囊联动搜索框、内部搜索引擎与提交按钮，以及常规单行输入框、按钮和控件内图标。便签编辑器的标题、正文与预览，以及其他多行编辑区、卡片、APP 图标、头像与状态指示保持正常圆角。

在“设置 → 外观 → 壁纸与背景效果”上传本地图片后，上传控件下方按时间倒序展示最近 5 张缩略图。点击缩略图可放大预览，再选择“设为壁纸”；关闭预览不会更换壁纸。登录用户的图片保存在服务端，上传第 6 张时自动移除最早的一张；访客的上传历史只在当前设置页面有效。清除壁纸或恢复默认效果不会删除已上传的历史图片。

底部“常用网站”打开面板。弹窗采用固定 64×64px 方形网格、8px 间距：320px 宽手机每行可放 4 个图标，PC 使用相同尺寸；名称统一在图标下方，隐藏名称不改变占位。小文件夹与图标外观同尺寸；大文件夹占 2×2 格（136×136px），可见边框上下对齐两排图标外框，名称位于边框下方且与第二排图标名称对齐；切换文件夹大小不改变图标大小。弹窗按占用宽度居中；首页固定图标另用与搜索框左边界对齐的自动换行布局。应用从文件夹移出或移至另一文件夹时追加到列表末尾；删除文件夹后成员也依次追加。面板提供搜索、文件夹管理和网站编辑；离线时可查看当前账户此前缓存的网站列表，服务端错误不会作为离线缓存展示。

### AI 应用图标

添加或编辑网站时，在“图标 → AI 生成”选择支持 `/images/generations` 的图片模型。风格包括极简、几何、符号、线性、双色、柔和渐变、柔和 3D 和图形角色；生成的是原创 Launcher App Icon，不是官方品牌标志。

网站名称为必填上下文，域名从网址提取且只发送 hostname，不发送路径、query 或 fragment。可选“图标语义/用途”最多 300 字，用于说明产品功能或视觉隐喻；该描述仅用于本次生成，不保存为网站字段。生成前会展示 Provider、模型、风格及实际发送的名称、域名和用途；取消不发起请求。

每次生成只发送一次 OpenAI-compatible 请求，保持 `n: 3`、`size: "1024x1024"` 和现有图片校验。Prompt 统一约束 32／48／64px 可读性、单焦点、安全边距、原创性，以及候选的视觉隐喻、轮廓和构图差异；实际效果取决于 Provider／模型。选中候选后沿用上传与图片校验流程，图标文件上限 2 MiB。请求可能产生 Provider 费用。


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
