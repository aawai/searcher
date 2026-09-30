# Searcher Design System Contract

本参考与 [UI Constitution](DESIGN_PRINCIPLES.md)
共同约束页面；[Review Checklist](UI_REVIEW_CHECKLIST.md) 为 UI PR 验收模板。

## Ownership

- web/src/design-system/tokens.css：值、主题、accent、shape 与 taxonomy。
- components/ui/：shadcn primitives，基础交互、ARIA、几何。
- components/searcher/PageShell.tsx、PageHeader.tsx、semantic.tsx、semantic.css：页面与组合结构。
- feature stylesheet：领域布局，不另建常规几何值。

正式 shadcn 色彩 role 由 `@theme inline` 映射到 Searcher Token：primary →
accent，secondary → surface-soft，muted-foreground → muted，destructive →
danger，ring → ring。`text-muted` 保留文字语义，Table/Badge 的背景使用 surface
role，不把 muted 文字色当作 surface。

## Token taxonomy

| 角色                                     | token                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| page inline / block                      | --space-page-inline / --space-page-block                                                      |
| section / card padding                   | --space-section-gap / --space-card-padding                                                    |
| row / control / inline                   | --space-row-gap / --space-control-gap / --space-inline-gap                                    |
| page / section / component title         | --font-page-title-* / --font-section-title-* / --font-component-title-*                       |
| body / caption / metadata / code         | --font-body-* / --font-caption-* / --font-metadata-* / --font-code-*                          |
| weight                                   | --font-title-weight / --font-label-weight / --font-body-weight                                |
| card / control / input / search radius   | --radius / --control-radius / --input-radius / --search-radius                                |
| control / compact / input / touch height | --control-height / --control-compact-height / --control-input-height / --control-touch-target |

每页最多一个 h1；section 使用 h2；component title 不抬高到 page
层级。caption/muted 不承载唯一关键提示。code 使用 code role/monospace。

上表是新建和已迁移 UI 的 canonical 命名，不提供第二套同义 role。既有
Home、Launcher、通用 card 等消费者仍使用
`--space-section`、`--space-card`、`--space-card-gap`；这些是未迁移的历史变量，不是新
Token 的可互换 alias。尤其 `--space-card` 在 640px 以下为 16px，而
`--space-card-padding` 保持 24px；`--space-card-gap` 为 12px，`--space-row-gap`
为
16px。不能仅按初始值相同全局替换，否则会改变本次未重设计的首页和卡片布局。新增消费者只使用上表；迁移历史消费者时验证对应响应式行为，所有引用移除后再删除旧变量。

## Surface / elevation

| level                  | 背景                     | 边框                        | 阴影                | blur                                          | 状态                                       |
| ---------------------- | ------------------------ | --------------------------- | ------------------- | --------------------------------------------- | ------------------------------------------ |
| L0 Canvas              | --surface-l0 / wallpaper | 无                          | 无                  | 壁纸 runtime filter                           | 无交互                                     |
| L1 Content             | --surface-l1             | --border-subtle             | --shadow-l1         | 壁纸 material 才用 --material-blur-content    | hover 不改变 geometry；selected 有语义标记 |
| L2 Primary interaction | --surface-l2             | --surface-l2-border         | --shadow-l2         | 壁纸 material 可用 --material-blur-search     | focus/loading/error 不改变 geometry        |
| L3 Overlay             | --surface-l3             | --surface-l3-border         | --shadow-l3         | 不叠加大 blur                                 | Dialog/Sheet/Popover 管理 focus/open/close |
| Navigation             | --surface-navigation     | --surface-navigation-border | --shadow-navigation | 壁纸 material 可用 --material-blur-navigation | hover/current/focus 不升为 L2              |

material 与 z-index 分离：--elevation-* 只表达叠放顺序，不授权更强阴影。普通
content 不叠加强 border/glow/highlight。

## Page Archetypes

| 类型            | 页面                      | 结构与边界                                                                                                    |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Search Canvas   | Home Zen/Widgets          | global toolbar → primary Search → optional personal content → workspace navigation；无 heavy sidebar/竞争 CTA |
| Utility         | Settings/Account/Auth/404 | PageHeader → section groups → standard cards/rows；Auth 窄表单，Settings container layout                     |
| Workbench       | Ask/Note editor           | workspace navigation → context toolbar → content canvas → composer/action；降低 box-on-box，保留编辑/会话模型 |
| Data Management | Admin/Trash               | PageHeader → local navigation → filters/controls → table/structured content → pagination；表格局部横滚        |

PageShell archetype 是稳定布局语义，不按页面新增分支。NoteEditor overlay
使用既有 Dialog 的 workspace composition，不在 overlay 内再造 main。direct entry
有 breadcrumb/上级；local tab replace，跨 workspace 入口保持 history。

## Semantic components

PageHeader 保留 items，并拥有唯一 title、description、actions、optional
navigation。Section/SectionHeader 管理分组；SettingsCard/SettingsRow 管理
label/description/control；ActionGroup 管理动作；EmptyState/StatusBanner
管理空/状态；WorkspaceToolbar 管理上下文；LocalNavigation 管理
route-current；ManagementTable 复用 shadcn Table 与局部 overflow。基础交互继续由
shadcn 提供。

## Interactive / responsive contract

- default/hover/focus-visible/active/selected-current/disabled/loading/error
  可辨识；selected 不仅改变颜色，使用 check/current/ARIA；loading 保留位置。
- hover/selected 不改尺寸，不用 hover transform 模拟 elevation；focus-visible 用
  --ring；disabled 可读；error 有文字和 role=alert。
- 遵循 prefers-reduced-motion，不用 motion 表示唯一状态。
- 小屏 actions wrap、控件不溢出；设置行由 settings-panel container query
  重排；touch target 不缩小。
- 390/768/1440 最小实页矩阵；640/960/1280
  和长文案检查临界布局；guest/authenticated、light/dark、Zen/Widgets、wallpaper
  on/off 都检查。

## Static guard

deno task check:ui 检查业务 CSS/TSX 新增 raw
shadow/font-size/radius/spacing、inline visual style 与 arbitrary
Tailwind。baseline 精确到内容和次数，不按文件放行。runtime exception 见
scripts/ui-guard/exceptions.ts。删除旧违规同时缩减
baseline，不将迁移后的新增违规加入 baseline。CI 执行同一入口。

/design-lab 是正式组件 smoke surface，不是新 UI
语言来源，不能替代真实业务页面验证。

## 迁移范围与反馈裁决

本 Contract 以 Issue #33 的 Search-first、一致性与反 drift
为目标，不引入差异化视觉、hero、装饰性动效或新的产品能力。

`UI_UX_AUDIT_FIX_PLAN.md`、`WORKSPACE_LAYOUT_REDESIGN_PLAN.md` 与
`Searcher-v1-Final-React-shadcn-Spec-Pack/` 保留为既有设计资料；当前 UI 规则以本
Contract 为准，业务
API、安全与持久化约束仍以实现和契约为准。反馈与合理的本次范围冲突时，保留任务要求并说明未迁移边界，不借反馈扩展业务范围。

本次完整视觉迁移对象是 Admin、Settings、Ask 和 Design
Lab；Account、Auth、Trash、Home 接入 PageShell/PageHeader
不表示其全部内部控件和历史样式已重写。Account 的旧 link-button 与表单 inline
presentation、首页的旧 spacing 消费者属于存量，不作为新 UI 示例。baseline
记录存量违规，不是批准新增的系统级例外。

`scanDirectory` 遍历 `web/src` 下所有非测试 CSS/TSX，排除测试、fixtures
与产物；baseline 只参与扫描后的比较，不跳过已登记文件。普通
`.ts`、文档、测试和其他非样式文件不在这一扫描面内。门禁只保证已实现 rule
的新增/计数不增加；不自动证明 focus 配色、层级、对比度或移动端交互合格。

focus-visible 的 canonical 规则仍是 `--ring`。旧
`.note-color-dot-btn`、`.wallpaper-history__item` 使用
`--accent`，`.note-action-btn` 使用 1px
offset，尚未在本次页面迁移中统一；这是已知存量偏离，不是获批例外。修改这些控件时按
Contract 收敛并实际验收，不能因 check:ui 通过宣称这些语义已被自动验证。

Settings 壁纸输入目前提示“或 CSS 渐变”，但 preferences 的 BackgroundImage
校验仅接受 HTTPS URL 或 owner 壁纸路径；登录用户的 CSS gradient
持久化存在既有前后端契约不一致。Issue #33 明确不修改 backend、权限、安全与业务
API contract，因此本次不扩展校验白名单，也不以 data URL
或关闭同步提示绕过问题。真实图片壁纸验证不能作为 gradient 持久化通过的证据。
