# Searcher 核心组件矩阵

基线及覆盖口径见 [UI_AUDIT_REPORT.md](UI_AUDIT_REPORT.md)。本表区分“同一能力的非必要重复”和“有业务意义的差异”；不因为数值相同就要求合并。

**证据等级**：实页 = 实际 Chromium 渲染/操作；代码 = 当前源码；待验 = 尚不能由本轮验证闭合。默认截图覆盖 390/768/1440 × light/dark，但交互状态不在每个组合重复全流程。

## 组件与 ownership

| 组件 | 当前实现 / 消费页面 | 实际差异与状态证据 | 保留 | 应统一 / 修复 |
| --- | --- | --- | --- | --- |
| Button | `components/ui/button.tsx` + `primitives.css`；全站 | 命名 `default`→primary，但省略 variant→outline；36/28/icon 是设计角色，触屏可扩大命中区；Lab 的“默认”和“描边”实为同变体 | outline 安全默认、primary 局部唯一、ghost 工具栏、dialog 内危险填充 | F04：演示显式声明 primary；F08：文档说明默认与 content；不要改全站默认 |
| Icon Button | Button icon、顶栏、Dock、note actions | 视觉字形 14/16/20；顶栏与模型组粗指针目标实测 ≥44；部分 note/Dock 控件为领域交互 | 图形可见尺寸不必等于命中区；Dock 系统图标不是普通表单按钮 | 只补真实缺失的标签/命中区；本轮未证明需一刀切包装 |
| Input | `ui/input.tsx`、`primitives.css`；认证、管理、设置 | 独立输入有 control border；SettingsRow 内透明、右对齐；搜索框有专用字号 | 行内与独立表单不同材质是明确语义；focus 不可删除 | F01 仅修容量，不把全部行内字段恢复厚边框 |
| Textarea | `ui/textarea.tsx`；Lab、配置与源码 | 多行圆角有独立角色；Markdown 源码有编辑/保存语义，不是普通设置输入 | multiline radius 和可编辑内容滚动 | 短高 Host 需真实键盘再评估工具栏；本轮不改变编辑器 |
| NativeSelect | `ui/native-select.tsx`；搜索、设置、后台 | 原生选择与右对齐行内外观不同；领域模型选择还用菜单 | 原生语义与成熟选择器能力 | F02 明确 token utility 的扫描覆盖；不因使用 `cn`/token 任意类而替换控件 |
| Switch | `ui/switch.tsx`；外观、后台设置 | thumb 与轨道明暗层级共享；多处状态保留标签 | Base UI 状态与命中区 | 无已确认外观缺陷；不把 visual thumb 放大到 44px |
| Checkbox / Radio | Base UI primitives；模型设置另用原生 input+label | 模型原生 input 16px，但 label 在粗指针中 52×44；视觉与 Lab/编辑器任务框不完全同构 | 模型“默认”互斥、任务状态、开关不同业务语义 | 可在未来相关任务消费现有 primitive 以统一 focus，但不是独立必修项；不据此整体替换 |
| Segmented / Tabs | RadioGroup segmented、Base UI Tabs；外观、笔记范围、编辑模式、Lab | mutually exclusive preference 与导航/视图切换不同；编辑器模式与内容工具分开 | 不把所有分段都强改 Tabs；选中不只靠颜色 | Lab Tabs 操作已验证；全套 screen-reader 行为待验 |
| Dialog / AlertDialog | Base UI + Escape layer stack；添加应用、管理、删除确认、Lab | 固体 Overlay；普通危险按钮与确认内填充不同；Dialog Escape 焦点回触发器实测成功 | 模态、确认、pending/取消边界 | 标题类与 Sheet 部分共享是可维护性观察，不是已确认 bug，不单独拆改 |
| Sheet / Workspace Panel | `ui/sheet.tsx`、`WorkspaceSurface/WorkspaceShell` + `workspace.css` | ≥768 侧面板、<768 近全屏；非模态、保留桌面；编辑可扩展/全屏 | overlay surface、dock inset、Escape 与未保存保护、Host 独立 | 不改成第二张资料库页面；F06 只收敛 Dock 方向，不改 Panel 状态机 |
| Popover / Dropdown / ContextMenu | Base UI；引擎、应用、任务栏、笔记、Lab | Floating、菜单危险项/分隔线；文件夹在 dialog primitive 上承载 Floating 内容 | 用哪种 primitive 不自动决定材质；文件夹是浏览浮层，不是编辑工作台 | F07 澄清缩略图几何；没有证据要求把所有文件夹改实色 |
| Tooltip | `ui/tooltip.tsx`；Lab、工具栏、Dock | 实际 hover 出现提示；触屏不能以 Tooltip 作为唯一操作来源 | 名称/快捷键辅助，不增加常驻教学文案 | 真实触屏长按冲突与读屏待验；本轮没有确认 tooltip 需重写 |
| Card / SettingsCard | `ui/card.tsx`；`semantic.tsx:74–86,102–136` | SettingsGroup 提供外标题/脚注 + 单个 surface；未确认卡片套卡片普遍问题 | semantic 组合有真正结构价值，不是无用 wrapper | 不删除 SettingsGroup/SettingsCard 分层以减少 DOM 数量 |
| Grouped List / SettingsRow | `semantic.css:129–285`；设置、账户、后台、模型管理 | 单值行视觉稳定；复合模型/文件组在 390px 挤压标签；320px 会换行 | 标题容器外、脚注容器外、内部内缩分隔线 | **F01：统一容量契约；复合行允许堆叠，不统一所有行高** |
| StatusBanner | `semantic.tsx/css`；错误、同步、成功状态 | 持久反馈与浮动反馈不同，tone 与布局由 semantic 控制 | 持久错误不改成自动消失 toast；连接与同步状态不混合 | `.trash-status` 有真实 consumer，不能删除 |
| UndoToast | `semantic.tsx/css`；软删除、Lab | Lab 实页出现、撤销关闭；Floating 胶囊与 live status | 软删除可恢复，不等同于不可逆 AlertDialog | 不再造第二套 toast；若补回归关注真实撤销和 focus，不测静态文案复制 |
| EmptyState / LoadingState | semantic；笔记、回收站、Ask、Lab | 一句核心信息，最多一操作；空审计日志/回收站不应强行填满页面 | 无插图、无多层卡片、不同 headingLevel | 账号/内容为空时的垂直留白是页面状态，不当作普遍密度缺陷 |
| Navigation | SettingsShell、LocalNavigation、顶栏、Dock | 手机设置分类/详情；后台窄屏局部横滚 Tabs；首页隐藏低频管理入口 | “频率决定距离”；URL/标题语义随页面不同 | F08 同步搜索详情和标题文档；不恢复旧资料库总览 |
| Dock | `features/dock/*`；首页、Ask | Floating；四向桌面，手机 bottom；独立固定与排序；系统项可隐藏；固定/收起球 | 已验四向 panel 不相交、收展可用、偏好隔离 | F06 移除 JS 已归一后不再需要的方向覆盖，保留 mobile sizing 与 safe-area |
| WebAppGlyph / Launcher / Folder | `components/searcher/WebAppIcon.tsx`、`launcher.css`、app-library | 域名身份色与 accent 不同；48/44 glyph、2×2 folder、mini/remainder 几何不同 | 真实业务尺寸、稳定 fallback、名称基线、网格/图像 owner 分离 | F07 规范描述按实际边长比例；不得将所有 miniature 尺寸/圆角强制同值 |
| HomeNote | HomeNoteCard、HomeNotes、home-notes.css | 桌面格位/容量不足转流式；移动短预览；任务进度、拖动/键盘预览 | 中性 Material、单元吸附、不叠放、业务颜色数据继续保留 | 不为统一卡片强制同一预览长度；本轮鼠标/键盘取消路径已验，提交持久化待验 |
| Search / Omnibox | SearcherSearchInput、search.css、omnibox | 唯一首焦点，专用字号与引擎标识；不能与设置 Input 等高等重 | 搜索/底板外缘对齐、ghost 提交、中性联想、独立语义 | 不扩大品牌按钮重量；真实远端联想/AI 响应未完整验证 |
| Editor / Markdown | documents、markdown-editor、shared Markdown renderer | live/page/source、多 Host、格式工具、分页测量；与普通页面差异必要 | 不以普通 Card 包编辑器；保留页面切片与隐藏 spacer 约束 | 短高工具栏是否可折叠需先真实键盘验证；不把分页 geometry 当 raw presentation 删除 |

## 主题、材质与交互状态

| 维度 | 实际观察 | 结论 |
| --- | --- | --- |
| light/dark | 正式页面六格矩阵；Material 与实色页都覆盖 | 两套中性 surface 方向连贯，不需要重新配色 |
| 默认 / 图片壁纸 | 默认 mesh；本地生成后真实上传的合成图；首页六格 | 可读性和材质应由同一 owner 降级；不是实际照片的全色域验收 |
| 四档玻璃 | 图片壁纸下 off/soft/regular/clear × 两主题 | 保留用户偏好；不能凭 blur 数量认定性能坏 |
| reduced transparency | 媒体查询真实匹配；底板 blur none、实色 | 保留集中 fallback，不新增每个 feature 的平行开关 |
| reduced motion | 媒体查询真实匹配，代表页面/交互已查看 | 不等于所有 transition 插值都审完；未来改动保留同时长透明度语义 |
| focus | Dialog Escape 焦点返回；Lab focus 局部截图；九色实色 surface ring 计算 | 无证据支持删除 focus；未做全站读屏/所有背景认证 |
| hover / active | Lab button 局部 hover，Tabs 选中，菜单/任务栏展开，编辑模式选中 | 禁用与常态不同；不依赖每格重复全部交互来证明一致性 |
| disabled / pending / error | Lab disabled、空 composer、备份未选文件，源码有 pending/错误边界 | 网络失败与所有业务 pending 未逐一注入；不能声称完整验证 |
| Touch | 独立 hasTouch Context：模型 label 与关键按钮 ≥44px | 44px 是命中区，不是所有 glyph / visible control 的强制外观 |

## 第三方复用判断

- shadcn Base UI wrapper 不只是复制视觉：Button variant、Dialog/Popover/Dropdown/Menu、Tabs、Focus/Portal 及 Escape 协议需要共享边界。整体换库会扩大回归面，没有审计证据支持。
- SettingsGroup/SettingsRow、PageShell/PageHeader、UndoToast 等封装确有产品语义，保留；需要修的是容量和示例，不是删除封装。
- dnd-kit 与 Milkdown/ProseMirror 提供 UI 库不负责的能力；runtime transform、分页与测量不应改成普通 Tailwind 静态布局。
- 原生 checkbox/select 与 Base UI 并存应按实际体验评估。本轮没有发现“只因存在原生控件就必须迁移”的消费者缺陷。
- 不把“同背景色/同圆角”当作冗余；不强行合并名称不同但语义清晰的 Token。已证明可清理的是 F09 的四个无消费者定义。
