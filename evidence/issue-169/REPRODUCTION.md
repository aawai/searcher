# 复现与证据索引

基线0c8d36d2f0203f5289ab981bad0913d8bc241b29。先按仓库要求 Deno 2.9.7+ 安装依赖及 Chromium，生产构建由既有fixture/runner管理。

完整套件的实际命令及环境：

```sh
E2E_REPORT_DIR=/tmp/audit-169-final/e2e-full \
E2E_EVIDENCE_DIR=/tmp/audit-169-final/e2e-evidence \
DENO_JOBS=2 deno run -A scripts/e2e/run.ts full --parallel
deno task check:ui
```

浏览器交互复现使用现有 `web/e2e/helpers/production-app.ts` 的 `startProductionApp()`，合成用户通过 `seedAskFixtureUser` 建立（密码为临时合成值，不使用真实账号）；监听输出的随机 origin，不依赖固定端口。账号内通过实际API创建9个pinned Apps（含文件夹中2个）、3个首页固定展开Notes、长Document；第一页便签约87行及长代码，其余13行，note_layouts初始x/y null。所有 ID 和实际响应值在 interactions JSON 中记录，不重用真实用户数据。

`probes/matrix.js` 是浏览器工具 `tab.run` 的函数体/证据采集器，不是Deno独立测试文件；传入 `origin`、`outputDir`、场景列表，使用托管Puppeteer page，先8场景校准再批量。依赖API prefs和账号cookie，不能直接node执行后声称验收。具体API/selector/等待条件见探针与基线源码；人工交互最小步骤见REPORT的C1–C6。

固定矩阵：两个模式、两个主题、390×844/768×1024/1440×900，home/apps/notes/documents。扩展light两个模式：320×568、360×800、430×932、640×800、700×800、767×900、769×900、900×700、959/960/961×900、1023/1024/1025×768、390×400、900×200、1024×200、1440×240、844×390；home/apps全跑，Notes/Documents选关键宽度与短屏。results.json是逐场景权威清单。

本分支发布：全部154张矩阵捕获及2张失败截图、4张contact sheet、交互JSON/PNG/录屏、全套stdout/JUnit/timings、审计报告、研究及复核、独立issue计划。没有复制约97MB的既有E2E媒体目录；完整测试结果仍可从stdout与JUnit追溯。没有发布数据库、会话cookie、真实账号或壁纸文件。临时fixture入口只存在/tmp，不改生产启动流程。

校准产物保留以免隐瞒失败，但不得拿来作最终通过证据：ask-viewport.json、note-logout-warning.webm、widgets-feedback.json/对应初次录像。最终应看REPORT列出的final/pure/confirmed版本。录屏为自动交互序列，部分仅0.4–0.5秒，不代表长时间人工操作。

真实移动设备/OS软键盘/地址栏/原生pinch/旋转/IME未验证。横屏尺寸和viewport resize只是布局模拟。
