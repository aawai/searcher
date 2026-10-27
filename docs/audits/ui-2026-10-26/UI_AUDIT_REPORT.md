# Searcher 全站 UI 与样式工程审计

## 结论

当前问题不是缺少 Design System，也不是需要更换视觉方向。主要根因是：**语义组件缺少内容容量契约，规则门禁不理解常用表达式，正式规范与组件演示未同步到实际实现**。它们使局部页面在规则全绿时仍出现明显缺陷。

优先修复 `SettingsRow` 的标签挤压（F01）和 UI Guard 的表达式盲区（F02）。随后修复 Design Lab 的错误样本与横向溢出、收敛 Dock 的重复方向决策。四个未消费 Token 只适合顺手清理，不值得独立进行视觉重构。

共记录 9 项：P1 两项、P2 六项、P3 一项；未确认 P0。这是本轮证据支持的发现数量，不是对全站无其它缺陷的保证。

保留 Search First、壁纸画布、平台原生字体、Material / Floating / Overlay、分组列表、首页网格、独立任务栏固定状态、非模态 Workspace 和现有 Base UI 交互边界。不建议增加装饰、整体替换组件、全面改成 Tailwind 或统一所有控件尺寸。

## 代码基线与方法

- 分支 `main`；HEAD `5bb55b91dc2829c5fa37b7b32d1a5e07e8b4df77`；审计开始时工作区干净。
- 已消费当前 AGENTS.md、`docs/frontend.md`、`docs/design/VISUAL_LANGUAGE.md`、`docs/design/UI_CHECKLIST.md`、`deno.jsonc`、`web/components.json`、`web/vite.config.ts`。历史计划不作为当前事实。
- Deno 2.9.8；React 19.1.1、Vite 7.1.7、Tailwind 4.1.13、Base UI 1.0.0、Playwright 1.56.1。组件 registry 为 shadcn `base-nova`。
- 执行当前生产构建，以现有 `web/e2e/helpers/production-app.ts:75–213` 创建隔离内存 SQLite 服务。夹具有一个管理员、历史 AI 对话、36 个应用、2 个文件夹、8 篇笔记，其中 4 篇固定到首页。没有调用真实 AI，没有使用现存数据库或真实账号。
- 浏览器：真实 Chromium 150.0.7871.24；通过 `browser.open` 建立审计页，再由 Playwright CDP 连接同一浏览器并创建隔离 Context。另建 `hasTouch` Context 检查粗指针命中区。
- 本轮仅新增本目录的报告和证据；未修改业务源码、规范、测试、baseline 或依赖，未创建 Issue / PR。
- 另外读取了当次最新的 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)；其通用建议服从本项目产品语义，例如不机械替换原生字体或将所有状态强制写入 URL。

### 已执行验证

| 操作 | 实际结果 | 不能推出的结论 |
| --- | --- | --- |
| `deno task build` | 3178 modules；Vite 构建成功，5.00s；主 CSS 148.33 kB / gzip 25.20 kB | 不证明视觉正确或运行时性能达标 |
| `deno task check:ui` | 扫描 245 文件，ownership / visual 均 0 违规，0 allowance | 不证明表达式被完整扫描；不证明体验合理 |
| Playwright 实页 | 231 张 PNG/JPG（含六张联系表）；页面截图、DOM 几何、Computed Style、交互 | 不是全套 E2E 通过，也不是像素回归测试 |
| 临时 scanner 探针 | 直接违规可报错，`cn()` / 条件 style / 默认 utility / raw CSS 颜色可漏报 | 不表示目前所有这些写法都是违规 |
| CDP Performance / CSS Coverage | 获得单次交互成本与规则使用样本 | 不足以认定 blur 导致卡顿，或估算全站 dead CSS 比例 |
| `npx -y react-doctor@latest . --verbose` | 扫描 549 文件，输出 61/100、52 warnings；工具未识别 Deno React 工程，并混入 `.worktrees/` 与 `.vite/` | 语料和规则未校准；不将分数作为当前 UI 质量评分，也不据此确认安全/性能故障 |

详细原始数据见 [environment.json](evidence/environment.json)、[guard-probe.json](evidence/guard-probe.json)、[metrics.json](evidence/metrics.json)。本轮是调查，不新增永久测试，也未运行完整 E2E、单元测试或 axe。

### 近期变更已核对

通过当前 Git history 与提交文件清单核对，不依赖 wiki 或旧计划：

| 提交 | 已合入变化 | 本轮处理 |
| --- | --- | --- |
| `55a3a3a` / PR #316 | Dock 系统入口显示开关、偏好与测试 | 纳入当前任务栏/外观实页，不建议恢复固定四入口 |
| `9d00610` / PR #315 | Dock Floating 材质、glyph 圆角、Grouped List 管理 | 保留成果；F06 针对剩余重复方向决策，不反转材质 |
| `4a3603c`、`8468f1a` / PR #314 相关链 | 短高编辑器边界、Dock inset 与流式底部避让 | 以当前矩形为基准，不重复报告旧版遮挡 |
| `8275c99`、`5d2f2c0`、`16506a0` | 中性首页笔记、网格密度、固定笔记交互 | 使用当前网格/材质，不采用历史纸张方案 |
| `2d708be` / PR #317 | 编辑器紧凑滚动条、平直页间距 | 当前构建已包含；不列作待修复 |
| `65be9aa` / PR #318 | 分页 E2E 字体无关夹具 | 不把夹具修订当作实际视觉变化 |

## 覆盖范围

| 维度 | 已覆盖 | 边界 |
| --- | --- | --- |
| 样式 | 38/38 CSS 文件机械扫描；11747 行、308481 bytes；TSX 样式/组件/导入及关键 owner 定点阅读 | 行数包含文件末尾空行；没有逐条证明全部 selector 活跃 |
| 正式页面 | 首页、应用/笔记面板、搜索/外观/AI/数据/快捷键设置、账户、AI 历史会话、后台五分组、回收站 | 后台用户仅一个管理员；回收站主要为空状态 |
| 固定矩阵 | 上述 17 个 route 场景 × 390×844 / 768×1024 / 1440×900 × light/dark；搜索详情另补六格 | `/settings` 在手机上是分类页，不能当成搜索详情；另实测 `/settings/search` |
| 补充页面 | 登录、注册、访客首页各六格；编辑/分页各六格；Ask 空状态、404 | 无真实 AI 流式生成 |
| 八档尺寸 | 320×568、390×844、640×800、768×1024、1024×768、1366×768、1440×900、1920×1080 | 对首页、应用、笔记、模型设置、备份五个高风险场景检查；没有全站八档全组合 |
| 其它布局 | 844×390 横屏；长应用名、长笔记名、大量应用、多笔记；Dock 四方向与收展 | 没有原生设备 safe-area / 浏览器工具栏测量 |
| 外观 | 默认画布；上传合成图片；两主题；图片下四档玻璃；九个强调色的两主题 ring 计算值 | 合成图不是用户真实照片；没有全壁纸色域对比度证明 |
| 交互 | Dialog、AlertDialog 取消、Popover、菜单、Tooltip、Toast 撤销、Tabs；文件夹、添加应用弹窗；笔记鼠标/键盘移动预览与 Escape 取消 | 拖动提交持久化、所有嵌套弹层组合未完整回归 |
| 系统偏好 | CDP reduced motion / transparency；缩小视口模拟键盘；合成 composition 事件；2× pinch zoom | 不等同于真实 IME、软键盘、浏览器工具栏缩放或 VoiceOver/NVDA |

覆盖不是单一百分数：38 个样式文件的机械清点为全量；静态语义是定点审计；视觉为固定矩阵与风险抽样；交互为代表路径。全图索引见 [screenshot-index.json](evidence/screenshot-index.json)，逐页判断见 [UI_VISUAL_REVIEW.md](UI_VISUAL_REVIEW.md)。

## 样式架构与 ownership

实际依赖为 `main.tsx` 全局导入 + feature 入口导入；`global.css:1` 引入 `tokens.css`，后者引入 Tailwind。首页/Launcher 等较多样式在首屏图谱内，设置、Ask、编辑器等另有 CSS chunk。构建结果不是“所有样式重复加载”的证据。

| 层 | 应拥有 | 当前判断 |
| --- | --- | --- |
| Tokens | 颜色、材质、尺寸、字号、层级及能力降级 | 基本集中；有四个未消费层级变量，局部圆角公式登记不完整 |
| UI primitives | Base UI 交互外观、命中区、focus / disabled | 应保留；primitive 与 Tailwind 并用本身不是问题 |
| Searcher semantic | 页面骨架、分组行、反馈、局部导航 | 真正的系统性缺陷在标签/控件容量分配，而非容器不够抽象 |
| Feature | 应用、笔记、AI、Dock 的领域呈现 | 模型控制组与备份文件组合法但超出横排容量；应消费明确的堆叠语义 |
| Page layout | Settings 两栏、管理页、Ask 阅读列 | 断点组织基本一致；不能以全站缩紧留白代替局部修复 |
| 动态几何 | Dock inset、拖动、壁纸焦点、分页测量 | 属合理复杂度；不得机械搬成固定 utility |

38 个 CSS 文件中有 25 处 `!important`：Dock 13、Workspace 全屏 7、分页零高度标记 4、菜单 positioner 1。只有 Dock 存在已定位的重复方向决策（F06）；其余用法不能仅凭 `!important` 判错。没有确认第二套 Button/Dialog/Toast 实现，也没有确认全局 CSS 污染或可批量删除的 feature class。

## 已确认发现

### F01 — P1：Grouped List 缺少标签最小容量，较宽的手机反而竖排

- **分类/场景**：响应式、信息层级；AI 模型设置和后台备份。
- **位置**：`web/src/components/searcher/semantic.css:166–217`，尤其 `flex: 1 1 0`、`min-width: 0` 与 `overflow-wrap: anywhere`；`AiSettings.tsx:480–558`、`settings.css:507–531`；`AdminBackupRestore.tsx:380–401`、`admin.css:236–259`。
- **现有行为**：390px 时模型标签列 26px、控制列 284px、行高 390px；“标准稳定模型”逐字换行。备份标签列 8.296875px、控制列 301.703125px、行高 104px，“备份文件”竖排。320px 时控制组放不下而另起一行，标签恢复为 256px。768px 模型标签仍仅 116px，metadata 行数明显膨胀。
- **预期**：短标签保持自然阅读；控件组超过行内容容量时整体下移或采用明确的纵向行，而不是先把标签压成字列。不可通过隐藏功能或缩小命中区解决。
- **复现**：准备一个带标准文本/工具/流式能力的模型；390×844 打开 `/settings/ai`；再打开 `/admin/backup`，无需选择文件即可观察。对比 320 / 640 / 768 / 1440。
- **证据**：[模型截图](evidence/ai-settings-390-light.png)、[备份截图](evidence/admin-backup-390-light.png)、[尺寸数据](evidence/settings-row-geometry.json)。`semantic.css:175` 的“Labels never shrink below their text”注释与实际约束相反。
- **根因/归属**：semantic row 没有定义标签的容量下限与复杂 control 的堆叠契约；feature 将多操作组当作单值控件。主 owner 是 semantic，feature 负责选择横排或堆叠变体。
- **修复方向**：先确定短标签的不可挤压规则；对模型管理、文件选择等复合内容使用现有 `.settings-row--vertical` 或正式化的复杂行语义，必要时按容器容量转换；不得增加 390px 专用补丁。
- **影响/回归风险**：所有 SettingsRow 调用方，包括账户、设置、后台；过度设置 `min-width:max-content` 会让长标题溢出，不能无差别套用。
- **验收**：六格实页 + 八档相关场景；短标签不逐字竖排、长标题正常换行、控件完整可达、粗指针目标不降到 44px 以下；现有单值输入保持右对齐。

### F02 — P1：UI Guard 可被常规表达式写法绕过

- **分类/场景**：样式工程、维护风险；所有使用 `cn()`、条件 class/style 的组件。
- **位置**：`scripts/ui-guard/tsx-scanner.ts:262–371,546–570`；真实调用形态见 `components/ui/breadcrumb.tsx:12–19`、`native-select.tsx:46–49`。
- **现有/预期**：`className="text-[19px]"` 报 `raw-font-size`，`className={cn("text-[19px]")}` 不报；直接 `{fontSize:19}` 报错，条件 style 中相同对象不报。`text-xl gap-7` 也不报。预期同一静态视觉值不因包装函数或条件分支改变约束。
- **复现/证据**：调用现有 `scanTsxCode` 与正式 registry；输入及结果完整保存在 [guard-probe.json](evidence/guard-probe.json)。没有改动仓库文件以制造失败。
- **根因/归属**：TS AST 处理仅解析部分 JSX initializer；缺少可静态确定表达式的递归抽取。Tailwind 默认 scale 与登记 Token 也没有明确映射。
- **修复方向**：递归读取静态字符串、模板静态段、条件/数组/对象类名及已知 `cn`/`clsx` 调用；style 覆盖静态分支和可解析局部常量；不执行任意代码。runtime geometry 仍按 owner 精确豁免。明确标准 utility 与 Token 映射，不禁止全部 Tailwind。
- **影响/风险**：UI Guard 全站；误报会干扰真实动态几何，必须用正反夹具保护，不扩 allowance。
- **验收**：等价写法得到等价诊断；当前零 baseline 保持；focus/layout 等合法 utility 不误报；不能只添加 source-text 测试。

### F03 — P2：文档声称拒绝 raw 颜色，实际没有相应规则

- **位置**：`docs/design/VISUAL_LANGUAGE.md:233`；`scripts/ui-guard/types.ts:1–15`、`css-scanner.ts:52–60,305–317`。
- **现有/预期**：`.audit{color:#ff00ff;background:#00ff00}` 扫描结果为空；现有规则只限制登记的 accent 填充，不是通用颜色检测。预期规范承诺与实际检查一致。
- **复现/证据**：[guard-probe.json](evidence/guard-probe.json) 的 CSS raw color 项。
- **根因/归属**：门禁实现缺项，不是当前所有领域颜色违规。笔记配色、引擎品牌色、域名回退色已有合理领域语义。
- **方向/影响**：新增 CSS 颜色值解析与精确领域例外，并覆盖已支持的 TSX 颜色路径；由 guard owner 维护，视觉 owner 核定例外。不要以全文件豁免或删除规范承诺处理。
- **风险/验收**：覆盖 hex/rgb/hsl/命名色及 fallback，不误伤 `currentColor`、Token、已登记领域色；主代码仍零违规。与 F02 可顺序交付，但不应将误报导入 baseline。

### F04 — P2：Design Lab 的“默认”按钮没有展示 primary

- **场景/位置**：正式组件状态演示；`web/src/design-lab/DesignLab.tsx:233–248`；`components/ui/button.tsx:10–26`；`VISUAL_LANGUAGE.md:171`。
- **现有/预期**：`<Button>默认</Button>` 实际使用安全默认 `outline`，与“描边”样本同为 `button--subtle`，背景都为 `rgb(235,235,238)`；该样本区没有显式 primary。预期按钮语义变体与演示一一对应。
- **复现/证据**：访问 `/design-lab` 的按钮区；[局部截图](evidence/lab-button-states-1440-light.png)、[计算样式](evidence/lab-button-states.json)。
- **根因/归属**：把“省略 prop 的默认值”与“名为 default 的变体”混为一谈；Lab owner 修演示，规范解释 API 默认值。
- **方向**：显式展示 `variant="default"`，另外标明省略 variant 的安全默认；补充 `content` 语义。**不要把 Button 全局默认改成 primary**，那会改变所有未声明变体的业务操作。
- **影响/风险/验收**：仅 Lab 与规范；低风险；明暗样本中 primary/subtle/ghost/danger/link/content 可辨，并检查 hover/focus/active/disabled，不强迫样本按钮都同尺寸。

### F05 — P2：正式 Design Lab 窄屏有 202px 横向溢出

- **位置**：`web/src/design-lab/design-lab.css:207–220`、`DesignLab.tsx:147–169`。
- **现有/预期**：390px 文档 `scrollWidth=592`；两个构图预览的展示盒为 576px，从 x=16 延伸至 x=592。应保持内部 1440×900 比较画布，但展示盒必须受容器约束，不拖宽整个页面。
- **复现/证据**：390×844 打开 `/design-lab`；[截图](evidence/design-lab-390-light.png)、[溢出元素](evidence/design-lab-overflow.json)。
- **根因/归属**：固定源视口和固定展示尺寸混为一个约束；Lab CSS owner。
- **方向**：容器感知的缩放或局部受控滚动；保持两个原型同一比例、明确展示比例。不得全局 `overflow-x:hidden` 裁掉问题。
- **影响/风险/验收**：Lab 预览，不动首页真实锚点；验证 320/390/768/1440；文档无横向溢出，完整对比画布仍可辨。

### F06 — P2：Dock 同时用 JS 与重要性覆盖决定手机方向

- **位置**：`WorkspaceDock.tsx:354,813`；`dock.css:9–45,97–136,208–240`。
- **现有/预期**：JS 已把手机 `effectiveEdge` 归一为 bottom，并将其写入 `data-edge`；CSS 仍用 13 个 `!important` 重置手机定位、方向、滚动与分隔线，其中含防御 left/right 的重复分支。预期有效方向只有一处决策，尺寸适配由 CSS 正常级联完成。
- **复现/证据**：读上述映射与选择器；四向实页均已检查，[dock-geometry.json](evidence/dock-geometry.json) 中面板与 Dock 无相交，说明这是维护债务，不是现有遮挡故障。
- **根因/归属**：早期 CSS 方向回退与当前 JS 有效方向共存；Dock feature 独占归属。
- **方向**：将桌面四向分支限于适用容量，保留手机底部尺寸与 safe-area 差异；移除已不可达的方向纠正，逐条证明其替代规则。不要把全部 25 个 `!important` 一并删除。
- **影响/风险**：四向停靠、收展、overflow、Inset、Portal；中风险，用户收益主要是以后修方向不再修改两套规则。
- **验收**：四方向 × 跨 768 边界；手机强制底部且桌面偏好不被改写；收起释放 inset；打开面板/模态/全屏/键盘场景不退化。

### F07 — P2：文件夹预览圆角登记比真实语义窄

- **位置**：`VISUAL_LANGUAGE.md:149–152`；`launcher.css:3,343,470,500`。
- **现有/预期**：登记将 mini radius 定义为固定 14px×ratio；大文件夹实际按 `--launcher-mini-size` 计算，余数格再按半边长计算。同一名称有不同公式，门禁只验证名称已登记，不验证公式。预期登记表达“实际图形边长×比例”或清楚区分缩略图角色。
- **复现/证据**：对照上述 CSS；[文件夹截图](evidence/home-1440-light.png)、[弹层截图](evidence/folder-popup-1440-dark.png)。没有证据说明实际圆角难看。
- **根因/方向/归属**：规范仍固定早期 miniature 几何。优先修正规范及注释，保留按实际尺寸比例的实现；如确需局部变量则由 Launcher 拥有，不新增全局尺寸阶梯。
- **影响/风险/验收**：小/大文件夹、余数预览、Dock glyph；低风险的契约修订；390/768/1440 下比例连续、图像不裁切、名称基线不变。禁止为了匹配旧文字把大预览硬压回 14px 圆角。

### F08 — P2：前端契约存在已可观察的漂移

- **位置**：`docs/frontend.md:22–23,114–115`；`SettingsShell.tsx:75–128`、`routes.ts:33–48`；`VISUAL_LANGUAGE.md:171,230–231`、`button.tsx:16,24–26`。
- **现有/预期**：文档说 `/settings/search` replace 到 `/settings`，实际直达并显示搜索详情；手机分类页与详情正依赖这一区别。文档写 Settings H1“设置”/Tab H2，实际可见详情由 `PageHeader` 命名。Button 存在 `content` 变体与 outline 安全默认，规范未说明；owner 示例还引用已不存在的 `notes.css`。
- **复现/证据**：390px 直达 `/settings/search`，地址未 canonical redirect；[搜索详情](evidence/search-detail-390-light.png)。其余为上述源码可核验差异。
- **根因/方向/归属**：规范滞后于路由与语义组件演进；frontend/design 文档 owner 修订契约。保留可用的手机详情路径，不为迎合旧文档引入跳转；补充标题的可见/辅助技术语义与 Button 默认约定。
- **影响/风险/验收**：后续代理与评审的执行依据；本项首先是文档修订，低运行时风险；路由、标题与变体例子逐项对应实际实现，不建立第二份平行规范。

### F09 — P3：四个层级 Token 已无消费者

- **位置**：`web/src/design-system/tokens.css:93,100,105,109`：`--elevation-note-drag`、`--elevation-dev-inspector`、`--elevation-card`、`--elevation-local-6`。
- **现有/预期**：全站源码/脚本/文档搜索只找到定义，没有找到动态拼接或运行时读取这些名字。应删除过时语义，而不是让读者猜它们是否为保留层级。
- **复现/证据**：搜索四个完整名字并检查 `elevation-` 的模板/字符串拼接及 `setProperty/getPropertyValue`；注意 `.trash-status` 有真实消费者，**不是 dead class**。
- **根因/方向/归属**：历史层级残留；Tokens owner 在相关修改时删除这四项；不顺带压缩其余 z-index 数值。
- **影响/风险/验收**：很低，收益也低；全站检查无 undefined Token，drag/Menu/Toast 层级不变。不以减少四行当作主要成果。

## 规范自身应如何调整

1. 保留字号、材质、响应式容量与命中区底线；不要遵循通用设计技能而换掉本项目有明确产品理由的原生字体。
2. Grouped List 规范应区分“一个值的行”和“复合管理内容”，说明标签/控制区容量；“左标签右控件”不能是所有宽度下的硬约束。
3. 补齐 Button 安全默认、content、文件夹真实 mini 几何和手机设置详情契约。不是新增另一套设计语言。
4. `VISUAL_LANGUAGE.md:34` 对 Material `--muted` 给出 3:1、`UI_CHECKLIST.md:7` 统一要求文字 4.5:1，适用范围不够明确。应明确小号信息文本仍按正文底线验收，区分禁用/装饰与信息文本；本轮没有把这一文字冲突直接认定为全站对比度失败。
5. 固定少数断点不等于禁止容器容量设计或合理高度轴规则。现有 `(min-width:768px) and (max-width:1023px)` 不是被禁止的 CSS range 简写；不能据此报错。

## 性能、动态布局与可访问性

- 1440px 首页搜索/底板共享 x=400、width=640；底板 y=390、height=372。网格 x=416、width=608。应保留这条共同对齐线，不为减少 CSS 拆散几何 owner。
- Dock 四向与应用面板矩形均不相交；手机、平板首页流式笔记会在滚动中经过固定 Dock，这不等于最终内容不可达，不能单凭 fullPage 截图判遮挡 bug。
- 九个强调色在两主题的 ring 与实色 surface 对比度均超过 3:1，最低实测计算值约 5.12:1；这是该表面上的 Token 颜色计算，不是所有 wallpaper/focus 组合的认证。见 [accent-ring-contrast.json](evidence/accent-ring-contrast.json)。
- 粗指针 Context 中模型控件 label、推理按钮、顶栏按钮均达到 44px 高，见 [touch-targets.json](evidence/touch-targets.json)。模型原生 checkbox 视觉尺寸小于命中区是正常差异，不应直接判 16px 目标违规。
- reduced-transparency 下底板 `backdrop-filter:none`、实色；reduced-motion 的媒体查询真实匹配。代表 Dialog 的 Escape 关闭与焦点归还、Tabs、Dock 收展、笔记移动预览取消均观察成功；见 [interactions.json](evidence/interactions.json)。未证明全站键盘流程完整。
- 打开再关闭应用面板的一次不节流采样：17 次 Layout、51 次 RecalcStyle，LayoutDuration 0.002752s、RecalcStyleDuration 0.022625s。见 [performance-sample.json](evidence/performance-sample.json)。没有设备预算、重复分布与绘制因果证据，**不判为性能故障**。
- CSS Coverage 原始样本见 [css-coverage.json](evidence/css-coverage.json)。跨导航后部分 stylesheet 已分离，只保留可读取项；CSS 分组范围也可能覆盖未执行分支。不能将本样本换算为“98% 有效”或 dead CSS 占比，不据此删代码。
- 短高编辑器的源码输入空间明显紧张，[模拟截图](evidence/editor-keyboard-resize-390x430-dark.png)。这里只缩小了布局视口并发送合成 composition 事件，没有真实 OS 键盘触发。将工具栏折叠原型列为待验证，不直接发布设备特例。

## 现有门禁：能力与缺口

| 门禁/工具 | 已有能力 | 盲点与建议 |
| --- | --- | --- |
| UI Guard | ownership、旧类/路径、Token 注册、accent 填充、raw 字号/圆角/间距等；零 baseline | F02/F03；也不能评价实际信息层级与布局容量 |
| Design System 单元测试 | 网格镜像、断点、玻璃/壁纸强调色数学等 | 公式通过不代表实际页面可读或内容容量足够 |
| Playwright E2E | 网格/底板几何、Dock inset、workspace chrome、拖动/键盘、编辑等大量可观察合同 | 本轮未运行完整 suite；不能依据文件数量断言覆盖完整或重复 |
| 截图证据 | 测试和清单有截图输出、人审矩阵 | 未发现 `toHaveScreenshot/toMatchSnapshot` 的自动像素比较；F01/F05可在截图留存时照样漏过 |
| a11y | 语义、焦点、Escape 层栈、目标与对比度的局部测试 | 未发现 axe 集成；没有全站屏幕阅读器证据，不应宣称“无障碍已通过” |
| Bundle gate | `check:bundle`、构建分包及报告 | 大小不是 layout/paint 成本；本轮只执行 build，未执行 bundle gate |
| Design Lab | 正式 primitive + 主题/材质/交互演示；原型与正式页面分开 | 样本自身有 F04/F05；不能替代真实复杂业务行 |

没有证据支持批量删除“重复测试”。apps-density、home-composition、Dock、workspace-inset 可能交叉使用同一页面，但验证的是容量、构图和避让等不同风险，应保留；任何去重必须先列出相同前置、相同动作、相同用户断言。新增优先为 F01/F05 几何回归和 F02/F03 scanner 反例；像素比较只选确定性组件/关键状态，动态日期、壁纸与用户内容不要粗暴全站重录 baseline。

## 明确不实施的方向与待验证项

- 不将 Design Lab 路由可达直接认定为生产泄漏：`docs/frontend.md:12–16` 已明确其用途，所谓“原型不进入生产”首先指不进入正式业务体验。若未来要限制实验路由，需独立产品/部署决策，不能顺手改变访问权限。
- 不把 `cn()`、透明输入、相同 Token 值、hover/fine-pointer 辅助条件、Canvas 中 runtime style、非宽度媒体规则本身当作缺陷。
- 不撤销现有文件夹比例圆角、贴面边缘、原生字体、搜索 38% 锚点或 neutral home-note 材质。缺乏用户真实壁纸/图标的比较证据，不做个人审美反转。
- 待验证：真实移动键盘/IME、浏览器工具栏缩放、非零 safe-area、Safari/Firefox、屏幕阅读器、流式 AI、极大量笔记虚拟化需求、绘制/合成 GPU 成本、有效/无效 CSS 的可靠全站比例。上述不是已确认缺陷，不作为无依据的重构任务。

后续执行见 [UI_OPTIMIZATION_PLAN.md](UI_OPTIMIZATION_PLAN.md)、[UI_COMPONENT_MATRIX.md](UI_COMPONENT_MATRIX.md)、[UI_ISSUE_DRAFTS.md](UI_ISSUE_DRAFTS.md)。
