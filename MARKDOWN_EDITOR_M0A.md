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

阶段顺序与逐 PR gate 已记录到 #102。本次仅交付 M0A，未启动 #110、M0B 或
Documents 生产实现。后续按单独阶段读取最新 Contract、实现、验收及提交 PR；正式
library 交付时必须增加网络隔离验收，不能只引用本 spike 的结果。
