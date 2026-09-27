# Searcher

基于 Deno、Hono、React、SQLite
的单进程搜索主页。首页以普通搜索为主；登录后可管理 APP、Markdown 便签、AI
问答、壁纸和跨设备偏好。管理员由交互式 CLI 创建，不存在默认管理员。

## APP 使用

登录后，首页搜索框下方按同一左边界显示固定网站；在“设置 → 搜索”可选择显示
8、12、16 个或全部，在“设置 →
外观”可调整图标大小。右键网站图标（触屏长按；键盘菜单键或
Shift+F10）可打开操作菜单，包括首页的“编辑布局”；编辑时直接拖动带提示的图标，键盘可用方向键排序。不显示悬浮省略号按钮或图标下方的左右移动按钮。

在“设置 → 外观 → 控件形状”选择“默认”或“胶囊”：默认使用小圆角；胶囊联动搜索框、内部搜索引擎与提交按钮，以及常规单行输入框、按钮和控件内图标。便签编辑器的标题、正文与预览，以及其他多行编辑区、卡片、APP 图标、头像与状态指示保持正常圆角。

在“设置 → 外观 → 壁纸与背景效果”上传本地图片后，上传控件下方按时间倒序展示最近 5 张缩略图。点击缩略图可放大预览，再选择“设为壁纸”；关闭预览不会更换壁纸。登录用户的图片保存在服务端，上传第 6 张时自动移除最早的一张；访客的上传历史只在当前设置页面有效。清除壁纸或恢复默认效果不会删除已上传的历史图片。

底部“APP”打开可切换 40% / 65% / 90%
高度的面板。全部视图以文件夹汇集网站，桌面预览最多 9 个图标、窄屏最多 4
个；内容不足时图标居中放大，点击文件夹外收起。面板提供搜索、创建/重命名/排序/删除文件夹；首页仍只显示固定图标。添加 APP 时可快速识别站点名称与图标。网络不可用时可查看当前账户此前缓存的网站列表；面板提供重试连接，服务端报错不会当作离线缓存展示。

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

完整产品规格见
[`Searcher-v1-Final-React-shadcn-Spec-Pack/`](Searcher-v1-Final-React-shadcn-Spec-Pack/README.md)。
