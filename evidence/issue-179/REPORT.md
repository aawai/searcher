# Issue #179 验收证据

基线：`8e50419`。产品分支：`fix/179-zen-chrome-inset`。

## 根因与修复

`useDesktopGeometry` 已拥有 `.topbar` / `.connection-banner` 的测量；Zen Panel 未消费 `chromeBottom`，固定 top=64 遮挡 Retry。仅新增 Host → Shell → Surface 的 `chromeBottom` 输入与 Panel CSS max(语义 inset, chromeBottom)。不增加 measurement / viewport owner，不提高 banner z-index，不改 constrained / Sheet 几何、v4 payload 或用户数据。

## 红绿回归

- `workspace-chrome-inset-baseline-red.xml` 与 `workspace-chrome-inset-ba4eaa5f4fbac36e/banner-and-panel.png`：初始 auth/me abort，恢复网络并真实登录，768×1024 打开 Apps；Retry 中心命中 `h2.workspace-title`，1 failed。
- `workspace-chrome-inset-green-final.xml` / `.log` 与 `workspace-chrome-inset-cc23608997082c62/`：同路径 Retry 真实 click 成功，清除 banner 后 top=64，内部滚动和焦点恢复通过，1 passed。
- 首次 green 的 36 Apps 恰好填满内容区，滚动夹具失败；最终用 60 Apps 建立真实 overflow，未放宽断言。

## 分批实页矩阵

所有原始文件位于 `acceptance/`，保留失败报告，不拼装为一次全绿执行。

1. `full-results.json`：33 场景，30 通过；12 个固定 390/768/1440 × light/dark × Zen/Widgets Home/Apps 组合通过，5 个上下断点/900 场景通过，320/360/375/390/414/430 × 两布局网格通过，768×560 唯一 body scroll owner 通过。三处脚本失败分别为：Apps 离线态错误等待成功 grid；Zen/Widgets 错误要求 banner 消失前后 Search 的绝对 y 相同。
2. `focus-results.json`：复查 Apps 网络 abort→Retry 和 Zen 真正 auth/me abort→真实登录→全局 Retry 通过。Search 正常流随 53px banner 平移 53px，水平锚点保持；Panel top=117→64。Widgets 因误等 Panel header 超时。
3. `widgets-only-results.json`：改为等待实际 Window chrome 后独立 Widgets 场景通过，真实 Retry 成功，持久 v4 Apps frame 前后完全相同。
4. `main-baseline.json` / `main-green.json`：独立 browser.open，字体就绪与两帧稳定后，1440 Zen/Widgets hero y64 / height288.1875，Search x360/y296.1875/w720/h56；768 Zen Panel x352/y64/w400/h944；前后全部字段相同。
5. `main-extra.json`、`main-short-scroll.json` 与顶层 `omp-sshots-*.webp`：主代理补验 900×900 / 900×360 的真实初始 auth/me 网络失败→真实登录；61px banner 下 top125，Retry 中心命中；短屏底部添加与顶部返回/关闭真实 click 可达，清除后 top64。表单仅 app-dialog-body 滚动，回到顶部0，document scrollY0，关闭等待 opener 实际 focus。`main-short-form.png` 为恢复后短屏表单。

## 自动门禁

- `deno task test`：673 tests / 51 steps，0 failed。
- `deno test -A scripts/ui-guard`：100 passed。
- 前后端 `deno check web/src/main.tsx src/main.ts`、生产 build、bundle budget 通过。
- `deno task check:ui` 首轮指出新 runtime variable 未定义；补充局部默认值与 Surface 精确几何例外后 ownership201 / visual141 文件、violations与allowances均0。
- `deno task check:e2e`：46 文件。
- 变更源码 lint、10文件 fmt check 通过。
- `E2E_REPORT_DIR=artifacts/issue-179/full DENO_JOBS=2 deno task test:e2e:full --parallel`：完整执行一次，62 passed / 290 steps，1 failed / 1 step，46文件，11m19s。见 `acceptance/full/junit.xml` 与 `timings.json`。唯一失败：移动 Sheet Undo 恢复错误提示等待30s超时。
- 原失败测试未修改；最终分支 `acceptance/apps-interactions-recheck.xml`、独立未修复基线 `apps-interactions-baseline.xml` 各 1 passed / 6 steps。该超时未稳定复现，不能声称完整命令一次全绿，也不在此推断已证明其具体时序原因。Sheet 仍由独立 CSS override 管理，不消费新 inset。

## 边界

未验证真实 Safari / iOS / Android、软键盘、OS IME 或读屏器语音。Chromium 模拟不等于真机。无迁移；回滚 prop 与 CSS 消费即可，不覆盖已有布局或用户数据。媒体与本报告仅保存在独立证据分支，不合并 main。

## PR 持续集成

PR https://github.com/aawai/searcher/pull/186，产品提交 `e52bb3f90f700e6821d2c7f141f13ecf964daafc`。

- 六个 Workflow 最终全部成功：UI Guard、Bundle、Docker、Wallpaper、Notes 与 Workspace。
- Workspace run https://github.com/aawai/searcher/actions/runs/38989246211 首轮为 42 passed / 135 steps、1 failed；失败在既有 Apps density 的390px resize场景，采到540.078125px容器宽度。`apps-density.test.ts:1199-1216` 等待列数与当前容器宽度的公式一致，但未单独确认容器已收敛到目标viewport；本次不搭载该脚本的修复，也不放宽断言。日志 `ci-workspace-attempt-1.log`。
- 对照独立未修复基线，原 Apps density 模块为1 passed；见 `apps-density-baseline.xml`。本地完整生产执行中该模块也已通过。
- 收集证据后仅手动复查失败的 Workspace job；无产品或断言变动。第二次完整 Workspace 结果为43 passed / 135 steps / 0 failed（3m31s），日志 `ci-workspace-attempt-2.log`。不将此表述为首轮CI通过。
