# Searcher

基于 Deno、Hono、React、SQLite
的单进程搜索主页。首页以普通搜索为主；登录后可管理 APP、Markdown 便签、AI
问答、壁纸和跨设备偏好。管理员由交互式 CLI 创建，不存在默认管理员。

## APP 使用

登录后，首页搜索框下方显示固定网站：PC 从搜索框左边界起排，移动端将整组图标居中，均按容器宽度自动换行；展开文件夹后，内部应用从左侧起排。首页保留 64px 方形占位，图标之间的行列间距均为 6px。在“设置 → 搜索”可选择显示 8、12、16 个或全部，在“设置 → 外观”可调整图标大小。右键网站图标（触屏长按；键盘菜单键或 Shift+F10）可打开操作菜单，包括首页的“编辑布局”；编辑时可拖动带提示的图标，键盘可用方向键排序。不显示悬浮省略号按钮或图标下方的左右移动按钮。

在“设置 → 外观 → 控件形状”选择“默认”或“胶囊”：默认使用小圆角；胶囊联动搜索框、内部搜索引擎与提交按钮，以及常规单行输入框、按钮和控件内图标。便签编辑器的标题、正文与预览，以及其他多行编辑区、卡片、APP 图标、头像与状态指示保持正常圆角。

在“设置 → 外观 → 壁纸与背景效果”上传本地图片后，上传控件下方按时间倒序展示最近 5 张缩略图。点击缩略图可放大预览，再选择“设为壁纸”；关闭预览不会更换壁纸。登录用户的图片保存在服务端，上传第 6 张时自动移除最早的一张；访客的上传历史只在当前设置页面有效。清除壁纸或恢复默认效果不会删除已上传的历史图片。

底部“常用网站”打开面板。弹窗采用固定 64×64px 方形网格、8px 间距：320px 宽手机每行可放 4 个图标，PC 使用相同尺寸；名称统一在图标下方，隐藏名称不改变占位。小文件夹与图标外观同尺寸；大文件夹占 2×2 格（136×136px），可见边框上下对齐两排图标外框，名称位于边框下方且与第二排图标名称对齐；切换文件夹大小不改变图标大小。弹窗按占用宽度居中；首页固定图标另用与搜索框左边界对齐的自动换行布局。应用从文件夹移出或移至另一文件夹时追加到列表末尾；删除文件夹后成员也依次追加。面板提供搜索、文件夹管理和网站编辑；离线时可查看当前账户此前缓存的网站列表，服务端错误不会作为离线缓存展示。

## 本地开发

要求 Deno 2.9.7+。在仓库根目录：

```sh
deno install
APP_ORIGIN=http://localhost:5173 deno task dev:api
# 另开终端
deno task dev
```

打开 `http://localhost:5173`。Vite 将 `/api` 代理到
`127.0.0.1:34567`。`deno task test` 运行后端契约测试，`deno task build`
构建生产前端。

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
