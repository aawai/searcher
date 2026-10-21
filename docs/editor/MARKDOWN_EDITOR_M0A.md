# #102 M0A Shared Editor Feasibility Spike

## 状态与技术选择

本报告以 GitHub Issue #102（2026-10-07 读取的版本）为唯一产品/架构
Contract，并读取 #110、#108、#67 / PR #76 的相关约束。

编辑 correctness、真实 production build、现有页面加载隔离已经验证。 选择
**Milkdown 7.22.2 + ProseMirror，最小插件组合**；不考虑完整或裁剪 Crepe， 不引入
CodeMirror。现有 Notes 的 textarea、API、autosave、draft、conflict、history
保持不变。本 spike 不是 #110 生产 foundation，也不是 Documents 产品功能。

M0A 已完成当前存在的 surface 与 isolated spike 的技术验证。§36 的 Documents
root/library 网络不加载 editor runtime 仍是硬性 Contract；该正式 surface 在
M1/M2/M3 才交付，本次没有声称实际验收了不存在的 library。当前证据是 pre-open
shell、manifest 与 module ownership；真实 library 网络复验必须随其交付补齐。
这个验收时点问题已记录到 #102；PR 合并不等于跳过后续阶段的门槛。

## 可复现证据

```bash
deno task build
deno run --allow-read --allow-env scripts/m0a-editor-bundle.ts
deno run --allow-read --allow-env scripts/check-bundle.ts
deno test -A web/src/spikes/markdown-editor/runtime.test.ts
NODE_ENV=test deno test -A web/e2e/markdown-editor-spike.test.ts \
  web/e2e/markdown-editor-loading.test.ts
```

浏览器访问 `/design-lab/markdown-editor`。只有点击“打开编辑器”才动态加载
runtime；
可打开两个独立实例、切换源码、编辑、撤销/重做与卸载重建。不保存到服务器。

- `deno task test`：507 passed，21 fixture steps，0 failed。
- production React interaction：源码替换不触发 user
  dirty，选择替换、undo/redo、CDP 中文 composition
  commit、两个实例隔离及三次卸载/重建通过。
- production network：匿名 Home；注册后 Home、Apps Workspace、Notes root、现有
  NoteEditor；spike pre-open shell 不请求 editor runtime。点击后才请求异步
  editor chunks。没有把未来 Documents library 当作已存在的测试场景。
- Workspace 既有八个 E2E 文件：8 passed，85 steps，0 failed；没有改测试或
  baseline。
- 新代码 typecheck、lint、format 通过。UI Guard 0 violations，baseline 未放宽。
- 390×844、768×1024、1440×900 × light/dark 六组合实页截图；无页面横向 overflow。
  WCAG 2A/2AA axe 0 violations。详见 `UI_REVIEW_CHECKLIST.md`。
- 独立实页 smoke 用 Chromium CDP composition 输入“中文输入验证”，canonical
  Markdown 保留完整中文；不是 OS 输入法候选窗人工验收。

## Markdown 与事务契约

`runtime.ts` 提供 create/getMarkdown/replace/undo/redo/destroy 与实例自身
EditorView。 正文唯一 persistence representation 是 Markdown string；不保存
HTML/PM JSON。

21 组 fixture 比较输入与输出的 Markdown AST（忽略 source position），不是仅检查
serializer 幂等或非空。覆盖 H1–H6、段落、bold/italic/strike、inline/fenced code
及 language、链接、网络/asset:// 图片、列表/嵌套/任务、引用、HR、GFM table 及
alignment、hard break、PageBreak 与 raw HTML。

允许 list marker、table 排版、hard-break
写法的语义等价规范化；不允许内容、heading 级别、list depth、task
checked、URL、图片 asset ref 或 table cell 丢失。 Raw HTML
保留为原始文本/原子节点，不注入任意 DOM；复杂 HTML 不承诺 rich editing。

PageBreak 只识别独立精确
`<!-- pagebreak -->`。大小写、`page-break`、额外内部空格
都不被升级为语义分页符，原始 comment 保留。节点 atomic、可选择与删除，序列化为
固定 comment。开头、结尾、连续 PageBreak 有 fixture。

Pagination 演示仅在语义 PageBreak 后添加 aria-hidden widget decorations。
它们不进入 semantic tree / Markdown，使用同一个 PM EditorState。
**没有自动测量、paper layout、editable page surface 或 print；这些由 M0B/M5
验证。**

初始化期间的 schema normalization 不触发 user callback；replace 及其
appendedTransaction 链被识别为 programmatic，默认不触发 user dirty。
正常编辑、undo/redo 发出 user change。实页发现过初始化与 replace 被误判的问题，
已由 runtime 修正并有 production regression test。

Source 使用已有 Textarea，rich→source 序列化，source→rich 显式 replace；
不是每字符受控重建 rich state。两种表示由同一个 surface 同步。 源码模式的 native
selection/history 独立于 rich history；不承诺两种编辑器的 low-level undo stack
完全相同。没有第二套 editor framework。

模块在 browser globals 不存在时可被导入；浏览器对象只在 create/plugin DOM
调用时使用。 React effect 取消后会销毁迟到的实例；多实例不共享 editor state。

## Production bundle

Baseline 为 `69e5677` 的真实 Vite production build。数据为 JS 文件 bytes，gzip
使用 `node:zlib.gzipSync` 的统一默认设置；不把 npm package size 当产物体积。

| 指标                                        | Raw bytes | Gzip bytes |
| ------------------------------------------- | --------: | ---------: |
| baseline initial static JS                  |    779450 |     245385 |
| spike initial static JS                     |    779742 |     245494 |
| initial 增量（lazy 路由）                   |       292 |        109 |
| 新增 editor / harness async chunks          |    337589 |     106585 |
| 冷打开 editor 的全部非 initial JS           |    508666 |     159066 |
| 最大新 chunk：editor-vendor                 |    331058 |     103209 |
| baseline shared markdown-vendor             |    162599 |      50032 |
| 当前 shared markdown-vendor                 |    171077 |      52481 |
| shared Markdown chunk 增量                  |      8478 |       2449 |
| harness + runtime adapter（已计入，不另加） |      6531 |       3376 |
| Source 专属 framework runtime               |         0 |          0 |

**新增代码 104.09 KiB gzip 不等于冷打开下载成本**。Home 没有加载 shared
markdown-vendor，因此冷打开还需该 chunk，合计 **155.34 KiB gzip**。 这处于
§14.3.7 的 150–200 KiB 区间，不宣称达到 <=150 KiB 目标。

主要依赖为 ProseMirror view/model/transform/tables/state/history、Milkdown
CommonMark/GFM schema，以及共享 Markdown parser/serializer。 GFM
tables、history、IME/selection 与完整 v1 Markdown 语法是必需项，不能通过删掉这些
能力降低体积。已经去掉完整 Crepe、默认 theme、LaTeX/KaTeX、AI、协作、CodeMirror
及 language packs。该组合低于 200 KiB 上限；不为追求 150 KiB 而放宽语法或
correctness。

Rollup module report 的主要构成（rendered bytes 是 minify
前的组成证据，不能直接加到 上表 production raw bytes）：

| 包                          | Rendered bytes |
| --------------------------- | -------------: |
| prosemirror-view            |         248528 |
| prosemirror-model           |         124695 |
| prosemirror-transform       |          83326 |
| prosemirror-tables          |          81635 |
| @milkdown/preset-commonmark |          60244 |
| prosemirror-state           |          36005 |
| @milkdown/preset-gfm        |          30090 |
| prosemirror-history         |          17149 |

Manifest 中 initial closure 只有 application、react-vendor、ui-vendor；
markdown-vendor 不在其中，且不反向 import editor-vendor。 Milkdown、ProseMirror
和 remark-stringify 放在独立 editor-vendor。 共享 mdast helpers 仍使只读
Markdown chunk 增加 2449 gzip bytes，这不是 Home initial 增量，也不是整个 editor
runtime。该成本已单独披露，不以“共享”把冷下载成本扣掉。

`web/dist/bundle-report.json` 记录实际 module ownership；缺失时 gate 失败。
module IDs 使用 repo-relative 路径，不暴露构建机器绝对路径。 React/ReactDOM
19.1.1、ProseMirror view 1.42.6 / state 1.4.4 / model 1.25.12 / transform
1.12.2、remark-gfm 4.0.1、unified 11.0.5 各为单一 resolved version。 没有重复
Rollup module ID；没有所监控 runtime package 的多版本打包。

## #110 输入约束与后续阶段

#110 应消费本次已验证的最小 stack、AST fixtures、origin 规则和 lazy-loading
证据， 而不是复制两套 Notes/Documents adapter。

- shared owner 为
  `features/markdown-editor`；create/destroy、parse/serialize、GFM、 typed
  command、composition、selection/history、transaction origin 是 shared
  技术能力。
- shared core 不知道 API、autosave debounce、server version、draft storage key
  或 Workspace。
- production origin contract 要覆盖 initialization / user / programmatic /
  normalization； programmatic replace 与 mode hydration 不能变成 user dirty。
- 提供 DOM/class hooks，不加载 framework theme。consumer 自己定义 Notes 或
  Documents typography。spike 已用 canonical Markdown token 验证，不把这个 demo
  CSS 当两域最终 UI。
- PageBreak presentation、pagination/paper/print 属 Documents-only，不能搬进
  shared core； 可通过 shared extensibility 接入 Documents 插件。
- Notes #108 不依赖 M0B，也不由本次迁移。M4 必须消费 #110；M5 等 M0B + M4。
- M0B 的自动分页、caret/IME reflow、oversized blocks 和 paper metrics 尚未由 M0A
  证明。

阶段顺序与逐 PR gate 已记录到 #102。M0A PR #124 仅交付 spike；#110 由独立
阶段实施。后续按单独阶段读取最新 Contract、实现、验收及提交 PR；正式 library
交付时必须增加网络隔离验收，不能只引用本 spike 的结果。

## #110 Shared Foundation

共享 owner 为 `web/src/features/markdown-editor/`。上面的 M0A 数字是 PR #124
的历史构建快照；本节记录独立 #110 阶段。便签产品未迁移，Documents 尚未上线。

- `runtime.ts` 的 `createMarkdownEditor(root, markdown, onChange?, options?)`
  创建独立实例，返回 `getMarkdown`、`replaceMarkdown`、`focus`、`undo`、`redo`、
  `executeCommand`、异步 `destroy` 和只属于该实例的 `view`。
- `types.ts` 可被 consumer 用 type-only import 引用；真正打开编辑 surface 时才
  dynamic import `runtime.ts`。不要把 runtime 的 barrel 静态导入 Workspace
  shell。
- change event 为 `{ markdown, origin }`。初始化不发送 dirty event；replace 及其
  appended transactions 标为 `programmatic`。只有 `origin === "user"` 进入
  consumer 的 dirty/autosave 流。extension 可用 `originMetaKey` 显式标记
  `normalization`；用户编辑触发的修正继承该次编辑的来源。
- `options.onFocus/onBlur/onComposition` 提供实例级事件；composition 包含
  start/update/end 与 data。普通格式 command 在 composition 中返回 false。
- command union 与当前便签 toolbar 同名：bold/italic/strike/inlineCode、
  heading1/2/3、bulletList/orderedList/taskList、blockquote、link、codeBlock、
  horizontalRule、table。link 参数为 `{ href, title? }`，codeBlock 为
  `{ language? }`，table 为 `{ rows?, cols? }`；没有第二种 positional 参数格式。
- source 由 consumer textarea 持有本地值，在返回 rich 时显式 replace，不能每字符
  重建 rich state。API、autosave、draft、conflict、版本与资产 resolver 均由
  consumer 拥有，core 不导入 Notes/Documents/Workspace 业务。
- `options.plugins` 是 Milkdown extension seam。PageBreak 与 pagination 只位于
  spike consumer；`spikes/markdown-editor/runtime.ts` 仅组合插件，已删除原型
  adapter 的重复实现与过渡 alias。共享 fixtures 不包含 Documents PageBreak。
- `structural.css` 只提供 `.markdown-editor .ProseMirror` 的 whitespace、
  selection 与 node selection bridge。consumer 独立定义 typography、surface、
  task presentation；没有 framework 默认产品 theme。

最终 production build：initial 779742 raw / 245500 gzip bytes；相对 M0A 前基线
增加 292 raw / 115 gzip bytes。冷打开异步闭包 516057 raw / 161636 gzip bytes
（157.85 KiB），新增代码 344980 raw / 109155 gzip bytes。150–200 KiB 的依赖
依据仍是必需的 CommonMark/GFM、PM view/model/transform/tables/history；
`prosemirror-commands` 提供成熟格式命令。Shared Markdown chunk 保持 171077 raw /
52481 gzip bytes，没有增加第二份 parser。完整 module/version breakdown 可运行
`scripts/m0a-editor-bundle.ts` 重现，所有 bundle gates 通过。

验收：focused 28 tests / 25 steps；全量 526 tests / 25 steps；production
editor、 网络隔离与既有 bundle-loading 合计 3 tests / 9
steps，全部通过。typecheck、lint、 format、UI Guard 通过，baseline
未放宽。实页六组 390/768/1440 × light/dark 无横向 overflow，H1/H2/H3 仍为
18.9/16.8/15.4px，axe WCAG 2A/2AA 0 violations。 真实 CDP 验证
focus/blur、composition start/update/end 与“中文验收”内容保留；
跨粗体文本的整段链接更新/移除已通过 failing-before/passing-after regression
和实页 consumer 调用验证，邻接链接与粗体保留。没有 OS 输入法候选窗人工验收。

未修改基线首次运行曾有 1 个 CryptoVault 篡改测试失败，已记录到 #110。测试把 随机
cipher 尾部直接替换为 ff，不能保证内容实际改变；本次未保存 cipher，不能
断言失败的精确随机输入。最终实现后的完整回归通过不代表修复了该无关测试，
本阶段未改 crypto 代码或测试。正式 Documents library 的网络验收仍留在其交付
阶段与 M7，不将 spike shell 证据冒充正式 library。

## #102 M0B Editable Pagination Feasibility Spike

入口 `/design-lab/editable-pagination` 仅在打开编辑器时加载 runtime，消费 #110
的 shared core 和 M0A semantic PageBreak，不创建第二套 editor core。
连续/页面模式保持同一 EditorView、EditorState、selection 和 undo history。
页面采用原生 CSS multicol 的水平纸张带；纸张背景是 editable DOM 外的
aria-hidden、pointer-inert sibling，不进入 Markdown 或 clipboard。

唯一 layout owner 读取 A4/Letter、orientation 与 5–50mm margins，按 96 CSS px/in
换算物理版心；requestAnimationFrame 合并文档、尺寸、图片、字体
触发的测量。composition 期间延后几何写入，compositionend 的 PM handler
完成后提交重排。列位置以 round 处理浏览器的子像素舍入，不用 manual-break-count
floor 掩盖布局失败。PageBreak 使用非零结构尺寸触发列断裂； 末尾仅补空
paragraph（normalization / no-history），不增加 canonical 字节。

验证命令：

```sh
deno test -A web/src/spikes/editable-pagination/runtime.test.ts
deno task build
NODE_ENV=test deno test -A web/e2e/editable-pagination-spike.test.ts
deno task check:ui
```

- focused：6 tests / 3 steps；production：1 test / 5 steps，均通过。
- 完整回归：532 tests / 28 steps；UI Guard ownership/visual 均为 0；未放宽
  baseline。
- production 证明 DOM identity、选区文字、undo/redo、exact semantic PageBreak
  clipboard、首/连续/末尾共 5 页、间隙点击不变 selection、CDP 中文提交后
  重排、Letter landscape 与 5/50mm 边界不改正文。
- 超高 paragraph/pre/table 均产生多个 native fragments；2000×3000 PNG
  不超出版心且保持比例；纸张横向 overflow 仅在局部 viewport。
- 390×844、768×1024、1440×900 × light/dark：实页截图、无全局横向 overflow、axe 0
  violations。主题批量脚本先前未等待 transition，出现瞬态 contrast
  结果；等待浏览器 animation.finished 后重新验收了完整固定矩阵。

已知限制与 M5 路径：

- 本 spike 使用水平纸张带，不承诺正式产品纸张排列、zoom 或移动 Sheet。 M5 须在
  M4 的 DocumentEditor 生命周期内接入此 owner，并完成 Host 交互。
- 原生 table fragmentation 不承诺 repeating header；widow/orphan、heading
  keep-with-next 仍为 #102 定义的 best-effort，不改 semantic tree。
- 没有 PDF/Print、真实 document assets resolver、服务器 settings 或
  persistence； 这些不是 M0B 交付。M5 需基于 M1/M4 接入并单独验收同一物理
  geometry 的 print。
- 验收使用真实 Chromium CDP composition，不声称 OS 候选窗人工验收。
- M0B 仅作为 M5 前置，不阻塞 M1/M2/M3/M4、#110 或 #108。
