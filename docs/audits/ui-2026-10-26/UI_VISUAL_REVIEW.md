# Searcher 逐页视觉评审

本轮只审计。缺陷编号、根因和完整修复边界集中在 [UI_AUDIT_REPORT.md](UI_AUDIT_REPORT.md)，避免每页重复同一结论。此处记录实际呈现与应该保留/调整的视觉方向。

## 证据阅读方式

六张联系表用于比较全站层次；确认局部问题应打开原尺寸 PNG，不能从缩略图判断文本对比度。

| 视口 | 浅色 | 深色 |
| --- | --- | --- |
| 390×844 | [联系表](evidence/contact-mobile-light.jpg) | [联系表](evidence/contact-mobile-dark.jpg) |
| 768×1024 | [联系表](evidence/contact-tablet-light.jpg) | [联系表](evidence/contact-tablet-dark.jpg) |
| 1440×900 | [联系表](evidence/contact-desktop-light.jpg) | [联系表](evidence/contact-desktop-dark.jpg) |

每张表含 16 个页面；搜索设置的分类/详情另列，认证与编辑器另有完整截图。231 张图片的实际文件索引为 [screenshot-index.json](evidence/screenshot-index.json)。文件名中 `390` / `768` / `1440` 分别对应上述固定高度；`320x568` 等名称为显式补充尺寸。`fullPage` 可能高于视口，固定 Dock 出现在视口所在位置，不表示它会随整张图片移动。

以下所有“未发现”只限本轮状态，不表示完整回归通过。

## 1. 首页搜索、应用网格、文件夹与固定笔记

**证据**：[1440 light](evidence/home-1440-light.png)、[1440 dark](evidence/home-1440-dark.png)、[390 light](evidence/home-390-light.png)、[768 light](evidence/home-768-light.png)、[320×568](evidence/home-320x568-dark.png)、[1024×768](evidence/home-1024x768-dark.png)、[1920×1080](evidence/home-1920x1080-dark.png)。

- **现状**：搜索与底板共享外缘，中轴明确；日期/继续比主块轻。应用底板承载密集个人内容，首页笔记采用同档 Material，不再有第二套纸张材质。大文件夹 2×2 足迹与图标名称基线有真实组织作用。
- **层级判断**：满容量底板面积大于搜索，不等于必须删应用。搜索仍有独立横向输入尺度、前置位置和留白；不建议为了“唯一焦点”再放大搜索或增加强调色提交按钮。
- **响应式**：320 下三列、390 下容量收敛，更多入口承接溢出；中屏笔记转流式，宽屏两侧排列。补充八档未观察到正式首页文档横向溢出。不能把流式长页面与固定 Dock 在某一滚动位置相交直接当作布局故障。
- **长内容**：应用名与长笔记名正常截断；笔记正文按短预览呈现，不建议为了展示更多正文把所有卡片拉高。
- **交互**：[鼠标预览](evidence/home-note-drag-preview-1440-dark.png)、[键盘预览](evidence/home-note-keyboard-preview-1440-dark.png)。空闲位与目标反馈可见，Escape 取消路径观察成功；提交与持久化未在本轮完整回归。
- **改进优先级**：F07（P2）补充 miniature radius 契约，优先修文字而非改变外观；无证据支持重做构图。Fallback 图标的黑色边缘是当前可访问性/身份色设计的一部分，不因个人偏好减弱。

### 壁纸与玻璃

[图片浅色](evidence/home-wallpaper-1440-light.png)、[图片深色](evidence/home-wallpaper-1440-dark.png)、[关闭玻璃](evidence/home-wallpaper-glass-off-dark.png)、[通透玻璃](evidence/home-wallpaper-glass-clear-dark.png)、[系统减少透明度](evidence/home-reduced-preferences-1440-dark.png)。

图片通过真实上传路径进入隔离服务，是合成测试图而非真实用户照片。四档在两主题均采样；减少透明度后底板实色、blur none。保留用户可控可读性遮罩，不给首页新增额外径向遮罩。不对全照片色域宣称对比度合格。

## 2. Dock 与浮动入口

**证据**：[菜单](evidence/dock-menu-1440-dark.png)、[管理](evidence/dock-management-1440-dark.png)、[收起球](evidence/dock-collapsed-1440-dark.png)、[右侧面板避让](evidence/dock-right-apps-1440-dark.png)、[四向矩形](evidence/dock-geometry.json)。

- 图标/文字的系统入口与应用快捷方式分组有语义，不应该把系统入口、首页固定与任务栏固定合并。
- Floating 材质、选中点/状态、收起球符合持续可达的个人工具方向。管理界面使用同一分组语言，当前没有理由另造设置面板。
- 四方向与应用面板未相交，收展实测可用。Dock 方向 JS 与 CSS 重复决策为 F06（P2）；这是维护成本，不是已确认的用户遮挡 bug。
- 不建议删除所有动效或用全局动画清零处理；改动时检查 translate 与 positioning transform 分工，不把变换全部揉到同一个属性。

## 3. 应用管理面板与添加应用

**证据**：[390 light](evidence/apps-390-light.png)、[768 dark](evidence/apps-768-dark.png)、[1440 light](evidence/apps-1440-light.png)、[横屏](evidence/apps-844x390-dark.png)、[添加应用](evidence/add-app-dialog-1440-dark.png)、[文件夹浮层](evidence/folder-popup-1440-dark.png)。

- 非模态面板保留首页背景，没有重复的资料库总览或额外遮罩；标题、添加、返回的层级明确。
- 应用网格比首页更像完整集合，这是正常业务差异。不能将两者列数强制一致，也不应给管理网格重复添加水平卡片 padding。
- 36 个应用与两种文件夹大小下列表/网格可用；短高横屏通过面板内部滚动承载，不应以增加面板绝对高度解决。
- 添加应用弹窗使用正式 Dialog；Escape 关闭观察成功。未在本轮验证所有图标候选、远端抓取及表单错误状态。
- 优先级：F07 规范同步；不建议无证据更换文件夹弹层 primitive 或材质。

## 4. 笔记管理、编辑与分页

**证据**：[笔记列表390](evidence/notes-390-dark.png)、[列表1440](evidence/notes-1440-light.png)、[编辑390](evidence/editor-390-light.png)、[编辑1440](evidence/editor-1440-light.png)、[分页390](evidence/pagination-390-light.png)、[分页1440](evidence/pagination-1440-dark.png)。

- 列表保留范围切换、笔记本、搜索和单一新建主操作。名称与摘要/日期角色分开，长标题不会推出行操作。
- 移动端列表的上方控制区有一定高度，但包含独立筛选、归组与搜索功能，不能为“紧凑”删掉其中一层或复制到新 Toolbar。
- 编辑器多行顶栏与 title / format toolbar 提供明确模式分离，桌面有足够阅读空间；不应套外层 Card。
- 390 常态下正文可见；[390×430 视口缩小模拟](evidence/editor-keyboard-resize-390x430-dark.png) 中源码编辑空间明显变短。**待验证**：真实键盘/VisualViewport 事件、焦点与 IME；不作为已确认软键盘 bug，也不新增设备补丁。
- 格式工具横向滚动与分页 spacer 是功能复杂度，不按 dead CSS 清理。最近 `2d708be` 已恢复紧凑滚动条/平直页间距，审计基线已包含该提交，不重复提出旧问题。
- 优先级：先修系统真实缺陷；编辑工具栏紧凑化只有在真实键盘证据后才进入原型。

## 5. 设置分类与搜索详情

**证据**：[手机分类](evidence/search-settings-390-light.png)、[手机搜索详情](evidence/search-detail-390-light.png)、[桌面搜索详情](evidence/search-detail-1440-dark.png)。

- 手机分类/详情分离、宽屏侧栏组织是合理容量切换；账户与安全纳入同一骨架。
- 搜索详情仅包含引擎与结果打开方式，没有必要扩充说明、卡片或装饰以填满页面。大留白符合低频配置页。
- 实际 `/settings/search` 直达详情，文档声称 redirect 不符合当前行为。F08（P2）应修契约，而不是恢复会破坏手机详情的旧跳转。
- 行内控件的透明底/右对齐与独立认证 Input 不同，是有意语义，不是视觉不统一。

## 6. 外观与主要设置分组

**证据**：[外观390](evidence/appearance-390-light.png)、[外观768](evidence/appearance-768-dark.png)、[外观1440](evidence/appearance-1440-light.png)。

- 主题/强调色、首页、任务栏、壁纸有清晰分组；色点在手机两排展开，不使用彩色卡片。
- 设置页较长来自真实偏好数量，不建议通过减少触屏高度来缩短整页。44px 是命中区底线，不要求每个可见开关都画成大块。
- 自定义图片通过现有上传、历史与构图链路处理；不要引入另一个壁纸预览实现。
- F01 说明“所有设置行都横排”有容量问题，但不是所有行都需要改成竖排；主题与单个开关目前可保留。

## 7. AI 模型设置

**证据**：[390 light](evidence/ai-settings-390-light.png)、[390 dark](evidence/ai-settings-390-dark.png)、[768 light](evidence/ai-settings-768-light.png)、[触屏390](evidence/ai-settings-touch-390.png)、[标签尺寸](evidence/settings-row-geometry.json)。

- **P1 / F01**：模型名称与 metadata 被操作组挤到一字宽。视觉重量由窄长文字柱支配，操作却横向占满一行，既降低扫描速度也浪费垂直空间。
- 不要减少启用/可见/默认/推理能力；将复合控制组放到标签之后的独立行，或由容量驱动布局。原生 checkbox 不属于命中区违规，label 已达到 44px 高。
- 768px 有侧栏后内容宽度减少，模型 metadata 仍明显多行，证明不应只加手机 viewport 补丁。

## 8. 数据与同步、快捷键

**证据**：[数据390](evidence/data-settings-390-light.png)、[数据1440](evidence/data-settings-1440-dark.png)、[快捷键390](evidence/shortcuts-390-light.png)、[快捷键1440](evidence/shortcuts-1440-dark.png)。

- 数据与同步的状态、入口和后果脚注分开，低密度与内容量匹配，不是“需要填充”的空洞。
- 快捷键表较长但有明确功能分组；不建议重复把快捷键写回每个工作区常驻段落。
- 没有观察到正式页面文档横向溢出；键帽样式与正文不同是信息角色，不强行统一字号和背景。
- 全量同步错误、离线重连与所有键盘命令未在本轮注入，不宣称通过。

## 9. 登录、注册与账户

**证据**：[登录390](evidence/login-390-light.png)、[登录1440](evidence/login-1440-dark.png)、[注册390](evidence/register-390-light.png)、[注册1440](evidence/register-1440-dark.png)、[账户390](evidence/account-390-light.png)、[账户1440](evidence/account-1440-dark.png)。

- 窄表单的中心列、字段边界和明确提交符合入口用途，不需要向主站引入额外营销版式或品牌字体。
- 账户复用设置骨架，资料、安全、会话有分组；单条会话样本不证明大量设备列表的完整覆盖。
- 本轮通过真实登录进入应用；注册页面只渲染审查，没有重复注册账号。密码错误、删除账号、强制退出等高风险动作不为视觉审计执行。
- 没有已确认需要重新设计的视觉缺陷；F01 修改后须将该页作为共享 semantic 回归面。

## 10. AI 问答

**证据**：[会话390](evidence/ask-390-light.png)、[会话768](evidence/ask-768-dark.png)、[会话1440](evidence/ask-1440-light.png)、[空状态390](evidence/ask-empty-390-dark.png)。

- 阅读列、代码块、表格与底部 composer 的层级明确；会话侧栏与主内容是工作台结构，不应强行做成设置双栏或 Card 网格。
- 手机历史入口收敛、Dock 保持导航距离；正文不增加装饰性背景。
- 历史 Markdown 样本含列表/引用/代码/表格，但没有真实 token stream；streaming 高度变化、重试/错误反馈、附件与模型生成性能待验证。
- 无实际证据支持减少消息功能、强制所有消息等宽或替换 assistant-ui。

## 11. 管理后台五分组

**证据**：[总览](evidence/admin-1440-light.png)、[用户390](evidence/admin-users-390-light.png)、[设置390](evidence/admin-settings-390-dark.png)、[审计日志](evidence/admin-audit-1440-light.png)、[备份390](evidence/admin-backup-390-light.png)。

- 总览统计/跳转、用户筛选/表格、系统分组、日志空状态各自符合管理任务；不能因为不是同一种控件排列就改成同一卡片模板。
- 窄屏导航为局部横向滚动，标题与主要内容没有被拖宽。该滚动不同于文档意外横向溢出。
- **P1 / F01**：备份文件 label 被挤到约 8px，文字竖排。选择文件、文件名与预检应作为复合控制区域，不能挤压标签。
- 保留配置导入与完整 ZIP 备份的分组区别；没有执行真实导入、还原、删除用户或修改生产配置。
- 表格仅单管理员样本，长用户名与大量用户分页应在未来关联改动中验证，不将本轮视觉截图写成压力验收。

## 12. 回收站、404 与反馈层

**证据**：[回收站390](evidence/trash-390-light.png)、[回收站1440](evidence/trash-1440-dark.png)、[404](evidence/404-390-dark.png)、[Dialog](evidence/dialog-390-dark.png)、[AlertDialog](evidence/alertdialog-390-dark.png)、[Popover](evidence/popover-390-dark.png)、[Toast](evidence/toast-390-dark.png)、[Tooltip](evidence/tooltip-390-dark.png)。

- 空状态不加插图或多重容器，是可保留的克制，不因为空白多就增加低价值组件。
- Dialog、确认、浮层的材质与危险操作层级应维持区分；Toast 实测撤销可收回，不替代持久同步错误。
- Dialog Escape 焦点返回已观察；复杂弹层嵌套/IME Escape 未完整实测，不将单次成功扩写为层栈全通过。
- 本轮不对已有 `.trash-status` 做 dead-class 删除，它在成功和错误反馈中都有消费者。

## 13. 正式 Design Lab

**证据**：[390](evidence/design-lab-390-light.png)、[1440](evidence/design-lab-1440-dark.png)、[按钮局部](evidence/lab-button-states-1440-light.png)、[focus](evidence/lab-button-focus-1440-light.png)、[hover](evidence/lab-button-hover-1440-light.png)。

- **P2 / F04**：“默认”与“描边”实际相同，缺少显式 primary 样本；这会误导人工评审。
- **P2 / F05**：固定 576px 的构图展示盒把 390px 页面拖宽到 592px。需要约束展示层，不改内部源视口，不全局裁切。
- 正式 primitive 与状态对照很有价值；可以修样本精度，不应整体删除 Lab 或以它替代真实业务页面。
- 原型子路由未全部进行深度操作，不能把 Lab 原型功能当成正式产品验收。其公开路由本身不是本轮确认的设计错误。

## 优先顺序

1. F01：恢复复合行的自然阅读和空间分配。
2. F02/F03：使门禁对实际开发写法有效，避免规则全绿带来的错误安全感。
3. F04/F05：校准设计对照面，再评估进一步视觉收敛。
4. F06/F07/F08：降低方向与契约的多点维护；保留目前可用的视觉和业务差异。
5. F09：顺手清理。编辑器键盘空间、GPU blur 成本等先补真实证据，不直接进入重构。
