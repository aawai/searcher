# 管理后台方案 A 系统级重构实施计划

> **状态**：部分实施；管理壳层、概览、审计、用户筛选与备份流程已修改，完整回归和实页验收仍未完成。本文中的验收清单不是已通过记录。
>
> **已知限制**：`audit_logs.actor_user_id` 在用户彻底删除时由外键设为 `NULL`，现有数据无法区分已删除操作者与系统操作；现有记录会显示为“系统”。要实现两者区分，需要先确定并迁移持久化契约。

## 一、背景与实页基线

基于隔离数据库 + 生产构建（`deno task build`）在真实 Chromium 中对 `/admin`、`/admin/users`、`/admin/settings`、`/admin/audit`、`/admin/backup` 执行的跨视口（`390×844` 粗指针、`768×1024` 粗指针、`1024×768`、`1440×900`）、跨主题（`light`、`dark`、`high-contrast-light`、`high-contrast-dark`）及控件形状（`data-shape="pill"`）实页审查，确认以下系统性结构问题（非单点微调）：

| 维度                       | 实页观察与量化证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 主要定位                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **壳层与宽屏布局**         | `1440×900` 下 `PageShell[data-archetype="management"]` 与顶部 `LocalNavigation` 宽 `1100px`（`x: 170..1270`），但概览/设置/备份的 `.semantic-section[data-content="grouped"]` 被限宽 `680px` 左对齐（`x: 170..850`），右侧留出 `420px` 空白；切页时宽度在 `680 ↔ 1100px` 间反复跳变；`LocalNavigation` 在 `data-shape="pill"` 下未响应 `--shape-button-radius`                                                                                                                                                                                                                                                           | `web/src/components/searcher/semantic.css`、`web/src/app/AdminPage.tsx`                                                                |
| **表单语法误用与截断**     | 1) `AdminPage`「创建新用户」弹窗（`SettingsRow` 内联无边框右对齐输入）在 `1440` 静止态下与只读行无异，且与同文件使用 `.admin-field` 的「重置密码 / 删除用户」弹窗语法分裂；`390` 粗指针下 `#create-email` 被 `--settings-row-label-min: 8em` 挤压至 `142.67px`，`16px` 字号下 placeholder `alice@example.com` 被右缘裁切为 `alice@example.con`；`message` 跨整行掉在输入下方。<br>2) `AdminSystemSettings`「保留期限」数字框同样透明无边框，静止态与静态文本 `90 天` 难以区分；`semantic.css:582` 的 `:hover` 缺少 `@media (hover: hover)` 守卫，导致 `390` 触屏实测 `#auditRetentionDays` 背景变为 `rgb(235, 235, 238)` | `web/src/app/AdminPage.tsx`、`web/src/app/AdminSystemSettings.tsx`、`web/src/components/searcher/semantic.css`                         |
| **概览信息架构过弱**       | `AdminOverview` 将全部系统状态塞进 4 行静态 `SettingsRow`，`390` 下数值折行挤压跳转按钮；缺少核心 KPI 层级、最近高危/关键操作摘要及统一页头刷新位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `web/src/app/AdminOverview.tsx`                                                                                                        |
| **用户列表密度与信息丢失** | `USERS_PAGE_SIZE = 50` 导致 56 位用户时 `1440` 页高 `3146px`、`390` 页高 `3768px`，总数沉在底端；`390` 隐藏「角色」列导致管理员无法辨识；缺角色/状态筛选；当前登录管理员行仅剩「重置密码」1 项操作仍套 `200px` 宽 `DropdownMenu`                                                                                                                                                                                                                                                                                                                                                                                         | `web/src/app/AdminPage.tsx`、`src/features/users/users.route.ts`                                                                       |
| **审计可观测性与浮层缺陷** | 表格缺失 **操作者（Actor）** 列；仅支持单一精确 action 下拉筛选，无关键词检索；`AuditTargetId` 复用默认 `side="top"`、`width: 288px` 的 `PopoverContent`，向上弹出遮挡上一行对象与表头，且无一键复制；`390` 两列硬塞多行明细导致行高失衡                                                                                                                                                                                                                                                                                                                                                                                 | `web/src/app/AdminPage.tsx`、`web/src/components/ui/popover.tsx`、`src/features/audit/service.ts`、`src/features/audit/audit.route.ts` |
| **设置脏状态与备份碎片化** | 系统设置无 dirty state 追踪；「下载备份（ZIP）」占用了 Primary 实心主按钮抢占流程重心，预检成功后在页面下方追加 3 个离散区块，选择文件与「还原此备份…」被清单隔断；导入配置 `FilePicker` 缺少 `placeholder` 且取消确认后文件名残留                                                                                                                                                                                                                                                                                                                                                                                       | `web/src/app/AdminSystemSettings.tsx`、`web/src/app/AdminBackupRestore.tsx`                                                            |

---

## 二、目标架构（方案 A）与约束边界

1. **双栏管理工作台壳层**：
   - `≥768px`（中/宽）：采用与 `SettingsShell` 同源的左侧固定 `220px` 导航轨（`管理后台` 标题 + 5 项垂直导航 + `← 返回桌面`）+ 右侧内容区。
   - 右侧内容宽度按页面性质自然匹配：`概览 / 设置 / 备份` 收敛在 `--layout-settings-panel-max`（`680px`），与侧栏合计 ~`932px` 居中对齐，消除宽屏右侧空洞；`用户 / 审计` 扩展占满剩余宽度（总外壳上限允许至 `1160–1200px` 内），保持左侧导航锚点稳定不跳动。
   - `<768px`（窄）：左侧导航收起为顶部分组导航条，随 `--shape-button-radius` 响应形状偏好；表格页面切换为语义化列表行/事件卡片，保持角色、状态与操作者的完整可见性。
2. **必须保留的契约不变量**：
   - `<h1>` 仍为唯一的 `"管理后台"`，右侧子页主标题用 `<h2>`（保持 `web/e2e/navigation.test.ts` 的 `h1 -> h2` 连续层级断言）。
   - `/admin/overview` 继续规范重定向至 `/admin`；非 `users` 标签页不触发 `/api/admin/users` 请求。
   - 保持现有权限校验（非 admin 返回 403 / 无权访问）、密码规则引用 `AUTH_CREDENTIAL_RULES`、删除用户名确认与恢复快照等安全边界。
   - 严格遵守 `docs/design/VISUAL_LANGUAGE.md`：无卡片套卡片、无内容区阴影、禁止 `any`、高对比与 `forced-colors: active` 完整可辨、`deno task check:ui` 与 `deno task check:agents` 保持 0 违规。

---

## 三、分增量实施步骤

### 增量 1：契约修订与表单基础语义纠偏（P0 前置）

- **目标文件**：
  - `docs/design/VISUAL_LANGUAGE.md`、`docs/design/UI_CHECKLIST.md`
  - `web/src/components/searcher/semantic.css`
  - `web/src/app/AdminPage.tsx`、`web/src/app/AdminSystemSettings.tsx`、`web/src/app/admin.css`
- **实施内容**：
  1. 在 `VISUAL_LANGUAGE.md` 修订两处规则：
     - **页面原型 · 管理类**：明确管理后台独立页在 `≥768px` 使用“左侧导航 + 右侧内容”的双栏管理壳层，表单/概览面板取 `--layout-settings-panel-max`，表格区扩展占满剩余宽度。
     - **组件语法 · 表单两种形态**：区分“即时生效的偏好选择（无框右对齐 `SettingsRow`）”与“需要显式提交/输入校验的模态创建表单与数字输入（带 `--field-border` 的独立左对齐字段）”；将新增的管理员左侧导航高对比选中填充选择器登记到「强调色填充登记」表。
  2. 修复 `semantic.css:582`：将行内输入 `:hover` 规则包入 `@media (hover: hover)`，消除粗指针/触屏设备上的误触灰底。
  3. 修复 `semantic.css` 中 `.local-navigation a` 圆角（改用 `--shape-button-radius`），使其在窄屏模式下响应 `data-shape="pill"`。
  4. 重构 `AdminPage.tsx`「创建新用户」弹窗（1033–1115 行）：移除模态内横向 `SettingsRow` 无边框输入，改为 `.admin-field`（标签在上、全宽带 `--field-border` 输入框、说明/错误紧贴字段下方），与「重置密码」「删除用户」弹窗保持一致，消除 `1440` 静态文本误判与 `390` 占位文字裁切。
  5. 修改 `AdminSystemSettings.tsx`「保留期限」控件：保持其与 `天` 单位并排，但为 `#auditRetentionDays` 使用显式带 `--field-border` 的短文本输入框样式（保留 3 个 `NativeSelect` 的右对齐行内样式，不破坏 `route-style-stability.test.ts` 的 Select 右对齐断言）。
- **验收与验证**：
  - `deno task check:ui` 通过（0 新增违规，登记项与 `VISUAL_LANGUAGE.md` 一致）。
  - `390×844`（粗指针）与 `1440×900` 实页打开「创建新用户」弹窗和 `/admin/settings`：`#create-email` 占位符完整可见无裁切，`#auditRetentionDays` 在 `1440` 静止态有清晰边框且在 `390` 无灰底 hover 残留。
  - 运行 `web/e2e/route-style-stability.test.ts` 中 `/admin/settings` 用例回归通过。

---

### 增量 2：双栏管理工作台壳层（P1 架构升级）

- **目标文件**：
  - `web/src/app/AdminShell.tsx`（或同目录抽离壳层组件）
  - `web/src/app/AdminPage.tsx`、`web/src/app/admin.css`
  - `web/src/design-system/tokens.css`（如需登记壳层最大宽 Token）
  - `web/e2e/forced-colors.test.ts`、`web/e2e/navigation.test.ts`
- **实施内容**：
  1. 建立 `AdminShell`：
     - 保持 `PageShell[data-archetype="management"]` 与唯一 `<h1>管理后台</h1>`。
     - `≥768px`：左侧 `220px` sticky 导航轨渲染 5 个带 Lucide 图标（`LayoutDashboard` / `Users` / `SlidersHorizontal` / `FileClock` / `HardDriveDownload`）的导航链接（`aria-current="page"` + 字重 `600` + `--accent-soft` 底 + 左侧指示条）及 `← 返回桌面` 链接；右侧面板渲染当前子页标题 `<h2>`（与右侧动作区对齐）和子页主体。
     - `<768px`：左侧导航折叠为顶部紧凑横向导航条（保留可滚动遮罩提示与 `min-height: var(--control-touch-target)`）。
  2. 为左侧导航补全 `[data-contrast="more"]`（高对比浅/深）与 `@media (forced-colors: active)` 样式（`forced-color-adjust: none`、`Highlight` / `HighlightText`、焦点环 `CanvasText` / `--foreground`）。
  3. 修复宽屏宽度策略：`概览 / 设置 / 备份` 面板限宽 `680px`（紧邻侧栏居中），`用户 / 审计` 面板 `width: 100%` 占满管理外壳剩余空间，彻底消除切页跳变与右侧大面积留白。
- **验收与验证**：
  - 更新 `web/e2e/forced-colors.test.ts` 中管理导航选择器（若类名统一为 `.admin-nav-item` 或复用 `.local-navigation` 垂直变体），跑通 `forced-colors.test.ts` 与 `navigation.test.ts`。
  - 在 `768 / 1024 / 1440 × light / dark / high-contrast` 切换 5 个 Tab，验证左侧导航列位置零抖动、无横向溢出、焦点环可见。

---

### 增量 3：「概览」工作台重构（P1 信息架构）

- **目标文件**：
  - `web/src/app/AdminOverview.tsx`、`web/src/app/admin.css`
  - `web/e2e/navigation.test.ts`、`web/e2e/route-style-stability.test.ts`
- **实施内容**：
  1. 将「刷新」按钮收归页头动作区（与其他页面统一），移除分组卡片右上角的孤立刷新按钮。
  2. 重构系统概况区为 **2×2 KPI 指标网格**（用户、内容规模、AI 服务、审计与策略）：
     - 卡片使用 `--surface` 底色 + `--radius` 圆角 + `1px` `--border` 或无框纯表面分隔（严禁阴影与卡片套卡片）；
     - 主数字使用 `font-variant-numeric: tabular-nums`，辅以精简副文案与下钻链接（保持 `配置 AI 服务商`、`管理用户`、`查看审计日志` 的 `aria-label` 与路由替换语义）。
  3. 新增「最近关键操作」分组：在概览页并行拉取 `/api/admin/audit-logs?limit=5`，展示最近 5 条关键记录（操作语义色 + 操作者 → 对象 + 时间）及「全部记录 ›」直达入口。
  4. 加载态与错误态保持与现有 `LoadingState` / `EmptyState` 一致；仅概览页自身渲染时仍绝不请求 `/api/admin/users`。
- **验收与验证**：
  - `390×844` 下 KPI 卡片单列/双列紧凑排布无折行挤压，`1440×900` 下与 680px 面板齐宽平衡。
  - `navigation.test.ts`（含 `配置 AI 服务商` 跳转返回与不触发 `/api/admin/users` 断言）及 `route-style-stability.test.ts` 对应断言更新后通过。

---

### 增量 4：审计日志增强——操作者列、搜索筛选、紧凑 ID 复制与窄屏事件列表（P0+P2）

- **目标文件**：
  - `src/shared/contracts.ts`
  - `src/features/audit/service.ts`、`src/features/audit/audit.route.ts`、`src/features/audit/audit.test.ts`
  - `web/src/app/AdminPage.tsx`、`web/src/app/admin-audit.ts`、`web/src/app/admin.css`
  - `web/e2e/route-style-admin-lab.test.ts`
- **实施内容**：
  1. **后端与契约扩展**：
     - `AuditLogDto` 增加可选字段 `actorUsername?: string | null`、`actorDisplayName?: string | null`（当用户已被彻底清理或系统操作时允许 `null`）。
     - `AuditService.list()` 通过 `leftJoin(users, eq(auditLogs.actorUserId, users.id))` 返回操作者展示信息；新增可选查询参数 `q`（支持按操作者用户名/显示名、目标 ID、metadata 内容 `LIKE ... ESCAPE '\\'` 匹配）和 `category`（`user | system | ai` 前缀过滤）。
     - 补充 `audit.test.ts` 回归用例覆盖操作者解析、关键词搜索（含 `%`/`_` 转义）与分类过滤。
  2. **桌面端表格与工具栏**：
     - 标题旁显示 `共 N 条`；工具栏补充关键词搜索框（`<Input variant="search" />`）+ 操作筛选下拉。
     - 表格新增「操作者」列（展示 `@username` 或 `系统` / `已删除用户`）。
  3. **修复 `AuditTargetId` 浮层**：
     - `PopoverContent` 传 `side="bottom"`、`align="start"`，在 `admin.css` 中覆盖其宽度为 `width: auto; max-width: min(360px, calc(100vw - var(--space-6)))`，避免向上弹出遮挡前一行目标与表头。
     - 浮层内并排展示等宽完整 ID 与「复制」按钮（带 `navigator.clipboard.writeText` 与已复制反馈），保留键盘 Escape 关闭并归还焦点。
  4. **窄屏（`<768px`）语义化事件列表**：
     - 桌面保留 `ManagementTable`，`<768px` 切换为单列语义事件列表（顶部：操作 + 时间；中部：操作者 → 对象 + 可交互 ID 触发器；底部：横向自动换行明细项，`overflow-wrap: anywhere` 处理长未知 key），消除两列窄表格纵向拉伸。
- **验收与验证**：
  - `deno test -A src/features/audit/audit.test.ts` 通过。
  - 更新 `web/e2e/route-style-admin-lab.test.ts` 的 390px 审计测试以兼容窄屏事件卡片容器，保留对短 ID 触发器 `≥44×44`、键盘 Enter/Escape 焦点回归及触屏点击的完整断言并运行通过。

---

### 增量 5：「用户」页运营效率与窄屏语义行重构（P0+P2）

- **目标文件**：
  - `src/features/users/users.route.ts`、`src/features/users/users.test.ts`
  - `web/src/app/AdminPage.tsx`、`web/src/app/admin.css`
  - `web/e2e/route-style-admin-lab.test.ts`
- **实施内容**：
  1. **后端分页与过滤**：
     - `GET /api/admin/users` 默认 `pageSize` 由 `50` 调整为 `20`（并允许可选 `limit` 参数，上限 `50`，兼容已有分页测试或同步更新断言）；新增可选 `filter`（`all | admin | disabled`）查询参数。
     - 在 `users.test.ts` 补充角色/禁用状态过滤与默认分页大小的契约测试。
  2. **前端列表与交互精简**：
     - 页头展示 `共 N 位`；工具栏在搜索框旁增加紧凑型 `RadioGroup variant="segmented"` 筛选器（`全部 / 管理员 / 已禁用`）。
     - 行尾操作精简：当仅剩 1 个可用操作（例如当前登录管理员行仅「重置密码」）时，直接渲染内联 `Button variant="outline" size="sm"`，不再嵌套只有一个菜单项的 `DropdownMenu`；同时确保操作按钮在粗指针下命中区 `≥44px`。
     - `<768px` 切换为语义化用户列表行（参考 `TrashPage` 双视图切换模式，无卡片套卡片）：首行展示显示名称 +「管理员」/「已禁用」状态徽标 + 行动作，次行展示 `@username · email · 创建时间`。
- **验收与验证**：
  - `deno test -A src/features/users/users.test.ts` 通过。
  - 56 位用户场景下 `1440` 与 `390` 页面高度收敛约 60%；`390` 列表可一眼辨识「管理员」与「已禁用」用户；当前登录管理员行可直接一键点击「重置密码」。
  - 更新 `web/e2e/route-style-admin-lab.test.ts` 用户标签换行断言（覆盖窄屏行视图与 768px 表格视图）并运行通过。

---

### 增量 6：「设置」脏状态追踪与「备份还原」连贯作业流（P1+P2）

- **目标文件**：
  - `web/src/app/AdminSystemSettings.tsx`
  - `web/src/app/AdminBackupRestore.tsx`、`web/src/app/admin.css`
  - `web/e2e/route-style-stability.test.ts`、`web/e2e/route-style-admin-lab.test.ts`
- **实施内容**：
  1. **系统设置脏状态闭环**：
     - 保存服务端返回的 `savedSettings` 基线，对比当前表单状态计算 `isDirty`；`isDirty === false` 时禁用提交按钮；`isDirty === true` 时在页脚展示操作栏（「有未保存的更改」提示 +「放弃」重置按钮 +「保存设置」Primary 按钮）。
  2. **备份与还原统一流**：
     - 为「导入配置」的 `FilePicker` 补充 `placeholder="未选择文件"` 与清除图标/重置逻辑（在用户取消导入确认对话框时同步清理临时文件名或允许显式清除）。
     - 将「下载备份（ZIP）」从 `variant="default"` 调整为 `variant="outline"`，避免高频/低频导出按钮与危险还原流程争夺视觉主焦点（确认 `route-style-admin-lab.test.ts` 对比度测量仍满足 `≥4.5:1`）。
     - 将「完整备份」整合为同一 `SettingsGroup` 内的连贯作业流：上方「创建备份」行；下方「从备份还原」纵向步骤区直接内联展示所选文件、清除操作、预检触发、成功校验后的清单摘要与底部「还原此备份…」危险按钮（不再在页面最下方追加分离的多张卡片）。
- **验收与验证**：
  - 运行 `web/e2e/route-style-admin-lab.test.ts` 备份语义色用例及 `web/e2e/route-style-stability.test.ts` 的 `/admin/backup` 9 视口 + 长文件名压测。
  - `390`、`768`、`1440` 实页验证长文件名换行、预检前后高度平滑展开、无元素越界与无横向溢出。

---

## 四、总体验收与门禁清单

全部增量完成后按以下顺序执行完整验证，不以局部通过替代完整门禁：

1. **后端与契约单测**：`deno task test`
2. **门禁与静态检查**：`deno task check:ui`、`deno task check:agents`、`deno task check:e2e`、`deno task check:bundle`
3. **受影响 E2E 集合（先 `--timeout 5000` 摸底，再默认超时验收）**：
   - `web/e2e/navigation.test.ts`
   - `web/e2e/forced-colors.test.ts`
   - `web/e2e/route-style-admin-lab.test.ts`
   - `web/e2e/route-style-stability.test.ts`
   - `web/e2e/ui-ownership.test.ts`
   - `web/e2e/bundle-loading.test.ts`
4. **实页视觉矩阵**：在隔离数据库 + 生产构建下对 `/admin`、`/admin/users`、`/admin/settings`、`/admin/audit`、`/admin/backup` 覆盖 `390×844`（coarse）、`768×1024`（coarse）、`1024×768`、`1440×900` × `light / dark / high-contrast-light / high-contrast-dark` 及 `data-shape="pill"`，逐张核验截图、对比度、焦点路径与触屏命中区。
5. **文档与变更日志**：同步更新 `docs/plans/README.md` 状态，并在最终实现合入时于 `CHANGELOG.md` 的 `## [Unreleased]` 记录外部可观察变更。
