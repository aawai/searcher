# Searcher UI Constitution

不可绕过的视觉 Invariants。实现见 [Design System](DESIGN_SYSTEM.md)，验收见
[UI Review Checklist](UI_REVIEW_CHECKLIST.md)。现有实现不是正确性的证据；历史
baseline 仅记录迁移债务，不允许新增同类样式。

| 原则                              | 允许                                                                                                                                                                                                                                                                               | 禁止                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search-first                      | Search 使用 L2；Bento 使用 L1；Dock/Zen edge trigger 使用 Navigation；Workspace 侧栏使用 `--surface-workspace`（非模态 aside）。新增能力先归入 secondary content 或 workspace。                                                                                                    | Bento、Dock、edge trigger、Workspace 用更强 shadow/glow/contrast 抢一级焦点；管理工具堆到 hero 或首页卡片（首页专注于使用，管理下沉至工作区）。                    |
| Quiet surfaces                    | 背景、弱边框和一个与 elevation 对应的阴影；壁纸使用 material token 与离散预设；Workspace 桌面采用 surface-solid。                                                                                                                                                                  | 普通表面叠加强 border、shadow、glow、大 blur、gradient highlight；为“质感”堆效果；普通工作区滥用模态 L3 遮罩。                                                     |
| One hierarchy, many presentations | Zen/Widgets 只改变 density、presentation 与空间操作，Apps/Notes 业务逻辑和每域独立 route/stack/query 共享。Zen >=768 使用非模态 Panel；Widgets >=1024 使用多窗口 Desktop，768–1023 使用单 active constrained window；<768 共用模态底部 Sheet。                                     | 因布局复制业务逻辑或改变 navigation grammar；同 workspace 多处同级入口；给 Zen 引入 Dock/Snap/Overview；普通桌面工作区滥用模态 L3 遮罩。                           |
| One primary action per region     | 每个区域最多一个 primary；Workspace 根视图仅设搜索框与单一 primary 按钮（“添加应用”/“新建便签”）；nested/editor 视图收起 Switcher 保护脏表单，头部仅留 onBack；destructive 破坏性操作保留独立模态确认（AlertDialog）。                                                             | card title、header button、Dock 对同目的地重复竞争；编辑态允许直接切换 workspace 导致草稿静默丢失；destructive 与日常操作同级。                                    |
| Content before chrome             | Workbench 以 message/canvas 为内容中心、composer 为主操作；management 以数据为中心；Home 以内容消费为核心。                                                                                                                                                                        | toolbar/tab/badge 强于内容；为包裹而 Card 内嵌 Card；满屏 box-on-box；在消费型首页堆砌管理栏。                                                                     |
| Semantic spacing                  | page/section/card/row/control/inline gap 使用对应 token；便签大盘槽位交错偏移使用 --space-1~--space-5。                                                                                                                                                                            | 重复固定 padding/gap；用负间距掩盖结构问题。                                                                                                                       |
| Shared geometry                   | 控件、卡片、Search、Workspace 的 radius/height/elevation 由 token 和正式组件拥有；Controlled Notes Board 使用确定性槽位与 `--notes-board-step: 54px`、`--notes-board-tilt: 1.2deg`，偏移来自 `--space-1`~`--space-5`。                                                             | 另造常规 Button/Dialog/Tabs/Badge/Toast；任意 font-size/font-weight/radius/shadow；手写随意浮动坐标或将未受控的绝对 x/y 坐标持久化至服务端。                       |
| Responsive by available space     | 页面骨架可用 viewport；settings row、action card、toolbar 按容器或可用空间重排；Bento 使用 `@container bento-wrapper` 5:3 不对称列比，Controlled Notes 在移动端（<=767px）或 `<=280px` 容器下自动回流为单列流（align-self stretch）。                                              | 缩小字号/touch target 挤布局；将已工作的 container query 改成 viewport-only；卡片强行等高或内容被不当截断。                                                        |
| Restrained motion                 | 全局遵循动效预算（GLOBAL_MOTION_BUDGET）；壁纸仅允许离散档位且周期 >=28s 的环境光/漂移/缩放微动（位移 <=1.0%，缩放增量 <=4.0%）；强调色总贡献 <=8%（双光场单场 <=4%），黑白模式强制使用纯白中性光（accent 0%）；prefers-reduced-motion 下位移/缩放降级为关闭且冻结光场位移与缩放。 | 未经预算的高频循环、快速移动（周期 <28s 或位移 >1.0%）、缩放过大（>4.0%）、高饱和/高对比动态光斑抢夺 Search 视觉焦点；绕过 prefers-reduced-motion 执行无感知动效。 |

应用 Workspace 的操作层级：section 更多为 secondary，整理态以“完成整理”替换 创建
primary；表单仅自身提交 Footer。Escape 一次只消费一层，显式关闭与返回
不混用。应用编辑会话不由 presentation 持有；Host 切换不等于离开草稿。
移动反馈必须进入活动模态的交互树与正常布局，不以 z-index 绕过模态边界。

## 例外

必须说明新增系统级语义、owner、状态与可验证边界。“现在就是这样”“更现代/优雅”不是理由。runtime
geometry（controlled notes board CSS slots、drag、masonry）、壁纸
image/filter/overscan、领域颜色值不属于 arbitrary visual value；static guard
按窄范围规则区分。例外仍须满足动作层级、键盘访问和 overflow contract。

- **壁纸预设与极端材质可读性例外（Phase 0 授权）**：
  所有合法预设组合均严格满足动效安全预算（`GLOBAL_MOTION_BUDGET`）；但当用户配置任意原始高对比/高明度自定义壁纸图片，并选择“清透（clear
  12%）+ 无模糊（none 0px）+ 原色（natural）”这一最弱干预组合时，系统不保证
  Search-first
  绝对可读性。系统保留用户的自由选择权，不施加硬性暗化或饱和度钳制，但明确不作虚假的“全组合全图片绝对可读安全”声明。
