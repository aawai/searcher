# Issue #158：Zen 页面模式滚动条反馈循环

此分支仅承载验收证据，不合并至 main。全部正文、账号和图片均为合成
fixture；不包含用户提供的录屏或个人文档。

## 独立 Red → Green

- 实施基线：`068b104bca58ba5ea6410b7862a926e29844f6fa`。
- 独立 Red Test：`b7965ca`，经典滚动条 Chromium `1024×1548/1552/1556`
  均稳定复现。
- 运行方式：Playwright Chromium
  headless，`ignoreDefaultArgs: ["--hide-scrollbars"]`，保留经典滚动条。
- `1024×1552` 单页短文本，2 秒 idle：修复前 120 次 reflow，正文可用宽度
  851↔866px、zoom 1↔0.991558；修复后 0 次 reflow、宽度 851px、zoom 0.991558。
- 唯一运行时修改：既有页面模式正文 scroll owner 添加
  `scrollbar-gutter: stable`。不改变 Host overflow、分页引擎、选区或保存流程。

`before.json.gz` / `after.json.gz` 包含最初 5 秒及就绪后 2
秒的逐帧几何、scrollTop、page-count、signature 与 reflow 计数。`summary.json`
汇总范围；`before.png` / `after.png` 为各次独立执行截图。

## 真实界面额外采样与录屏

- `surface-nine-seconds.json.gz`：最终生产页面额外 9 秒、542 帧，0
  reflow；`final-surface.png` 为该实页。
- `before-after.webm`：合成文档对照。前约 3 秒在最终构建临时覆盖
  `scrollbar-gutter:auto`，重现旧 CSS 的反馈循环；后约 5 秒移除覆盖，使用最终
  CSS，重排停止。不是将覆盖片段伪称为旧版本构建。独立 Red commit
  的旧代码失败另有上述日志证明。
- `video-comparison.json.gz`：录屏段对应采样。
- `summary.json` 的 `closeReopen`：十次实际打开/关闭，退出动画结束并 GC 后 DOM
  nodes 恒为 112，event listeners 恒为 173。
- 初版生命周期脚本未释放 Puppeteer `waitForSelector` 返回的
  ElementHandle，造成诊断工具自身的 DOM 保留；修正为不返回 DOM
  的就绪判断后重新执行十次。这里只发布修正后结果。

## 平台边界

这是 Linux Chromium 的经典滚动条复现，不声称验证了真实 Windows、Safari、原生 OS
IME 或软键盘。CompositionEvent 的浏览器契约测试不冒充原生输入法验收。
