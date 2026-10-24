# 前端开发

UI 视觉规则以 [Visual Language](design/VISUAL_LANGUAGE.md) 为准，实页验收按
[UI 验收清单](design/UI_CHECKLIST.md)；本文只记录代码位置、组件归属、交互与可访问性约定。

## 组件

- 基础交互组件位于 `web/src/components/ui/`，来自 shadcn/ui 的 Base UI
  版本并按品牌 Token 调整；`web/components.json` 记录 registry 配置。
- 业务组合组件位于 `web/src/components/searcher/`；页面复用
  `PageShell`、`PageHeader` 和 Searcher semantic components。
- `/design-lab`
  用于检查正式组件、交互状态、主题与响应式预览，不替代真实业务页面验收；设置中的入口仅对管理员显示。`/design-lab/*`
  是 [实验通道](design/VISUAL_LANGUAGE.md#实验通道)：原型进入生产前须经对应契约子任务。
- `/design-lab/markdown-editor` 是 M0A
  编辑技术验证入口，仅本地演示，不保存或替换笔记。验证结论、bundle 口径和 #110
  输入约束见 [M0A 报告](editor/MARKDOWN_EDITOR_M0A.md)。
- 页面语义由 `components/searcher/` 拥有：`PageShell` / `PageHeader`
  管理页面骨架与唯一标题；`semantic.tsx` 提供 `Section`、`SettingsCard` /
  `SettingsRow`、`ActionGroup`、`EmptyState`、`StatusBanner`、`LoadingState`、`UndoToast`、`LocalNavigation`、`ManagementTable`
  等共享语义组件。Feature 不另建同名反馈或分组容器。
- 标题层级：每个页面只有一个 `h1`。设置页 `h1` 为“设置”，Tab 为 `h2`，分组为
  `h3`；Tab 内的 `LoadingState` / `EmptyState` 使用 `headingLevel={3}`。Ask
  登录态的会话标题是唯一 H1。
- 图标使用 Lucide，`size` 只允许 14、16、20（`check:ui` 强制）。语义映射：应用
  `AppWindow`、笔记 `NotebookPen`、总览 `LayoutGrid`、文件夹
  `Folder`。
- 用户可见文案（应用 / 网站 / 网址、笔记 / 首页纸张、删除与恢复动词、版本冲突选项）以 Visual Language 文案为准；代码与 API
  保持 canonical 英文命名。

## 样式

- `web/src/design-system/tokens.css` 定义颜色、材质、圆角、阴影，以及共享的
  `--space-*`、`--font-*`、`--layout-*`、`--control-*` 和
  `--elevation-*`。通用页面、表单、卡片和控件优先消费这些
  Token，不重复写入相同固定尺寸。
- `web/src/styles/global.css` 保留页面骨架、通用控件与跨业务公共规则；首页 Zen
  布局在
  `web/src/features/home-layouts/home-layouts.css`，应用图标和文件夹网格在
  `web/src/components/searcher/launcher.css`。`web/src/main.tsx`
  按首页布局、全局样式、Launcher
  的顺序加载，保持公共交互状态和网格覆盖的级联关系。
- 页面横向留白在 767px 以下为 16px，通用卡片内边距在 640px 以下为
  16px；触屏常规控件使用 44px 点击目标。不要把不同用途的尺寸合并成同一个 Token。
- 稳定布局使用语义 class 或 Tailwind 标准 utility；壁纸、拖拽变换等 runtime
  值保留 inline style。图标尺寸和 Launcher 方格等组件内部几何由组件维护。
- 样式调整后构建前端，实页检查首页、设置、登录和笔记面板的浅深色与壁纸组合。

## UI 门禁

```sh
deno task check:ui
deno test -A scripts/ui-guard/
# 迁移旧样式后，仅删除已经解决的历史 allowance
deno task check:ui --update
```

- 门禁按文件、rule 和具体值计数；已有文件中新加的 raw
  spacing/font/shadow/radius、arbitrary Tailwind 或 inline presentation
  同样失败。
- runtime geometry 与 domain-specific value 例外只限明确的 owner 和表达式，见
  `scripts/ui-guard/exceptions.ts`。
- 语义规则读取 [Visual Language](design/VISUAL_LANGUAGE.md) 的登记表（解析见
  `scripts/ui-guard/registry.ts`）：`font-size` / `border-radius` 只能引用已登记
  Token，`--font-*` / 圆角 Token 的定义必须已登记，`var(--accent)` 作为
  background / fill 必须在已登记的文件与选择器中。登记表缺失或格式错误时门禁失败。
  新增 Token 或强调色填充先改 Visual Language，再改实现。
- `--update` 不接受新增或数量增加的违规；CI 运行检查和门禁回归测试。
- baseline 通过不表示历史样式债务、focus
  语义或所有业务流程已清零。390/768/1440、light/dark 与真实页面交互证据按
  [UI 验收清单](design/UI_CHECKLIST.md) 人工验收。
- 门禁的 ownership 规则（feature selector 不进入 `global.css`、legacy `.page`
  几何、未定义 Token、native confirm、已废止 class、CSS 前缀归属）不能通过
  baseline、`--update` 或 initialize 豁免。
- 既有 UI 计划（[docs/plans/](plans/README.md)）是历史设计资料；当前规则以
  [Visual Language](design/VISUAL_LANGUAGE.md) 为准。

## 可访问性契约

对比度、焦点环与触控目标的数值底线见
[Visual Language](design/VISUAL_LANGUAGE.md#一底线)。以下为代码必须保持的行为：

- Escape 由 `components/ui/escape-layer-stack.tsx`
  统一裁决，每次只消费最上层的菜单、弹窗或工作区；输入法合成中不分发；注销层不得穿透到
  window。关闭后焦点回到触发控件。
- 删除、覆盖、放弃未保存修改等不可逆操作使用 AlertDialog。取消与 Escape
  不执行动作；pending 时禁用确认与取消。
- 禁止 `confirm()`、`window.confirm()` 等原生确认（`check:ui` 的
  native-destructive-confirm 规则）。
- 选中状态不只靠颜色：配合勾号、`aria-current` 或 `aria-pressed`。
- 同步失败使用持久、礼貌的状态容器，图标与文字链接并存；连接错误与偏好同步错误分开建模，不互相覆盖。
- 主题切换按钮的可访问名称与 `title` 使用中文，说明当前与下一个主题。
- `prefers-reduced-motion`
  下位移、缩放与旋转改为纯透明度变化，页面切换不做过渡，加载指示保持旋转；系统偏好不改写用户已保存的设置。

## 路由

前端路径统一由 `web/src/app/routes.ts` 维护。

- `/ask` 是对话工作区（空状态），`/ask/:id` 是会话深链；同一路由元素承载两者，在 `/ask`
  发起的会话拿到 id 后以 replace 更新为 `/ask/:id`，侧栏切换为 push。首页不是 Ask
  的入口：首页顶栏没有 AI 链接，头像菜单的“AI 问答”与其他页面顶栏的 AI 链接只在登录且有可用模型时
  出现，访客与无模型用户在首页没有任何 AI 入口。
- `/settings/search` replace 到 `/settings`；未知 Settings/Admin 子路径显示
  404。
- 登录与注册保留经过校验的站内 `next`（含 query）；无来源或外部目标返回首页。成功后由
  页面上“已登录”状态这一处 replace 到目标，只导航一次（`/share` 这类一次性入口依赖它）。
- `/share` 是分享目标，不渲染内容页，立即 replace 到首页或登录，见
  [首页与桌面 · 捕获入口](workspace.md#捕获入口)。
- Settings/Admin 内部 Tab replace 当前 history entry，外部进入具体 Tab 保留正常
  entry；二级页面 breadcrumb 提供稳定的上层与首页目标。登录用户的设置导航首项为
  “账户与安全”（`/account`），按设置内部 Tab 处理。
- 顶层页面之间的导航（顶栏、用户菜单、404 返回等）启用 React Router
  `viewTransition`；设置、管理内部 Tab 与工作区不使用。首页回答卡片展开为 `/ask/:id`
  使用共享元素过渡（`web/src/lib/shared-element.ts`），不经过 React Router 的
  `viewTransition`。
- 从 `/ask/:id` 离开到首页时（任意方式），首页挂载后把焦点放回搜索框。

服务端路由回退规则见 [部署细节](deployment.md#请求路由)。

## 构建分包

本仓库是应用而非可发布的 Deno library，`deno.jsonc` 不声明包 `name` 或
`exports`。`web/vite.config.ts` 按 React runtime、AI 会话、Markdown 与 UI
依赖设置 `manualChunks`，保留 Vite 默认的 500 kB chunk
警告阈值。分包不等于按需加载，也不减少总 JS 体积。
