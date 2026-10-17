# Issue #180：Zen 默认固定便签避让 Search

- Issue: https://github.com/aawai/searcher/issues/180
- PR: https://github.com/aawai/searcher/pull/188
- 基线：`b055c8d`；最终修复：`ae3867d`。
- 实现工作区：隔离 worktree
  `fix/issue-180-zen-note-placement`。本分支仅保存验收证据，不合入 main。

## Red → Green

`red/` 为基线真实服务和生产构建的失败场景：两张展开固定便签，API
x/y=null，1440×900 输入搜索词并普通点击 submit。Playwright 报便签 `<p>`
拦截指针，2500ms 超时。`red-click.xml` 保留失败结果；首轮夹具依赖 API
返回顺序的失败不算产品 Red。

`search-final/` 为最终按需构建的 focused 证据：1440×900、1024×768 真实 submit
点击都进入受控本地搜索目标，JSON 保存 API null 坐标、Search/submit/note
bounds、hit target 与目标 URL。

独立浏览器基线：Search x=360/y=296.1875/w=720/h=56；submit
x=1031/y=304.1875/w=40/h=40；第二 note x=850/y=200/w=250/h=315。实际点击
(1051,324.1875) 命中
P，note=true、submit=false。`baseline-browser.json`、`baseline-browser.webp`
保留该观察。旧代码的该次正文点击会置顶并持久化坐标；最终独立烟测仅在本地临时
fixture 中将其恢复 null 后复查默认放置，不将用户已保存坐标误当默认坐标重排。

## 最终行为与视觉

`matrix-final/` 是最终按需构建的十二组视口截图：390×844 / 768×1024 / 1440×900 ×
light/dark × Zen/Widgets。脚本检查搜索真实 hit target、无横向
overflow，主代理逐张审阅较早同布局矩阵，并在最终构建重新执行矩阵。其他验收包括
1440/1024 首屏与字体就绪、实时 resize、320/390/768/960 flow、961×390
短屏回流、固定 x=700/y=420 保持不变、默认置顶/折叠/展开不建立坐标、实际拖动与
reload、折叠保存、第二账号隔离。

关联短屏反馈：回流后滚动让 Search 离开原占位，便签短暂切回 canvas、页面缩短导致
scrollY 归零。新回归在旧 placement 构建上失败；exclusion 保留当前 Search
与实测未滚动占位的并集后通过。`short-scroll-before.json` 保存失败观察；最终
1440×450 独立普通滚轮后 scrollY=252，连续六帧保持不变，见
`short-scroll-after.webp`。矩阵另用 961×390 真实滚轮检查持续滚动及回流可达。

Search 的 1440×900 anchor 修复前后都为 x=360/y=296.1875/w=720/h=56。未提高
Search 全局 z-index 或降低全部便签层级；未新增 viewport owner。已有 desktop
坐标不自动重排，无 schema/storage key/v4 迁移；回滚 bounds prop 与 placement
不需要覆盖用户数据。

## 分批验证，不伪称完整命令一次通过

| 检查                             | 实际结果                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `deno task test`                 | 675 passed / 51 steps                                                           |
| 纯 placement                     | 2 passed                                                                        |
| `deno test -A scripts/ui-guard/` | 100 passed                                                                      |
| typecheck / lint / fmt           | 通过；最终 fmt 检查 11 files                                                    |
| `deno task check:ui`             | ownership 202 files / visual 141 files，0 violations                            |
| E2E manifest                     | 46 files                                                                        |
| 完整生产 E2E 首轮                | 71 passed / 291 steps、1 failed；见 `full-first.xml`、`full-first-timings.json` |
| 滚动修复后受影响 5 文件复查      | 7 passed / 48 steps；见 `final.xml`                                             |
| 最终按需构建 5 文件复查          | 7 passed / 27 steps；见 `lazy-final.xml`                                        |
| 最终 bundle gate                 | entry=344786 B；initial graph=285111 B gzip；全部预算通过                       |

完整套件唯一失败为新增快速折叠/展开夹具：未等待默认重排与 hover
操作区就绪，展开点击未发出保存。实际便签动作仍可操作；按 placement-ready、字体与
hover opacity/pointer-events 就绪后执行一次真实点击，后续完整 Home
相关模块与矩阵通过。没有 force click、固定 sleep、自动重发或全局
retry。`layout-failure.json` 保存诊断时的布局响应和
DOM，不把未通过的首轮记为成功。

最终按需构建复查：home-notes-order、home-notes-persistence、bundle-loading、markdown-editor-loading、route-style-stability。前一批复查：home-notes-order、home-notes-persistence、bento、workspace、ui-ownership。完整套件成功项另覆盖
Workspace 导航/未保存保护、桌面
canonical/v4/Dock、编辑器撤销/版本/滚动、Documents
分页、壁纸/reduced-motion、懒加载与身份隔离。

预算首轮 entry=351942 B，超过既有 350000 B
限制。未提高门禁；仅存在固定便签时按现有 React lazy/Suspense 模式加载
FloatingNotes，最终守住预算。匿名 Home 与 Apps 的编辑器 runtime 冷加载契约通过。

## 合并与 CI

PR #188 已合并至 main，merge commit `f862435`；issue #180 自动关闭。 最终
`ae3867d` 上六个 workflow 全部成功：

- [完整 Workspace E2E 与格式](https://github.com/aawai/searcher/actions/runs/39028627108)
- [Notes regression](https://github.com/aawai/searcher/actions/runs/39028627226)
- [Wallpaper contracts](https://github.com/aawai/searcher/actions/runs/39028627202)
- [Bundle 与 Route Loading](https://github.com/aawai/searcher/actions/runs/39028627102)
- [UI Guard](https://github.com/aawai/searcher/actions/runs/39028627191)
- [Docker build](https://github.com/aawai/searcher/actions/runs/39028627111)

## 未验证

真实 Safari / iOS / Android、真实软键盘、OS IME 与读屏器语音未验证。Chromium
viewport、focus/hit-testing 不代表真机或软键盘通过。
