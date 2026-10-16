# #169 重新审计报告

审计日期：2026-10-15。基线 main@`0c8d36d2f0203f5289ab981bad0913d8bc241b29`（PR #172）。隔离 worktree：`audit/169-ui-audit`。本交付仅证据、探针与修复计划，不修改生产代码。原评论中的五个 Confirmed 结论不可靠，本报告取代该评论。

## 输入、环境与证据边界

用户明确批准以 #169 正文七类范围为完整清单；未取得原始截图，不推断截图 CSS 是需求。Deno 2.9.7，Linux x64。完整生产 E2E 使用 Chromium 141.0.7390.37；交互探针使用托管 Chromium 150（Windows UA 不代表 Windows 主机）。独立临时 SQLite、同源 production fixture、合成账号 audit169_final，三条固定展开便签、一篇长文、九个应用及文件夹；所有测试数据非真实用户内容。基线时 open PR 为零；#163 已经由 #164 合并，不存在该 PR 尚未落地的差异。

证据路径均相对本目录。`sections/` 是静态研究附件，运行结果及最终裁决以本报告为准。源码引用以基线 SHA 固定，行号只适用于该版本。

## 实际执行与覆盖

| 检查 | 结果及证据 |
|---|---|
| `E2E_REPORT_DIR=… E2E_EVIDENCE_DIR=… DENO_JOBS=2 deno run -A scripts/e2e/run.ts full --parallel` | 一次完整执行：48 passed（281 steps），0 failed；44 个测试文件；`e2e-full/stdout.log`、`junit.xml`、`timings.json`。测试耗时约 10m44s，不是分批通过拼接。 |
| `deno task check:ui` | 已执行通过：ownership 200 files，A–M violations 0；visual 141 files，violations/allowances/new/increased/stale 均 0。无原始重定向日志，本行记录当次工具输出，不伪造日志。 |
| 固定视觉矩阵 | Zen/Widgets × light/dark × 390×844、768×1024、1440×900 × home/apps/notes/documents，共 48/48 捕获；`matrix-calibration` 8 + `matrix-fixed` 40。四张 `contact-*.png` 已人工查看。 |
| 扩展矩阵 | 两模式 light，320、360、430、640、700、767、769、900、959/960/961、1023/1024/1025 宽及短屏、横屏；`matrix-extra-a` 56/56，`matrix-extra-b` 50/56。后者两个 Apps OPEN 失败，四个后继 Notes/Documents 捕获跳过，不能记通过。 |
| 矩阵总计 | 160 planned，154 captured，2 product failures，4 downstream skipped；成功捕获的几何断言无违规。截图无溢出不等于所有交互无缺陷。`matrix-summary.json`。 |
| 桌面交互 | 真指针拖拽、SE resize、left Snap preview/commit、Dock 最小化恢复、焦点与重载、缩小再放大；`interactions/desktop-*.json`、`dock-minimize-restore.json`、`persistence-geometry.json`、`recordings/desktop-gestures.webm`。完整套件另覆盖其余 Snap/resize/边缘碰撞/Overview 路径。 |
| 搜索及访客 | 固定矩阵六组模式切换搜索纵向锚点差为 0；390/768/1440 top 分别约 248.80/298.80/296.19px。访客四个代表场景无账号入口泄漏，匿名外观刷新保留；`guest-isolation.json`。 |
| 草稿及键盘 | Apps edge 切换保留、关闭确认取消保留；真实 Settings Link 路由离开丢失另列 C2。Note 标题本地落盘/返回/退出/重新登录恢复另列 C5。Escape、快捷键本地优先级、焦点、滚动、文档分页由本次完整 E2E 覆盖，具体步骤见 stdout，不将静态测试存在当成通过。 |
| Ask viewport | 五个桌面 CSS 视口，等待会话实际加载；`ask-viewport-final.json`。390×400 外层 thread scrollTop 0→50，使 dock bottom 425→375，`ask-short-scroll.json`。独立路由没有与 Home 同时校正同一 Surface。 |
| 壁纸 | off/ambient/drift/zoom 及模拟 reduced-motion；`wallpaper-motion.json` 和录屏。动态模式采样 transform 改变、Search 几何稳定；reduced 下 119 帧只有一个 transform、running animation 0。off 初始化有两种 transform，不误报动画。不是 FPS 基准或性能缺陷证据。 |
| 真实移动平台 | **未验证**：iOS/Android 软键盘升降、地址栏、刘海/Home Indicator、原生缩放/旋转、多引擎和 IME。CSS viewport resize/横屏尺寸/媒体模拟不是这些项目通过的证据。无 adb/idevice/xcrun 或真机连接。按 #169 的允许边界明确保留，不创建推测性修复。 |

探针校准错误单独排除：`ask-viewport.json` 的移动标记切换导致重载后未就绪；首次 Note 返回选择器错误导致 autosave 已发生；首次 Widgets 检查混入恢复窗口的有效 alert，HTTP503 也不是网络离线。最终证据分别使用 `ask-viewport-final.json`、`note-logout.json`、`widgets-pure-feedback.json`、`widgets-offline.json`；不把这些校准错误算产品失败。Playwright 下载曾遇平台识别/超时，安装后浏览器可用，最终全套实际通过。

## 七类需求逐项裁决

| 范围/子项 | 裁决 | 依据与边界 |
|---|---|---|
| 1 搜索层级、默认布局 | Confirmed C3 | 默认便签覆盖可用搜索提交按钮；不是锚点跳动。 |
| 1 登录状态、焦点、模式切换锚点 | By Design / Not Reproduced | 访客隔离、刷新外观和六对锚点实测；#70 禁止打开工作区自动聚焦输入。不能沿用 #21 已被 #75 替代的访客不持久化要求。 |
| 2 Host/Panel/Sheet、状态迁移 | Confirmed C1/C4 | 受限初始关闭状态无 Presenter；Zen banner 操作被 Panel 遮挡。其余固定矩阵通过；不重建统一工作区。 |
| 3 拖拽/resize/snap/dock/最小化/焦点/几何 | Not Reproduced（已运行路径） | 手工真实手势与全套 E2E；#157/#163 的 canonical/presentation 契约保留。不是对所有设备的健康保证。 |
| 4 viewport/dvh/safe-area | By Design；原生行为未验证 | Home 与 Ask 分路由 owner，不是同 Surface 双校正。viewport-fit auto 不等于 safe-area 失效；`env()` 零值不会触发 fallback。是否改 edge-to-edge 是 Needs Decision，需要真实 WebKit 证据，不建缺陷 Issue。 |
| 4 关键宽度、断点间、短屏与横屏尺寸 | Confirmed C1；其余见矩阵 | 保留2失败/4跳过，无“全矩阵通过”结论。真实旋转、pinch、地址栏和键盘未验证。 |
| 5 CSS ownership/cascade/tokens/一致性 | Confirmed C6；其余 Not Reproduced / By Design | 运行 UI guard、route-style E2E；feature namespaced :root、领域颜色、fallback 不单独构成问题。无证据支持全局 CSS 清理。 |
| 5 scroll/wallpaper/reduced-motion | Not Reproduced（已运行路径） | 长代码块/文档滚动/Ask 短屏、壁纸采样和完整 E2E；无性能缺陷结论。 |
| 6 Escape/快捷键/恢复 | By Design / Not Reproduced | 普通自由 Window Escape 不关闭；受限 Escape 最小化保留 DOM；不能以 DOM 数量不变判失败。嵌套表单先处理、焦点回 opener。 |
| 6 未保存保护、收起和路由 | Confirmed C2/C5；其他 By Design | Zen edge 切换保留 Apps 草稿；真实离开 Home 丢失。Note 立即关闭取消云端 debounce 但本地恢复，是 README/现有测试规定的语义，不要求 unmount flush。退出警告漏检才是缺陷。 |
| 7 历史/测试/CI | 已审计；不视作产品缺陷 | 18 个指定 Issue 逐项见 `sections/history-ci.md`；#21、#141 A6、早期几何规则已被后续契约替代。CI 静态覆盖并非全部 full；本次本地执行补齐 full，不宣称远端工作流已运行。CI 扩面没有预设产品要求，列风险而非新增缺陷。 |

## 六个 Confirmed 问题（每项独立 Issue）

### C1 / P1：Widgets 短受限视口不能从全关闭状态打开工作区
- 步骤：清空该合成账号的桌面布局，Widgets，844×390 或900×200；点击 Dock Apps（Notes/Documents 同根因）。
- Expected：已有共享 Surface 的可滚动 fallback 或可用工作区；Actual：windows=0、panels=0、Dock 仍未打开。844×500 则成功。
- 证据：`matrix-extra-b/*-error.png`、results.json、`recordings/short-workspace.webm`。矩阵后续四项跳过不是通过。
- 根因：`SearchHome.tsx:357–384` 仅 geometry.usable 才 OPEN；`:1023–1029` fallback 限 width>=1024，漏768–1023不可用几何。`desktop-geometry.ts:90–91` 有明确最小内容阈值。
- 既有覆盖：缩小已有窗口不覆盖“空桌面初次打开”。关联 #147/#163，不重复重开整个历史重构。

### C2 / P1：Apps 脏表单经实际 SPA 路由离开丢失（重写 #174）
- 步骤：Zen Apps 新建，填 name/URL；edge 切 Notes 再 Apps 保留；关闭 X 会确认且取消保留。然后点击顶部 Settings Link，返回 Home，重开新建。
- Expected：真正离开脏会话前由统一确认 owner 拦截（#141 A1.5）；Actual：直接进入 /settings，无 dialog，返回后两字段为空。
- 证据：`apps-draft-retention.json`、`apps-dirty-confirm.png`、`apps-route-loss.json/png`。
- 根因：AppSessionProvider 在 SearchHome 内，workspace guard 不覆盖 Router 离开导致卸载。不是 edge openWorkspace 丢失。

### C3 / P1：Zen 默认固定便签遮挡主搜索提交按钮
- 步骤：1440×900，Zen，有两张以上展开固定便签，note_layouts 坐标为空（非用户手动摆放），输入搜索词，点击提交。
- Expected：默认布局不遮挡主搜索；Actual：submit rect(1031,304.19,40,40)，第二张 note rect(850,200,250,299.75) 覆盖；elementFromPoint 命中 note-preview，真实 click 被拒。
- 证据：`zen-default-search-occlusion.json/png`、`zen-search-click.json`；包含服务端 null 坐标。
- 根因：`FloatingNotes.tsx:16–35` 默认摆放 y=200、交错 x，没有 Search exclusion；note canvas z25。不能全局抬高搜索 z-index 掩盖默认布局问题。

### C4 / P2：Zen Panel 遮挡全局连接提示 Retry
- 步骤：初始 /api/auth/me 网络失败；恢复网络并实际登录，使连接提示仍在；768×1024 打开 Apps Panel。
- Expected：顶部连接提示及 Retry 仍可操作；Actual：banner bottom125，Panel top64，Retry center 命中 workspace-title；关闭 Panel 后 Retry 点击可清除提示。
- 证据：`zen-banner.json/png`、`zen-banner-retry.json`。
- 根因：固定 workspace inset64 没有消费可变顶栏下缘；Panel z45 在 banner z10 之上。应用现有 chrome measurement，不新增独立 visualViewport 修正。

### C5 / P2：退出登录漏掉真实未同步便签草稿提示
- 步骤：编辑标题，1.5s debounce 前点击“返回便签列表”，等待本地 IDB 提交；退出登录。
- Expected：现有“有未同步的便签草稿”提示；Actual：未提示就退出。服务端旧标题、PATCH0、本地新标题；重新登录可恢复。**不是数据丢失**。
- 证据：`note-logout.json/png`、`note-logout-restored.json`、`recordings/note-logout-confirmed.webm`。
- 根因：`state.tsx:455–464` 查 draft:<uid>:；`NoteEditor.tsx:136,216` 写 note:draft:<noteId>。修复必须保护账号隔离与旧草稿恢复，不能扫描所有账号后泛化警告。

### C6 / P2：Widgets 首页加载/错误/离线状态遗漏或误报（重写 #177）
- 步骤：清缓存、无打开窗口，延迟/503 Notes GET；Apps 同样检查 loading/error；预置 Apps 缓存后真实网络 abort。
- Expected：加载/错误不是“暂无固定便签”，可访问状态及重试，缓存离线有提示；Actual：Notes pending/503 均显示空态，虽有3条；Apps 私有loading/error无相应live语义，9缓存应用网络断开仍无离线提示。
- 证据：`widgets-notes-feedback.json`、`widgets-pure-feedback.json`、`widgets-offline.json` 及同名PNG。
- 根因：`WidgetsLayout.tsx:133–180` 丢弃已有领域状态或自行输出文本。HTTP503与真正网络失败政策不同，不要求503强行回缓存。

## 纠正旧 Issue 与待决策

- #173 撤回并以 not_planned 关闭：缺 viewport-fit=cover 不是已证实缺陷。参考 https://webkit.org/blog/7929/designing-websites-for-iphone-x/ 。边到边布局是产品决策且需真机证据。
- #175 撤回并以 not_planned 关闭：#85/#91、DESIGN_SYSTEM.md:346–348 明确普通 Window Escape 不关闭；受限最小化不卸载 DOM。
- #176 撤回并以 not_planned 关闭：Ask 与 Home 独立 owner；删除 Ask 校正反而会破坏其短屏处理。
- #174/#177 保留编号但完整改写，只跟踪本报告真实 C2/C6；显式撤回原触发及全局 CSS 清理。
- 不建议改变 Note 关闭同步语义（README:67、DESIGN_SYSTEM:83–92、notes-focus.test:270–298）；旧 Needs Decision/P1 数据丢失结论撤回。
- 真机 viewport、IME、IDB 故障、草稿过期与断网编辑组合未全部运行；它们是未验证边界，不是 Confirmed 或 Not Reproduced。

## 方案、依赖、回滚与执行顺序

六项均使用现有领域/Host seam。C1局部 Presenter分支优于窗口重构；C2因 BrowserRouter 不支持 useBlocker，需要最小 data-router seam迁移并复用唯一确认 owner，不能仅给 Settings Link 加特例；C3默认放置避让实际 Search bounds，保留用户坐标；C4共享已测量 chrome inset，不能重写safe-area策略；C5统一用户所有权草稿命名/发现与兼容迁移，不能全库扫描；C6消费已有状态和semantic反馈，拒绝全局CSS清理。

建议顺序：C2（编辑状态风险）→ C1（工作区不可用）→ C3（主搜索鼠标不可用）→ C5（退出提示）→ C4（提示操作遮挡）→ C6（状态误报）。六项没有互相阻塞依赖；C1/C4都触 SearchHome/Workspace，合并前需重放对方场景；C2路由改动需重跑导航/lazy CSS/bundle及草稿保护。负责人均未分配。所有修复独立提交、独立回滚，保留当前存储/路由数据兼容；C5 migration 不可删除旧数据后简单回滚。

修复通用禁止回归：搜索锚点、320–430移动网格、Workspace导航/焦点/未保存保护、canonical/presentation几何与v4持久化、Dock、编辑器版本/撤销、长文滚动分页、壁纸reduced-motion、路由懒加载与账号/匿名隔离。各独立 Issue 另列 focused red→green、真实点击/指针验收、390/768/1440×light/dark×两模式实页、check:ui、相关E2E及回滚步骤；不以构建替代UI证据。

## #169 完成边界

审计完成不表示六项缺陷已修复。完成需本报告和原始证据有持久链接、六项各有实际创建/更新的完整计划、旧错报已撤回、主问题逐项回填及独立复核。原生设备未验证按正文许可显式列出；不可把它们改写为通过。最终 Issue 编号与发布 commit 在 #169 回填，避免事先伪造链接。
