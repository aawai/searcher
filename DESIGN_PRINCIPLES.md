# Searcher UI Constitution

不可绕过的视觉 Invariants。实现见 [Design System](DESIGN_SYSTEM.md)，验收见
[UI Review Checklist](UI_REVIEW_CHECKLIST.md)。现有实现不是正确性的证据；历史
baseline 仅记录迁移债务，不允许新增同类样式。

| 原则                              | 允许                                                                                                 | 禁止                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Search-first                      | Search 使用 L2；Bento 使用 L1；Dock 使用 Navigation。新增能力先归入 secondary content 或 workspace。 | Bento、Dock、edge trigger 用更强 shadow/glow/contrast 抢一级焦点；管理工具堆到 hero。 |
| Quiet surfaces                    | 背景、弱边框和一个与 elevation 对应的阴影；壁纸使用 material token。                                 | 普通表面叠加强 border、shadow、glow、大 blur、gradient highlight；为“质感”堆效果。    |
| One hierarchy, many presentations | Zen/Widgets 改 density、展开程度和 presentation，功能名、目的地、管理路径、panel/detail 行为一致。   | 因布局改变 navigation grammar；同 workspace 多处同级入口。                            |
| One primary action per region     | 每个区域最多一个 primary；manage/bulk/destructive 降级或独立确认。                                   | card title、header button、Dock 对同目的地重复竞争；destructive 与日常操作同级。      |
| Content before chrome             | Workbench 以 message/canvas 为内容中心、composer 为主操作；management 以数据为中心。                 | toolbar/tab/badge 强于内容；为包裹而 Card 内嵌 Card；满屏 box-on-box。                |
| Semantic spacing                  | page/section/card/row/control/inline gap 使用对应 token。                                            | 重复固定 padding/gap；用负间距掩盖结构问题。                                          |
| Shared geometry                   | 控件、卡片、Search 的 radius/height/elevation 由 token 和正式组件拥有。                              | 另造常规 Button/Dialog/Tabs/Badge/Toast；任意 font-size/font-weight/radius/shadow。   |
| Responsive by available space     | 页面骨架可用 viewport；settings row、action card、toolbar 按容器或可用空间重排。                     | 缩小字号/touch target 挤布局；将已工作的 container query 改成 viewport-only。         |

## 例外

必须说明新增系统级语义、owner、状态与可验证边界。“现在就是这样”“更现代/优雅”不是理由。runtime
geometry（masonry、drag、floating note）、壁纸 image/filter、领域颜色值不属于
arbitrary visual value；static guard
按窄范围规则区分。例外仍须满足动作层级、键盘访问和 overflow contract。
