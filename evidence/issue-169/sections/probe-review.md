# 临时 matrix.js 静态评审（未运行）

审查对象：`/tmp/audit-169-final/probes/matrix.js` 当前 80 行版本；本节不表示浏览器探针或测试通过。只读审查，不修改脚本/生产代码。

## 结论与批量前阻断项

脚本可以作为证据采集器，但**不能以 `errors.length === 0` 宣称 UI matrix 通过**。它只收集 geometry，最终仅列 document 横向 overflow，没有执行表面正确性、点击可达、焦点恢复、内容加载成功或 safe-area 的断言。建议先校准 Zen 1440 与 Widgets 390（分别覆盖非 portal Panel 和 portal Sheet），确认 API、选择器、内容及关闭等待后再批量；再单独补 Widgets 900/1440 与受限高度回退。

### 1. 等待加载消失会把错误态当正常态（高风险 false pass）

- 探针约 63 行只检查没有文本含“正在加载”的 `[role=status]`；失败后的 `[role=alert]` 不阻断。`AppsWorkspace.tsx:338-423` 即使 apps status=error 也仍挂载 AppsRootView，所以“有 root + 无 loading”不能证明成功加载。
- `WidgetsLayout.tsx:135-151` loading/error 本来就没有 role=status/alert；首页只等待 `[data-app-id] >= 7`（约 54 行），不等待 notes loaded。应用先完成、便签仍在请求时，会把临时空 Bento 拍成最终空态。
- 建议每个 kind 采用正向 fixture 断言：期望 app/note/document 的具体名称/ID 可见、seed 数量符合预期、目标 surface 无错误反馈。离线/error 场景单列 expected outcome，不能统一当失败或通过。父进程现有种子若不是 >=7 pinned apps，当前首页等待会产生探针失败而非产品缺陷。

### 2. 受限 viewport 可能等待错误 presenter（确定的适用范围漏洞）

- 约 59 行把所有 widgets >=768 硬编码为 DesktopWindow。实际 `SearchHome.tsx:1004-1014,1229-1309` 在 >=1024 且 geometry.usable=false 且目标窗口尚不存在时，使用带 viewportInsets 的 WorkspaceShell/Panel fallback；`WorkspaceShell.tsx:108-110` 明确允许该分支。
- 短高度/不够 geometry 的场景需按真实 `data-presentation` 选择 surface，并记录是否为 fallback。不能把无 DesktopWindow 的超时直接判为页面坏了。正常 900px constrained 仍应为 DesktopWindow，不应一律改成 Panel。

### 3. 几何采样可能选择隐藏/错误 owner（高风险 false evidence）

- `capture` 约 19-21 行用 `win || panel`，不验证 win 可见、kind 是否匹配 panel。`DesktopWorkspaces.tsx:317-322,482-487` 会保留隐藏的非 active constrained windows。应传入本次已经验证的 surface selector/element，断言 visible、非 inert、目标 kind/root 正确。
- controls 约 23 行只排除 `display:none`，没有排除祖先隐藏、visibility:hidden、inert 或零尺寸；不应把这些 rect 当可达控件。
- scrolls 约 22 行扫全 document、不带 window/kind 身份，也包含隐藏窗口。实际 AppForm scroll owner 为 `.app-dialog-body`，而不是探针 `.app-form-body`；Notes 为 `.note-body-scroll` / `.note-live-editor` / textarea，探针遗漏主要 Source owner。需限于本次 surface，记录 owner selector/rect/client/scroll/overflow/scrollTop，并实际滚动验证。

### 4. 采集 != 几何/遮挡验证（高风险 false pass）

- 约 24,77 行只记录 documentOverflow；bodyOverflow 虽记录未汇总，surface/controls 完全没有 containment 或相交断言。负数也不代表正确。
- 需要至少断言 surface 在预期 visual/work rect 内、搜索锚点在同一视口的 Zen/Widgets 切换稳定、footer/关闭按钮可见且有真实 hit target；`elementFromPoint`/真实 click 才能证明无遮挡。为 Zen banner 候选增加真实 connection-banner 的 rect/position/z-index 与 Panel 的相交、Retry hit test；当前脚本没有触发 banner。
- 没有 safe-area computed values；`visualViewport.height/offsetTop/scale` 只是当前值。没有真实键盘/地址栏/缩放/旋转过程，不能用此 matrix 关闭 #173 或 #176。

### 5. 稳定等待/异常证据需要兜底

- 约 7-12 行等待所有 finite animation.finished，没有总 deadline；被 pause 且不再结束的 finite animation 可永久阻塞。`finished.catch` 仅吞取消属于合理等待容错，不是产品错误兜底，但等待仍需限时及超时说明。两帧不保证数据/ResizeObserver/持久化全部完成。
- 约 69 行关闭等待只接受 removed 或 display:none；如果实际关闭机制采用 visibility/inert，会超时。当前 ordinary Panel 卸载和 Desktop CLOSE 这条路径匹配源码，但不应把它推广到最小化/沉浸隐藏。
- catch 约 72-75 行保留 message 是优点，但缺 kind/stage/stack。某 kind 失败后，本 scenario 的后续 kinds 都跳过；必须输出 planned/completed/skipped/failed 矩阵，不能仅报 records 总量。保存截图或写盘自身若失败，会中断循环且丢失原始错误；建议分别 try/finally 保留错误元数据。

## 已核对正确的部分（避免新误报）

- 当前 `.apps-workspace-root`、`.notes-workspace`、`.documents-workspace` 都有实际 consumer：`AppsRootView.tsx:221`、`NotesWorkspace.tsx:576`、`DocumentsWorkspace.tsx:292`。close button class 也真实存在（`WindowChrome.tsx:716`）。
- IndexedDB key **就是** `searcher:desktop-layout:v1:<userId>`（`desktop-persistence.ts:62-64`）；payload 为 v4 不意味着 key 应改成 v4。不要误改清理 key。
- `tab.click` 调用没有 force 参数，源码没有主动绕过可交互性；真实 API 的 auto-scroll/hit-test 语义需父进程在两个校准场景中验证，不能仅从无 force 推定已命中正确元素。
- `page.setViewport` / `page.waitForFunction(fn, options, ...args)` 看起来是 Puppeteer 风格；父进程实际 browser.tab.run page 包装 API 是否支持，由校准运行决定。本审查没有 API 文档或执行证据，不将其称为确定错误。
- 每次 goto 会重建 document，所以这份脚本不能验证 #120 要求的同-document SPA 路由加载顺序；需要既有 route-style-stability E2E 的独立证据。
- fullPage 截图可做背景/文档证据，但建议同时保存 viewport 图及 surface locator 图。fullPage 图不能单独证明 viewport 下固定层未遮挡，也不能证明滚动后可达。

## 建议校准验收

1. Zen 1440：真实 app/note/doc fixture 内容出现；Panel rect、footer、点击关闭、opener 焦点记录；有界等待。
2. Widgets 390：Sheet 与 backdrop 真正 portal，关闭真实 click 成功，mobile navigation selector 命中且无横溢出；Source/编辑器状态不能由 root smoke 代替。
3. 两个场景的 planned capture 数必须等于 `sum(1 + kinds.length)`；每张图与记录一一对应，错误/跳过有明确 stage；不要把未采集场景写成通过。
