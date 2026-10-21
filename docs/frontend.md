# 前端开发

UI 规则以
[Design Principles](design/DESIGN_PRINCIPLES.md)、[Design System](design/DESIGN_SYSTEM.md)
与 [UI Review Checklist](design/UI_REVIEW_CHECKLIST.md)
为准；本文只记录代码位置与维护约定。

## 组件

- 基础交互组件位于 `web/src/components/ui/`，来自 shadcn/ui 的 Base UI
  版本并按品牌 Token 调整；`web/components.json` 记录 registry 配置。
- 业务组合组件位于 `web/src/components/searcher/`；页面复用
  `PageShell`、`PageHeader` 和 Searcher semantic components。
- `/design-lab`
  用于检查正式组件、交互状态、主题与响应式预览，不替代真实业务页面验收；设置中的入口仅对管理员显示。
- `/design-lab/markdown-editor` 是 M0A
  编辑技术验证入口，仅本地演示，不保存或替换便签。验证结论、bundle 口径和 #110
  输入约束见 [M0A 报告](editor/MARKDOWN_EDITOR_M0A.md)。

## 样式

- `web/src/design-system/tokens.css` 定义颜色、材质、圆角、阴影，以及共享的
  `--space-*`、`--font-*`、`--layout-*`、`--control-*` 和
  `--elevation-*`。通用页面、表单、卡片和控件优先消费这些
  Token，不重复写入相同固定尺寸。
- `web/src/styles/global.css` 保留页面骨架、通用控件与跨业务公共规则；Zen /
  Widgets 专属布局在
  `web/src/features/home-layouts/home-layouts.css`，应用图标和文件夹网格在
  `web/src/components/searcher/launcher.css`。`web/src/main.tsx`
  按首页布局、全局样式、Launcher
  的顺序加载，保持公共交互状态和网格覆盖的级联关系。
- 页面横向留白在 767px 以下为 16px，通用卡片内边距在 640px 以下为
  16px；触屏常规控件使用 44px 点击目标。不要把不同用途的尺寸合并成同一个 Token。
- 稳定布局使用语义 class 或 Tailwind 标准 utility；壁纸、拖拽变换和瀑布流位置等
  runtime 值保留 inline style。图标尺寸和 Launcher
  方格等组件内部几何由组件维护。
- 样式调整后构建前端，实页检查两种布局、设置、登录和应用面板的浅深色与壁纸组合。

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
- `--update` 不接受新增或数量增加的违规；CI 运行检查和门禁回归测试。
- baseline 通过不表示历史样式债务、focus
  语义或所有业务流程已清零。390/768/1440、light/dark 与真实页面交互证据按
  checklist 人工验收。
- 既有 UI
  计划（[docs/plans/](plans/README.md)）是历史设计资料；当前规则、存量迁移边界及
  advisor 裁决见 Design System。

## 路由

前端路径统一由 `web/src/app/routes.ts` 维护。

- `/settings/search` replace 到 `/settings`；未知 Settings/Admin 子路径显示
  404。
- 登录与注册保留经过校验的站内 `next`（含 query）；无来源或外部目标返回首页。
- Settings/Admin 内部 Tab replace 当前 history entry，外部进入具体 Tab 保留正常
  entry；二级页面 breadcrumb 提供稳定的上层与首页目标。

服务端路由回退规则见 [部署细节](deployment.md#请求路由)。

## 构建分包

本仓库是应用而非可发布的 Deno library，`deno.jsonc` 不声明包 `name` 或
`exports`。`web/vite.config.ts` 按 React runtime、AI 会话、Markdown 与 UI
依赖设置 `manualChunks`，保留 Vite 默认的 500 kB chunk
警告阈值。分包不等于按需加载，也不减少总 JS 体积。
