# UI PR Review Checklist

参考 [Principles](DESIGN_PRINCIPLES.md) 与
[System](DESIGN_SYSTEM.md)。适用项填写证据，不适用写原因；build/test
不代替实页。

## Issue #210 图标尺寸收敛

- [x] 基于 #203/#216 合并后的 main，在 `.worktrees/issue-210` 隔离实施。
      普通图标采用 `--icon-sm/md/lg`（14/16/20px）与 `size="1em"` +
      `icon-sm/md/lg` CSS utility，无新增包装组件或 DOM。 清除
      `--control-icon-size` 与 LayoutModeSelector 的独立加粗描边。
- [x] 品牌 SVG 保留路径及颜色；应用预览、启动器图块、文件夹空态和
      引擎后备标记保留专用 CSS token，语义和尺寸例外见 DESIGN_SYSTEM。 shadcn
      控件盒尺寸不冒充图标尺寸，也不缩小原有命中区。
- [x] Chromium 141 真实生产页面：工作区/Dock、设置、笔记编辑器各自 390/768/1440
      × light/dark，共18张截图逐张审阅；横向 overflow 均0， 普通 glyph
      仅14/16/20px，笔记工具栏16px；390px真实粗指针下
      工具栏按钮均至少44px。截图：
      `/tmp/issue210-final141-{workspace,settings,editor}-{390,768,1440}-{light,dark}.png`。
- [x] 初次完整 E2E 为33 passed/55 failed，定位为 Chromium 141 不支持 SVG
      width/height 属性直接引用 CSS var，导致图标按大画布布局。 改用 CSS utility
      控制几何，并增加 guard 拒绝这类属性。
      同时覆盖非三档数字、数字字符串和条件表达式；guard模块105条通过。
      便签实页补查还发现标题/更多菜单未显式设尺寸，已补齐相同约定。
- [x] CSS 兼容性修正后完整生产 E2E 一次运行85 tests / 300 steps全部通过。
      其后仅补齐便签菜单图标，相关路径另行定向复验，不冒充相同产物的完整套件结果。
      领域基线719 tests / 51
      steps通过；前端typecheck、受影响源码lint及format通过， `check:ui`
      ownership 228 files / visual 155 files均0 violations。
- [x] 最终重建后便签编辑/格式菜单 E2E 2 tests / 8 steps通过； Chromium 141
      的390px粗指针实页所有便签工具栏图标16px、按钮44px， 编辑器就绪截图
      `/tmp/omp-sshots-15adbd083d59d0db.png`。 最终 bundle 初始静态 JS
      gzip283970 B，全部预算与依赖边界门禁通过，未提高预算。

## Issues #203 / #216 术语、冲突与便签实时连接

- [x] 在 `.worktrees/issues-203-216` 基于安静的 main 实施；开始时无打开的 PR。
      用户确认便签/笔记/应用词表，并明确选择补齐真实长笔记 AI 检索。
- [x] 用户可见长篇内容统一“笔记”，短便签保持“便签”，应用图块与网址字段分开；
      软删除统一“移至回收站”。保留内部 `documents` 标识、DOM document 术语、
      Markdown fixture、技术注释及历史规格，不做技术标识符重命名。
- [x] 便签与笔记复用 ConflictDialog、shadcn Button/Dialog/AlertDialog；
      用云端/用我的版本均二次确认，另存副本不覆盖云端，暂不处理可重开；
      便签保留复制和合并。390/768/1440 × light/dark 六组便签冲突实页
      已逐张审阅，横向 overflow 均0；修正移动端预览 flex 压缩裁切，
      内容区可滚动且 footer 保持可操作。390px 笔记 Sheet 的相同三项动作及
      确认框实页已核验，确认按钮44px、中心 hit-test 命中自身；
      `/tmp/omp-sshots-15ada87421b664af.webp` 前一张是动画中间态，
      最终静止确认框与独立工具设置画面在同次会话后续截图中复核。
- [x] 三个便签窗口仅一条 `/api/notes/events` 请求；clean 更新静默同步， dirty
      更新保留本地草稿，暂不处理/取消确认不丢数据。
      另存副本首次网络失败保留原文，成功重试保留原云端并保存完整本地 Markdown；
      最后一个窗口关闭及登出均使连接 CLOSED。管理器4条单测覆盖 noteId
      分发、退订、无效事件与账号切换隔离。
- [x] AI 三个本地开关为搜索便签/搜索笔记/搜索应用；实页单独启用搜索笔记时
      另外两项仍关闭，真实 capabilities 返回 documents=true。 SQLite 冒烟调用
      lookup_documents 返回 documentId 引用，关闭授权则明确拒绝；
      工具/stream测试覆盖账号、回收站隔离及来源持久化。 来源导航等待账号
      workspace reset 与桌面恢复完成，避免新路由打开后被重置。
- [x] 基线712 tests/51 steps通过；实现后领域套件719 tests/51 steps通过，
      focused工具/SSE测试35条通过。完整生产E2E首轮81 passed/4 failed；
      修复来源导航生命周期、旧APP反馈定位、Markdown末尾换行的测试假设，
      以及笔记编辑脚本未等待focus/dirty/saved与浏览器回调闭包问题。 Ask/UI
      feedback最终3 tests/17 steps通过；共享连接和笔记presentation 最终2
      tests通过。**这是分批通过，不是完整命令一次全绿。**

## Issues #198 / #197 / #201 / #200 / #215 / #204 / #202

- [x] 在 `.worktrees/issues-197-215` 隔离实施，按用户指定的五组拆分：
      #198、#197+#201、#200+#215、#204、#202。#197 采用推荐方案 A；
      不添加图标省略号，不修改既有 tile 几何。
- [x] 搜索旧产物因缺少 combobox role 红测，新产物完整搜索文件8 steps通过， 包含
      IME/229、active descendant、Tab、Esc、503不泄漏诊断。
      Chromium辅助技术树显示展开、选中与建议数量；本地历史在503时仍可选择。
      粗指针引擎/提交/建议均≥44px，移动 frame仍52px。
      原生桌面及读屏环境不可用，用户明确授权以 Chromium AX/ARIA/键盘替代后合并；
      **NVDA/VoiceOver 未实测**。
- [x] 首页首次提示可读、可关闭并按账号隔离；刷新后不再出现。
      Shift+F10打开应用菜单，设置与应用根工作区有常驻操作说明。 相关
      launcher、apps-interactions、workspace-shell 回归通过。
- [x] 应用与便签软删使用“移至回收站”；连续3项可逐项/批量恢复，
      10秒、hover/focus暂停、失败保留重试及回收站入口有生产交互回归。
      390px菜单打开时暂藏同一提示并暂停，关闭后恢复；模拟经过10.5秒仍保留。
      80字连续名称不超出视口。最终实页三次删除、批量恢复3项、
      菜单期间隐藏、Search Y不变及overflow=0； `/tmp/issues-201-queue-390.png`。
- [x] 标题栏可见菜单与Enter路径、Ctrl+Alt+Shift+M、左右吸附与总览快捷键通过。
      Escape只关菜单或总览，保留窗口；移动文档More菜单Esc后Sheet仍在。
      Escape单测覆盖优先级、注销后的快照、不重复派发、已处理事件与overlay订阅；
      应用入口AppWindow与Folder区分，名称不变。
- [x] Ask确定性SSE覆盖失败/中断→重试、原因清理、开始/结束及节流播报、
      工具能力说明/标签、示例问题即时填入与390px控件无溢出。
      人工SSE冒烟从消息内重试恢复正常回答；
      `/tmp/omp-sshots-15acec46e9cd8508.webp` 与
      `/tmp/omp-sshots-15acec51e3cd8509.webp`。
- [x] Documents toolbar单个Tab入口、方向键、aria-pressed、More菜单与Portal
      保存边界通过。390×360真实页面的模拟键盘视口中，toolbar Y145.20–206.20，
      选区Y327.73–343.73，均在360px内；
      `/tmp/issues-documents-short-360.png`。390×240正文露出至少24px且原生wheel
      只滚正文、不滚chrome。未实测原生软键盘，使用既有visualViewport缩小契约。
- [x] 首页Zen/Widgets十二组、Ask与Documents各六组： 390×844、768×1024、1440×900
      × light/dark实页截图逐张审阅，横向overflow均0。
      `/tmp/issues-home-{zen,widgets}-{390,768,1440}-{light,dark}.png`、
      `/tmp/issues-{ask,documents}-{390,768,1440}-{light,dark}.png`。
      首轮主题过渡截图无效，已等待实际computed color与动画结束后复采；
      文档使用隔离设备状态，避免恢复中的旧窗口抢占入口。
- [x] 首次完整生产E2E为79 tests / 295 steps通过、5 tests失败。
      应用密度入口先滚入视口后保留hit-test；删除已移除Ask
      pill的存在性/样式采样； 长名fixture按accessible name定位，修复相对has
      locator作用域。
      文档等待真实几何就绪，visiblePoint扣除实际sticky遮挡后仍要求≥24px与命中。
      五个失败文件最终均完整定向通过；最终documents/host为2 tests / 26
      steps通过。 **这是分批通过证据，不是完整命令一次全绿**。
- [x] 领域测试首轮710通过/1失败：沉浸式单测缺少新应用Provider。
      补Provider后相关20条模块通过；快捷键2条通过。
      审查发现并修复遗漏Hook/组件import、canonical丢失旧失败详情及文档根class遗漏；
      最终前端typecheck、受影响源码/测试lint与format通过。
- [x] 最终UI ownership/visual均0 violations，Guard测试102条通过， E2E
      manifest覆盖53文件；入口JS gzip283256 B，全部bundle预算与 Markdown
      lazy/consumer依赖边界门禁通过，没有提高预算。

## Issues #205 / #206 / #209 / #208 系统层级、强调色与中文排版

- [x] 按用户指定顺序先实施 #205/#206，再实施 #209/#208；所有改动在隔离
      worktree。层级与材质分离，便签持久化 rank 不改变 canvas 的全局层级。 Sheet
      内版本恢复确认与编辑菜单实页 hit-test 通过；Dialog/AlertDialog light/dark
      均为 45% 黑色 scrim、无 blur、12px radius、L3 shadow、 16px title。Ask
      Popover 使用受控模型元数据、不发送生成请求， 实测 positioner=70、12px
      radius、L2 shadow，指针命中自身。
- [x] Switch 无选中 glow，Radio 仅保留选择轮廓，Slider 使用 L1； Primary 的
      default/hover/active 使用纯色。新增 raw-z-index guard， CSS/TSX/Tailwind
      静态数值拒绝，运行时排序允许；guard 模块102项通过。 首轮类型检查发现漏登记
      RuleId，补齐后通过；UI gate 最初指出 Radio 裸选择阴影，迁移至既有选择轮廓
      Token 后 ownership/visual 均0。
- [x] 新对比度 E2E 在旧产物中明确失败：light emerald/soft=4.460、
      amber/soft=4.455。调整为 `#157e3d` / `#b25209` 后， 实际 sRGB
      对比度为4.543 / 4.511；所有18组合最小文字/surface与
      foreground/按钮状态均5.117，最小焦点对比度4.563。 检查登记于 Workspace
      suite，进入现有 CI，不放宽门槛。
- [x] 每种强调色只保留一个明暗 palette block，派生色只由主题比例定义； mono
      既有较弱比例保留。18组截图与独立探针比较：其余16组合所有
      accent/hover/active/foreground/soft/subtle/border/ring 通道差异均0；
      上述两种浅色 accent/ring 最大2/255，soft/border 最大1/255，
      hover/active/foreground/subtle 不变。证据
      `/tmp/ui-final-accent-evidence.json`，截图审阅画廊
      `/tmp/omp-sshots-15ac755b409858ec.webp`。
- [x] 默认壁纸使用 background/surface-soft，保留原 accent 混合预算； 自定义
      image/gradient、mask、filter、ambient neutral light 未改。 完整 Wallpaper
      E2E（23 steps）在最终全量运行中通过。 中文 metadata=13px、wordmark
      letter-spacing=normal；Linux CDP 实际标题字体为 Noto Sans CJK
      SC、非自定义字体。macOS/Windows 未实测；用户明确选择按 Linux
      验收后合并，并在 PR 保留该限制。
- [x] 最终设置6组及首页 Zen/Widgets 12组：390×844、768×1024、 1440×900 ×
      light/dark，实际页面截图与 overflow 检查均通过； 无选中
      glow、无横向溢出，默认背景无异色底板。截图使用已校准的 reduced-motion
      稳态，不将最初颜色过渡中的截图计为通过。 首页画廊
      `/tmp/omp-sshots-15ac75e85e5858ed.webp`， 设置与首页详情
      `/tmp/ui-final-page-evidence.json`。
- [x] 高持久化 rank=2000 的便签新增拖拽回归，在第一阶段产物中失败； 独立 canvas
      内拖拽上限 Token 修复后通过。定向对比度与完整 home-notes-order 为4 tests /
      8 steps通过。
- [x] 第一阶段完整 Workspace 为56 tests / 139 steps通过。 最终完整 E2E 首轮80
      tests / 295 steps通过、2 tests失败： masonry 在 Widgets 未发布最终 mode
      前采样；ownership 将 violet CSS token 源文本写死。前者等待已发布
      notes-only 与字体就绪，不放宽
      几何断言；后者删除实现文本断言，不改钉新字符串。两个完整文件定向 复查为2
      tests / 28 steps通过。证据分批取得，不声称完整命令一次全绿。
      首轮完整报告：
      `artifacts/e2e/full-1792407904588-c210eea0-ee80-4ad9-98fe-bf4973c96064/`。
- [x] 隔离工作区基线领域测试702 tests / 51 steps通过； 最终前端
      typecheck、相关源码/测试 lint、format、E2E manifest、 UI ownership/visual
      与 bundle budget 门禁通过。

## Issues #196 / #199 游客登录引导与注册可用性

- [x] Zen/Widgets 游客 AI 菜单与顶栏入口标明登录要求，保持可聚焦和可读屏；
      切换及 `/ai` 提交的错误共用登录链接，带原页面 query 的 next
      真实登录回跳通过。
- [x] 首页提示只在搜索后作为 secondary content，无 primary 或 autofocus；
      390×844、768×1024、1440×900 × light/dark × Zen/Widgets 十二组
      实页截图逐张审阅、横向 overflow 均0。Search frame 的 Y 与修复前一致：
      248.796875、298.796875、296.1875 CSS px。 截图
      `/tmp/guest-auth-{zen,widgets}-{390,768,1440}-{light,dark}.png`。
- [x] 注册用户名/密码规则来自共享契约，aria-describedby 进入辅助技术描述；
      blur/invalid 后有错误态。注册页六组尺寸/主题实页与 overflow 检查通过，
      截图 `/tmp/guest-auth-register-{390,768,1440}-{light,dark}.png`。
- [x] 503 注册状态为未知、不可提交、不露出误导性注册入口；重查可恢复，
      关闭状态不发注册请求；登录错误凭据反馈不变。首次红测1 passed/3 failed，
      实现后认证、游客AI及既有导航定向回归6 passed/10 steps、0 failed。
- [x] 领域测试702 passed/51 steps；前后端及CLI typecheck、lint、UI ownership
      与visual gate通过。格式检查最初发现4文件未格式化，已按Deno修正；
      E2E清单最初发现漏登认证测试，已纳入routing，与游客AI一同常规执行。
- [x] 完整 Workspace 生产回归56 passed/139 steps，E2E manifest与bundle
      gate通过。 后续移动实页暴露浮动错误条被固定定位的 shrink-to-fit 挤窄；共享
      StatusBanner 使用 max-content 且保留视口
      max-width。新移动回归旧产物失败，修复后通过， 390px
      实测横幅宽274.609375px、提示单行，截图
      `/tmp/omp-sshots-15ac35ed38de2b47.webp`。
- [x] 最终routing首轮5 passed/1 failed：游客AI测试切换外观后立即硬导航，
      中断设备偏好事务；等待已保存的目标布局后，完整游客AI与UI feedback复查 3
      passed/17 steps，UI gate仍为0 violations。认证和navigation的已通过结果
      未受影响；不把这些分批证据描述为一次完整routing通过。
- [x] PR #219 首轮CI：Workspace为55 passed/1 failed（139 steps）， Zen
      reduced-motion采样到12个running动画；Bundle两处游客入口仍匹配旧
      aria-label。迁移为AI链接的语义前缀，Zen按动画结束条件等待后仍断言零running，
      无固定sleep或重发操作。完整bundle-loading、route-style-stability、
      zen-inline-notes本地复查3 passed/8 steps，lint/format通过。
- [x] 第二轮CI Bundle及其余六项检查通过；Workspace为55 passed/1 failed （138
      steps），失败在代码滚动测试直接hover被相邻叠放便签遮挡的中心。
      改为先hover露出的标题按已有board规则置顶，再操作代码区，保留原滚动、
      scrollbar及无溢出断言；未使用force或修改产品叠层。完整home-notes-order
      本地复查3 passed/8 steps，lint/format通过。

## Issues #207 / #212 / #213 无障碍修复

- [x] 默认 Search surface 的实际 computed placeholder 为浅色
      rgb(96,105,117)/白底、深色 rgb(166,175,188)/rgb(29,33,40)， WCAG
      对比度分别5.56:1、7.29:1，opacity=1；旧浅色0.85合成为4.02:1。 Zen
      入口13px、foreground，Navigation 94%不透明材质即使分别叠在纯黑/
      纯白底上，对比度下界仍为13.63:1、11.66:1，不提升材质或阴影等级。
- [x] 无限动画盘点：global wallpaper ambient A/B、wallpaper controller 的
      drift/zoom WAAPI；游乐场 wheel/gondola、swing、orbit/bob、flag、balloon、
      cloud、idle/stroll/step/hold、puff，继续使用各自静止降级。 animate-spin
      消费者为 Account、AdminOverview、AdminPage、
      AdminSystemSettings、Trash、AppForm、EngineSelector、LogoCandidatePicker、
      DocumentEditor；全局 iteration-count=1，刷新/重试补充进行中文字，
      其余抓取、检查、处理、保存保留已有状态文字。
- [x] 首屏 gate 下 LoadingState 为 polite
      status；主题三态中文说明当前/下一状态；
      503连接错误与偏好PATCH失败使用不同文案、不泄漏原始诊断， 同步失败链接保留
      link role 并处于常驻status中。390px失败顶栏全部控件在视口内。
      全局反馈与错误恢复 E2E 最终为2 tests / 17 steps、0 failed， 包含
      reduced-motion 刷新文字与迭代次数、API偏好不变。
- [x] 独立Playwright生产smoke实测fine/hover入口36px、touch/coarse入口44px，
      对照旧入口样式时Search frame的Y均为296.1875px、无变化。
      reduced-motion稳态中running infinite与场景动画均0，
      Account真实刷新保留“刷新中…”、duration=0.00001s、iterations=1，
      减少动态效果前后完整API偏好相同。探针首轮缺Origin被403拦截；
      修正同源请求后又在降级刚提交时采到退场动画，
      等待两帧稳态后fine/touch两组通过，未修改产品以满足探针。 截图
      `/tmp/a11y-account-reduced-{fine,touch}.png`。
- [x] Zen 入口在辅助技术树中为“工作区”navigation，键盘Tab可达；
      实页焦点为2px实线rgb(29,78,216)，沿用全局focus-visible。 焦点截图
      `/tmp/omp-sshots-15ac2c8abe6502f7.webp`， 同步失败截图
      `/tmp/a11y-sync-failed-390.png`。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      十二组生产首页截图与几何检查通过，document横向overflow均0；
      逐张审阅，搜索保持一级焦点。截图
      `/tmp/a11y-{zen,widgets}-{390,768,1440}-{light,dark}.png`。
- [x] layout首轮21 tests / 50 steps通过、1 step失败：Matrix D只等待main，
      强制点击可能命中异步Host切换前的入口。改等Widgets Dock并移除force，
      完整workspace-matrix定向复查1 test / 7 steps通过；
      其余layout结果仍有效，不将分批证据描述为整条命令一次通过。
      UndoToast首轮选择器误选被面板遮挡的Zen入口，改为活动workspace-panel导航，
      完整ui-feedback复查通过，不重发操作或放宽原行为断言。
- [x] 生产build、前端/受影响E2E typecheck、lint/format、check:ui、 E2E
      manifest、bundle gate通过，ownership/visual均0 violations。 wallpaper
      E2E完整通过（1 test / 23 steps），覆盖保存、故障恢复、
      reduced-motion与所有壁纸动效；加载文字后续变更不涉及壁纸路径。

## Issue #195 / PR #194 输入与冲突保护续实现

- [x] 获取 PR 分支并合入当前 main；保留两侧 CHANGELOG 新增内容。
      搜索组合态方向键、Enter、form submit 与 Safari 风格 `keyCode=229`
      事件顺序有生产页面回归；旧产物在 ArrowUp 被抢占处失败，新产物通过。
- [x] 推送后首轮完整 Workspace CI 为55 passed / 1 failed（2 steps）：
      `workspace.test.ts` 仍使用“先更新 clean
      云端，再输入本地内容”的旧冲突时序，
      远端已被正确静默接受，因此不再产生预期冲突；后续用例被未关闭窗口遮挡。
      改为先建立 dirty 本地草稿再更新云端，保留正文、版本递增与后续保存断言。
      本地完整 `workspace.test.ts` 复查为1 passed / 8 steps、0 failed，
      lint/format 通过；不改产品行为、不重发操作、不放宽验收。
- [x] 便签订阅真实的具名 `note.updated` 失效事件，等待 mutation queue 后按版本
      GET 最新 DTO。clean 远端更新静默同步，dirty 才冲突；自己保存不误报，
      合并初值保持本地正文。无 SSE 时仍经 409 保护旧版本写入。
- [x] 关闭、Esc、切换便签、进行中保存后的新输入、IME 卸载与账号隔离有回归；
      落后版本的 canonical 草稿进入显式冲突，关闭重开保留原基线。
      实页立即关闭标题编辑后，GET 已返回最后输入及递增版本。
- [x] 文档冲突可 Esc/遮罩/暂不处理关闭并重开；两种破坏性选择使用独立
      AlertDialog，失败反馈保留本地内容并可重试。实页发现原 `z-50` 确认被 Dialog
      遮挡；改用既有 modal Token 后，确认框中心 hit-test 命中自身，
      取消/确认可点击。390px Sheet 内恢复冲突后，全部操作在视口内。
- [x] 相关 Chromium E2E 共18条分批取得通过：扩大范围首次为16 passed / 2
      failed，历史守卫、409 fallback 时序与接受云端状态修正后，失败文件定向
      复查通过；不是整条扩大范围命令一次全绿。覆盖 notes 全组、搜索、 document
      immersion 与共享 UI feedback。领域测试首轮702条通过，
      草稿恢复增补后26条模块测试定向通过；前端/受影响 E2E typecheck、 lint、生产
      build、UI ownership/visual 与 E2E manifest 门禁通过。
- [x] 入口预算复查后将两个 NoteEditor 消费者改为既有 lazy/Suspense 模式， 入口
      chunk 为327098 B，全部 bundle 门禁通过，未提高预算。 切分后的 Notes
      focus/drafts/live-editing/workspace 与 bundle-loading 最后一次定向运行9
      passed / 42 steps、0 failed；实页首屏未请求 NoteEditor
      chunk，首次打开才加载，编辑后立即关闭仍已保存。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 首页12组，
      及外观设置6组实页、焦点和边界审阅通过，document 横向 overflow 均为0。
      首轮焦点过渡采样及恢复中的工作区影响首页画面，已等待焦点动画收敛并使用
      无窗口状态的独立上下文复查受影响 Widgets 组合，不把遮挡截图算通过。 有效
      Zen 截图为 `/tmp/omp-sshots-15abd8186ae07e01.webp`、
      `15abd818dce07e02`、`15abd81a6d207e05`、`15abd81b02207e06`、
      `15abd81cf7a07e09`、`15abd81da6a07e0a`（后五项同目录与扩展名）； Widgets
      为 `/tmp/issue195-widgets-{390,768,1440}-{light,dark}.png`； 设置为
      `/tmp/omp-sshots-15abd4a7*` 至 `15abd4aae*`。
- [x] 实际 computed color 按 WCAG 计算，9种强调色、明暗主题与
      background/surface-solid/surface-soft 三种表面的最小焦点对比度分别为
      4.47:1 / 5.16:1，控件边界分别为3.25:1 / 3.80:1。 访客登录表单与代表性
      gradient 壁纸另有实页检查；任意自定义图片沿用既有例外。
      确认框截图：`/tmp/omp-sshots-15abd7b3eba07dfd.webp`；
      移动冲突/确认：`15abd7dac6607dfe`、`15abd7db30607dff`（同目录扩展名）。
- [x] 用户明确要求跳过 Safari 验证；本次不以原生 Safari IME 作为交付门禁，
      也不将 Chromium 的 composition/229 合成事件结果描述为 Safari 实测。

## Issue #191 移动 Zen 无容器便签

- [x] 仅 `<768px` Zen 使用单张透明内容预览；实际 computed background 为透明、
      border 为 0、box-shadow 为 none。删除数值分页、外框与首页管理栏，
      标题与正文在中轴默认居中排版，复用现有 Typography/Spacing/Button content
      语义，无新增 guard allowance。
- [x] `zen-inline-notes.test.ts` 生产 E2E 为 1 passed / 0 failed：
      0/1/多张、仅首页固定、稳定排序与删除回退、真实 CDP 双向滑动和纵向手势、
      键盘/辅助技术操作、原 Sheet
      编辑保存与正常关闭焦点恢复、账号隔离与立即刷新通过。
      单行标题实测高度为单行行高（24px），与正文共享 8px
      间距，不为单行预留空白第二行； 首轮确实暴露异步 IndexedDB
      写入被刷新中断；采用与 DocumentEditor 一致的同步 localStorage 当前 ID
      后，同一路径通过。无服务端字段或 note_layouts 迁移。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 的 12 组实页截图
      与 overflow 检查通过，并审阅构图；移动 Zen 的 Search、Launcher
      网格、便签、 Navigation 中轴偏差 <=1 CSS
      px。应用网格保持标准左对齐流式排列，不修改图标对齐；
      切换当前便签不改变外部控件几何。
      证据：`artifacts/e2e/evidence/zen-inline-notes-191-68a03903e410a024/`。
- [x] 同一生产 E2E 覆盖默认背景、代表性纯色/CSS gradient/真实上传图片， 150%
      正文字体、390×520 短屏、reduced-motion 与 767→768→767 编辑会话；
      草稿可保存，最后一行能滚到导航上方。跨断点卸载 opener 后遵循既有 Host
      契约恢复工作区入口，不重新创建全局焦点规则。极端自定义壁纸仍保留既有可读性例外。
- [x] 补充真实浏览器 smoke：localStorage 被 SecurityError 拒绝仍可切换； 失效 ID
      回到首项；无标题空内容显示“空白便签”；中文/英文长段落与混合 Markdown
      无交互子节点或横向溢出，标题两行/正文四行；多指与 touchCancel 不切项。
      开启游乐场后便签与导航 hit-test 均可命中，场景 pointer-events 为 none。
      最终单行短句实页（间距修正后）：`/tmp/omp-sshots-15ab1bf1cef3d0c5.webp`；
      长文实页：`/tmp/omp-sshots-15ab1a612933d0c2.webp`。
- [x] 摘要与选择等模块 22 项通过；曾由测试发现的列表勾选丢失已修复。 既有
      Launcher density/drag、默认便签避让/响应式矩阵通过； 旧 manual-order
      用例移除已废弃的移动卡片代码滚动假设后，定向复查为 1 passed / 8
      steps。上述证据分批取得，不表示完整旧命令一次通过。
- [x] 前端 `deno check web/src/main.tsx`、受影响源码/测试 lint、19 文件 fmt
      check、 生产 build、E2E manifest 与 `check:ui` 通过，ownership/visual 均 0
      violations。 Bundle gate 通过；首页预览只加载 parser，不提前请求
      editor-vendor、 NoteLivePreviewEditor 或 editor runtime。复用已锁定的
      unified/remark-parse， 没有修改 chunk 规则或放宽预算。
- [x] 浏览器脚本按实际就绪条件校准：不把 sr-only 后代自身的尺寸当成可见控件，
      等待目标主题与正文/图片 decode；不因卡片可见就假设 Host 或数据已完成切换。
      脚本问题与实际刷新竞态分别处理，未自动重发操作或改变产品来满足旧卡片断言。

## 动态游乐场裁切与松树颜色修复

- [x] 2400×1360 实页修复前 Host 仅高240px，过山车顶部与云被截断； 修复后 Host
      高336px，SVG 顶部与 Host 顶部均为1024px，完整场景可见。 不改
      Search、Dock、pointer-events 或场景层叠。
- [x] 松树 `<use>` 复用定义的树干与树冠直接引用原主题色板；
      浅色实页恢复绿色，深色保持深绿色；灌木继续消费原 CSS 类。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      共12组首页实页截图与几何采样，场景上下边界均在 Host 内、 document 横向
      overflow=0。截图位于本地 `/tmp/omp-sshots-15ab05fa*` 至
      `/tmp/omp-sshots-15ab0602*`；首轮布局选择器未匹配，校准后重新执行完整矩阵。
- [x] 生产 build、`desktop-scenes.test.ts` 的2条 E2E、前端 typecheck、
      `check:ui`、受影响 TS lint 与源码 fmt check 通过；UI ownership / visual
      guard 均0 violations。新增几何断言覆盖390、640/641、1920、2400px。
- [x] 汇总至 main 后完整领域测试690项/51 steps、前后端 typecheck、生产 build、
      场景2条 E2E 与 UI 门禁通过。PR #190 首轮 Workspace CI 为53 passed / 135
      steps、1 failed：等待泛化 AlertDialog locator 卸载时命中两个退场中的
      弹窗。改为等待所有 AlertDialog 卸载，保留最终零弹窗与草稿完整断言，
      不改产品逻辑；本地完整 Apps session 的10条 E2E、lint/fmt通过。

## Issue #182 / PR #189 动态桌面场景续实现

- [x] 合并前审查发现
      [Workspace CI](https://github.com/aawai/searcher/actions/runs/39042396911)
      为 53 passed / 1 failed：实时缩屏至 390px 时测得 540.078125px 容器、7
      列，与旧受限窗口宽度吻合。原等待只核对网格与当前 容器自洽，没有等待目标
      Host；探针确认稳定窗口为约 540px / 7 列， 稳定 390px Sheet 为 356px / 5
      列。 `apps-density.test.ts` 改为先等待对应 Sheet/Window
      与视口边界匹配，再复用 `settlePresentation`
      等待动画、字体和布局收敛。未修改产品样式、五列期望、
      命中区或排序断言；完整 focused Chromium density 验收为 1 passed / 0
      failed， lint 通过。本次只修复验收采样边界，不在 CHANGELOG
      记录内部测试调整。
- [x] 后续
      [Workspace CI](https://github.com/aawai/searcher/actions/runs/39082067504)
      中 density 已通过，但 Shell 的平板 Escape 场景失败：只等 innerWidth=800
      就发按键，没有等待受限 Host 发布。改为等待便签窗口的“窗口尺寸”控件可见，
      再从便签搜索框发送一次 Escape；保留桌面不关闭、平板关闭与 Dock 焦点
      恢复断言，不重发按键。完整 Shell Chromium 验收为 1 passed / 9 steps、 0
      failed，lint/format 通过；未修改产品代码或样式。

- [x] 三阶段范围统一保留在 PR #189 的独立 worktree，合入当前 main， 未触碰 main
      或旧 issue-182 工作区的未提交修改。
- [x] `desktop_scene` 增量迁移保留旧用户的 engine/theme/accent，旧行默认 none；
      `db:generate` 输出无 schema 差异。偏好、迁移、归一化与过山车 focused 首轮
      35 tests 通过；随后删除只断言 storage key 文本的测试， 完整领域回归为 690
      tests / 51 steps、0 failed。
- [x] 匿名键盘选择与刷新、登录云端默认覆盖匿名缓存、失败 PATCH 后顶部重试、
      新浏览器上下文读取同账号、登出恢复匿名选择与另一账号默认关闭，由真实生产
      Chromium E2E 通过。独立实页复现旧产物保存失败只有 `!` 无重试入口；
      新产物重试后 API 返回 amusement-park。
- [x] 生命周期函数回归先暴露 fixture 的多元素 strict selector 错误，修正后确认
      CSS 暂停失败：Host 已 paused，但 flag computed play-state 仍为 running。
      经用户确认，只提高 Host 暂停/reduced-motion 选择器优先级，
      不修改正常场景构图、色板或动画参数。
- [x] 最终生产产物的独立 Chromium 141 smoke：四十次首页/设置往返，稳态首页只有 1
      个待执行 RAF、3 个 document visibility listeners，离页均回到 0/0；
      reduced-motion 下 RAF=0、场景 CSS animations=0，恢复后 RAF=1。 强制 GC
      后最后十次挂载堆占用在 8.09–8.40 MB 波动，末次 8.31 MB；
      此短时样本不等价于长期无泄漏证明。首次采样错误假设 WallpaperSurface
      不随首页卸载；扩展内存采样时又碰到瞬时 layout RAF，修正为等待可观察的 RAF
      稳态后采样，不放宽离页零 RAF 契约。
- [x] 经用户确认修正设置场景选项的三条 Rule M：只增加 RadioGroup/Item slot
      compound selector；`check:ui` ownership 220 / visual 152 files、 0
      violations，不调整 baseline/allowlist。
- [x] 1440/1024/768/390/360 × light/dark × Zen/Widgets，20 组首页截图， 均零
      document 横向 overflow；桌面现有设施及移动过山车/摩天轮可辨认。
      该矩阵为暂停规则修正前正常运行态；修正不改变正常构图， 修正后的
      reduced-motion 静态实页另行确认。
- [x] 场景开启/关闭，1440×900 的 Search、Bento、Dock、Apps window 的
      x/y/width/height 完全一致；Search 为 360/296.1875/720/56。 开启场景时八向
      resize 每方向按预期增长 12px，最大化/还原、左 Snap、 Dock、未保存 Dialog
      的继续编辑/放弃操作可用。768 Zen Panel 输入值在 390 Sheet
      切换后保留，Sheet 可继续输入；图片上传 Toast 与设置卡片实页可用。
- [x] 默认背景矩阵、真实上传图片的 dark 场景、CSS gradient 的 light 场景均实页
      审阅；未修改 WallpaperMotionController、全局 modal z-index 或 Dock 几何。
- [x] Chromium 150 headless / Linux x64 / 8 logical CPUs / 1440×900、DPR=1， 15s
      前台采样 899 帧：最终场景 RAF callback 平均 1.487ms，
      p95=2.6ms、p99=3.4ms、max=4.7ms；帧间隔平均 16.666ms、p99=16.8ms。
      初次有效采样发现 SVG 读写交错；保持轨道/速度/位姿计算不变，复用字符串
      buffer，先读完三车位姿再统一写 transform；15s trace 的 Layout 事件由 3616
      降至 1806，优化前 callback 平均 1.816ms。 关闭时应用 RAF
      callbacks=0，帧间隔同样约 16.666ms； 另一次 1Hz 采样因联系图 tab
      抢前台而作废。 保留 CPU profile 与 rendering
      trace；结果含采样/分析器开销。
- [x] 77.8s / 30 FPS / 1440×900 录屏覆盖摩天轮 72s 周期与小车/火车/摆船运动。
      云层最长 260s，另以 Web Animations API 采样 0/25/50/75/99.99% 相位：
      三朵云在循环首尾均完整位于视口外，保存五组截图与实际 progress/rect JSON，
      不把 seek 分段证据描述为 260s 实时录屏。
- [x] 主线与最终 PR 的独立生产构建对照（gzip level 9）：initial JS 285111→286033
      B；entry raw 344786→347331 B； 场景独立 JS 19715 B raw / 5616 B gzip，CSS
      6535 / 1542 B， SVG 内嵌在该 JS，无额外图片或字体资产。最终 `check:bundle`
      通过， 未提高任何 budget。
- [x] 完整 Chromium E2E 首轮 72 passed / 290 steps、2 failed / 1 step：
      导航测试硬编码三级标题清单，新增场景分组后失效；删除该静态文案断言，
      不重写期望清单，保留路由、刷新和返回行为。 另一失败是偏好 GET
      成功误清认证连接错误；改为独立 auth 错误与 syncFailed
      派生全局提示，偏好读写不能清除认证错误。 同时保留既有匿名 legacy cache
      清理，不改缓存迁移约定。 最终导航、Zen banner/Panel、场景、Apps
      session、壁纸、bundle、 route style、UI feedback 八文件定向复查：19 passed
      / 57 steps、 0
      failed。其余完整套件通过项未重复运行；不声称完整命令一次全通过。
      随后仅调整小车同帧读写顺序；最终场景与 bundle-loading 再验收为 3 passed /
      5 steps、0 failed，原轨道/速度纯模型未变。
- [x] 前后端与新增/修改 E2E typecheck、源码 lint 分批通过； 异步场景 JS 被真实
      abort 时局部边界回退，搜索仍可输入， uncaught page errors=0。
- [x] Chromium 141、1440×900、新浏览器上下文、无 IndexedDB/cache、 保留登录
      Cookie，每档三次交替采样：从导航到 Widgets 实际发布且搜索完成
      fill/readback，关闭场景 161–234ms、开启 169–173ms。
      与完整集成套件并行运行，不是标准化 TTI，也不足以声称场景使首屏更快。
      初次未等待 layout 发布时输入丢失；确定性阻塞 preferences GET 的对照确认
      main 与本 PR 均存在云端 style hydrate 重挂载 Search 的旧行为， 本 PR
      未扩大范围改动它，不将初始 shell 可见当作最终交互就绪。
- [ ] 用户暂缓场景视觉调整：旋转木马仍为各自往返而非统一匀速旋转；
      装饰建筑/设施灯泡存在，但未补建筑间灯串。不得将此状态宣称为 #182
      三阶段全部完成或关闭总 issue。
- [x] 用户明确仅要求 Chromium，本次按此范围验收。

本次原始截图、矩形、运动录屏、生命周期和 bundle JSON、E2E 报告保留于本机
`/tmp/pr189-evidence/`；CPU profile/trace 路径记录在其 `perf.json`。

## Issue #180 Zen 默认固定便签避让 Search

- [x] 在隔离 worktree、`origin/main@b055c8d` 基线，两个展开固定便签的 API x/y
      均为 null；focused 真点击 submit 被便签正文拦截而超时。 首轮夹具误依赖 GET
      顺序，修正后才取得真实遮挡 Red，不将夹具失败算产品证据。
- [x] `SearchHome` 复用现有 `useDesktopGeometry.safeRect`，`ZenLayout` 测量
      Search bounds；纯 placement 只处理未保存 desktop 坐标的便签。
      Markdown、字体与尺寸就绪后发布位置，空间不足复用 flow；不新增 viewport
      owner， 不改搜索纵向 anchor 或全局 z-index。Design Lab 明确使用 flow
      预览同一组件。
- [x] 最终 focused 在 1440×900、1024×768 输入搜索词、普通 click submit，
      都到达受控本地搜索目标；首屏、字体就绪、实时 resize、light/dark 均覆盖。
      已保存 x=700/y=420 不自动重排，默认置顶/折叠/展开保持 null 坐标，
      实际拖动建立坐标并经 reload 保留，折叠与第二账号不覆盖该坐标。
- [x] 320/390/768/960 flow 与 961×390 短屏回流通过；额外发现滚动释放 Search
      占位会令 flow 移回 canvas 并重置页面滚动。新增回归先 Red，修复后普通滚轮
      保持滚动；主代理另在 1440×450 实页观察 scrollY=252 连续六帧不变。
      exclusion 保留实测 Search 当前与未滚动占位的并集，无硬编码 Search Y。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      共十二组实际截图与搜索 hit-testing、零横向 overflow；主代理逐张审阅。
      1440×900 Zen Search 修复前后均为 x=360/y=296.1875/width=720/height=56。
- [x] 领域测试 675 tests / 51 steps、纯 placement 2 tests、UI Guard regression
      100 tests 通过；前后端 typecheck、7 files lint、格式化与 `check:ui` 通过，
      ownership 202 files / visual 141 files 均为 0 violations。
- [x] 完整生产 E2E 首轮 71 passed / 291 steps、1 failed：新增快速折叠/展开夹具
      未等待重排和 hover 操作区就绪。改用真实 placement-ready 与 hover
      完成条件， 不 force、不重发点击；最终
      home-notes-order、home-notes-persistence、bento、 workspace、ui-ownership
      共 7 tests / 48 steps 全通过，包含滚动修复。
      不将分批结果描述为完整命令一次通过。其他完整套件成功项覆盖导航/草稿保护、
      canonical/v4/Dock、编辑器/版本/分页、壁纸/reduced-motion、懒加载与身份隔离。
- [x] 入口预算首轮因同步引入 placement 超出 350000 B：entry=351942 B。
      仅存在固定便签时用现有 React lazy / Suspense 挂载该模块，最终 entry=344786
      B， initial graph=285111 B gzip，bundle 全部门禁通过；不提高阈值。
      最终按需构建上的
      home-notes-order、home-notes-persistence、bundle-loading、
      markdown-editor-loading、route-style-stability 共 7 tests / 27 steps
      通过； 新版十二组矩阵与真实搜索目标一并复查，匿名/Apps 不加载编辑器
      runtime。
- [x] CHANGELOG、Design System 同步；无 schema/storage key/v4 迁移，
      不持久化覆盖默认或已有用户坐标，可独立回滚 bounds props 与 placement。
      原始 Red、最终矩阵、分批 JUnit 和完整运行 timing 见
      [证据分支](https://github.com/aawai/searcher/tree/evidence/issue-180/evidence/issue-180)。

## Issue #181 Widgets 短屏初次打开工作区

- [x] 基线 `6a34b75`：844×390 Widgets 点击 Apps 后 windows=0、panels=0； focused
      regression 在成功登录后等待真实 `.apps-workspace-root` 超时。 修复后
      `#181` focused 7 tests 通过，844×390 / 900×200 的 Apps、Notes、 Documents
      初开均操作真实搜索框并关闭，767/768、1023/1024 独立空桌面通过。
- [x] 900×200 正式生产构建实页：滚动 Apps 表单填写 URL/名称、提交后 API
      返回持久化条目；Notes 标题保存后返回关闭；Documents 创建、编辑标题与正文、
      返回关闭，API 返回实际保存内容。未把等待保存前的导航当作保存完成。
- [x] 844×500 / 900×700 恢复仅一个 Apps window，保留 create route、草稿与
      输入焦点；首轮暴露恢复后焦点丢失，修复交接顺序后通过。
- [x] 沿用 `useDesktopGeometry`、Workspace Host intent、已有窗口 presentation；
      仅缺少窗口时启用共享 Surface，受限 Surface 整体滚动，无新 viewport owner，
      无 storage schema/key 迁移。focused 验证不可用几何不创建 canonical v4
      frame； 既有 free-window shrink/grow/pagehide 基线通过。
- [x] 短屏刷新恢复专项先 Red 后 Green：实际拖动的非默认窗口在900×200刷新后打开，
      恢复1440×900保持原frame与完整v4 payload。恢复前等待IndexedDB读取完成，
      不以新建默认窗口抢占旧canonical。已有Apps窗口hydrate时，Notes查询、焦点、
      选区(1,3)和单实例保留；实页与独立回归均通过。语义aria-label优先于 Base
      UI自动生成id；hydrate chrome不抢占fallback焦点。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 共 12 组
      Home/Apps 实页截图，均一个 Apps 实例、document 横向 overflow=0； 本地截图
      `/tmp/issue181-evidence/`。首轮脚本误点残留表单路由，清除后改用明确 Host
      selector 重新取得完整矩阵，不把脚本失败记为产品通过。
- [x] 最终 `deno task test`：673 passed / 51 steps / 0 failed；
      typecheck、lint（6 files）、fmt（10 files）、`deno task check:ui`
      通过，两类 UI Guard 均 0 violations。
- [x] 完整生产 E2E 首轮为 69 passed / 291 steps、1 failed：Documents
      初始受限长文的领域 scroll area 被自然高度撑开。改为 Shell 显式
      `bodyLayout="editor"`、有界最小 Body 后，最终定向运行
      `deno test -A web/e2e/document-immersion.test.ts web/e2e/desktop-presentation.test.ts`
      为 12 passed / 0 failed；未宣称完整命令一次通过。 复查包含桌面
      free/constrained、short reload、Notes 实际标题提交、Documents
      长文滚轮和恢复。实页 scroll area 为 240 / 2414px，滚轮后 scrollTop=500，
      收起入口可达；普通 Panel/Sheet 的样式不消费新增 editor
      标记，矩阵证据仍有效。 中途取消的旧产物运行不计为通过。

## Issue #179 Zen Panel 顶部连接提示避让

- [x] 仅修复 C4；复用 `useDesktopGeometry` 的 chrome measurement， `SearchHome`
      经 Shell 将 `chromeBottom` 传到 Surface，Panel 顶部取 原语义 inset
      与实测下缘最大值。不新增 measurement / visualViewport owner，不提高 banner
      z-index，不改 Sheet 或受限窗口 inset 语义。
- [x] 基线 `8e50419`：初始 `/api/auth/me` abort，恢复网络后真实登录， 768×1024
      打开 Apps，Retry 中心命中 `h2.workspace-title`，focused regression
      实际失败。修复后相同路径普通 click 发出成功的 auth/me 请求、 清除
      banner，Panel 回到 64px；键盘打开、关闭焦点恢复与内容内部滚动通过。
- [x] 首次 green 的 36 个 Apps 恰好填满 body，滚动夹具断言失败 （clientHeight =
      scrollHeight = 756）；改用 60 个 Apps 建立真实溢出后 focused 为 1 passed /
      0 failed。未放宽 Retry、几何或滚动契约。
- [x] 独立真实浏览器按字体就绪、两帧与 reduced-motion 稳定采样； 修复前后
      1440×900 Zen / Widgets 的 hero y=64、height=288.1875， Search
      x=360、y=296.1875、width=720、height=56 完全一致； 768×1024 无 banner 的
      Panel x=352、y=64、width=400、height=944 不变。
- [x] 完整领域测试 673 tests / 51 steps、UI Guard regression 100 tests
      均通过；前后端 typecheck、生产 build 与 bundle budget 通过。 UI Guard
      首轮指出新增 runtime CSS variable 未声明；补充局部默认值与 Surface
      精确几何例外后，ownership 201 / visual 141 文件均为 0 violations。
- [x] 完整生产 E2E 首轮为 62 passed / 290 steps、1 failed / 1 step （46
      文件）；失败为移动 Sheet Undo 错误提示 30s 超时。原断言未修改，
      最终分支与独立 `8e50419` baseline 的模块对照各为 1 test / 6 steps
      通过；不将分批结果描述为完整命令一次通过。其余搜索、导航/未保存保护、
      canonical/v4/Dock、编辑器/版本/分页、壁纸、懒加载和身份隔离在首轮通过。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 的 12 组 Home /
      Apps 实页截图；另验收 900、767/768、1023/1024， 320/360/375/390/414/430
      两布局 Apps 网格与 768×560 内部滚轮， 共 33
      个场景分批取得通过证据。首轮三处脚本失败为错误等待成功网格及 错将 banner
      正常流平移视作锚点回归；修正后复查 Apps Retry、Zen 与 Widgets 真实 auth/me
      恢复路径。Widgets 复查再次修正误等 Panel
      header，最后独立场景通过。保留全部失败报告，不更改产品契约。
- [x] 真实 banner 高 53px 时，Zen Panel top=117→64；Search 随提示平移
      53px，水平锚点不变；Widgets v4 canonical frame 前后完全一致。 主代理另验收
      900×900 与 900×360：61px banner 下 Panel top=125， Retry
      中心可命中；短屏底部创建、顶部返回/关闭普通 click 可达， Retry 清除后
      top=64。表单仅 `.app-dialog-body` 滚动，返回/关闭后 等待实际 opener
      focus，document scrollY=0。
- [x] 最终变更源码 lint、10 个文件 fmt check 与 E2E 权威清单检查通过； 清单覆盖
      46 文件。原始红绿报告、分批矩阵 JSON、截图和完整门禁 JUnit/timing 保存在
      [独立证据分支](https://github.com/aawai/searcher/tree/evidence/issue-179/evidence/issue-179)，
      不将媒体合并到 main。
- [x] Design System 同步共享 inset、唯一 measurement owner 与独立 Sheet /
      constrained 契约；CHANGELOG 仅记录最终用户行为。 无 storage key、数据库或
      v4 payload 变化，可独立回滚 prop / CSS 消费， 不迁移或覆盖用户数据。

## Issue #178 账号便签草稿与退出提醒

- [x] 仅修复 C5 的 key/owner 不一致；编辑器、退出发现和清理统一消费
      `features/notes/local-drafts.ts`。不重建 Workspace/Window，不改 CSS、
      Token、v4 布局、API 或数据库 schema；保留原退出确认组件与交互文案。
- [x] 基线 `cc1cf90` focused regression 在等待“有未同步的便签草稿”时超时；
      此前已确认本地提交、PATCH 0、服务端标题/正文/版本未变。修复后同条
      regression 通过，真实浏览器再次观察到对应 canonical 草稿与退出提醒。
- [x] 领域与原存储 focused 5 tests 通过；完整 `deno task test` 为 673 tests / 51
      steps，UI Guard regression 为 100 tests，均 0 failed。其后仅将 IDB mock
      控制状态收进 fixture 实例，受影响 notes/local/desktop persistence/ desktop
      hook 的 40 tests 通过；不新增跨调用测试 global。
- [x] 新增 E2E 首轮 3 passed / 1 failed；失败源于 epoch 脚本使用完整文档导航，
      登录 cookie 仍有效导致认证页重定向，且重建 AppState 无法检验同 realm
      的旧结果保护。改为真实 SPA 登录 Link 后，单独 epoch 场景通过；
      不将分批结果描述为首次完整命令通过。真实 IDB transaction abort 场景已确认
      legacy 完整保留、canonical 未提交、编辑暂停，重试成功恢复。
- [x] 无草稿直接退出、他人 canonical 不警告、他人 legacy 不读取/迁移、 当前
      owner legacy 提醒与恢复、网络检查失败后重试、取消保留、确认后重登、
      正常同步清 key 均由新生产 E2E 覆盖。epoch 场景在同一 document 中挂起
      检查，换账号后释放响应，不出现旧提示、不发注销新会话请求。
- [x] 最终
      `E2E_REPORT_DIR=artifacts/issue-178/full DENO_JOBS=2 deno task test:e2e:full --parallel`
      完整执行一次为 62 passed / 291 steps / 0 failed（45 文件，11m0s）；
      包含最终四条草稿 E2E、notes-focus/navigation、搜索锚点、移动 Apps、
      Workspace 未保存保护、桌面几何/v4/Dock、编辑器版本/撤销/滚动、 Documents
      分页、壁纸/reduced-motion、路由懒加载与账号隔离。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 的 12
      组退出确认与 12 组实际编辑器 Host 截图；Sheet、Zen Panel、Widgets
      constrained/free Desktop 均只挂载一个编辑器，恢复同账号标题，无横向溢出。
- [x] 另验收 320×640、430×932、767×900、1023×768、1024×768、390×240、
      1440×240、900×200 × 两主题/布局，合计 44 组退出确认；popup 均在 viewport
      内，无横向溢出，取消按钮可真实滚动点击。短屏使用 viewport 截图，避免
      full-page 捕获扩大画布误表视口。字体就绪、两帧布局后采样； 1440px hero
      y=64 / height=288.1875 与基线一致。
- [x] `deno check web/src/main.tsx src/main.ts`、生产 build、bundle budget
      通过；`check:ui` 实扫 ownership 201 / visual 141 文件，
      violations/allowances 为 0。新增验收文件已注册权威清单，`check:e2e` 覆盖
      45 个文件。
- [x] README 与 Markdown Editor 同步迁移、账号/epoch、失败重试和降级契约；
      CHANGELOG 仅记录最终行为。实页实际备份原 key/完整值、鉴权验证归属后 复制
      canonical 到旧 key、等待 commit 并重读，确认完整值一致且 canonical
      保留。未部署旧版服务，不将 key 转换验证扩大为完整旧版运行验收。
- [x] 最终变更源码 lint、文档/源码 fmt check 通过；原始 red 结果、56 张浏览器
      截图、逐场景几何 JSON、降级备份与完整 E2E JUnit/timing/stdout 存于
      [独立证据分支](https://github.com/aawai/searcher/tree/evidence/issue-178/evidence/issue-178)，
      媒体不合并到 main。

## Issue #177 Widgets 首页状态反馈

- [x] 本次仅跟踪首页状态反馈；撤回旧 issue 中未经证实的 feature `:root` 污染、
      fallback 色差与任意 CSS 引入序需清理的归因，不搭载 CSS / Token 全局重构。
- [x] 复用 Search archetype、Bento 与 compact semantic 状态组件。 `SearchHome`
      继续拥有领域 load state、账号缓存与 reload；无新重试引擎。
      同账号重试保留可用内容，账号切换清空并按 owner 隔离渲染。
- [x] baseline `910e25b` 的隔离首页 focused 回归在 Notes pending 缺少
      `role=status` 时失败；修复后 1 test / 10 steps 通过。覆盖无缓存 Notes
      503、 pending/503 不误报空、缓存保留、Apps 503 与 network abort
      区分、真实重试、 两域 ready-empty，以及 Desktop / constrained / Sheet
      的单一 live owner。
- [x] `deno task test`：672 tests / 51 steps；UI guard tests：100 passed。
      完整生产 `test:e2e:full` 首轮为 57 passed / 289 steps、1 failed / 2 failed
      steps（Bento compact 高度）。修复重复空态标题后，Bento + 完整 ui-feedback
      为 3 passed / 36 steps；未放宽 `<120px`
      断言，不将分批结果描述为完整命令一次通过。
      其余首轮兼容场景已通过，最终改动只影响首页空态组合，既有带标题 consumer
      不变。
- [x] 最终生产 build、前后端及受影响 E2E typecheck、6 个 TS/TSX 文件 lint、 10
      个变更文件 fmt check、bundle budget 均通过；`check:ui` 实扫 200 / 141
      文件，violations/allowances 均为 0。
- [x] 最终另验收 Apps-only、Notes-only、both-empty × 390/768/1440 × light/dark
      共 18 组实页，无横向溢出；1440px 两主题 compact Notes / Apps 高度分别为
      117.96875 / 95.9375px。空态只省略重复标题，原引导说明仍可阅读。
- [x] 独立真实浏览器复核 Notes pending→503→重试：无假空态，503 保留 3 条便签、
      显示 alert，重试成功清除错误。Apps 真实网络 abort 保留 9 个入口并显示离线
      warning，重试真实请求后恢复。没有把 HTTP 503 改成离线缓存策略。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 的 12
      组实页；另含 320×640、430×932、767×900、1023×768、1024×768、
      390×240、1440×240、900×200，共 44 组稳定截图/几何记录， document 与 Bento
      卡片横向溢出均为 0。另验收 6 组 Widgets 错误/离线组合。
      字体就绪和两帧布局后采样；不以首次可见作为布局稳定条件。
- [x] 另以相同固定尺寸/主题/布局打开 Notes Workspace，12 组实际 Host 截图覆盖
      Sheet、Zen Panel、Widgets constrained 与 free Desktop； 页面横向溢出均为
      0。Apps 离线缓存→pending 重试→HTTP 503 的独立实页 在两种中间状态均保留 9
      个可打开入口，之后成功重试清除错误。
- [x] 390×240、1440×240 与 900×200 的首页错误重试经真实滚动、中心 hit-test 和
      click 验证可达，均发起新请求。此结论不扩大为极矮 Workspace
      的全部操作通过。 1440×900 的 hero y=64 / height=288.1875 与 baseline
      完全一致。
- [x] 不新增 CSS/Token；仅删除已被 semantic EmptyState 替代的私有空态文字规则。
      API、cache key、数据库与 v4 布局协议不变；可独立回滚首页 render、
      状态传入与 semantic 组合，无数据迁移或兼容 shim。
- [x] 原始红测输出、baseline/final 截图与逐场景 JSON 保存于
      [evidence/issue-177](https://github.com/aawai/searcher/tree/evidence/issue-177/evidence/issue-177)，
      媒体不合并至 main。

## Issue #174 Apps 真实 SPA 离开保护

- [x] 撤回“Zen edge 切换丢草稿”的归因。main `0c8d36d` 实页的 edge Notes→Apps
      与关闭后取消均保留字段；真实 Settings Link 无确认且返回后草稿为空。
      focused regression 修复前等待 alertdialog 超时，修复后通过。
- [x] Data router 保留 AppState / Layout / descendant Routes 与懒加载边界。
      AppSession 生命周期只有一个 blocker，路由与 Workspace 复用原确认 owner；
      无 Link 特判、history patch、第二套 Router 或跨刷新草稿存储。
- [x] 最终生产构建的 Apps session E2E：10 passed / 0 failed。 覆盖 Settings
      Link、真实 Ask 程序化跳转、Back/Forward、clean、取消/放弃、 edge/Presenter
      保留、关闭取消、并发确认、beforeunload 与提交中拒绝离开。 URL 变化不是
      render 完成条件；目标页渲染与旧 dialog/form 卸载分别等待。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 的 12
      组稳定几何实页截图：document 横向溢出为 0，Footer 均在 viewport 内。
      另验收 767/768、1023/1024 断点与 390×240 短屏。无新增 CSS/token，
      不修改窗口 canonical geometry、v4 数据或账号/匿名缓存。
- [x] `deno task test`：672 tests / 51 steps。完整生产 E2E 首轮为 54 passed /
      280 steps，3 failed / 1 failed step；Apps density、Documents
      selection、Workspace keyboard 三个失败文件在独立 baseline
      和最终分支串行比较 均为 3 passed / 9
      steps，原断言未修改。分批结果不描述为完整命令一次通过。
- [x] 最终 build、bundle budget、前端与新增 E2E typecheck、变更文件 fmt/lint
      通过；`check:ui` 实扫 ownership 200 / visual 141 文件，均为 0 violations。
      路由 canonical/404、lazy CSS/bundle、搜索锚点、编辑器/分页、壁纸与隔离的
      既有生产用例已在上述完整执行中覆盖。
- [x] 独立 router seam 提交与 blocker cutover 可一起回滚；无 schema、storage
      key、持久数据迁移或兼容 shim。媒体及原始失败报告存于
      [evidence/issue-174](https://github.com/aawai/searcher/tree/evidence/issue-174/evidence/issue-174)。
- [ ] 极短屏既有边界不记为通过：Widgets 900×200 的 Apps 无法打开、 1024×200
      fallback 的 Cancel 被 hero 覆盖，独立 `0c8d36d` baseline
      实页同样复现。本次不搭载 viewport/Window 重建。Zen 900×200 的 Cancel
      可经键盘 focus 滚入可见区域。详见证据报告。

## Issue #163 Canonical / Presentation Geometry

- [x] M0 真实 Chromium 红测：1440×900 将窗口放到 x=540，缩到 1024×768 后
      x=264，恢复 1440 后旧实现仍为 x=264；focused E2E 同样失败。
- [x] 新实现实页：canonical `{x:540,y:160,width:760,height:663}` 缩屏时显示
      `{x:264,y:105,width:760,height:663}`，恢复视口后原 frame 完整恢复。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Widgets/Zen 的 12
      组实页截图： Widgets 分别为 Sheet、constrained 和 free Desktop，Zen 为
      Sheet/Panel； document 横向 overflow 均为 0。900×200 fallback
      实页的窗口高度为 136px， 标题栏与收起按钮可见。
- [x] 复用现有窗口与测量 owner；不新增视觉 token、依赖、编辑器树或 Overview
      geometry preview。basis 仅属于 runtime，v4 payload 与 storage key
      保持不变。
- [x] focused Chromium 4 cases：shrink/grow + focus/pagehide 的 v4 frame 保持；
      1024 下 MOVE/RESIZE 建立新 intent；900 下工作区切换、Dock、preset、
      收起/重开不污染自由桌面；Snap/最大化/Restore/拖出 grab ratio 保持。 首帧
      ratio 期望 0.68、实测 0.67999998。
- [x] 另以真实鼠标将 normal width 设为 1200px，最大化后缩到 1024px 再拖出： 首个
      normal preview 与最终 commit 的宽度均为 1024px，无超屏首帧； 20% grab
      的实测 ratio 为 0.205859375（边界 clamp 后）。
- [x] 审查补强 own-basis 原始比例与边界校验；被 reducer
      拒绝的操作不授权覆盖旧缓存。 对应回归与完整单测通过。
- [x] 受限收起保留 mounted state 后，关闭等待改为用户可见的 hidden；
      不删除键盘/焦点断言。完整回归发现 Dock 焦点未恢复，修正 visibility
      判断后， focused shell 的 9 steps 与最终完整 Workspace 均通过。
- [x] 最终 `deno task test`：672 tests / 51 steps；
      `deno task test:workspace`：29 tests / 135 steps；
      `deno task test:documents`：6 tests / 65 steps，均 0 failed。
      build、check:bundle、前端 TypeScript check、fmt/lint 全部通过； UI Guard
      扫描 200 / 141 文件，violations/allowances 均为 0。
- [x] 按用户授权最小修复既有 lint 阻断，并归一两个静态文件格式；
      不改变搜索业务与本地 IO 的 Promise 合同。

## Issue #157 Widgets 拖拽边界

- [x] 复用 DesktopWindow / WindowChrome；不改共享 geometry、state、persistence、
      Canvas、ResizeHandles、Dock、布局 schema 或编辑器。实施基线为 `b30fee8`。
- [x] M0 的 1440×900 / 1024×768 × 四边真实 Chromium 手势：越界后反向 5/10px
      不移动窗口，但 capture 与应用 active 保持；不将鼠标离开标题栏等同失焦。
      首次 Playwright 红测在八个边界场景均观察到死区。
- [x] M1 由实证触发：真实 pointerId 1 被注入的 pointercancel 99 错误终止；
      safeRect-only gap 测量变化也曾释放 capture。修复后非匹配事件不驱动手势，
      默认摆放变化不取消 normal drag，真实 Header/Dock/viewport 变化仍安全取消。
      另实页验证 capture 失败不启动手势、外部原生失捕保存最后有效 frame、
      拖拽期间关闭再由 Dock 打开无 ghost 状态。
- [x] M2 四边反向 5px 即合法内移 5px；连续往返、斜向裁剪、单个大步长事件与 rAF
      前释放、Snap/最大化恢复、4px 阈值及五类窗口均由真实交互保护。 pointermove
      没有 API 或布局写入；合法 FOCUS 与 release 保存单独统计。
- [x] M3 唯一装饰层绝对定位、aria-hidden、pointer-events:none，只有内侧 accent
      边框的 140ms opacity pulse；不改变权威 transform、尺寸、scroll geometry
      或命中。 同墙持续施力及沿墙移动不重触发；反向退出再碰撞可触发，Snap
      preview 优先。 reduced-motion 无运行中的动画，release/cancel/unmount
      清理状态。
- [x] 390×844 / 768×1024 / 1024×768 / 1440×900 × light/dark × Widgets/Zen 的 16
      组实页截图和几何数据；另以字体就绪、两帧完成条件复查固定尺寸的六组 Widgets
      实页，768px 两种主题的真实拖动均保持 constrained frame 不变。 15.5 秒
      H.264 录屏覆盖普通拖动、边界、回转与 Snap。
- [x] 最终完整 `deno task test`：663 tests / 51 steps；
      `deno task test:workspace`：25 tests / 135 steps；
      `deno task test:documents`：6 tests / 65 steps；均 0 failed。
      build、check:bundle、TypeScript check 通过；check:ui 实扫 200 / 141 文件，
      violations 与 allowances 均为 0。
- [x] 验收校准保留失败证据：shell 等待菜单键盘焦点交接，并以稳定 hover +
      hit-test 确认真实标题栏而非 resize handle；Notes
      历史用例曾超时，单独及最终完整回归 均通过，未修改 Notes
      实现或测试。碰撞沿墙重武装另有修复前失败/修复后通过证据。
- [x] 本次变更文件 fmt/lint 通过。全仓库已有格式失败在
      `WORKSPACE_FINAL_REFACTOR_PLAN.md`、`scripts/ui-guard/baseline.json`；
      lint 的 9 项失败在 `web/src/lib/{api,local}.ts` 与
      `src/features/search/{search.route.ts,search.route.test.ts,service.ts}`，
      不扩展本 Issue 修复这些文件。
- [x] [独立证据分支](https://github.com/aawai/searcher/tree/evidence/issue-157/evidence/issue-157)
      包含捕获/激活/frame trace、截图、录屏、环境及实际失败日志，不合并媒体至
      main。
- [x] Chromium touch emulation 在右边界发出 pointercancel / lostpointercapture
      并安全结束。

## Issue #158 Zen 页面模式稳定性

- [x] 复用 Documents Editor archetype；唯一样式改动为页面模式正文 scroll owner
      的 `scrollbar-gutter: stable`。不修改 Workspace 外层
      overflow、Notes、Apps、 WindowChrome、分页引擎、保存流程或选区恢复策略。
- [x] 用户录屏指出单页/高视口的滚动条显隐边界。经典滚动条 Chromium `1024×1552`
      修复前：可用宽度 851↔866px、scale 1↔0.991558， 2 秒 idle 120 次
      reflow；独立 Red Test 提交 `b7965ca`。
- [x] 最小修复后 `1024×1548/1552/1556` focused 浏览器测试全部收敛， 未禁用
      ResizeObserver、字体/图片重排或合法 dirty 保存。
- [x] 四个正常视口和 `1440×240` / `390×240` 短屏实际可访问 header、返回/关闭、
      格式工具栏、首末页及源码 textarea。是否启用 chrome 兜底按实际 header +
      toolbar + 240px 正文最低高度判断，不按 viewport 高度硬编码。 正文 Wheel
      不同时移动 chrome；Library 与 Apps 列表仍能滚动。
- [x] 独立浏览器契约覆盖 20 次连续/页面切换、Editor DOM 身份、选区、undo/redo、
      composition defer、晚加载图片/字体、纸张/视口变化及 clean/dirty/in-flight
      保存。 CompositionEvent 模拟不冒充原生 OS IME。
- [x] 实页额外 9 秒 / 542 帧采样：0 reflow、宽度 851px、zoom 0.991558 恒定。
      十次打开/关闭，在退出动画结束并 GC 后 DOM nodes 恒为 112、 event listeners
      恒为 173。初版诊断未释放 `waitForSelector` 返回的
      ElementHandle，产生采样工具自身的保留；改用不保留 DOM 的就绪条件后复测。
      合成文档对照录屏先以测试 CSS 恢复旧 gutter，再移除覆盖验证最终样式；
      不发布用户录屏或个人正文。
- [x] `deno task test`：663 tests / 51 steps；完整 Workspace：23 tests / 135
      steps。 `check:ui` ownership 实扫 200、visual 实扫 141，violations /
      allowances 为 0； `check:bundle`、`deno check src/main.ts web/src/App.tsx`
      及变更文件 fmt/lint 通过。
- [x] 全仓库 `deno fmt --check` 失败于未修改的
      `WORKSPACE_FINAL_REFACTOR_PLAN.md` 与
      `scripts/ui-guard/baseline.json`；`deno lint` 有 9 项既有错误，位于
      `web/src/lib/{api,local}.ts` 和
      `src/features/search/{search.route.ts,search.route.test.ts,service.ts}`。
      已与 Red commit 比较确认这些文件未改动，不把局部门禁通过描述为全仓库通过。
- [x] 开发构建经典滚动条 `1024×1548/1552/1556` × light/dark 的 6 个 focused
      场景通过。
- [x] 最终完整 `deno task test:documents`：6 tests / 65 steps / 0 failed；
      覆盖既有 Widgets normal / 最大化 / Snap / 沉浸、打印和大文档契约。
- [x] 最终 4 类 fixture × 5 个视口 × light/default 与 dark/reduced-motion，共 40
      组实页截图和逐帧采样；每组 2 秒 idle，临界高视口及代表多页场景 9 秒， idle
      reflow 均为 0。首轮图片测试误将 Milkdown 空工具图片纳入 decode， 修正为
      canonical 正文图片并断言真实 320×180 decode 后，focused 及完整回归通过。
      证据位于 `evidence/issue-158-scrollbar-stability` 分支；不合并媒体至
      main。

## 移动端首页固定应用密度回归（2026-10-10）

- [x] 根因与最终范围：#149 仅恢复 Apps；本次移动 coarse/no-hover `<768px` 的 Zen
      与 Widgets Quick 统一为 68×68px tracks、4px 双向 gap、 40/42/44px
      glyph。Apps、fine-pointer 与 >=768px touch 保持原有布局。 Quick 卡片
      padding 不变，网格在实际内容区居中。
- [x] Zen 生产页面触屏 E2E（`home-launcher-density.test.ts`）：375px 4
      列，390px（358px 内容宽）5 列，430px 5 列。 测 computed 轨道/间距、tile
      行数、hit-test、无重叠与横向溢出； 检查三个图标尺寸、显示/隐藏名称、真实
      CDP 触屏拖拽的 overlay 68px/4px 与 42px 默认 glyph，比较原始 tile 与
      portaled overlay 的 glyph 相对 X/Y
      坐标，验证隐藏名称时两者均居中；触屏长按进入整理，
      并断言排序保存、刷新后顺序持久化。页面加载、尺寸切换及设置重载后，
      额外等待 ResizeObserver 列数与实测首行几何一致再断言。 更新后的 Home
      density suite 已单独通过；原 Apps density 的移动首页 及 767/768
      断点预期同步更新。
- [x] Widgets Quick 375/390/430px 首行分别 4/4/5 个，实际区域 68×68px， gap
      4px；六种 glyph/名称组合均验证水平居中、隐藏名称时垂直居中、 网格中心偏差
      <1px 和按钮 hit-test。更新后的 Home density E2E 通过； 首次回归在 88≠68
      失败，随后居中回归发现 16.5px 偏移，修正后通过。 fine-pointer Zen Home 仍
      64px/6px。
- [x] 最终生产构建的 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 共
      12 组实页截图与几何验证，无页面或网格横向溢出。 截图矩阵媒体实测均为
      coarse/no-hover，不冒充 fine-pointer； fine-pointer 由独立 Playwright
      context 的 E2E 验证。 390px Quick 内容宽 332px、4 列，Zen 内容宽 358px、5
      列； 两者均 68px track / 4px gap / 42px 默认 glyph，移动网格中心偏差为 0。
      390×640 Quick 另采集 light/dark × 三种图标尺寸 × 名称开关共 12 张；
      图标与名称整体（或单独 glyph）在单元内水平、垂直中心偏差均为 0。 1/3/5/6
      个固定应用实页复查网格中心偏差均为 0。 截图
      `/tmp/pr151-unified-*.png`，报告 `/tmp/pr151-unified-report.json`； 浏览器
      errors 为空。矩阵脚本首次误用卡片外宽计算列数导致等待超时，
      改为按实际内容区验收并重新采集全部最终矩阵，不修改卡片 padding。
- [x] 本地 build、受影响 TypeScript check/lint 与四个源文件 fmt 通过。
      `check:ui` 使用 `/tmp/searcher-pr151-acceptance` 路径别名避开 `.omp`
      绝对路径排除：ownership 实扫 194 文件、visual 实扫 141 文件，
      violations/allowances 均为 0。
- [x] 最终代码本地完整 `deno task test:workspace` 通过： 23 passed（134 steps）/
      0 failed；包含生产构建、更新后的 Home/Apps density、Bento、launcher 及全部
      Workspace 回归，不复用旧提交 CI。
- [x] 本次触屏使用 Chromium 模拟与 CDP 输入。
- [ ] 未执行独立 axe。

**历史区分**：下面 #149 记录的「Home/Quick 仍为 88px」仅描述 #149
合并时的状态；此次最终范围包含移动 Zen 与 Widgets Quick 的 68px 统一。

## Issue #149 触屏应用网格密度（2026-10-09）

- [x] 沿用 Apps Workspace archetype；`launcher.css` 拥有视觉轨道和局部预览，
      `WebAppLauncher` 将 workspace 标记带到根网格、文件夹内容与 portaled
      overlay。 不改共享 88px
      Token、布局算法、排序规则、API、Sheet、表单或搜索列表。
- [x] 修复前生产构建的 coarse/no-hover 390px 实页：实际内容宽 356px， 88px
      tracks / 4px gap / 3 列；修复后为 68px square tracks / 4px 双向 gap / 40px
      glyph / 5 列。新增 E2E 修复前在 88px track 断言失败。
- [x] 实测列数按 `floor((contentWidth + 4) / 72)`，不从 viewport 硬编码。
      两种主题的结果一致；768px Host 切换后按各自容器自然重排：

| Viewport    | Apps 内容宽（CSS px） | 列数 |
| ----------- | --------------------- | ---- |
| 375         | 341                   | 4    |
| 390         | 356                   | 5    |
| 430         | 396                   | 5    |
| 767         | 733                   | 10   |
| 768 Zen     | 366                   | 5    |
| 768 Widgets | 540.08                | 7    |

- [x] app / small folder 为 68×68px hit area，大文件夹为 140×140px； preview
      buttons 与管理入口至少 44×44px，中心 hit-test 均可达。 大文件夹底部另用
      44px 区域的中心与四角 hit-test 验证独立 opener，
      名称不拦截它；预览最多四个可操作按钮，+N 与详情保留剩余成员访问。 1/2/4/10
      成员的大文件夹预览不溢出、不遮挡标题。
- [x] 真实生产构建页：375×812、390×640/844、430×932、767×1024、 768×1024 ×
      light/dark × Zen/Widgets 共 24 个 touch 场景； 1440×900 fine-pointer 共 4
      个场景。computed tracks/gaps、实际 bounding
      boxes、首行、行距、无重叠/横向溢出与短屏真实滚动均通过。 45 张
      root/detail/arrange/management/preview 截图及 report.json、 另两张手动
      before/after 截图保存在
      [独立证据分支](https://github.com/aawai/searcher/tree/evidence/issue-149/evidence/issue-149)，
      不将图片并入 main。
- [x] 390→375→430→767→768 不刷新重排仍保留混排顺序； app 68px overlay
      对齐触摸落点并成功移入文件夹，服务端及 Home pin order 保留。 大文件夹
      140px overlay 对齐真实 touchMove，取消后仍可继续整理；
      既有键盘混排、文件夹内排序、移出、长按、刷新持久化回归通过。
- [x] Home/Quick touch 仍为 88px tracks，gap 分别 6/8px； fine-pointer 仍为 64px
      Home/Quick tracks、68px Apps tracks； Apps 非空搜索保留 A9 列表。#141
      草稿、Undo、Escape、管理入口与应用排序回归通过。
- [x] `deno task build`、相关 7 个布局单测、`deno task test`（643 tests / 51
      steps）、`deno task test:workspace`（22 suites / 134 steps）通过。
      完整命令之后仅调整 density fixture 的稳定截图等待与 CDP 复用，
      最终单独复验 density suite 通过；其余 suites 无改动，复用既有结果。
- [x] fixture 校准：修正菜单名称与相对 selector，等待 Host 恢复、主题、字体、
      有限动效和两个稳定 frame；拖拽激活后再测实际移动。 短屏 Widgets 的
      fullPage 截图后曾丢失 coarse/no-hover 模拟， 改为实际 viewport
      截图并重新采集全部 45 张证据；不修改产品来掩盖脚本问题。
- [x] `check:ui` ownership A–M、visual violations 与 allowances 均为 0； 受影响
      TypeScript 的 check/lint 与受影响文件 fmt 门禁通过。
- [x] 本次使用 Chromium 触屏模拟与 CDP 输入。
- [ ] 独立 axe 未验证。

## Issue #145 便签颜色入口（2026-10-09）

- [x] 沿用 Home / Workspace archetype，唯一 presentation owner 为
      NoteColorMenu；仅删除触发器文字，复用 Button、DropdownMenu radio， 不修改
      CSS、Token、Host、保存逻辑或 compact 更多菜单。
- [x] 五色真实首页卡片均无可见标签；aria-label 保留当前颜色名称，菜单名称与
      checked 状态保留。纸白在 light/dark 均有原有 inset swatch 边框。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 共12组
      authenticated 实页截图；页面无横向 overflow，移动入口44×44px。
      截图与矩阵报告在本次运行的 `/tmp/issue145-evidence/`，不提交图片至 main。
- [x] 生产 E2E 在修复前因触发器可见“纸白”失败；修复后五色菜单 checked、
      Enter/Escape、焦点返回、纸白→鼠尾草保存/刷新、多便签正文保留通过。
      既有菜单回归继续验证五色鼠标选择、编辑保存与 focus restoration。
- [x] 首轮主题矩阵发现读取时过渡未完成，最终截图等待字体、连续两帧与有限动画
      完成后重取全部12组；菜单截图与 Accessibility Tree 保留五色名称。 浏览器
      errors 为空。
- [ ] 独立 axe 未执行。
- [x] build、两项 focused production E2E、受影响 typecheck/lint/format 与
      check:ui 通过；ownership A–M、visual violations 与 matched allowances
      均为0。
- [x] guest/empty/loading/error
      不创建新的颜色入口；壁纸、标题偏好、其他卡片操作、
      编辑器及保存状态的实现未改动，不将历史验证冒充本次证据。

## 设计与所有权

- [ ] Page Archetype：****；primary interaction：****。
- [ ] 新 surface level：****；background/border/shadow/blur token：****。
- [ ] 复用 semantic component：____；无另造基础控件或 box-on-box。
- [ ] 每区域最多一个 primary；同目的地无重复同级入口。
- [ ] 此改动每个新增 visual behavior 都有唯一 owner；新增 feature class 只负责
      layout / domain presentation。
- [ ] 没有重新实现 Button / Dialog / Toast / Status / Empty / Table；新语义已在
      Design System 同步 owner 与 contract。
- [ ] 唯一 page title；component title 不抢层级；关键提示不依赖 caption/muted。
- [ ] 未新增 raw spacing/font/shadow/radius/inline style，或正式 owner
      与系统语义：____。
- [ ] 不以现有实现证明正确；偏离规范的系统语义/范围/验收：____。

## 实页证据

- [ ] 仓库固定实页要求与明确验收场景逐项覆盖；额外维度的代表场景、边界值、成对组合或全组合范围及依据：____。
- [ ] 批量验收脚本已校准媒体偏好、状态提交、动画/transition
      完成条件及断言时机：____。
- [ ] 如有失败或重跑，记录产品/脚本/环境原因与复查范围；脚本缺陷导致原结果不可信时重新验证受影响范围，必要时整组重跑；无变化且证据有效的已通过检查不重复：____。
- [ ] 390×844 / 768×1024 / 1440×900 页面和 screenshot：____。
- [ ] 640/960/1280 临界宽度、长文案、guest/authenticated：____。
- [ ] light/dark、Zen/Widgets、wallpaper on/off、title preference：____。
- [ ] empty/populated/loading/error、hover/focus-visible/active/selected-current/disabled、overlay
      open：____。
- [ ] reduced motion；Tab、focus restoration、touch target、overflow：____。
- [ ] Console 无新增 warning/error；Accessibility Tree / axe：____。
- [ ] Design Lab 与真实业务页面验证分别记录，不互相替代。

## 自动化门禁

- [ ] 组合覆盖与重跑策略遵循
      [仓库指南](AGENTS.md#验证范围与重复执行)，不替代既有验证阶梯及测试、typecheck、lint、format
      和 UI 门禁；full suite 按风险和仓库要求执行。
- [ ] check:ui 的 A–M ownership rules 全部通过，无 baseline allowance 或 prefix
      通配放宽。
- [ ] deno task check:ui；baseline 只删除迁移旧项，不增加 allowlist 债务。
- [ ] deno task build 与 affected focused tests；路由变更用 deno task
      test:routing。
- [ ] API 权限、history、conversation model 保持
      contract；只有直接相关的改动才追加验证。

## Issue #141 应用会话与管理交互（2026-10-09）

- [x] 沿用 Workspace archetype、Search-first 与原有 Zen/Widgets Host； 使用现有
      Button、Tabs、DropdownMenu、AlertDialog、semantic UndoToast， Tooltip
      封装现有 Base UI 依赖，不新增 dependency/API/DTO/schema。
- [x] 固定实页矩阵：390×844 / 768×1024 / 1440×900 × light/dark ×
      Zen/Widgets，每组 root/folder/search/create/edit/arrange，72 张稳定截图。
      校准 preferences 提交、字体与有限 transition；分批采集，最终几何文件含 73
      条记录（390 Widgets dark root 重复一次），72 个唯一场景均无横向溢出。
      合入最新 main 后刷新 24 张 create/edit 截图，另存
      refreshed-form-geometry.json；最终表单联系图单独记录。 截图与几何发布于
      [evidence/issue-141](https://github.com/aawai/searcher/tree/evidence/issue-141/evidence/issue-141)，
      不把图片并入 main。
- [x] 390×640 短屏正文顶/中/底、图标折叠/展开/错误；另外记录 640/960/1280
      表单末项与 Footer。真实上传的渐变壁纸 + balanced/none/natural +
      reduced-motion 代表组合可读；壁纸关闭覆盖固定矩阵。Footer 完整可见、
      workspace-body scrollTop=0，正文是唯一滚动 owner。

| 合同 | 已执行证据                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | 新增全部字段、图标输入与真实 SVG 上传；编辑全部字段与 URL 图标确认，767/768、1023/1024、1440/390、窗口最大化/还原/最小化/恢复。失败保存保留草稿，继续/放弃确认、旧会话获取结果、同步双 submit 单次请求、保存只返回原文件夹一层。                                        |
| A2   | 390×640/844 模态内 Undo 中心 hit-test、pointer/touch/Space 恢复；clock 控制 Sheet 内外移动为同一 DOM/live region，不重启 5 秒期限；恢复 503 在当前 Sheet error Banner 可见，无虚假条目。共享 Home note/Ask Undo 复验。                                                  |
| A3   | Body 与非收缩 Footer 的完整 flex 高度链、无空外层 Footer，VisualViewport owner 消费可见高度和 safe-area；短屏及临界宽度截图/几何。                                                                                                                                      |
| A4   | 所属菜单/业务 AlertDialog、空格 query、整理、文件夹、dirty 表单、根收起分别一键一层并恢复焦点；合成 composing Escape 不导航；Panel/Sheet/Window 单一应用 coordinator，其他工作区既有语义复验。                                                                          |
| A5   | 可见新建文件夹与整理/完成；保留右键、真实 CDP touch 长按、鼠标/触摸拖拽、键盘排序、满网格管理入口。并发两次排序：新请求先成功、旧请求后失败，UI 与真实服务端确认排序及刷新一致。                                                                                        |
| A6   | coarse/no-hover 下根关闭/更多 44×44，小文件夹 88×88、大文件夹 146×146、mini 应用 44×44，Switcher/表单 Tab/提交/取消高度 44；滚入可见正文后的相邻 Tab 与 Footer 不相交。AI 原生下拉框另以真实 bounding box 验证，移除覆盖共享尺寸的 feature 规则。细指针网格对照见下表。 |
| A7   | 默认图标摘要、打开方式常显；普通编辑折叠、更换图标直接展开；展开/折叠和 Host 切换保持 AI snapshot、描述、风格、候选。真实上传及重复 URL/更新图标确认复验；受控 AI fixture 不冒充真实生成。                                                                              |
| A8   | 长文件夹只有一组返回/名称/count/更多，换行且返回/更多可达；文件夹 CRUD、大小切换、删除确认与应用保留复验。                                                                                                                                                              |
| A9   | 原匹配/去重/计数及文件夹进入/清 query；同名长名称显示 hostname/文件夹，完整 accessible name/菜单；搜索主按钮实际打开目标新标签页，与更多为 sibling。原菜单、长按、拖拽及键盘路径复验。                                                                                  |
| A10  | 失败提示可手动继续，原始原因保留开发 console；手填名称/图标来源不被迟到获取覆盖；blur/debounce pending 去重；`https://intranet/` 不自动检测仍保存并以 hostname 回退名称，未收紧保存规则。                                                                               |

- [x] 渲染/输入基线：e747aa4 与修复工作树分别使用相同 production
      `--minify false` 构建、100 个应用、1440×900 Widgets、60 次名称键入。
      DevTools commit hook 记录发生 render 的 Fiber（PerformedWork + 新 Fiber
      identity），不是把一次 commit 中所有组件都算成 render。两边 SearchHome、
      Widgets/Zen、DesktopWindow 均未因键入 render；修复侧仅新增 Provider 的 60
      次 render，AppForm 都为 60 次。输入→下一 animation frame 为下表；
      单次样本不作为性能提升承诺。没有 metadata/生成/检测等无关 API 请求。

| 实测项                          | e747aa4 基线 | 修复侧       |
| ------------------------------- | ------------ | ------------ |
| 输入→下一 frame 中位数          | 12.9 ms      | 12.4 ms      |
| 输入→下一 frame P95             | 13.5 ms      | 13.5 ms      |
| 名称键入期间 API 请求           | 0            | 0            |
| 细指针桌面 tile                 | 68×68 px     | 68×68 px     |
| 细指针桌面网格列数 / gap        | 10 / 4 px    | 10 / 4 px    |
| coarse/no-hover tile / 同宽列数 | 68×68 px / 9 | 88×88 px / 7 |

以上为 #141 合并时的历史测量；其中 coarse/no-hover 的 88px Apps 轨道是 #149
修复的密度回归，不是当前设计要求。当前 Apps 网格与 hit-area 契约见本文件 #149
验收记录；Home/Quick 的 88px 触屏轨道不受此次修改影响。

- [x] 取舍限定：触屏为 44px mini/完整 tile 增加纵向占用与减少列数，
      不改细指针桌面密度；图标折叠增加一次展开，搜索列表用较低横向密度换取
      hostname/文件夹辨识，不删除原有打开/管理能力。
- [x] 真实模型查询 `/api/ai/models`、`/api/ai/providers` 均为空；无模型引导
      保留。受控候选 fixture 只验证会话/异步，候选选择使用真实 upload API。
      Guest 实页应用入口/个人 tile 均为 0。
- [x] `deno task test` 643 tests / 51 steps；build、受影响入口 typecheck、
      `check:ui` ownership（194 files）/visual（141 files）均为零违规。 合入
      main 后首批 workspace 为 18 suites / 128 steps 通过，另三项失败： AI
      下拉框被 feature 的 40px min-height 覆盖、菜单 Escape 在新 Sheet
      挂载前操作、便签历史仍断言上游已移除的颜色文字。分别移除重复尺寸规则、
      等待实际 Sheet/menu、删除 incidental 文字断言（保留真实恢复颜色 API
      断言）。 最终 `deno task test:workspace` 完整命令 21 suites / 134 steps
      通过； AI 三个下拉框真实命中区均满足 44px。最终共享反馈/文档复查 2 suites
      / 25 steps 通过。保留上游 #109 masonry 与 #145 颜色点改动。
- [x] 共享消费者：Home 便签/Ask、Account/Trash/Provider 确认与 Undo、 Notes
      编辑/历史/menu/order、Zen/Widgets/window/Guest；Documents 实页 16
      个尺寸/主题/Host 组合、短屏输入及大文档完整性共19 steps 通过。
- [ ] 真实图片 Provider 生成不可用，未执行。
- [ ] 全库 lint/fmt 清洁：本次未修改文件仍有 9 项既有 lint 诊断，
      WORKSPACE_FINAL_REFACTOR_PLAN.md 与 scripts/ui-guard/baseline.json
      两个既有格式问题；不混入无关清理。本次文件 scoped lint/format 单独验证。

## Issue #109 Widgets 便签响应式 masonry

- [x] 沿用 Workspace archetype、NoteCard 与 Host chrome；不增加基础控件、
      surface 或视觉 Token。NotesWorkspace 显式接收 listLayout，仅 Widgets
      desktop root/search 使用 masonry；Zen Panel、移动 Sheet 与首页不改布局。
- [x] 复用 canonical masonry engine，容器宽度决定 1/2/3 列，最多三列；
      minColumnWidth 245px，gap 从 --space-row-gap 读取。505/506/766/767px
      实际内容宽边界逐项验证，不以 viewport 代替。固定、其他、搜索独立测量；
      未测量卡片隐藏，展开长 Markdown 后无重叠，容器高度覆盖全部卡片。
- [x] 横向、纵向、对角 resize，最大化/还原、snap 与 constrained preset
      均经真实窗口操作验证；查询、展开状态和 canonical API order 不变，
      纯几何变化零写请求。pin/home-fixed 迁移、删除与清空搜索重新测量。
- [x] 两列和三列分别验证跨列 pointer 上半/下半插入与 keyboard 排序；
      取消零排序写入，固定组不参与排序，成功排序经 API 与关闭/重开验证。
      DragOverlay portal 至 body，并使用实际 transform-aware rect； overlay
      卡片宽度等于当前列宽，inert 且不重复暴露可操作控件。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 共 12 组
      authenticated 真实页面截图，保存在本次运行的
      /tmp/issue109-evidence/notes-{style}-{width}-{theme}.png。 可通过
      E2E_EVIDENCE_DIR 与 test:workspace 重新生成；截图不并入 main。 root/search
      与首页隔离有实页断言，移动单列无横向 overflow。
- [x] 浏览器手动 smoke 验证 1440px 三列、768px constrained 两列、390px Sheet
      单列；实际 keyboard 跨列移动、overlay/card 等宽与排序提交通过。
      reduced-motion 实页匹配；masonry 没有新增过渡或动画。
- [x] 脚本先校准 Origin、lazy summary 和连续两帧稳定布局；resize 等待 rAF
      提交后释放鼠标，keyboard 等待 sensor 测量完成后发送方向键。
      初次回归定位并修复产品的 transform 测量与 overlay containing-block
      问题；最终专项 1 test /23 steps 全部通过，没有放宽几何/排序断言。
- [x] deno task test：643 tests /51 steps；受影响 lint/typecheck 通过； check:ui
      A–M ownership、visual violations 与 matched allowances 均为0。 build
      通过；bundle initial gzip 255794B、shared editor 141117B、 Notes-only
      editor 1526B，未放宽预算或依赖门禁。
- [x] 完整 test:workspace 初跑 13 tests /126 steps 通过、2 steps 失败：
      重复的旧全宽断言和单列 ArrowUp 假设。删除重复全宽检查（新的列宽契约
      已覆盖），按卡片实际位置选择键盘方向；受影响两文件复查分别 8/7 steps
      通过，其余已通过范围不重复。全部 15 tests /128 steps 已取得通过证据。
      复查另遇首页 suggestion 遮挡 editor reopen 的 pointer click，改为实际
      focus/Enter 打开便签后验证 draft/autosave；不使用 force click。
- [ ] 独立 axe 审计未执行。

## Issue #140 便签编辑、历史与列表交互（2026-10-08）

- [x] 沿用 Workspace archetype 与原有 Host chrome；复用 Button、Tabs、
      DropdownMenu radio 与 AlertDialog。通用 900/720/240px 编辑几何 Token 由
      tokens.css 拥有，Documents 仅迁移同值消费者。Notes 没有完整内层卡片框，
      Markdown 正文排版仍由 canonical owner 提供。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 共 12 组
      authenticated 编辑页，每组 Live 长文中段、Source 与历史三张截图；
      实际主题、活动编辑器、布局与 overflow 在 report.json 记录。证据在
      [独立 evidence 分支](https://github.com/aawai/searcher/tree/evidence/issue-140/evidence/issue-140)，
      不将截图并入 main。
- [x] 640/960/1280 viewport；工具栏实际宽 639/640/641px 分别为 6/13/13
      个入口，历史实际同宽分别为单列/两列/两列。边界 smoke 显式设置实际容器宽，
      不以 viewport 代替；390×568 与 1024×600 正文高度均为 240px，
      编辑器整体可滚动、页面横向 overflow 为 0。
- [x] Zen 展开/收起与 Widgets 最大化/还原：同一编辑实例、已输入文本及 undo
      保留，几何操作期间零 PATCH。最大化窗口 1408px、标题宽 720px；
      正文内容扣除原生滚动条后 705px。不承诺跨 Host 的 undo 保留。
- [x] 历史回归使用真实 API/DTO：dirty 一次 manual flush、clean 零 PATCH、 返回
      Source 选区/焦点、取消零 POST、恢复 title/body/服务端 version、 当前 color
      保留；保存失败/409不进入历史，接受云端后可再次进入；
      恢复失败保留预览和草稿，重试后成功。GET 错误重试与在途保存仍由既有
      production 回归覆盖，恢复复用原 mutationQueue。
- [x] Live/Source 全部 15 个命令均通过真实菜单/按钮触发，分别观察 DOM 语义与
      Markdown 转换。Portal 菜单保留选区、不会提前 flush；两实体窗口中，
      第一实例 dirty 标题转到第二实例的格式菜单，仅第一实例产生 manual PATCH。
      IME 为 composition/CDP 自动化模拟，不是 OS 候选窗验收。
- [x] 五色单选显示名称、checked 状态；选择后菜单关闭、焦点返回当前颜色入口。
      coarse-pointer E2E 验证工具栏触点至少44px；移动卡片动作常显。
      卡片正文双击保持 compact 且不打开编辑，标题 Enter/Space 均进入编辑；
      显式展开、首页拖动/持久化与 #138 原生代码滚动回归继续通过。
- [x] 普通 AST 摘要、空白、标题命中、正文/Unicode 命中、URL 与 raw HTML
      源码-only、正则字符输入均经真实根列表验证；script 文本只展示为文本，
      没有执行。分组、排序及查询 membership 未改变；parser 只由 Notes root lazy
      import，实例缓存随 body 失效并清理已删除便签。
- [x] 壁纸 on/off、reduced-motion、长标题/表格/长代码实页证据已记录； guest
      页面无便签卡片/编辑器，GET /api/notes 返回401。axe 4.10.3 对实际
      light/dark 的 edit/history/menu/confirm 共8个表面执行 WCAG
      2A/2AA/2.1AA，零 violation；隔离 console 只有 React DevTools info，
      没有新增 warning/error。故障注入产生预期失败请求，单独记为验收数据。
- [x] 脚本校准：菜单 focus restoration 等待关闭过渡完成；右键使用稳定 locator
      的相对空白坐标而非过渡中的全局 mouse 坐标；主题审计等待 data-theme
      与实际背景提交。首次并发构建会替换生产 assets，后续 构建/E2E
      串行；失败范围复查后最终 workspace 全部通过，不放宽断言或门禁。
- [x] deno task test：641 tests /51 steps；test:workspace：14 tests /105 steps；
      test:home-notes：2 tests /14 steps；受影响 typecheck/lint/format 通过。
      check:ui ownership A–M 与 visual violations 均为0； check:bundle initial
      gzip 253959B、shared editor 141117B、 Notes-only editor 1529B，预算与
      forbidden dependencies 门禁未放宽。
- [x] 全库 lint 已运行，未改动的 lib/api.ts、lib/local.ts 与 search 域仍有
      9项既有诊断；没有将无关清理混入本次修复。README、DESIGN_SYSTEM、
      MARKDOWN_EDITOR、CHANGELOG Unreleased 与本记录同步更新。
- [x] 全库 fmt check 已运行；未修改的 WORKSPACE_FINAL_REFACTOR_PLAN.md 与
      scripts/ui-guard/baseline.json 共2个既有格式问题保留，本次文件单独检查。
- [x] 本次验收范围： #109 当前仍 OPEN，尚不存在其最终 masonry
      集成可验收；本次既有 ControlledNotes
      动态高度/排序回归通过，不修改其布局算法或列数阈值。

## Issue #138 浮动画布代码块滚动条（2026-10-08）

- [x] 沿用 Home archetype，Search 为 primary；无新 surface / primitive /
      layout。 notes.css 为唯一 scrollbar presentation owner，作用域只匹配
      `.floating-notes--canvas .note-preview.markdown pre`。Issue 授权的 4px、
      中性 thumb 与 pill radius 仅用于原生滚动条；不重设 overflow。
- [x] 用户确认允许最小交互修复：FloatingNotes 的既有 pointerdown guard 排除
      pre，避免置顶重新分层打断原生滑块；未新增 listener/state/dependency。
      标题、拖动手柄、其余卡片与控件保持既有交互。
- [x] Red：真实 production home E2E 的原生拖动后 scrollLeft >100 等待超时，
      原有六个持久化 steps 均通过；Green：同一原生拖动 step 与全部七个
      persistence steps 通过。Playwright 默认隐藏 scrollbar，回归浏览器显式
      去除该启动参数；不 mock scroll、不阻止事件冒泡、不替换 DOM。
- [x] Linux headed Chromium 141.0.7390.37 / Firefox 142.0.1，390×844 / 768×1024
      / 1440×900 × light/dark 共 12 组真实首页截图。用户追加指出胶囊与截断后，
      更新 CSS 并重跑全部 12 组：pre 为共享 multiline 8px 圆角、块 code 无内层
      chip；DOM Range 校验首/尾 glyph 完整位于两端 padding 内，
      preview/page/短代码横向 overflow 均为 0。
- [x] 用户确认保留单行横向滚动，不改为自动换行。块 code 恢复 canonical 13px
      与透明背景、零 padding/radius；inline code 不变。生产回归增加 首/尾 glyph
      可达断言，不以源码或样式文本代替可见内容契约。
- [x] 未隔离事件的最终 smoke：Chromium 滑块拖动 scrollLeft=661，Firefox=464；
      preview scrollLeft 与横向 overflow 均为 0。Tab 实际到达 pre，ArrowRight
      与水平 wheel 继续可用；长代码单行、多行、短代码、行内代码和
      纵向正文滚动均已观察，整张卡片几何不变。
- [x] 默认透明、hover/focus alpha=.45；Chromium 标准 thin 优先，原生轨道
      占10px，WebKit 伪元素 computed height=4px，不宣称实际绘制为4px。 Firefox
      使用 native thin/overlay；active 使用浏览器原生反馈或 WebKit .7。
- [x] Chromium 真实卡片手柄拖动从 (130,95) 到 (180,130)，折叠/展开、
      纸白→琥珀→纸白控件通过。右侧工作区 pre 保持 auto scrollbar/overflow，
      Widgets ControlledNotes 不匹配新选择器；卡片无可用 resize 控件。
- [x] 截图见 PR #139 的私有仓库 evidence/issue-138 分支，不并入 main。 Firefox
      headless 强制隐藏 scrollbar，视觉与指针验收使用 Xvfb headed； keyboard
      smooth-scroll 完成后再发送 wheel，按实际 scrollbar/overlay
      几何命中滑块。原型临时事件隔离只用于定位原因，最终 smoke 与回归无隔离。
- [x] a11y 验证为真实 Tab/focus-visible/ArrowRight。
- [ ] 未新增 axe 运行。
- [x] 修复后 deno task test：640 tests / 51 steps；生产 Notes 回归合计 4 tests /
      28 steps；build、受影响 typecheck/lint 与 check:ui 通过， ownership A–M /
      visual violations 均为 0。未放宽 baseline 或 CI。

## Issue #136 Notes 编辑焦点与保存验收（2026-10-08）

- [x] Owner 为现有 NoteEditor；标题、当前正文、工具栏消费同一实例的编辑焦点
      判定，模式 Tab 保留例外。历史、颜色与外部控件不属于内部区域。未修改共享
      Markdown adapter、API/schema、版本/snapshot 策略、样式或 Host geometry。
- [x] Red：未修改标题，鼠标从标题点击 Live 正文，完整观察 1800ms 后捕获真实
      manual PATCH（原始正文与 version=1），预期为零提交。Green：同一回归保护
      PATCH、真实 Note DTO/version 与 history，不 mock save。
- [x] 真实 production-app 的 390×844 / 768×1024 / 1440×900 × light/dark 六组
      实页与 screenshot；390/1440 使用 Zen，768 使用 Widgets constrained。 标题
      Enter → 正文 → 工具栏 → 正文 → Source，300ms 内无提前 PATCH；
      真正移至历史后仅一个 manual PATCH，version +1，额外观察 1800ms 无重复
      autosave。颜色/历史与两种模式的键盘边界由真实 E2E 覆盖。
- [x] Chromium CDP `Input.imeSetComposition` 在标题输入“中文组合”，等待 1800ms
      无半成品 PATCH；`Input.insertText` 提交后仅一个 autosave。 不是 OS
      输入法候选窗人工验收。标题 composition Enter/格式命令/blur 与正文
      IME、undo/redo、本地链接快捷键由 production E2E 覆盖。
- [x] 1440×900 dark Widgets 两个真实便签窗口：第一窗口 dirty 标题移至第二窗口，
      仅第一实例发 manual PATCH；第二实例 clean，不发 PATCH。截图确认独立窗口、
      原有 chrome 与正文结构保持不变。
- [x] 脚本/环境校准：补齐 user-local Chromium 运行库与中文字体，不改产品代码或
      CI 预算。browser script 改用实际 Tabs 语义而非猜测 data-state；修正 press
      API 参数后重跑全部六组。E2E 在打开第二实体前通过 Dock 重新聚焦 Notes
      browser， 避免真实窗口遮挡；关闭/返回兼容两种 Host，不强制点击被遮挡控件。
- [x] `notes-focus.test.ts` 的 14 steps：clean 内部/外部移动、Live/Source
      标题与正文合并 autosave、原始 debounce、不保存的模式切换、dirty 标题-only
      历史/颜色 flush、显式 clean Ctrl+S、标题 IME、卸载与恢复 dirty
      草稿、失败重试、在途旧标题响应保留新正文、两个实例独立保存全部通过。
      既有云端 409/替换、history restore、Source
      transforms、工具栏与快捷键回归保持。
- [x] `deno task test`：640 tests / 51 steps； `deno task test:workspace`：11
      tests / 105 steps； affected typecheck/lint 通过。`check:ui` 为零
      violations； `check:bundle` 通过，initial gzip 251140 bytes、shared editor
      async 141117 bytes、Notes-only 1530 bytes；不放宽 baseline 或预算。现有
      Notes regression CI 与 workspace task 纳入新 focus E2E。
- [x] 全库 lint 已执行：未改动的 api.ts/local.ts 与 search 域仍有 9 项既有诊断；
      本次新增测试的 require-await 已修复，受影响文件 lint 通过。全库 fmt check
      已执行：未改动的 WORKSPACE_FINAL_REFACTOR_PLAN.md、ui-guard/baseline.json
      格式不通过，不为此任务重排无关文件；本次修改文件单独检查。

## Issue #108 Notes Live Preview 验收（2026-10-08）

- [x] 默认 Live + Source；消费 #110 单一 foundation，无第二套
      parser/serializer/framework theme；Notes schema/API/version contract
      不变。README、DESIGN_SYSTEM、MARKDOWN_EDITOR 与 CHANGELOG 已更新。
- [x] 390×844 / 768×1024 / 1024×768 / 1440×900 × light/dark × Zen/Widgets 共 16
      组实页截图；实际 data-theme 与 Home layout 校验，viewport/editor 横向
      overflow 均为 0。H1/H2/H3/body computed font-size 为
      18.9/16.8/15.4/14px，正文行高 21.98px。
- [x] 同一 NoteEditor surface 的 Live 与真实冲突 NoteMarkdown 使用相同
      fixture，对 18 种 Markdown element 比较
      font/line-height/weight/color/margin/padding/list
      marker/background/radius；light/dark × 五种便签颜色共 10 组无差异。任务
      checkbox 的编辑/只读区别是交互 contract。
- [x] axe-core 实页 NoteEditor light/dark 0 violations；标题、工具栏、任务
      checkbox、模式 Tab 与焦点边界验收通过。
- [x] Chromium CDP Input.imeSetComposition → Input.insertText：组合期间等待
      1800ms 无 PATCH，提交后仅一个
      autosave，正文为“起点中文组合”。不是人工物理输入法验收。
- [x] 两个实体实例同时存在；关闭其一后另一实例的正文、选区与 undo
      继续有效，无串稿。20 次打开/关闭后无 ProseMirror DOM 留存；排除自动化
      ElementHandle 留存后 GC 样本第 5/10/15/20 次均为 353 nodes / 198 listeners
      / 3 documents，未线性增长。
- [x] 640 tests / 51 steps 通过；完整 test:workspace 通过；额外
      bundle-loading、route-style-stability、Notes/Ask shortcuts 通过。Live E2E
      包含 9500 字保存与 10001
      字拒绝后草稿仍完整。build/typecheck、lint/format、check:ui、check:bundle
      通过。
- [x] Home initial gzip 251076 bytes；shared editor async 141117 bytes（<150
      KiB），Notes-only 1529 bytes（<40 KiB）；Notes graph 无 Documents-only
      module、initial graph 无 editor、framework 无重复版本。
- [x] 脚本校准记录：模式/冲突 locator 改为最终语义；Source 等待 IndexedDB
      recovery 的 enabled 状态。真实回归暴露并修复云端替换后的延迟 blur
      重复提交、旧标题请求删除新正文草稿；排版比较发现 Tabs 行高继承，改用
      canonical body Token。首次 workspace Snap resize timeout
      在未修改其代码的完整重跑中通过。React Doctor 扫描为 71/100，39
      项均不位于本次编辑器变更；未扩大范围修改存量问题。

## Issue #102 M7 最终矩阵 / A11y / 性能 / Contract 验收（2026-10-08）

- [x] M0A/#110/M0B/M1–M6 均已独立 PR 合并；本阶段不改 Locked Decisions，不迁移
      Notes baseline，也不增加第二套 editor core。
- [x] 生产 Documents E2E：1 test / 19 steps；16 组 390×844 / 768×1024 / 1024×768
      / 1440×900 × Zen/Widgets × light/dark，三种 view 均可用，continuous/page
      保留同一实例，source 与服务端 canonical Markdown
      一致，切换模式不保存新版本。
- [x] 100k+ Markdown / 200 headings / 50 owner asset references / 20 tables / 30
      manual breaks：真实输入、Ctrl+S、API 持久化、page reflow、source
      往返不丢内容。夹具为 `web/e2e/fixtures/document.ts`；不以固定 FPS
      或未测出的耗时作性能承诺。
- [x] Library 打开前后生产网络不请求 editor-vendor，summary 不含 body；已接入
      Bundle CI。新建 `deno task test:documents`，使用既有 production-app 隔离
      helper。
- [x] 实际 Browser 复验 16 组长段落/代码/宽表/高图片 page/source，以及 390/1440
      × Zen/Widgets × light/dark 八组 gradient wallpaper 配对：截图、viewport
      overflow、Home Search 几何通过，Search y shift=0，axe WCAG A/AA 0
      violations。未宣称任意壁纸的绝对可读性，沿用既有 Phase 0 例外。
- [x] 390×400 模拟软键盘高度，实页发现正文高度 0；新增最小阅读高度 Token +
      editor container
      scroll，回归修复前失败、修复后通过，聚焦后的源码可见并能真实输入保存。
- [x] axe 前等待有限 animation/transition finished；原失败来自切换按钮背景颜色
      transition 中间态，稳定态仍使用原始 WCAG 门槛，未跳过规则。
- [x] 全套 639 tests / 28 steps；`deno task test:workspace` 8 tests / 85
      steps；shared lifecycle/IME/network/pagination production suites 3 tests /
      9 steps，Documents 单独 1 test / 19 steps。src/main + web/main
      typecheck、affected lint/format、build、UI Guard 0 drift、bundle gates
      均通过。
- [x] DocumentEditor route-only graph 约 172 KiB gzip，shared runtime 约 154
      KiB；150–200 KiB 档保留 breakdown：framework 约 100 KiB、Markdown pipeline
      约 51 KiB、adapter 约 3 KiB，加上 Documents UI/extension/paper。无
      Crepe/CodeMirror/KaTeX，initial graph 不包含 editor runtime。

### 最终 DoD 可追溯证据

| #102 §42 条目      | 已验收证据                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1、29              | 既有 Notes 语义不改；M6/M7 Workspace production regressions，包括 autosave/conflict/version/窗口恢复与身份隔离。                                   |
| 2–8                | PR #128/#131/#133 的 Host integration + 本阶段完整矩阵：root/nested、Zen 非模态、Sheet、constrained 与 entity boundary。                           |
| 9、10、28、33      | PR #127/#130 的 Notebook/CRUD/FTS/summary cursor 契约与 Library 实页；本阶段持续保护 body-free + runtime isolation。                               |
| 11–18、23、26      | #110 shared round-trip/runtime/commands、M4 editor-session 和 M0B/M5 production 编辑、选区、IME、PageBreak；本阶段三模式与 canonical body 持久化。 |
| 19–22、36          | PR #132 的 A4/Letter 四类纸张、margin 边界与严格 manual blank-page Print/PDF 证据；device-local view state 与 server paper owner 保持独立。        |
| 24、25、34、35、37 | M1/M4 的资产 MIME/10 MiB/owner、limits、draft/conflict/version restore/snapshot retention 回归；本阶段长文真实 owner 图片与保存往返。              |
| 27                 | 本阶段提交的大文档夹具与生产浏览器完整性测试。                                                                                                     |
| 30、31             | 全套/focused/E2E/实页矩阵、typecheck/lint/format/build/UI/bundle，以及 README/Design System/checklist/Unreleased 文档。                            |
| 32、38             | 单一 #102 Contract、单一 #110 core；#108 Notes consumer 为独立后续 Issue，未在本 Tracking 提前迁移或复制 core。                                    |

## Issue #102 M6 Widgets Entity Windows / Persistence 验收（2026-10-08）

- [x] 复用 DesktopWindow、geometry、Dock、Overview 与 Snap；Library singleton
      与多个真实 document entity 同时打开，不创建另一套 editor core/chrome。
- [x] 两笔记窗口独立保存标题与正文；最小化后重复打开保留同一 editor
      DOM；Dock/Overview 标题同步。Library
      删除确认后只关闭对应实体；独立窗口保存同步当前列表摘要。
- [x] 真实刷新恢复多窗口；左分屏刷新保留相同 frame。schema v3 回归保护两个实体与
      v1/v2 向后兼容，corrupt payload 回退为空桌面；最小化失效实体真实 GET 404
      后清理，其余窗口保留。
- [x] 390×844 / 768×1024 / 1024×900 / 1440×900 × light/dark 八组 Widgets
      实页截图与 viewport overflow 通过：前两种无 entity window，仅一个 nested
      editor，后两种保留多实例。固定 390/768/1440 双主题修复后 axe WCAG A/AA 0
      violations。
- [x] 窄桌面窗口实际发现滚动区域缺少键盘入口，增加 focusable region；原生 End
      将内容 scrollTop 从 0 移至 165，未改变 editor selection/history。
- [x] 全套 639 tests / 28 steps；既有
      workspace/shell/launcher/notes/order/bento/contract/matrix/bundle 9 tests
      / 90 steps，Apps/Notes 无回归；build/typecheck 与 UI Guard 0 drift，不放宽
      baseline。
- [x] 验收脚本校准：输入按 entity ID 定位，避免误输入其他窗口；注入损坏/失效
      IndexedDB 记录前退出 Home，避免 pagehide flush 覆盖夹具；主题断言
      data-theme，等待偏好与 Host 提交。

## Issue #102 M5 Editable Pagination / Print 验收（2026-10-08）

- [x] 基于 M0B 与 M4，生产与 spike 消费同一分页 owner；连续/页面共享 editor
      DOM、选区、undo history，不写入自动分页。既有分页浏览器测试 5 steps
      通过，覆盖中文 IME、纸张切换、复制粘贴、gap、超高段落/代码/表格/图片；修复
      compositionend 后重排被 PM composing flag 丢弃的回归。
- [x] 生产纸张弹窗保存 Letter 横向及 5/50/12.7/25.4 mm 四边边距，真实 GET
      返回一致值；390×844 弹窗完整可用，Tab 进入方向选择，axe 0 violations。
- [x] 原生打印入口与浏览器 PDF 验证：首部/连续/末尾手动分页为 5
      页，正文依次为空、标题与 PAGE TWO、空、PAGE FOUR、空；A4/Letter
      横纵向尺寸及边距已验证。超高正文、末尾代码/表格内容与 2000×3000
      图片完整输出；选中的真实图片不被当作 decoration 删除，lazy
      图片打印前等待加载。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      十二组生产实页截图与页面级 overflow 检查通过；页面横向滚动在 editor
      内，不扩张 document。
- [x] 全套 638 tests / 28 steps；focused 17 tests / 3 steps；UI ownership/visual
      guard 0，新 baseline allowance 0；affected lint/format 与 bundle gate
      通过。全仓库 lint 有 9 项既有问题，均不在改动文件中，未放宽规则。
- [x] 验收脚本校准：原生 textarea 输入代替未触发 React state 的 fill；等待分页
      mode 与动画稳定后断言；Widgets 使用工作区导航入口；PDF 使用
      preferCSSPageSize，避免工具默认 Letter 覆盖 A4。

## Issue #102 M4 Continuous / Source Editor 验收（2026-10-07）

- [x] 生产 DocumentEditor 消费 #110，Library 创建取得真实 ID
      后打开；空文档打开等待 1800ms 无 PATCH，首屏与根 Library 无
      editor/runtime/full-body 请求。
- [x] Markdown canonical、连续/源码切换、任务 checkbox 与
      undo、链接参数输入、大纲光标定位、字数边界回归；不复制 editor core。
- [x] 真实 HTTP 保存与历史恢复生成递增版本；真实 409 三种选择、历史 UI
      恢复、离线失败后 IndexedDB 草稿重开恢复。
- [x] Chromium CDP 中文 IME：组合期间等待 1700ms
      版本不变，提交后正文保存；两个生产 editor 实例分别保存不同正文。
- [x] 图片工具栏上传、paste、drop 实页成功，canonical asset refs 与 owner URL
      字节加载；复制与磁盘 `.md` 导出保留正文和 internal asset refs。
- [x] 118380 characters / 200 headings / 50 images / 20 tables / 30 manual
      pagebreaks 实页加载、输入、源码切换与末尾大纲定位；输入不重建 editor DOM。
- [x] 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 12 组实页截图，无
      viewport/editor 横向溢出；手机工具栏触摸目标 44px，窄屏大纲改为纵向组合。
- [x] 加载失败/retry 与草稿失败保留；axe WCAG A/AA 0
      violations；普通操作无浏览器错误。验收时重建产物导致旧页面请求过期
      chunk，刷新后重新覆盖错误/retry 场景，不作为产品缺陷。
- [x] 638 tests / 28 steps、现有 production Host matrix 7
      steps、typecheck/lint/format/build、UI Guard 0 drift，未修改 baseline。
- [x] 编辑器 async JS graph 约 166 KiB gzip，落在 #102 150–200 KiB
      需说明区间：共享 editor vendor 约 100 KiB、既有 Markdown parser/vendor 约
      51 KiB、adapter/UI 约 15 KiB；不加载完整 Crepe theme，首屏隔离保持。
- [x] M5 分页/打印与 M6 Desktop entity integration 未提前交付；正文图片不冒充
      portable export。

## Issue #102 M3 Documents Library / Notebooks 验收（2026-10-07）

- [x] 真实页面覆盖 0、1、101 条笔记：50→100→101 游标加载，无 list body 或 editor
      runtime 请求。
- [x] 全部/最近/收藏与笔记本 scope
      独立于搜索；跨笔记本结果保留归属标签，清除搜索恢复原
      scope；延迟旧搜索不会覆盖新结果。
- [x] 创建、重命名、收藏、移动、移入废纸篓及 API 状态验收；409
      错误保留输入，不默默重试。
- [x] 笔记本创建/重命名/移动/排序/删除实页验证；child 无创建子级入口，含 child
      的 root 禁止降级；删除保留笔记并提升 child。
- [x] 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 共 12
      组：无横向溢出，窄 Zen 单栏，宽 Widgets 内部侧栏。
- [x] Loading/error/retry/empty；延迟失败时 Escape
      不关闭提交中表单，失败后输入保留；axe WCAG A/AA 0 violations。
- [x] 全套 596 tests / 28 steps、现有 production workspace matrix 7
      steps、build/typecheck/affected lint/UI Guard 0 drift；不放宽 baseline。
- [x] 无 DocumentsPage、额外 editor core 或 fake entity；完整 editor/entity
      intents 依用户确认保留 M4/M6 边界。

## Issue #102 M2 Workspace Core / Host 验收（2026-10-07）

- [x] 三域独立 route/stack/query；Documents scope 不随 Back 或清空搜索重置，认证
      reset 清空所有域。
- [x] 复用 WorkspaceShell、WorkspaceSurface、DesktopWindow、Sheet；无
      DocumentsPage、第二套 window chrome 或 editor core。
- [x] 实页 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 共 12
      组：根摘要展示、正确 presenter、无 viewport 横向溢出，浏览器无错误。
- [x] 真实 API 55 条摘要：首批 50 条，加载更多后 55 条。
- [x] 原有 production workspace layered matrix 全部通过；全套 594 tests / 28
      steps 通过；UI Guard 0 violations，不调整 baseline。
- [x] 构建通过；本阶段只交付根 Host 与摘要入口，Library 管理和生产编辑器保持
      M3/M4 依赖边界。

## Issue #110 Shared Markdown Editor Foundation 验收（2026-10-07）

- [x] Shared owner `features/markdown-editor`，structural CSS 不定义产品
      typography 或 surface；spike 保留 utility archetype 和自身
      presentation，复用现有
      PageShell/Section/ActionGroup/Button/Textarea。没有迁移便签或上线
      Documents。
- [x] 实页新增共享加粗选区、任务列表与表格命令；source/rich、双实例、卸载重建、
      selection/history 与 Chinese CDP composition 的 production E2E 通过。
- [x] 390×844、768×1024、1440×900 × light/dark 六组截图；无页面横向 overflow，
      H1/H2/H3 18.9/16.8/15.4px。Surface light rgb(255,255,255)、dark
      rgb(29,33,40)；批量前通过主题按钮和 reduced-motion
      校准，原页面标题层级保留。
- [x] axe WCAG 2A/2AA 0 violations；Console 无新增 pageerror。真实 CDP hook
      probe 捕获 focus/blur 与 composition start/update/end，正文保留
      “中文验收”；临时 probe 已移除。不是 OS 输入法候选窗人工验收。
- [x] Home/Apps/Notes 现存 surface 的 production network 验收通过；真正
      Documents root/library 尚不存在，须在其交付阶段补充，不用 Design Lab
      代替。 Zen/Widgets host、wallpaper 与账号业务未改，不由本 editor
      阶段重复验收。
- [x] focused 28 tests/25 steps；全量 526 tests/25 steps；production editor +
      network + existing bundle-loading 3 tests/9 steps。typecheck/lint/format、
      UI Guard 0 violations；baseline 无放宽。初次未修改基线的一次 CryptoVault
      测试失败已单独记录到 #110，本阶段没有修改该测试。
- [x] 冷异步闭包 157.85 KiB gzip，150–200 KiB 依赖分析见
      `MARKDOWN_EDITOR_M0A.md`；initial graph 无 editor runtime，没有 Crepe、
      CodeMirror、Documents pagination/print 或 Notes 业务进入 shared core。

## Issue #102 M0A editor spike 视觉验收（2026-10-07）

- [x] 独立技术验证入口 `/design-lab/markdown-editor`；复用 utility
      PageShell、PageHeader、Section、ActionGroup、Button、Textarea，不是
      Documents 业务页面。
- [x] consumer presentation 由 `spikes/markdown-editor/spike.css`
      拥有；typography 复用 canonical `markdown.css`，不引入 Milkdown/Crepe
      theme。
- [x] 390×844、768×1024、1440×900 × light/dark 六组合实页截图；scrollWidth 等于
      viewport width，H1/H2/H3 computed size 为 18.9/16.8/15.4px。
- [x] editor surface 跟随 token：light rgb(255,255,255)，dark
      rgb(29,33,40)。任务状态标记可区分；table/code 不造成页面横向溢出。
- [x] 批量前校准 theme 与 reduced-motion；axe WCAG 2A/2AA 0
      violations。Zen/Widgets host、wallpaper、账号业务属于 M2–M7，不由 spike
      验收。
- [x] 初态 dirty 实页问题修正后，打开显示正文变化 0 次；source replace
      的事务来源另由 focused production E2E 门禁保护。

## Issue #120 Route CSS Cascade 稳定性与 Ask 大屏响应式几何重标验收（2026-10-06）

- [x] RadioGroup Canonical Variants 与结构所有权规范：
  - `web/src/components/ui/radio-group.tsx` 引入
    `RadioGroupVariant`（`default`、`swatch`、`segmented`）；
  - Settings 外观页强调色使用 `variant="swatch"`，1440px 桌面端稳定呈现 2
    列且中文标签保持单行不折行（`white-space: nowrap`）；
  - Settings 动态背景程度使用 `variant="segmented"`，四档等宽单选控件，隐藏
    radio circle 并保留原生无障碍键盘行为；
  - 移除 `settings.css` 中冗余的 `settings-swatch-grid` 与
    `settings-swatch-option` 结构层重写；
  - `NativeSelect` 采用 `.settings-choice-select` 包装层决定宽度，内层
    NativeSelect 保持 100% 撑满，消除样式冲突。
- [x] Ask 大屏工作区响应式几何重标：
  - 新增设计系统 layout
    tokens：`--layout-ask-workbench-max: clamp(1280px, 82vw, 1760px)`、`--layout-ask-message-max: clamp(900px, 55vw, 1040px)`、`--layout-ask-composer-max: clamp(760px, 50vw, 920px)`；
  - 共享 `PageShell` 引入 `--page-shell-workbench-max` 局部 override
    机制，AskPage 挂载 `.ask-page-shell` 局部注入；
  - 1440×900 视口：workbench 1280px，sidebar 260px，reading lane
    900px，assistant lane 900px，user lane 760px，composer 760px；
  - 2048×1152 视口：workbench 1679px，reading lane 1040px，assistant lane
    1040px，user lane 920px，composer 920px；
  - 移除 `.ask-assistant-body pre` 负外边距，代码块与表格严格约束于 100%
    阅读列内；
  - 输入框发送按钮完全包含于 surface
    容器内部（`tools-right flex-shrink: 0`），触控尺寸 >= 44×44px。
- [x] UI Guard 规则 M（`primitive-feature-cascade-order`）：
  - 硬门禁覆盖
    `SettingsPage.tsx`、`settings.css`、`AskPage.tsx`、`web/src/features/ask/**`
    及 `markdown.css`；
  - 阻断裸 feature class 竞争 primitive 基础属性，要求显式 variant 或 slot-aware
    compound selector；
  - 0 violations 全量通过，包含正反 fixture 自动化单元测试。
- [x] 生产环境 E2E 稳定性与可视证据：
  - `web/e2e/route-style-stability.test.ts` 验证 1440×900、2048×1152 与 390×844
    视口；
  - 同 document SPA 路由序列导航断言 `performance.timeOrigin` 恒定，验证
    computed style 与加载顺序无关；
  - 生成 CI 可视证据至 `artifacts/route-style/`（含全部 7 张截图与
    `route-style-metrics.json`）。

## Issue #112 壁纸预设与动效系统重构验收（2026-10-04）

历史验收记录：以下旧 motion budget 与数值由 Issue #114 的 Motion Budget v2
取代， 不能作为当前最低可感知性通过依据。

- [x] Utility archetype（SettingsPage 外观页）与 Search Canvas（Home
      Zen/Widgets）：
  - SettingsPage 壁纸设置区集成离散档位滑动选择器（SettingsPresetSlider）与
    WallpaperCompositionDialog，负责壁纸来源、构图焦点与呈现预设调整；
  - 首页 Canvas 与设置页预览统一复用 WallpaperSurface 组件，建立隔离 stacking
    context（全屏 fixed，z-index: -1；嵌入模式 absolute，z-index: 0）。
- [x] 离散预设模型（WallpaperPresentation）与 Canonical 默认值：
  - 遮罩预设四档（`WALLPAPER_READABILITY_STAGES`）：clear 12%、balanced
    24%（默认）、quiet 36%、focus 48%；
  - 模糊预设四档（`WALLPAPER_SOFTNESS_STAGES`）：none 0px（默认）、subtle
    2px、soft 5px、hazy 9px；
  - 色调预设三档（`WALLPAPER_TONE_STAGES`）：natural（默认）、soft、mono；
  - 动效模式四档（`WALLPAPER_MOTION_STAGES`）：off（默认）、ambient、drift、zoom；
  - 动效强度四档（`WALLPAPER_MOTION_LEVEL_STAGES`）：subtle、soft（默认）、standard、pronounced；
  - 空壁纸/画布动效（`CANVAS_MOTION_STAGES`）：off（默认）、ambient；强度默认为
    soft；
  - 系统默认呈现状态：`{ composition: { focalX: 0.5, focalY: 0.5 }, readability: "balanced", softness: "none", tone: "natural", motion: "off", motionLevel: "soft" }`。
- [x] DOM 层级架构与 CSS 变量绑定：
  - `.wallpaper-surface` 拥有背景梯度与 CSS 变量；
  - `.wallpaper-surface__overscan`（内部 z-index: 0）消费
    `--wallpaper-overscan-x/y`；
  - `.wallpaper-surface__image` 消费
    `--wallpaper-image`、`--wallpaper-filter`、`--wallpaper-position`，`transform-origin`
    锁定构图焦点；
  - `.wallpaper__ambient`（内部 z-index: 1）仅在 `motion === "ambient"`
    时挂载，拥有 `.wallpaper__ambient-field-a` 与
    `.wallpaper__ambient-field-b`；
  - `.wallpaper-surface__mask`（内部 z-index: 2）消费 `--wallpaper-mask`；
  - 装饰层均为 `pointer-events: none` 且置于 `aria-hidden`。
- [x] 全局动效预算（GLOBAL_MOTION_BUDGET）与时序参数：
  - 双环境光场各分担一半混色（`ambientFieldMix = ambientMix / 2`），单场 <=
    4.0%，总强调色贡献严格 <= 8.0%；
  - 动效周期 >= 28s：ambient 双场分别为 28s（Field A，半径 58vmax，相位 -7s）与
    37s（Field B，半径 42vmax）；drift 为 54s；zoom 为 58s；统一采用
    `cubic-bezier(0.45, 0, 0.55, 1)` 缓动；
  - 漂移最大位移 <= 1.0%（各档位 x: 0.25%, 0.45%, 0.65%, 0.90%；y: 0.18%, 0.30%,
    0.45%, 0.60%）；
  - 推近缩放增量 <= 4.0%（各档位 scale: 1.012, 1.020, 1.028, 1.040）；
  - 色调协同：mono（黑白）模式下光场颜色强制切换为纯白中性光
    `--wallpaper-neutral-light`（#ffffff），强调色贡献严格为 0%。
- [x] Overscan 溢出几何计算（calculateWallpaperOverscan）：
  - 严格采用 `3 * blur * scale` 结合位移比例计算外扩补偿，通过
    `--wallpaper-overscan-x/y`（`calc(-${percentage}% - ${pixels}px)`）负向内嵌；彻底消除视口边缘模糊白边与动效位移露底。
- [x] 减弱动效与空壁纸降级策略：
  - 无壁纸（hasWallpaper === false）时 drift 与 zoom 降级为 off，canvas
    允许保留静态/环境光；
  - 减弱动态（prefers-reduced-motion: reduce）时 drift 与 zoom 降级为
    off，ambient 保持模式但位移与缩放强制归零（travel: 0, scale: 1），全局 CSS
    强制 `animation: none !important; transform: none;`；不修改用户持久化值。
- [x] 每源独立呈现持久化与淘汰机制（Per-Source Retention）：
  - `wallpaperPresentations` 记录每张壁纸的独立构图与呈现参数；
  - 远端 URL 与 CSS 渐变壁纸实施 LRU 淘汰，上限 24
    条（`MAX_REMOTE_OR_GRADIENT_PRESENTATIONS = 24`）；当前壁纸（currentSource）受保护不被淘汰；上传壁纸不计入
    24 条配额；非当前 `data:` 图片 URL 自动清理。
- [x] 数据库单向平滑迁移（DB Migration-Only Legacy）：
  - SQLite `preferences` 表中 legacy
    字段（wallpaper_mask/blur/grayscale/glow_strength/ambient_motion_mode/ambient_motion_strength）仅用于只读单向迁移映射（`migrateLegacyWallpaperPresentation`），新逻辑不再回写旧字段；新增
    `wallpaper_presentations`、`canvas_motion` 与 `canvas_motion_level` 字段。
- [x] 规范例外（Phase 0 授权）：
  - 所有合法预设组合均通过数学与工程约束保证动效预算安全（GLOBAL_MOTION_BUDGET）；但用户自定义壁纸属于任意原始材质或高对比/高亮主体，在“清透（clear
    12%）+ 无模糊（none 0px）+ 原色（natural）”最弱干预组合下，系统不保证
    Search-first
    绝对可读性；保留用户自由选择权，不作虚假的全图绝对可读安全声明。
- [x] 实页与调色板：390×844 / 768×900 / 1440×900 × light/dark × Zen/Widgets 共
      12 格，八类确定性素材（浅色、深色、高饱和、高频纹理、主体左/右/中央、CSS
      gradient）；均无横向溢出。截图 `/tmp/omp-sshots-1599378e50a76a4a.webp` 至
      `/tmp/omp-sshots-15993795b3676a54.webp`。
- [x] 默认值、独立 readability/softness/tone stages、三类 motion
      各四档及最高组合共 27 格真实首页截图；mono 透明渐变修复后 base/mask 均为
      rgb(255,255,255)，不再透出 accent 色。
- [x] ambient/drift/zoom 各连续观察 11 秒，周期分别保持 28/37、54、58 秒，只有
      transform 缓慢变化；截图差异比例为
      0.0117%、2.4371%、1.0842%，没有快速呼吸或环状涟漪。系统 reduced-motion 后
      animation=none、transform=none，不改保存值。
- [x] Settings 外观页 390/768/1440 × light/dark
      六格均无横向溢出，当前值显示“均衡 · 24%”“轻柔 · 2px”；axe 0 confirmed
      violations（2 项需人工判断），修复后浏览器无新增 runtime error。截图
      `/tmp/omp-sshots-1599390040676a73.webp` 至
      `/tmp/omp-sshots-15993902fda76a78.webp`。
- [x] 自动化测试与质量门禁：
  - `src/shared/wallpaper-presentation.test.ts`（13 tests）全通过；
  - `src/features/preferences/preferences.test.ts` 与
    `src/features/wallpaper/wallpaper.test.ts`（27 tests）全通过；
  - `web/src/components/searcher/SettingsPresetSlider.test.tsx` 通过；
  - `web/e2e/wallpaper.test.ts` 全 14 steps 通过，包括 pointer 草稿零 PATCH /
    release 单次提交、键盘 stages、按来源恢复、focal 冻结和 mono 透明渐变。
  - 全套单元测试通过；production build、入口 typecheck 与变更范围 lint/format
    通过；check:ui ownership/visual 均为零违规，baseline 未变。全仓库 lint 另有
    9 个不属于本次变更的 search/local/api 存量问题，全局 format check 的既有
    baseline JSON 等文件未通过；未扩展范围修复。

## Issue #103 快捷键说明与上下文验收（2026-10-04）

- [x] Utility archetype：设置 h1 → 快捷键 h2 → 五组 h3；复用
      SettingsSection/SettingsActionCard。只读入口无需登录，无自定义、持久化或全局
      dispatcher。
- [x] Catalog 为 binding、平台格式化和搜索命令的唯一 owner；已有
      Search/Notes/Ask handler 保持各自事件归属。keycap 消费既有 token，CSS 只归
      settings.css，不增加 baseline。
- [x] 修复前全局 Ctrl+K 抢占普通 input，额外 Shift 也触发；修复后
      input/textarea/select/contenteditable/role=textbox descendants
      均保留焦点。Notes K 插入链接并保留选区，B/I/Shift+X/S 与 Ask composer 内
      F/离开 Ask 后不接管均通过真实 E2E。
- [x] 全部五个 prefix、游客 AI 登录边界、登录后 AI 模式、新标签页 query
      与原页不跳转通过。Settings 直接访问/刷新/active/未知路径404、真实
      macOS/Linux userAgent 与 screen-reader 完整组合键通过。
- [x] 最终页面 390×844 / 768×1024 / 1440×900 × light/dark
      六组实测无横向溢出；截图 `/tmp/omp-sshots-15991c86d03376c8.webp` 至
      `/tmp/omp-sshots-15991c8816f376cd.webp`。媒体主题提交后再断言，reduced-motion
      下验收；axe 0 违规、浏览器 runtime error 0。
- [x] 工作区与路由共9套95步通过；三个快捷键E2E共12步通过；production
      build/typecheck/lint/format 与 check:ui 通过（111 visual files，0
      violations/allowances/drift）。未涉及 Design Lab，既有壁纸/布局/状态矩阵由
      workspace suite 回归。

## Issue #80 Workspace semantic 验收（2026-10-03）

- [x] WorkspaceSection 为 Apps / Notes 唯一 subsection grammar：panel h2 →
      subsection h3，component-title typography、统一 header/content
      gap、canonical Badge count。
- [x] compact LoadingState / EmptyState / StatusBanner；离线 warning、错误
      alert + retry，保留标准 AlertDialog 和底栏唯一 primary。
- [x] CSS owner 保持 workspace/apps/notes/launcher/home 隔离；旧 Apps
      section/count/banner/empty 与 workspace-empty 加入 forbidden guard。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 12
      组合实页检查：无横向溢出；截图 `/tmp/workspace-matrix-screenshots/01_*` 至
      `14_*`。
- [x] Apps root/folder/nested、Notes
      root/editor、长标题/正文、加载、错误重试、离线缓存、空态；移动 Sheet
      与桌面 aside 行为保持。
- [x] 真实 Workspace suite 覆盖切换、primary、Back/Close dirty
      protection、Escape/focus trap/return、DnD、autosave/conflict/version。
- [x] focused feedback 6 steps、ownership 37 tests、单元合同 348
      tests；typecheck、lint、build、check:ui 通过，visual baseline=0。

## Issue #75 壁纸构图与设置页验收（2026-10-03）

- [x] Utility archetype：SettingsPage 外观页；primary interaction
      为壁纸构图调整与偏好同步。
- [x] 壁纸表面语义：复用 Design System 材质，WallpaperSurface
      作为共享组件服务于首页全屏底色与设置页实时构图预览；系统级语义新增
      `--wallpaper-overlay-contrast: #ffffff;`（图像反差叠加层专属）、`--wallpaper-focal-marker-size: 24px;`、`--wallpaper-focal-marker-dot-size: 4px;`、`--wallpaper-preview-mobile-height: 380px;`（移动竖屏视口），全部由
      `tokens.css` 拥有。
- [x] 构图与裁剪几何：blur = 0 时彻底移除历史固定的
      `transform: scale(1.06)`，消除多余裁切；blur > 0 时采用基于模糊半径的负
      inset 过扫描；桌面 16:9 与移动端 9:19.5
      双视口实时同步，指针交互严格反向映射至原图归一化坐标（0..1），方向键/Home
      键提供精细与复位控制且防页面滚屏。
- [x] 历史卡片采用按可用宽度自动换行的网格，最小宽度由两个
      `--control-touch-target` 加行间距确定；菜单保持 44px
      触控目标。390/768/1440 × light/dark
      实测卡片中心命中主操作，菜单不拦截，页面无横向溢出。
- [x] 生命周期与引用完整性：删除当前壁纸提供明确的“恢复默认背景”双重风险确认，删除成功后原位清除并以
      `sync: false` 从本地 `wallpaperCompositions` 剔除该
      UUID，避免后续请求携带已删除资源
      404；失败保留卡片与提示；清除壁纸仅停止使用、保留上传历史；远程
      URL/渐变仅更新偏好不调用资源 API。
- [x] 匿名设备语义：文案校准为“设置保存在当前设备/浏览器；仅登录后新上传的壁纸可同步至云端（壁纸最大
      5 MiB）”，不产生匿名自动迁移歧义。
- [x] 390×844 / 768×1024 / 1440×900 实页与截图：light/dark 共 6
      种视口与主题实页无横向溢出，卡片单列至多列响应式正常；Dialog
      在移动端自适应。
- [x] 门禁：UI Guard 92 files、0
      violations/allowances/drift；全量契约测试与生产壁纸 E2E 7
      步通过；SettingsPage/后端入口 typecheck
      通过。最终实页重新验证六种布局与构图 Dialog；浏览器 runtime error 为 0。

## Issue #68 Auth surface 验收（2026-10-03）

- [x] Utility archetype 不变；PageShell 管页面布局，auth.css
      唯一管理内部窄卡片。
- [x] 复用 surface/border/radius/shadow/spacing token；无新 raw 值，不修改
      Input/Button。
- [x] /login 与 /register：390/768/1440 × light/dark 实页截图与 geometry 检查。
      卡片宽分别为 358/420/420px，padding 均为
      24px，无横向溢出；字段和按钮不越界。
- [x] 标题、说明、字段、按钮与 footer 共用内容轴；桌面窄表单、手机左右各 16px
      留白。
- [x] Tab 到密码字段保持 focus-visible；Enter 提交错误凭据展示错误，next 保留。
- [x] Production routing 10 steps 通过，覆盖登录/注册成功及 next 跳转；geometry
      修复前失败、修复后通过。
- [x] UI Guard：90 files、0 violations；build、Auth typecheck、受影响 TS lint
      通过。
- [x] 浏览器无 page errors；主题截图等待 theme 提交及正文颜色 transition 完成。

## Issue #33 advisor 核查记录（2026-09-30）

本记录区分已验证结果、保留的迁移边界与未解决问题；不代替上述 PR 验收。

- 扫描器实际处理 60 个非测试 CSS/TSX；文件 glob 的 61 个匹配中有一个
  `NoteCard.test.tsx`，不是遗漏约 200 个源码文件。扫描发生在 baseline 比较之前。
- 本次运行：796 个存量违规，新增、增加计数、stale allowance 均为 0；`global.css`
  有 377 个、`AccountPage.tsx` 有 164 个；`AdminPage.tsx` 与 `design-lab.css`
  均为 0。这些数字不代表全站无历史样式债务。
- Account 的两处 PageShell raw maxWidth 已移除；页面内部旧 link-button 和 inline
  presentation 仍存在。本次不把 Account 全量重写纳入 Admin/Settings/Ask/Design
  Lab 的迁移范围。
- Button 使用 `ComponentProps<typeof ButtonPrimitive>` 并透传 props，包含 React
  19 ref。Admin 的 reset/delete opener 在行内 onClick 记录到共享
  `modalTriggerRef`，创建弹窗使用 `createTriggerRef`；不是所有 Dialog
  都回到“添加新用户”。本次真实浏览器打开行内重置弹窗再按 Esc，焦点回到
  `title="重置用户密码"` 的按钮，未提交密码变更。创建按钮额外写入共享 ref
  是冗余，不构成此次回焦失败。
- 390px 深色 Settings 外观页：实际截图与 axe 检查，0 confirmed violations，1
  项需人工判断；无 page error。Settings 专用移动端 rendering/interaction
  永久测试尚未新增，不把浏览器矩阵描述成自动化测试覆盖。
- 带现有临时 mock 会话读取壁纸历史及 owner 图片均返回 200，当前页面无同步失败
  alert。CSS gradient
  的前后端校验不一致仍未修复，不能据此声称渐变保存已通过；详见 Design System
  的迁移范围。
- 旧 Note/壁纸控件的 focus 色与 offset 尚未全部收敛，check:ui
  不覆盖这些语义；Badge/Table 主题映射、历史语法错误、lint
  示例与路由测试的最终通过证据见本次原验收，不重复运行已通过检查。

## Issue #23 壁纸 canvas 验收（2026-09-30）

- [x] Search Canvas；primary interaction 仍为搜索。未新增控件、标题、CTA、
      surface level 或卡片材质；新增 glow Token 由 tokens.css 负责，边界见
      Design System。
- [x] 图片/glow/mask 内部层级为 0/1/2，滤镜仅在图片层；mask、图片专属材质标记、
      appearance 数据模型与 API 未改变。无新增静态 raw
      spacing/font/shadow/radius。
- [x] 生产实站匿名 2,880 个组合：390×844 / 768×1024 / 1440×900、light/dark、
      blue/cyan/violet/orange/mono、无壁纸/不透明 SVG 图片/linear/radial
      gradient、 blur 0/30、grayscale 0/1、mask
      0/.75/.95、Zen/Widgets；图层、滤镜、 mask、reduced-motion、URL
      材质标记与横向 overflow 检查均通过。 30px
      是超出设置上限的匿名渲染压力值，不表示 API 接受该值。
- [x] 独立临时数据库真实注册/登录、PNG 上传及 owner 图片读取返回 200； 390px
      下合法最大 blur=24、grayscale=1 的 light Zen / dark Widgets
      截图无边缘漏白或同步错误。登录态三视口×两主题×两模式共 12 张代表截图；
      640/960/1280 无壁纸、隐藏标题的 Widgets 实页均无横向溢出。
- [x] 浏览器实际动画 duration=8000ms；keyframes 仅含 opacity/transform， opacity
      .88→1→.88、scale 1→1.025→1。连续观察约 6 秒，opacity
      .881317→.960171→.996269；glow filter 始终为 none。reduced-motion 的
      computed animation-name 为 none。
- [x] 搜索输入、Tab 到搜索按钮、常用网站 Dialog 打开与 Escape 关闭可用； 关闭后
      focus 回到“打开常用网站面板”。装饰层不拦截交互。
- [x] 有效配置场景的 page errors / console errors 为 0；首页 axe WCAG A/AA 为 0
      confirmed violations、1 incomplete。装饰层未进入 Accessibility Tree。
- [x] check:ui：60 个文件、796 个历史违规；新增/增加计数/stale allowance 均为
      0， baseline 未修改。build 通过，保留 >500 kB chunk 警告；11
      项相关契约测试、 App.tsx typecheck/lint/format 通过，隔离工作区基线 195
      项测试通过。
- [x] 本次未修改 Design Lab、业务状态、权限、history 或 conversation model，
      不重复验收无关组件状态。浏览器组合是实页 smoke，不新增源码快照或 CSS
      文本测试。 gradient 验证仅证明前端渲染；既有登录态 gradient
      持久化限制未纳入本次修复。

## Issue #36 Workspace Shell 与空间轻桌面重构（2026-09-30）

### 代码与契约实现（已落地）

- [x] Workspace
      语义表面与分层契约：桌面端（>=768px）实现为非模态右侧边面板（`<aside>`），使用
      `--surface-workspace: var(--surface-solid)`（非模态 L3
      覆盖层）、`--shadow-workspace: var(--shadow-l2)`、`--elevation-workspace: 45`；几何约束采用
      `--workspace-width: 400px`、`--workspace-inset: var(--space-4)`、`--workspace-top-inset: calc(var(--control-height) + var(--space-6))`（安全避让顶栏）；面板不设
      backdrop 背景遮罩，不执行全局
      focus-trap，主页底层的搜索框与画布内容保持可直接交互；支持 Escape
      键或头部按钮收起，收起后焦点归还至唤起入口。
- [x] 移动端模态适配：移动端（<768px）适配为模态底部抽屉（`Sheet`），使用
      `--elevation-sheet: 50` 与 `--elevation-sheet-backdrop: 49`，高度受
      `--workspace-mobile-height: 820px`
      约束；顶部带有居中抓手条（`.workspace-grip`），支持手势向下滑动收起与
      safe-area 安全区避让。
- [x] 导航与 Switcher 融合：首页
      Dock（Widgets）与边缘入口（Zen，`.zen-edge-trigger`）作为进入工作区（apps
      / notes）的轻量入口，Zen 边缘唤起不强加 Bento 桌面卡片；工作区内部底栏整合
      WorkspaceNavigation
      Switcher（应用与便签平滑切换）；根视图（apps/root、notes/root）提供搜索与单一
      primary 主操作（“添加应用” / “新建便签”）；二级嵌套视图头部提供 `onBack`
      返回按钮。
- [x] 应用表单 Back/Close 通过 AlertDialog 保护未保存修改；Nested view 隐藏
      Switcher。
- [x] 便签编辑器依靠本地草稿与 autosave 保护 Close
      后立即重开的内容；冲突与版本历史回归通过。
- [x] 文件夹删除等破坏性操作保留真正模态确认。
- [x] 废弃组件清理与职责收敛：彻底删除废弃的 `ContentSheet.tsx` 与
      `AppFormDialog.tsx`；应用表单改为纯面板组件 `AppForm.tsx`；`NoteEditor`
      作用域限定于 `NotesWorkspace` 面板主体内部，保留 scoped
      本地草稿与自动保存机制；状态由 `workspace-state.ts` 集中管理，独立维护
      apps 与 notes 搜索词。
- [x] 主页职责正交分离与 QuickLaunch
      移除：主页专注于“使用内容”，完全移除主页卡片上的管理模式切换、浮动管理条（`.home-managing-bar`）及卡片内竞争的启动管理按钮；所有应用新建、编辑、分组管理及便签编辑统一下沉至
      Workspace 内部完成。
- [x] Controlled Notes 便签大盘：筛选至多 5
      张固定的主页便签（`selectHomeNotes`），按 `sortOrder` 升序及 `id`
      确定性排序；基于 CSS 槽位与
      `--notes-board-step: 54px`、`--notes-board-tilt: 1.2deg` 及
      `--space-1`~`--space-5` 交错内联偏移呈现叠放质感；hover / focus-within
      平整（`transform: none`）并提升层级（`z-index: 6`）；视口 >=768px 且容器
      >280px 时保持重叠槽位大盘；移动端（<=767px）或容器
      <=280px（`@container bento-card (max-width: 280px)`）强制回流为单列垂直流（`align-self: stretch`）；采用网格内在高度布局，不再向服务器写入或持久化绝对
      x/y 坐标；支持 `prefers-reduced-motion`。
- [x] Bento 5:3 容器网格：Widgets 布局使用
      `@container bento-wrapper (min-width: 680px)` 5fr 3fr 不对称比例（应用卡片
      5fr，便签卡片 3fr），卡片高度自适应内容，不强制等高。

### 实页与视觉验证（2026-10-01）

- [x] 390×844 / 768×1024 / 1440×900：light/dark
      实页截图与交互通过；真实上传壁纸组合无页面/面板横向溢出，Apps 面板 axe
      WCAG A/AA 无已确认违规（各有 2 项需人工判断）。
- [x] 640/767/768/960/1280 临界宽度：验证 768px desktop/mobile 切换、Bento 5:3
      与 <=280px 便签容器的流式回退；卡片宽度未溢出容器。
- [x] Zen / Widgets × light / dark：375/390/768/1024/1440/1920 实页通过；Zen
      edge trigger、FloatingNotes
      与桌面布局保留。另验证空、少量、多条内容、长标题及 reduced-motion。
- [x] 键盘与状态：Header/Footer 不随 Body
      滚动；桌面无焦点陷阱、移动端有焦点陷阱与 swipe close；菜单先处理
      Escape，随后收起 Workspace
      并回焦入口。应用保存失败保留表单，便签保存失败保留草稿；列表请求错误与离线缓存可重试恢复。
- [x] 构建、typecheck、198 项测试、生产 Workspace 7 个回归步骤及 check:ui
      通过（0 新违规，既有 baseline 从 796 缩至
      759）。应用排序修复前失败、修复后即时更新及刷新持久化通过；图标大小与标签偏好通过。
- [x] 本次修改范围 lint/format 单独验证；全仓 lint 的 13 项问题及 format 的
      settings.css 问题均位于相对 HEAD 未修改文件，保留既有债务、不扩大本次
      scope。

## Issue #38 Ask 会话工作区验收（2026-10-01）

- [x] Workbench；primary interaction 为 Composer。Searcher 保留
      Provider、API、SSE、SQLite 与 owner 隔离；assistant-ui external-store
      runtime 与 repository 负责对话交互，不迁移到 assistant-cloud。
- [x] 常规操作复用 shadcn Button/Popover/Dialog/Sheet；Header 只放会话操作。正文
      760px、代码 900px 的边界由 Ask feature stylesheet 持有，沿用 Design System
      Token。
- [x] 五个 CSS 视口 390×844 / 640×900 / 768×1024 / 1024×768 / 1440×900 的
      light/dark 空会话和长会话实页通过：页面横向溢出为 0，Composer
      发送可见，普通视口 Thread 无额外滚动。空会话 reasoning
      supported/unsupported 共 20 场景的已有证据保留。
- [x] 最终表格回归逐项读取
      innerHeight、visualViewport.height、documentElement.clientHeight，三者均与目标高度相同；截图
      DPR=1.25，物理尺寸不作为 CSS 视口尺寸。390/768/1440
      浅深色截图已保存于验收工具输出。
- [x] 额外 390×500 light/dark 短屏边界：空会话可局部滚动，长会话 Thread
      额外滚动范围
      92px，滚动后发送操作可见。此证据是浏览器缩短视口，不声称已验收实体手机软键盘。
- [x] 修复实页发现的代码/表格键盘横滚：代码 scrollLeft=40、表格外层 region
      scrollLeft=35，均通过真实 ArrowRight 输入并保持焦点。390×844 长 Markdown
      页面 axe WCAG A/AA 为 0 confirmed violations、1 incomplete；page errors 为
      0。
- [x] 历史 Sheet 与会话菜单 Escape 后回焦已验证；reduced-motion
      下复查布局。此前错误态五视口×两主题实页证据保留，不重复未变化的检查。
- [x] Gemini 真实 Provider 的
      streaming、停止、重新生成、编辑分支、图片/文本附件、只读 Tools
      与导出已验收；临时会话与 Blob 清理已核对数据库级联及 no-store。SearXNG 的
      HTTP 协议、tool/source 流与 502
      失败处理使用受控本地服务，未把它描述成公网搜索验收。
- [x] deno task test：286 passed / 0
      failed；包含旧数据库升级与分支恢复回归。最终 AskPage typecheck、Ask 27
      文件 lint、28 文件 format 检查通过；后续键盘入口修改已单独
      typecheck/lint/format/build 和实页复查。
- [x] 最终 build 与 check:ui 通过：87 文件，758 个既有 baseline
      匹配，新增/增加/stale 均为 0；未扩大 allowlist。构建仍报告大于 500 kB 的
      chunk 警告。
- [x] README、CHANGELOG 与 Design System 已同步。未修改首页 Zen/Widgets
      或壁纸，相关组合不作为本次 Ask 验收范围。
- [x] Advisor 复核：移除 Thread 与 Header 52px 耦合的冗余 height，保留
      flex:1/min-height:0；五视口×两主题空会话与长会话复查通过，普通 Thread
      滚动范围为 0，390×500 为 92px。
- [x] visualViewport 独立变化实测：Chromium pageScaleFactor=1.25 时
      innerHeight=844、visualViewport.height=675.2，约束后的 Thread
      bottom=675.1875；临时去掉约束后 bottom=820。证明 CSS-only
      不能处理该缩放边界；仍不声称已验收实体手机软键盘。

## Issue #41 Apps Folder IA 与上下文导航（2026-10-01）

- [x] 复用 Workspace archetype、既有 folder/launcher semantic classes 和
      Button；不新增视觉 Token，不修改 Notes/Bento 或后端 schema。
- [x] Root 中每个 App 最多直接展示一次，仅常用网站使用
      pinnedSortOrder；文件夹、未分组与全部网站保留导航实体。
- [x] apps/all 显示 Folder tiles + ungrouped apps；Folder 点击进入 Workspace
      route，不再显示 Launcher internal FolderView。
- [x] Root/All → group/ungrouped → Back 返回进入上下文；create/edit
      保留上下文，group management 保持独立 nested view。
- [x] name/URL 返回 App，group name 返回 Folder，未分组返回导航结果；清空 query
      恢复 Root，Apps/Notes query 独立保存。
- [x] 390×844 / 768×1024 / 1440×900，light/dark：Root 与 All 实页截图通过；14
      个大小混合文件夹、空文件夹、长名称及 12
      个成员的文件夹正常浏览，无页面/面板横向溢出；大小切换后三种宽度无横向溢出。
- [x] 空未分组、Folder 编辑返回、删除 group 保留成员已验证；浏览器无 page
      errors。
- [x] 205 项源码测试、生产 Workspace 8 个回归步骤、build/typecheck、修改范围
      lint/format 通过；check:ui 为 0 新违规、0 drift。

## Issue #42 Workspace Apps 几何与单一主操作（2026-10-01）

- [x] 基于已合入的 #41 IA；仅作用于 Workspace presentation，不改 Home/Zen
      launcher 样式、后端或 route。
- [x] 复用固定宽度 tracks 和既有空间 Token；通过 grid alignment 居中，不用左右
      padding 模拟居中。
- [x] 1/2/3/4 tile：常用、搜索、All、未分组及普通 group 共 144
      次浏览器几何检查通过，左右剩余空间差 <=8px；375px mobile 和 400px desktop
      Workspace 均通过。
- [x] 40 Apps（含 80 字符名称）、12 个长名称 small/large folder 混排，在
      375/390/768/1440、light/dark 下无横向 overflow；行列 gap 均为 4px，large
      folder 保持 140×140 的 2×2 tracks；1–4 tile 检查同时断言内部图标未越过
      tile 边界。
- [x] 方形几何补充修正后重新检查上述六种实页：图标 68×68、四 tile 左右余量差均为
      0px、grid 无横向 overflow；生产 Workspace 9 步回归重新通过。
- [x] Root 正常仅“添加应用”为 primary，整理仅“完成整理”为
      primary，完成或搜索后恢复添加；nested 不增加 footer primary。
- [x] Quick Apps 三种 icon size × 两种 label preference、pinned ordering
      与仅打开/在工作区中管理的菜单契约通过；打开 Workspace 不改变 Quick Apps 或
      Zen grid 的对齐和宽度。
- [x] 390×844 / 768×1024 / 1440×900，light/dark 六种实际页面截图已检查；375px
      长文件夹名整理列表实页无 overflow、无竞争 primary，浏览器无 page errors。
- [x] 205 项源码测试、生产 Workspace 9 个回归步骤、build/typecheck、修改范围
      lint 通过；check:ui 为 0 新违规、0 drift。

## Issue #43 Notes Root 原地浏览与几何（2026-10-01）

- [x] 复用 Workspace / Workbench 与 NoteCard 既有展开、操作菜单和 Button；未新增
      surface、视觉 Token 或全局 `.note-card` override，保留纸张、折角和阴影。
- [x] 修复前实页：3 条便签渲染 5 张卡片，card 250px / list
      366px，无展开入口；修复后固定和其他分组共 3 张，card / list 均 366px。
- [x] 独立临时数据库生产实页 390×844 / 768×1024 / 1440×900 × light/dark
      六张截图：compact 与 expanded 卡片均填满列表，宽差
      0px；长标题省略，无页面或面板横向
      overflow，纸张视觉保持。媒体偏好、实际主题与 reduced-motion 已校准；移动
      Sheet / desktop aside 均覆盖。
- [x] 实际点击展开、折叠、菜单均留在 Notes
      Root；搜索命中一次，清空恢复互斥分组；卡片主体进 editor、Back 回 Root。API
      回读三个 Note 的 version 均为 1、layout 均为 null，Home 展开正文仍保留。
- [x] UI smoke 脚本修正：浏览器 helper 的空字符串 fill 未提交 React
      query，改用真实键盘清空后复查；hover 后点击既有 action controls，不用
      force 绕过 pointer-events。
- [x] 审查发现禁用 grip 的 pointer-events 使点击穿透到卡片，实页复现进入
      editor；改为不参与 Tab 的 inert Button（aria-disabled）后，固定与搜索卡片
      `.note-drag` 的真实指针点击均留在 Root。
- [x] 补查触屏发现 action controls 原本仅 hover 可达；新增 `.notes-workspace` 内
      `(hover: none)` 常显操作和标题避让，不改 Home/Zen。390×844 真触屏模拟校准
      `maxTouchPoints=1`、coarse、hover:none；无 hover 的 tap 展开/折叠/菜单保持
      Root，菜单实际可见，tap 主体进入 editor。light/dark 截图与展开宽差
      0px、无横向 overflow 通过。
- [x] 浏览器 helper 每轮动作会恢复 viewport，真触屏验证改在单次 run
      内配置、reload 和 tap；只把校准媒体条件下的结果计为触屏证据。
- [x] 浏览器 console error 为 0；一次页面 reload 中 SSE `/api/notes/events`
      产生预期 `ERR_ABORTED`，无 JavaScript runtime error。
- [x] build、App.tsx typecheck、源文件 lint/format 与 205
      项源码测试通过；check:ui 扫描 71 文件，759 存量违规，0 新违规 / 增量 /
      stale allowance，未增加 baseline。
- [x] 最终生产 Workspace 回归：1 项集成测试 / 12 步全部通过（71
      秒）。覆盖去重、搜索空状态、原地展开与控制隔离、真实 touch tap、零 Note
      写请求与完整 DTO
      不变、删除展开项、六种几何组合及展开长代码无面板溢出、Home/Zen
      模式和坐标隔离、缓存错误浏览与 retry 200 后新增服务端便签出现。
- [x] Editor empty / unsynced / saving / save-error、local
      draft、autosave、conflict、version-history error / restore、new note /
      Back / Close 均由真实服务回归覆盖；修改后的测试 lint/format 通过。
- [x] 验收脚本缺陷已修复并复查：遗漏 request observer、可跳过的
      Home/展开几何断言、错误 IndexedDB 名称、retry 仅清错不等新数据；deferred
      save 导致旧 version 的冲突 fixture 返回 409，改为保存后回读 version 后全套
      12 步通过。先前弱断言结果不作为这些 contract 的证据。
- [x] Advisor 采纳项复验：inert grip 移除 aria-hidden，提供“不可排序”名称，保留
      aria-disabled / tabIndex=-1 和点击隔离。真实 Tab 从搜索进入“展开”（跳过
      inert grip），Enter 原地展开，点击 grip 不进入 editor；axe 的
      aria-hidden-focus / button-name 两项规则均无违规（非全量 accessibility
      audit）。
- [x] Deferred PATCH 的 finally 无条件释放 saveHold 后移除 route；CHANGELOG
      明确记录触屏操作常显。修正后的最终源码 205 项测试、生产 Workspace 12
      步（58 秒）、App.tsx typecheck、修改范围 lint/format、build 与 check:ui
      通过；UI baseline 保持 0 新 drift。
- [x] PR 提交前移除可排序 Gamma grip 的条件断言，必需控件缺失即失败；修改范围
      lint/format 与生产 Workspace 12 步重新通过（55 秒）。
- [x] React Doctor 未报告 NotesWorkspace 问题；全仓 65/100 的 28
      项提示位于其他既有文件，本次不扩大范围。诊断命令自动写入的临时依赖已移除。
- [x] 本次无 Design Lab / API / 权限 / conversation model
      变更；不新增基础控件，不重做 Home/Zen 或 guest 页面。
- [x] PR 分支整合最新 main（#38 Ask 工作区）后：293 项源码测试、生产 Workspace
      12 步（54 秒）、build、App.tsx typecheck 和 check:ui 通过；UI Guard 扫描
      88 文件、758 存量违规，0 新违规 / 增量 / stale allowance。CHANGELOG
      合并保留两项功能记录。

## Issue #44 Bento 与 Workspace 最终回归（含 #47，2026-10-01）

- [x] Search Canvas / Workspace 复用现有语义表面、Button、Context Menu 与
      AlertDialog，不新增基础控件。宽布局统一消费正式 Bento 列比 Token，无第二份
      raw 列比；两侧内容、Apps-only、Notes-only、两侧空态和 intrinsic height
      通过实际卡片几何断言。
- [x] Unified Launcher 取代旧 Apps IA 和路由：root
      混排、空文件夹、搜索去重、原地文件夹浏览、返回焦点/滚动位置、改名/大小/删除、单一
      primary
      均通过。App→Folder、Folder→App/Folder、App→App、文件夹内部排序分别验证；真实
      pointer、KeyboardSensor 和 touch 归组均覆盖。
- [x] Root 混排以单次 owner-scoped 事务更新 App 与 Folder；foreign/missing
      Folder 返回 404 并回滚 App 更新。失败保留草稿或回滚乐观 UI，刷新与 API
      回读一致；首页 pinnedSortOrder 不被 root 排序覆盖。API regression test
      修复前因 Folder rank 未更新失败，修复后通过。
- [x] Apps loading/error/retry、stale
      cache、空态、搜索无结果、添加/编辑失败、删除/撤销；Notes
      空态、去重、控制隔离、原地展开、零写请求、saving/unsynced/error、conflict、version-history
      error、stale cache retry 均通过。错误内容不会挤出
      Header/Footer；Apps/Notes query 相互隔离。
- [x] Shell / Bento 实页覆盖
      375/390/768/1024/1440/1920、light/dark、Widgets/Zen；长文案、多项、独立
      Body 滚动、焦点归还、桌面非模态、移动 Sheet focus trap/swipe、Escape
      优先级、reduced motion 和 Home/Zen 布局与偏好隔离均通过。
- [x] 独立临时生产实例 Browser 实页及截图：390×844 / 768×1024 / 1440×900 ×
      light/dark。校准 system theme 和 reduced-motion
      后检查实际外观；页面/面板无横向 overflow，Header/Footer 在视口内。桌面无
      backdrop，移动为模态 Sheet；截图为临时验收产物，不作为永久静态文件测试。
- [x] 1440px dark Apps Workspace：axe 的 button-name / aria-hidden-focus /
      aria-valid-attr-value / label 四项规则 0 violations，浏览器无 JavaScript
      runtime error；此项不是全量 accessibility audit。
- [x] 修正脚本假通过：移除手工 DOM theme 回显和 Token/source wiring 断言，theme
      system 使用媒体偏好与实际 dataset 等待。排序断言比较确切 ID
      顺序、rank、groupId、回滚与刷新状态；KeyboardSensor
      等待激活帧及实际落点后再释放，不用固定 sleep 代替状态验证。
- [x] 294 项源码测试、五套生产实页回归通过；最终有效回归共 57 步（Workspace
      8、Shell 5、Launcher 13、Notes 11、Bento 20）。App/src/main/所有 E2E
      typecheck、修改范围 lint/format、production build 通过。check:ui 扫描 86
      文件、758 存量违规，新增/增加计数/stale allowance 均为 0，未增加
      baseline；构建保留 >500 kB chunk 提示。
- [x] README、Design System、CHANGELOG 与本 checklist
      同步最终行为；临时诊断与生成截图已清理。不改变数据库 schema、Note API、Ask
      或 Design Lab。
- [x] 发布前整合 main 的 #49 Ask 变更，保留双方独立验收记录；整合后 308
      项源码测试与五套生产实页回归（57 步）全部通过，App/src/main
      typecheck、build 和 checklist format 通过。check:ui 86 文件、757
      存量违规，新增/增加计数/stale allowance 均为 0。

## Issue #49 Ask 页面层级、空间边界与请求体策略（2026-10-01）

- [x] Workbench 复用 PageShell、既有 Button / Sheet / Dialog 与 semantic token；
      登录态只保留 Conversation Header H1，Guest 与其他页面 PageHeader 不变，
      删除无状态语义的空态 badge；未增加 raw spacing / color / shadow。
- [x] AppShell / Ask / Workspace 使用 flex 可用高度，Topbar 与 connection banner
      不收缩，上下留白均为 --space-4；shell 使用 --surface-solid、
      --border-subtle、--radius-card，main 无 card shadow。Composer 保留自身
      focus 与 elevation。移动历史 Sheet
      修复中间容器最小高度，历史列表独立滚动。
- [x] 实页六尺寸：390×844、640×900、768×1024、1024×768、1440×900、 1920×1080 ×
      light/dark。36 个空/短/长会话场景、24 个 banner 存在场景、 12
      个图片会话场景通过；页面无横向溢出或二次 viewport scroll，长消息与长历史
      内部滚动，滚动 Thread 不移动 Composer。十二张长会话截图已审阅。
- [x] Header 重命名后 H1 与 Sidebar 同步；移动 Sheet Escape 关闭并回焦历史入口；
      connection banner 重试成功后移除且 Workspace 保留。
- [x] 开发账号的只读来源 SQLite 快照上使用现有 gemini-3.1-flash-lite： PNG
      1,179,936 / 2,094,561 bytes，JSON 请求 1,573,645 / 2,793,141 bytes，
      均返回 HTTP 200、真实模型回复 BODY LIMIT 49；原开发数据库未写入。
- [x] 14 项请求体契约回归与 307 项完整测试通过，production build、 src/main.ts /
      web/src/main.tsx typecheck、修改源码 lint/format 通过。 check:ui 88
      文件、757 存量违规、0 新违规 / 增量 / stale；baseline 仅收缩 1。
- [x] React Doctor 全仓 66/100；本次不扩展到既有诊断项。诊断下载写入的 lock
      变更已撤销。实模型页面无捕获到的 pageerror / failed request。
- [x] 不修改 assistant-ui runtime、Conversation / Branch / Message contract、
      reasoning 语义、附件业务上限或其他 PageHeader；build 仍有既有大 bundle
      警告。

## Issue #52 UI Guard 零基线（2026-10-01）

- [x] 初始实测 86 文件 / 757 条违规 / 12 个 baseline-bearing 文件。分批收缩 为
      0，未使用 initialize、未修改 scanner 或 exceptions；最终 NEW / INCREASED /
      STALE 均为 0。
- [x] raw spacing、typography、radius、shadow 与 TSX presentation 按角色迁移。
      Home/Launcher 专用几何保留；真正 runtime geometry 仍由原 owner 持有。
- [x] 六宽度 390/640/768/960/1280/1440 × light/dark × 八页面共 96 场景：
      页面无横向溢出，搜索引擎控件始终位于搜索框内。390/768/1440 的浅深色
      截图已审阅；覆盖账户、模式 preview、AI Settings、Ask 与实际 Home。
- [x] 本地隔离数据库：账户资料保存显示成功状态，页面无捕获到的 pageerror /
      failed request；未修改原开发账号或数据库。
- [x] UI Guard 31 项、非 e2e 测试 339 项通过；生产
      Workspace/Launcher/Notes/Bento 5 项测试共 57 steps 通过。等待异步 Home
      hero 可见后再读取 geometry， 不在 loading placeholder 上断言。
- [x] production build、web/src/main.tsx typecheck 与修改 TSX scoped lint 通过。
- [x] Design System 同步迁移对照与保留边界，CHANGELOG 记录零 allowance 门禁。
- [ ] React Doctor 并非全绿：全仓扫描包含其他 worktree，53/100、41 项诊断；
      仅作为待核实线索，本次不修改无关业务行为或扩展修复范围。
- [x] Advisor 指出的 connection banner 间距回归已修复：390/768/1440 × light/dark
      的真实错误横幅 computed gap 均为 12px、padding 均为 8px 16px，
      无页面横向溢出；恢复网络后点击重试，横幅移除。最终 build 与 UI Guard 31
      项复查通过。compact button padding 仍为 6px 12px，不扩大到语义命名重构。

## Issue #55 背景光晕与动态偏好（2026-10-01）

- [x] Search Canvas / Utility Settings，primary 仍为搜索；复用现有 Slider、
      RadioGroup、SettingsRow 和 surface/spacing/typography
      Token，未新增基础控件。 图片/遮罩/glow/ripple ownership 见 Design
      System；本记录取代 #23 的旧图层顺序。
- [x] 30 个实页场景：390×844 / 768×1024 / 1440×900 × light/dark ×
      off、breathe、breathe_ripple、动态强度 0、动态强度 1；内部 z-index
      0/1/2/3、pointer-events none、image-only filter、无横向溢出。
      光晕默认两主题均 14%；S=0 的 glow 关键帧无 opacity/scale 幅度，ripple
      全程透明。
- [x] 12 个 mask=0/.8 对照场景，glow computed gradient 完全一致； 18 个
      reduced-motion 场景两类 animation-name 均为 none、ripple 隐藏、静态 glow
      保留。 关闭系统偏好后恢复保存模式。640/960/1280 的 Home/Settings 另有 3
      组临界宽度检查。
- [x] 已校准缓存 transaction 完成、认证/偏好同步、两帧 React/CSS
      状态提交及媒体条件。 初次 reduced-motion 实测发现模式选择器 specificity
      高于媒体覆盖，已修复并重查上述 18 场景。
      登录控件操作必须等待账号/偏好恢复，避免把启动初始态误当同步完成。
- [x] 六视口/主题的匿名 Home 与背景 Settings 共 12 张截图，六种登录态 Home
      使用真实上传 PNG、 blur=24/grayscale=1 及应用/主页便签，另有移动登录态
      Settings 截图；均已审阅。 截图已在验收时审阅；/tmp
      文件为临时产物，不作为长期证据链接，以下复核 记录保留实际 viewport、DPR
      和运行结果。
- [x] Slider 键盘 0/30% 边界、1% 步长和即时 glow 更新；off 的动态 Slider
      disabled， 原 35% 值保留。恢复默认的实际 mask/glow/motion 为 .36/.14/.35。
      匿名刷新、账号保存后刷新/重新登录、登出恢复独立匿名值均通过。
- [x] 搜索输入、快捷建议命中与选择、应用 Launcher
      打开/收起、便签卡片打开编辑器可用， elementFromPoint
      未命中壁纸层；未触发外部搜索或应用导航。 默认自然动画 8 秒采样：glow
      opacity .937162–.999872、ripple opacity 0–.0625888，glow filter 恒为
      none。
- [x] Settings / Home axe WCAG A/AA 无 confirmed violations，分别 1–2 / 2 项
      incomplete。 最后生产导航无 console error/page error；便签 SSE
      在页面离开时的 ERR_ABORTED 属于正常取消。
- [x] build、typecheck、scoped lint/format 通过；UI Guard 扫描 87 文件、0
      violations、0 drift。 全量契约测试通过；历史 mask 0/.8 从 0015 升级到 0016
      后保留，future-row mask 默认 .36。 生产导航 9 steps 通过；移除已被 #49
      废弃的 Ask breadcrumb 断言，不重新固定旧实现。
- [x] Design Lab、权限、history、conversation model
      未改，相关组件全状态不重复验收； README、Design System、仓库匿名存储
      contract 与 Unreleased 同步最终行为。
- [x] 冷启动 /settings/appearance console errors 为 0；auth/me 延迟 3 秒时只显示
      Shell loading、不渲染设置控件，认证完成后恢复值与服务端一致。deps 长度
      warning 出现在 5185 旧开发热更新会话，冷生产页未复现；现行 effect 依赖
      数组固定为 [ready, user?.id, appearanceOwner, appearance]，无条件展开。
      不以旧日志推断现行构建仍有此缺陷。
- [x] 已记录 React Doctor 扫描 web 的 58/100、14 warnings（含 .vite vendor）；
      这不是诊断全绿。未报告 state.tsx 的 effect 依赖问题，Settings 的提示指向
      既有壁纸历史数组查找；本次不扩展到全站诊断整改，也不安装新的诊断依赖。
- [x] Advisor 复核（2026-10-01）：对 Home/Settings 分别读取 innerWidth、
      innerHeight、devicePixelRatio，并核对 browser.observe 的 viewport；
      390×844 / 768×1024 / 1440×900 均为 CSS viewport，DPR 均为 1.25。 对应 Home
      原始截图为 488×1055 / 960×1280 / 1800×1125； 工具展示的 474×1024 /
      768×1024 / 1024×640 是图片缩放，不是 viewport。 三档 × light/dark
      无横向溢出；off 时静态 glow alpha=.14、opacity=1、
      animation-name=none、ripple display=none，动态 Slider 禁用。
- [x] Advisor 复核匿名主题转换：匿名 dark → 登录账号改 light → 登出恢复 dark →
      匿名改 light → 刷新仍为 light。每一步核对 DOM dataset.theme 和 IndexedDB
      appearance:anonymous，均一致；console errors 为 0。

## Issue #57 Workspace Root Layout Contract（2026-10-02）

- [x] 复用 Workspace archetype、Input / Button 与现有 Design Token；未新增 raw
      value-token、baseline allowance 或 Apps/Notes-only 页面 padding。Body
      统一拥有 `--space-4` inset；Root 使用 `--space-section-gap`，Apps control
      group / toolbar 使用 `--space-control-gap`。Launcher 与 NoteCard
      内部几何和展示语义保持独立。
- [x] Apps/Notes 共用 WorkspaceSearch：40px height、相同 radius/icon/clear/focus
      ring； 保留 Root autofocus，去除叠加的全局 outline。两侧 Footer create
      使用同一 primary Button；整理模式仅“完成整理”为 primary，nested AppForm
      不出现 Root create，不重复叠加 Body/form inset。
- [x] 改动前 production bundle 实测 Apps Search 334×36px、Notes 366×40px；
      新增跨工作区回归在旧 bundle 上因 x 差 16px
      失败。完成切换后，独立临时生产实例 375/390/768/1024/1440 × light/dark ×
      Apps/Notes 共 20 个实页场景：Search、 Footer、create 与 Switcher
      几何差均为 0px，页面/Body 无横向 overflow。 实际 dataset.theme、CSS
      viewport 与加载完成状态已校准，保留 reduced-motion。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark 的 12 张最终面板截图已审阅，
      Apps toolbar 紧凑分组，Notes fixed/other 与长标题卡片保持 full-width。
      截图为临时验收产物，不新增永久 CSS/source 快照断言。
- [x] 实页复现 clear 按钮卸载后焦点落到 BODY；修复后 390/1440 两宽度 × 两工作区
      的键盘 Enter 清除均回焦 Search，下一次键盘输入成功，浏览器 runtime errors
      为 0。 regression 同时保护独立 query、arrange disabled Search、nested
      inset 和 focus/blur 无布局变化。Focus 断言等待实际 CSS transition
      完成，不依赖固定 sleep。
- [x] 不修改 Home/Zen layout、Workspace route/state model、CRUD/schema、NoteCard
      纸张语义或 Launcher folder/DnD contract；Design System 与 Unreleased
      同步更新。
- [x] 最终验证：`deno task test` 315 项通过；`deno task test:workspace` 5 个
      suite / 58 个 step 全部通过，包含 #47 Launcher 与 #43 full-width /
      inline-expand。 production build、`deno check web/src/App.tsx`、改动 TSX /
      E2E lint 与 formatting 通过；UI Guard 扫描 88 个文件，violations /
      allowances 均为 0。 Notes 保存生命周期测试在输入前等待 nested Back
      autofocus 完成，保留所有原有
      保存/失败/重试断言；未改保存实现或使用请求拦截门控。

## Issue #63 Settings 结构与 CSS ownership（2026-10-02）

- [x] 复用 utility archetype、Section/SectionHeader、SettingsCard/SettingsRow 和
      Button/ActionGroup；SettingsSection 输出 h3，页面为 h1、当前 tab 为 h2。
      description/actions 使用 header 字段；操作/状态卡片使用
      SettingsActionCard， AI 成功/失败提示使用 StatusBanner，不改业务
      API、同步机制或视觉主题。
- [x] 四个 Settings 路由 × 390×844 / 768×1024 / 1440×900 × light/dark 共 24
      个实页场景已采集截图并验证：tab 标题到首个分组 24px，header 到内容
      16px，均对应现有 gap token；section、heading、description margin 为 0，
      active nav 正确，页面无横向溢出。主题验证等待有限 animation/transition
      完成；dark 的 h2/h3 均为 rgb(235,238,242)，不使用主题切换中间帧作为证据。
- [x] 599/600/601、958/959/960 viewport 实页无 overflow；631/632/633 viewport
      对应 599/600/601px Settings 容器，row 在 <=600 时 column、601 时 row。 959
      时 nav 为两列 grid，960 时恢复侧栏；640/960/1280 Provider 追加检查 无
      overflow，卡片 padding 24px、ActionGroup gap 8px。
- [x] 已验证匿名登录提示、登录后的 Provider 空态、已配置 Provider/model row；
      添加/编辑弹窗、API Key 可见性切换、Escape 关闭、推理配置提交并刷新保留，
      模型禁用后从可用列表移除；默认搜索引擎修改后刷新保留。AI 工作区、回收站、
      Design Lab 三个 action link 均进入正确页面，登录状态显示已同步。
      Provider/model 使用独立临时数据库的渲染夹具，不使用真实账号或远程模型；
      刷新本地无模型列表的地址明确返回错误，StatusBanner 成功/失败均 margin 0、
      padding 12px 24px。未验收真实 Provider 连接或模型生成，本次不改这些行为。
- [x] 390 dark 四个 Settings 路由 axe WCAG A/AA confirmed violations 均为 0，
      每页 1 项 incomplete；浏览器 uncaught errors 为 0。
- [x] Settings 专属 CSS 归 settings.css，Provider 不再与 Ask selector 共享规则；
      废弃 settings-section/subgroup/section-head、ai-settings-header、
      provider-head h4、button--outline 均无残留。未新增 token 或 baseline
      allowance。
- [x] deno task test：315 passed；生产 navigation E2E：1 suite / 9 steps
      passed， 新增四个路由可访问标题层级与 active nav 断言。build、App/E2E
      typecheck、 改动 TSX/E2E lint 与 format 通过；UI Guard 扫描 89
      文件，violations、 new/increased/stale、allowances 均为 0。Design System
      与 Unreleased 同步更新。
- [x] PR #66 同步最新 main 后保留 #61/#62 与 #63 的全部 changelog/checklist
      记录；集成版本重新验证 320 项测试、生产 navigation 9 steps、build、
      typecheck、改动 lint/format 与 UI Guard 均通过（89 文件，0 违规）。

## Issue #62 首页固定便签排序验收（2026-10-02）

- [x] 复用 search PageShell、L1 Bento、NoteCard 与 shadcn Button；无新
      surface、视觉 token 或 baseline allowance。外层 slot 保留 deterministic
      rotation/54px step，内层只接收 runtime drag translate；窄屏单列回退不变。
- [x] 独立临时数据库实站验证 Pointer、CDP touch（390px）与
      KeyboardSensor；排序立即改变 DOM，并写入现有 sortOrder。普通便签分别保持原
      slot 1/3；不新增 API、schema 或首页排序字段。
- [x] 键盘 Space 拿起、ArrowUp 移动、Space 放下；保存期间保留同一
      activator，禁止重复排序，保存结束焦点仍在排序把手。把手点击与排序不进入编辑器。
- [x] 375/390/768/1024/1440 × light/dark 实页无水平 overflow；另核对固定
      768×1024 light/dark，DPR 1.25。390 单列 margin=0/transform=none；桌面前三
      slot margin=0/54/108px、未聚焦 slot 保留
      ±1.2deg。已审阅移动及桌面、平板浅深色截图。
- [x] Home axe WCAG A/AA：0 confirmed violations、2
      incomplete；不宣称人工项全部通过。
- [x] production build 与 App.tsx typecheck 通过；UI Guard 88 files、0
      violations、0 new/increased/stale。全仓 lint 发现 15
      项未改路径既有问题；全仓 format 仅 scripts/ui-guard/baseline.json
      既有格式不符，不扩大本次修改范围。
- [x] 最终契约：deno task test 320 passed；deno task test:workspace 6 suites /
      65 steps passed。新增 #62 E2E 覆盖
      Pointer、Keyboard、刷新/重新登录、隐藏第 6 条、metadata
      不变及固定/移出首页；最后补充真实 Workspace keyboard 重排并验证 API
      顺序，focused 7 steps 全通过。新增测试与修改文件 scoped lint/format
      通过；README/Unreleased 已同步。

## Issue #61 Apps 空白操作面验收（2026-10-02）

- [x] 保留 Workspace archetype 与 solid surface；复用 shadcn/Base UI
      ContextMenu、FolderNameDialog、Input/Button，无新增基础控件或视觉数值。
- [x] Apps Root 与 Surface 通过 flex 占满剩余高度，Grid 不增加
      padding、高度或轨道；新建文件夹、整理/完成整理统一由空白菜单提供。
- [x] 390×844、768×1024、1440×900 × light/dark
      实页截图及下方空白右键均通过，无横向溢出；68px 方格、大文件夹
      140px（2×2）保持不变。
- [x] 生产 Launcher E2E 14 个步骤通过：空
      Root、少量/多行应用、搜索结果/无结果、文件夹内联、整理菜单禁用新建、应用/文件夹菜单隔离。菜单命中点位于实际内容下方、Footer
      上方。
- [x] 390px CDP 原生 touch
      长按空白、应用与文件夹；释放不激活图块。短视口制造真实
      overflow，空白面滑动实际改变
      Body.scrollTop，未弹出菜单。Pointer/Keyboard/touch
      DnD、归组、文件夹内排序、持久化与失败回滚均通过。
- [x] Surface 保留 Tab 与 Shift+F10 入口；实页 axe 确认违规为 0，page errors 为
      0。
- [x] 315 项单元/模块测试、生产 build、typecheck、UI Guard（88 files / 0
      violations）通过；其他 workspace/navigation/bento E2E 通过。
- [x] 本次 TS/TSX lint 与修改文件 format 检查通过；全仓 lint 存量错误及
      scripts/ui-guard/baseline.json 存量缩进不在本次范围，未修改。
- [x] 验收脚本修正：菜单关闭坐标不可复用布局变化前的位置；触屏菜单场景独立刷新，避免点击菜单覆盖区域。长按释放回归修复前发生导航、修复后保持
      Root。
- 不适用：guest 无 Apps Workspace；未改变壁纸、标题偏好、Design Lab、API
  或路由契约，相关展示不追加矩阵。

- [x] 同步最新 main（28d2eda，#64）后，320 项单元测试、build/typecheck、UI Guard
      和 #62 七个 E2E 步骤通过。全套 Workspace 验收有 Launcher steps 7–10
      失败：step 7 错误 Banner 关闭超时，后续步骤级联失败。在独立、未修改的 main
      worktree /tmp/searcher-issue62-main-baseline 运行同一
      task，复现相同四项失败（栈路径确认来自该基线）；不是 #62 独有回归。未修改
      Launcher 实现或其既有测试，不将最终全套结果宣称为全绿。

## 极简呼吸 Dock 入口文案（2026-10-03）

- [x] 仅将“网站 · 数量”改为“应用 · 数量”；布局、Token、图标与目的地不变。
- [x] 隔离数据库登录态实页：390/768/1440px、light/dark
      显示均核对按钮文案并捕获截图；点击后打开“应用”工作区。
- [x] check:ui、目标组件 typecheck、lint、format
      通过；纯文案变更不新增静态文案测试。

## Issue #70 Workspace 初始焦点（2026-10-03）

- [x] 复用 WorkspacePanel、Button 与 Sheet；不新增
      Token、视觉样式或基础控件。Root
      初始焦点为“收起工作区”，嵌套页仍为“返回上一级”。
- [x] 更新 E2E focus contract：新断言在旧构建失败，修复后 Shell 六步通过；覆盖
      Widgets/Zen、light/dark、移动 Sheet trap 与关闭后的 opener 恢复。
- [x] 独立临时数据库实站：Apps/Notes × 390/768/1440 × light/dark 共 12
      场景完成并截图。初始焦点非输入，Tab 可进入搜索，Close/Escape 均恢复对应
      Dock opener；390px 验证正向与反向 Tab trap。
- [x] 浏览器捕获的 runtime error 为 0。校准时以状态轮询等待 focus trap
      提交，不把焦点守卫的瞬态当作最终焦点。
- [x] 全量单元测试 320 项通过；build、App.tsx typecheck、目标 lint/format 与
      check:ui 通过（89 文件、0 violations）。
- [x] Workspace 批量 E2E 中 5 个文件通过，Launcher 拖拽失败恢复步骤超时并导致 3
      步连锁失败；未改基线与修复分支的独立 Launcher 执行均为 14
      步通过。保留该间歇失败记录，不宣称批量套件全绿。
- [x] Chromium 响应式模拟已确认打开时无输入控件焦点。

## Issue #72 管理后台统一（2026-10-03）

- [x] management archetype；五个 tab 共用 SectionHeader，h1 → h2 → h3 → h4
      无跳级；MetricCard 保留指标语义，说明/流程/配置复用
      SettingsCard，操作复用标准 Button。
- [x] Users 成功消息切换 Overview 后不可见；Users/Audit 加载失败显示错误和重试，
      不伪装成搜索/筛选空态；Settings 使用 initialized 状态区分首次加载。
- [x] 390/600/768/960/1440px × light/dark × 五个 tab 共 50 个实页场景，
      内容标题起点一致、active navigation 正确、页面无横向溢出；390/768/1440
      另有实页截图。canonical 备份卡片 padding 调整后复查六种实页。
- [x] 窄屏导航单行滚动，Users 使用 shadcn DropdownMenu；键盘打开重置密码，
      创建/重置/删除后焦点归还有效触发点；恢复弹窗 Escape 后焦点归还恢复按钮。
- [x] 隔离真实数据库：创建、搜索/清除、刷新、重置密码、禁用/启用、删除用户；
      Users 两页及 Audit 三页前后翻页、Audit 动作筛选、Settings 保存后刷新保持。
- [x] 真实 JSON 导出/导入、ZIP 导出/验证/恢复成功（恢复 HTTP 200）；
      文件按钮支持键盘选择，选中文件名可见，同文件重选清除过期验证结果。
      未改后端恢复/权限/密钥逻辑，失败自动回滚依赖既有后端契约测试。
- [x] API 503 注入覆盖四个读取页面；长无分隔 metadata 注入验证 Badge 换行
      与表格滚动边界，600px 页面 scrollWidth 保持 600px。
- [x] 五个 tab × light/dark 的 axe WCAG A/AA 审计均 0 confirmed violations；
      部分页面仍有 1 项 incomplete（自动审计不能代替人工检查）。
      审计等待字体与有限动画结束，避免主题色过渡期的对比度误报。
- [x] 320 项单元测试、生产 build、前后端入口 typecheck、受影响 TS lint/format
      通过；UI Guard 90 files / 0 violations / 0 allowances；既有导航 E2E 10
      步通过。
- [x] 最终集成发现 390px 直访 Backup 时 active 在视口外，修复后追加 390/768/1440
      × light/dark × 五个 tab 共 30 个深链接几何断言，均完整可见； desktop→390px
      缩屏自动露出 active，手动滚动后仅高度变化保留 scrollLeft。
      字体加载导致前方链接变宽时也校正 active；最终代码重跑 320 项测试与 导航
      E2E 10 步均通过，build/typecheck/lint/UI Guard 通过。
- 不适用：guest 无管理权限；本次不改变 Home/Zen/Widgets、壁纸、API 或路由契约，
  不扩展为无关页面验收。

## Issue #79 UI/CSS 单一 owner（2026-10-03）

- [x] Token / shadcn / semantic / feature / global ownership matrix 与新
      primitive 判定条件已同步；domain CSS 从浏览器 entry 导入，基础
      primitives.css 有实际入口。
- [x] Home Zen/Widgets 只修改 Home scope；Settings/Admin/Account/Trash/Ask 的
      computed surface、radius、shadow 与卡片几何保持不变；theme、accent、search
      shape 保持全局。
- [x] PageShell 管页面 geometry；Account/Trash/Home/Ask/Workspace 复用
      StatusBanner、LoadingState、EmptyState、UndoToast，warning token 与
      compact density 有正式 contract；前端无 native confirm。
- [x] 确认弹窗覆盖 Cancel/Escape 不写入、Confirm 单次 mutation、pending
      禁用与焦点恢复；应用/便签/AI 对话删除撤销、首次 loading/error/empty、缓存
      warning 均经真实 API 与临时数据库验证。
- [x] 390/768/1440 × light/dark 的六个页面 geometry
      实页矩阵通过；Settings、Account、Admin 有六张实际截图；移动端 Account
      退出弹窗有截图，Escape 关闭后焦点回到“退出此设备”，无 logout 请求。
- [x] 最终集成发现 Launcher 空白 Surface 丢失 flex grow；在 launcher.css 唯一
      owner 恢复 flex 后重建并复查 Home/Bento、Workspace、菜单和 DnD。桌面
      Surface 实测 top=214、bottom=750，Footer top=766；内容下方 y=600
      右键菜单显示“新建文件夹 / 整理布局”，有实际截图。
- [x] 9 个相关 E2E 文件共 87 步通过，包括导航、Launcher、Workspace Shell、便签
      autosave/冲突/排序、Home Bento、ownership 与
      feedback；壁纸构图/生命周期/同步 7 步在 primitives.css
      入口修复后通过。删除内部 class/dataset 快照断言，保留用户可观察
      contract；surface 测量等待加载完成。
- [x] 348 项单元测试、58 项 Guard 测试、production build、入口 typecheck、34
      个受影响 TS/TSX lint、54 个受影响文件 format 检查通过；ownership 扫描 115
      文件、visual 扫描 98 文件，均 0 violations，baseline/allowances 仍为 0。
- 运行时记录：E2E 输出 Deno.serve 关于 request.signal 在成功响应后 abort 的
  legacy-behavior 提示；本次不改变服务端 lifecycle，无新增处理或 suppress。
- 不适用：未修改业务 API/数据模型或 AI conversation runtime；AI
  对话删除撤销无需真实模型，未执行额外模型推理。

## Issue #78 Markdown 便签验收（2026-10-03）

- [x] Notes Workspace 编辑 archetype；正文 Textarea 为 primary
      interaction。Toolbar 组合现有 ghost/icon Button，不新增 surface、raw
      visual value 或 editor framework；布局由 notes.css / notes-workspace.css
      拥有，Markdown presentation 由 markdown.css 拥有。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark 共六组实页截图与 geometry
      检查：页面无横向溢出，Toolbar 换行，split 在窄 Workspace 上下排列；长 code
      与表格留在容器内。最终 renderer
      复查截图：/tmp/omp-sshots-1597d58f1974d48b.webp。
- [x] 媒体校准：以 documentElement.dataset.theme、split DOM
      提交与两帧布局完成作为断言前提；设备模拟重载后重新打开编辑器。coarse-pointer
      另用真实 Chromium hasTouch context 验证，15 个 Toolbar 按钮均至少
      44×44，未将普通桌面 pointer 的 36px icon size 当作触控结果。
- [x] 全部 15 个 command、中文 UTF-16 selection、Ctrl/Cmd+B/I/K/S、composition
      event 保护、focus 恢复、Tab
      导航保持；不启用跨浏览器稳定性尚未验证的反引号快捷键。未使用 OS
      原生中文输入法做额外验收。
- [x] 自动保存只提交格式后的 body；Textarea↔Toolbar 不保存旧正文，离开 composite
      与切 Preview flush。恢复的本地草稿无 debounce timer 也可
      flush；该边界回归修复前失败、修复后通过。快速连续快捷键选区竞态由 commit
      后的 layout effect 消除。
- [x] 保存失败的格式草稿经 IndexedDB reload 恢复；retry、409
      使用云端/覆盖云端、版本恢复均使用真实 API。API 与数据库 schema、Markdown
      string、版本及冲突模型保持不变。
- [x] NoteCard、Preview、Split、Conflict、Version 共用 GFM / breaks /
      sanitize；不启用 raw HTML。只读 checkbox
      有可访问名称，代码与表格可键盘聚焦；局部 NoteEditor axe 30 passes、0
      violations。Console 无 runtime error，编辑器重挂载时关闭旧 SSE 的
      ERR_ABORTED 不属于 runtime error。
- [x] Guest 无便签编辑入口；Zen/Widgets 与固定卡片隔离由现有 Workspace E2E
      覆盖。未扩展壁纸、title preference 或新的视觉主题语义；已有 Home
      偏好矩阵不重复执行。
- [x] renderer / transform 用户可观察契约测试、production Notes 13 steps、完整
      Workspace suite、build、typecheck、lint/format、check:ui 验证；UI Guard
      119 ownership files / 101 visual files，0 violations / allowances。未增加
      baseline 或 prefix 豁免。
- [x] 验收校准记录：补上 card hover 与 reload 后入口等待；触屏 fixture
      使用独立便签并在结束时删除，避免 SSE 污染后续用例。早期完整 suite
      曾出现无关 Launcher 菜单关闭与 AppForm tile
      等待的偶发超时；未修改相应产品逻辑。

## Issue #86 Shared Workspace Core / Presenter 验收（2026-10-03）

- [x] Host `WorkspaceShell` 集中选择 panel/window/sheet；唯一 `WorkspaceSurface`
      承载 header/back/close、footer、accessible title 与 Body scroll boundary。
      Apps/Notes JSX、Core、CRUD API、note_layouts 与 CSS token/geometry
      未修改。
- [x] window 只建立正式 presentation，仍为原非模态 aside；不实现 Desktop Window
      Manager、drag/resize、Dock 或 multi-window，不新增视觉层级/raw value。
- [x] Root 不 autofocus Search、nested Back focus、overlay Escape 优先、Sheet
      focus trap/swipe、close focus restore、独立 query 与既有 section/state
      契约由 focused E2E 和完整 Workspace suite 覆盖。新增断言修复前收到 null
      而非 sheet， 修复后通过；跨 390/768/1024/1440 resize 保留
      query，logout/relogin 清空 query。
- [x] 真实隔离服务：390/768/1024/1440 × light/dark × Zen/Widgets × Apps/Notes 共
      32 组结构/overflow 检查与截图；无页面/Body 横向溢出，chrome 在 viewport
      内，Root Search 未获初始焦点。另覆盖 390×844、768×1024 双主题固定高度。
      截图：`/tmp/omp-sshots-1597e1bb03df32a1.webp`（390 light）、
      `/tmp/omp-sshots-1597e1bbf45f32a4.webp`（768 dark）、
      `/tmp/omp-sshots-1597e13ed21f329f.webp`（1440 dark）。
- [x] 校准：browser viewport 模拟未稳定触发已挂载 Host 的 matchMedia change，
      静态截图矩阵改为模拟后 reload，再等待 dataset.theme、presentation 和 focus
      提交；整组重新验证。动态 resize 保留状态由真实 Playwright E2E 单独验证。
- [x] Workspace Sheet 局部 axe：27 passes、0 violations、1 manual-review item；
      实页矩阵 browser errors 为空。wallpaper/title preference
      未新增行为，不扩展验收。
- [x] `deno task test`：382 passed；Core focused：6 passed；
      `deno task test:workspace`：7 passed / 76 steps；build、frontend
      typecheck、 变更文件 lint/format 与 `check:ui` 通过：119 ownership / 101
      visual files， 0 violations / allowances。全仓 lint 有 10
      个未改文件既存问题，未扩大修复范围。
- [x] Design System 同步 Core/Presenter 与 mounting contract；内部结构重构
      不改变最终视觉或用户行为，因此不新增 CHANGELOG 条目。
- [x] Design Lab 的“打开 Workspace”实页在 768px 挂载 panel，title、Search、
      close、primary footer 与 Apps/Notes navigation
      正常；与真实业务页证据分开。

## Issue #87 Zen Panel/Sheet 验收

- [x] 复用 Shared WorkspaceSurface、shadcn Sheet/Button 与 canonical workspace
      tokens；未新增视觉值、业务视图副本、Dock 或窗口几何。
- [x] 实页 390×844、768×1024、1024×768、1440×900 × light/dark 截图： <768 为模态
      Sheet，>=768 为 400px 非模态 Panel，无横向溢出。
- [x] Root 初始焦点为 Close、无输入 autofocus；桌面 Home Search 可直接聚焦，
      Panel 打开前后 hero geometry 相同。Close 返回实际 opener，切换 Apps/Notes
      不替换 opener；修复前 Apps→Notes→Close 错误返回 Notes，修复后返回 Apps。
- [x] reduced-motion 实页验收；browser console error 与 page errors 均为 0。
- [x] 无业务/API/schema 变更；FloatingNotes 与 note_layouts 未修改。
- [x] Design Lab 未修改，本次证据来自隔离数据库的真实首页。
- [x] check:ui：101 files、0 violations、0 allowances；前端 typecheck 与
      WorkspaceShell lint 通过。
- [x] `deno task test:workspace`：7 suites、77 steps、0 failed，覆盖 Apps/Notes
      正常/空态/loading/error、query、nested Back、Escape overlay
      precedence、Sheet trap/swipe/safe-area、FloatingNotes/layout 与 auth
      reset。
- [x] 移动端 Back→Root 原先被 Base UI popup restore 覆盖，实页修复后聚焦 Close；
      仅 Root 返回同步转移，嵌套进入保留 refs 就绪后的时序。
- [x] 精确视口下移除“内容必须产生滚动”的偶然断言，保留 scroll boundary 与
      header/footer 稳定性；触屏尺寸检查使用 reduced-motion，避免入场缩放
      尚未完成时读取按钮尺寸。实页工具栏 15 个按钮均为 44×44。
- [x] build、前端 typecheck、4 个受影响 TS 文件 lint/format 与 382 项单测通过。

## Issue #88 Desktop Window Manager 验收

- [x] Design Lab workbench 的非模态 demo；复用
      Section/ActionGroup/Input/Button， window solid
      surface、border、shadow、radius、gap/elevation 仅由系统 token 拥有。
- [x] frame 坐标只相对 Canvas safe rect；window pointer-events:auto、Canvas
      none； 实页点击窗口外的“重置预览”成功，背景不拦截控件。
- [x] 八向把手逐向验证：每次 8px resize 对应轴增长 8px，其他轴不变。 修复
      overflow:hidden 对右/下把手命中中心的裁剪。
- [x] input/button 不拖动；标题栏 pointer capture 拖动；多窗口内容点击提层；
      maximize→minimize→restore 保持 maximized，再 restore 回原
      frame；最小化保留输入。
- [x] viewport 中途改变后最后 frame commit，下一次手势不跳回； 1440→390
      保持可见；min-size/clamp/cascade/z-order 边界由核心测试覆盖。
- [x] 拖动中 IndexedDB readwrite transaction 与非 GET/HEAD API 请求均为 0；
      reduced-motion 与正常媒体偏好均运行几何交互；Console 无 page errors。
- [x] 390×844、768×1024、1024×768、1440×900 × light/dark， 8
      组实页均无横向溢出、窗口在 safe rect 内；截图
      `/tmp/omp-sshots-1597fbd*.webp`。
- [x] 全量 397 项测试、前端 typecheck、build、focused lint/format 通过； UI
      Guard 107 文件、0 violations、0 allowances、0 ownership drift。

## Issue #89 Widgets Desktop Windows / Task Dock 验收

- [x] Search archetype：Search/Bento 不因窗口打开推动；复用唯一 Apps/Notes
      content、shadcn Button/Menu/Sheet 与既有 window semantic
      tokens，无新增材质等级。
- [x] =1024 两个 singleton domain window 可同时显示；Dock
  >     Open/Focus/Minimize/Restore、maximize 实页验证；Dock 无 CRUD，Bento
  >     无重复 root navigation。
- [x] 768–1023 只有一个可见 active surface，inactive 保持 mounted；三档尺寸与
      safe rect 的 min 公式逐项实测，禁止 drag/resize，Apps
      表单切换后仍保留输入。
- [x] 实页发现初始 constrained 实现误用 max 造成尺寸膨胀；改为 Issue 指定
      min，回归测试修复前 3 项失败、修复后全部通过。
- [x] Pointer 激活 inactive window 后 input 保持 focus；最小化保留 query；显式
      Dock keyboard navigation 聚焦 Close/Back，关闭回对应 Dock item，overlay
      Escape 优先。
- [x] 390/768/1024/1440 × light/dark × wallpaper on/off 共 16
      组实页通过；逐组确认实际 theme 与 wallpaper paint、无横向溢出、safe rect
      内窗口与 Search geometry 无 shift。截图 `/tmp/omp-sshots-15986a*.webp`。
- [x] 390 使用 shared Sheet，无 DesktopDock；Zen
      Panel/Sheet、FloatingNotes、CRUD、错误恢复、cache、autosave、冲突与版本历史由既有
      E2E 实跑覆盖；浏览器无 page errors。
- [x] 全量 402 项测试、test:workspace 的 7 个 suite / 77 steps、前端
      typecheck、build、受影响域 lint/format 通过；UI Guard 109 文件、0
      violations、0 allowances、0 ownership drift。
- [x] README、Design System 与 Unreleased changelog 同步最终行为；无 window
      persistence、独立 Note entity window、Snap 或 Overview。

## Issue #90 Note Entity Windows / Device-local Layout 验收

- [x] Search archetype 复用既有 DesktopWindow、Notes browser、NoteEditor 与
      window tokens；无新增材质等级、Snap 或 Overview UI。
- [x] 两份不同便签可同时打开；同一 note 重复打开恢复/聚焦唯一实例，DOM id
      无重复。
- [x] 390×844、768×1024、1440×900 × light/dark 实页截图通过，无横向溢出；390/768
      为一个 nested editor，1440 为两个 entity editor。
- [x] Zen 使用 Notes nested editor，切回 Widgets 恢复 entity windows，不转换 Zen
      geometry。
- [x] 1440→1024、1920→1440 恢复所有窗口在 Canvas safe rect
      内。拖动后立即刷新保持新
      frame；maximize→minimize→refresh→restore→unmaximize 保留正常 frame。
- [x] IndexedDB 实际 payload 按 `searcher:desktop-layout:v1:<userId>`
      隔离；退出清 runtime，切换第二账号空桌面，切回原账号恢复。
- [x] unsupported version、duplicate/corrupt payload 默认空桌面；不存在 note
      丢弃；UI 删除便签立即关闭窗口，刷新不恢复 stale window。
- [x] IndexedDB 不可用时 Home/Notes browser/entity editor
      正常打开，云端保存成功，浏览器无 page errors。API 返回的 note layout
      始终为 null，无 Widgets geometry 写入。
- [x] 自动保存、版本历史、409 冲突实页验收；修复接受云端版本与在途 blur
      保存的竞态，接受后继续编辑成功保存。
- [x] README、Design System 与 Unreleased changelog 同步行为和故障回退边界。
- [x] 便签数据加载期间可立即打开工作区；恢复完成后保留已打开窗口，不提前覆盖设备记录。Hook
      回归修复前失败、修复后通过；核心测试 425 项、typecheck、lint、format 与 UI
      Guard 通过。
- [x] `deno task test:workspace`：7 passed（77 steps）、0
      failed，含生产构建；异步设备草稿恢复不覆盖即时输入，工具栏与后续自动保存通过。

## Issue #91 Snap / Overview / Window Menu 验收

- [x] 复用 DesktopWindow、shadcn DropdownMenu/Dialog、现有视觉 tokens；仅
      geometry 为 runtime inline exception。
- [x] 七种 Snap/maximize 模式实页拖拽正确；preview 的 pointer-events 为
      none。restoreFrame、拖拽解除 Snap、刷新语义由 state/geometry/persistence
      与生产 E2E 覆盖。
- [x] 1440→1024 的 top-left 分屏从 704×365 重算为 496×299，不保留旧 pixel
      geometry。
- [x] Overview 包含 normal/minimized 窗口；选择恢复并聚焦对应窗口，不修改
      frame；Escape 返回 Dock 总览按钮。
- [x] Running Note Dock item 支持恢复、聚焦、关闭后移除；长标题截断但保留完整
      accessible label，不提供业务 CRUD。
- [x] 窗口系统菜单可键盘触达，包含 Restore/Minimize/Maximize/Snap Left/Snap
      Right/Close；普通 desktop Window 的 Escape 不关闭窗口，tablet 与 Zen
      原有行为保留。
- [x] 1024/1440 × light/dark × wallpaper on/off
      的八种实页组合无横向溢出；390/768 × light/dark 不显示 Overview 或 running
      note items。
- [x] reduced-motion 下 Overview/preview 无位移动画；实页 axe 0 violations。截图
      `/tmp/omp-sshots-1598aea79623def3.webp`、`/tmp/omp-sshots-1598b1fac9a3def5.webp`。
- [x] `deno task test` 438 passed；typecheck、focused lint/format 与 UI Guard
      通过；无新增 token、baseline allowance 或 ownership drift。
- [x] 最终 `deno task test:workspace`：7 passed（78 steps）、0
      failed，含生产构建；七种拖拽释放、restoreFrame、刷新持久化及既有业务交互通过。

## Issue #92 最终双工作区验收

- [x] 移除 /design-lab 临时 DesktopDemo 与专属 CSS；真实页面仍展示 semantic
      component fixtures，未新增平行窗口 presenter。截图
      `/tmp/omp-sshots-1598c80b21296e9f.webp`；页面无新增 JS 错误。
- [x] 窗口标题为 h2，Apps/Notes subsection 为 h3；toolbar 使用合法 role
      容器，resize separator 暴露当前尺寸。Widgets 1440 实页双窗口 axe 0
      violations；右侧把手 ArrowRight 将可访问值从 760×569 更新到
      770×569，每个窗口只有一个 chrome/titlebar。截图
      `/tmp/omp-sshots-1598c99f7f696ea2.webp`。
- [x] A. Core responsive / visual（16 组合全覆盖）： 390×844 / 768×1024 /
      1024×768 / 1440×900 × light/dark × zen/widgets。全部 16 场景执行：
      `document.documentElement.scrollWidth <= innerWidth`
      无横向溢出；Search/Home 几何边界正常； Presenter 对应
      sheet（390）、panel（zen）、window（widgets >=768）； Keyboard Tab
      `:focus-visible` 焦点环正常；Dock 存在性契约（390 及 zen 无 Dock，widgets
      >=768 有 Dock）。
      截图：`/tmp/issue-92-e2e-screenshots/matrix-a-1440-widgets-light.png`。
- [x] B. Wallpaper material（壁纸材质与分离度）： 390×844 wallpaper on/off
      light，1440×900 wallpaper on/off dark。 Surface
      边界清晰（背景色/边框不透明）、文字高对比度可读； Active 窗口拥有明确
      elevation shadow 与 accent 边框，与壁纸 canvas 清晰分离。
      实测截图：`/tmp/omp-sshots-1598ce6ccda96ea7.webp`（1440 dark widgets 壁纸
      on，axe 0，无溢出）、`/tmp/omp-sshots-1598ce889d296ea9.webp`（390 dark
      widgets 壁纸 on，modalSheet，dock false，axe 0，无溢出）。
- [x] C. 390 与 1440 分别验证 Apps root/nested/empty、Notes
      root/edit/empty；两业务域均覆盖 delayed loading（可见 status live
      region）、500 error（alert）及 retry 恢复真实列表。Apps nested 与 Notes
      edit 可同时保持；关闭 Apps 不影响 Notes 编辑，域内 Back 与 query
      不互相覆盖。 实页截图：`/tmp/omp-sshots-1598d9d682e2c62e.webp`（390 Apps
      错误与重试）、`/tmp/omp-sshots-1598da1b31e2c62f.webp`（390 Notes
      加载态）。
- [x] D. Desktop Window 行为（1024 & 1440 Widgets）： Multi-window
      双窗口同时呈现；单 chrome 契约（每个窗口 1 个 chrome，0 个
      WorkspaceSurface 标题栏，h2 标题 axe 0）；
      Drag/resize（WindowResizeHandles 提供 separator
      `aria-valuenow`/`aria-valuetext` 并随 keyboard Arrow 响应）；
      Minimize/maximize/restore 状态机；Overview 窗口总览选择还原；Dock
      焦点还原； DesktopCanvas 未遮挡区域向 Home 搜索框完美
      pointer-through；reduced-motion 禁用动画/过渡。
- [x] Window Menu portal 事件与标题栏 DOM 隔离：1024 light
      鼠标点击左分屏后窗口为 Canvas 左半区（496×598 / 992×598）；1440 dark 用
      ArrowDown/Enter 选择右分屏成功。两次实页 axe 均为 0 confirmed
      violations、2 incomplete；截图
      `/tmp/omp-sshots-1598e99bdab2898c.webp`。矩阵在 1024/1440 均验证 Snap
      geometry 与 Restore 原 frame。
- [x] E. Persistence / Identity 隔离： 1440 窗口坐标刷新保持；1440→1024 resize
      自动 clamp 保证标题栏在安全区内可交互； Stale note
      清理（已删除便签窗口静默忽略不崩溃）； Unsupported version 999 与 Corrupt
      version 1 分别回退为默认尺寸，不写污染数据； IndexedDB unavailable
      抛错回退时窗口正常 open/drag 且禁止向 localStorage 写入 desktop layout；
      同 context logout -> 注册登录 User 2（默认独立无实体窗口） -> logout ->
      重新登录 User 1（自定义坐标完整恢复）； Zen ↔ Widgets 切换 Dock/Canvas
      正常卸载与恢复。
- [x] F. Tablet constrained 约束（768 Widgets）：
      单活动窗口（打开另一窗口时前一窗口自动
      constrained-hidden）；无自由拖拽与缩放（0 个 resize handles，titlebar
      拖拽坐标固定）； 3
      档尺寸预设（中等尺寸、大尺寸、全屏）按预设比例调整；Note
      嵌套编辑在约束窗内无横向溢出；Dock 无 Overview 总览按钮。
      实测截图：`/tmp/omp-sshots-1598ce7cb7296ea8.webp`（768 dark widgets
      on）、`/tmp/omp-sshots-1598ceac4b296eaa.webp`（768 light widgets off）。
- [x] 最终 `deno task test:workspace`：8 passed（85 steps）、0 failed。全套 E2E
      矩阵与既有套件全量绿色通过。

## Issue #85 验收断言补强（2026-10-04）

- [x] Matrix D 移除鼠标拖动失败后的键盘兜底。先通过 Dock 激活 Apps，避免标题栏
      被 Notes 遮挡；1024/1440 分别断言指针拖动的两轴位移与尺寸保持。
- [x] 鼠标 resize 的比较基准在键盘 resize 完成后重新读取；单独断言宽度减少
      50px、高度减少 40px，左上角不变，键盘操作不能代替鼠标验收。
- [x] Unsupported version 与 corrupt window 在 Settings 页面、DesktopCanvas
      卸载后注入，避免 reload 的退出保存覆盖异常 payload；等待回退布局完成后
      断言零窗口，再通过 Dock 打开 Apps，验证 canonical 默认尺寸与居中位置。
- [x] 移除旧拖动兜底后 Matrix D 失败；修正命中前置条件与断言后聚焦 A–F 矩阵 7
      steps 通过。仅修改验收测试，未改变产品行为或放宽 UI baseline。
- [x] 最终全量测试 443 passed；生产 build 与 Workspace 8 suites / 85 steps
      通过；前后端及 E2E typecheck、focused lint/format、check:ui 通过，
      ownership/visual violations 与 baseline allowances 均为 0。

## Issue #84 外观壁纸资源布局验收（2026-10-04）

- [x] Utility Settings archetype；复用 SettingsSection / SettingsCard、shadcn
      Button / Input 与 WallpaperSurface，不修改通用 SettingsRow 或后端 API。
- [x] 专用 wallpaper domain class 持有全宽 intro/source/current/history
      布局；复用现有 spacing、surface、radius 与 touch-target Token，无新增
      token、allowlist 或 baseline。
- [x] 独立数据库真实账号上传 5 张图片；1440 / 1280 / 768 / 640 / 390 / 375px ×
      light/dark 实页截图与尺寸检查通过，无页面横向滚动；桌面历史 5 列，窄屏 2
      列。
- [x] 来源输入不展示上传 API
      路径；当前壁纸有独立图片预览、文字状态与动作域。错误关联输入并沿输入轴显示，访客提示保留在
      intro。
- [x] 壁纸 E2E 全部 7 步通过：上传、HTTPS / gradient / Enter
      应用、空输入保护与刷新、构图保存、历史选择、停止使用、非当前/当前删除及失败保留、匿名设备隔离。
- [x] Tab 实测按上传 → 来源 → 当前动作 → 历史卡片/菜单顺序移动（空输入时跳过
      disabled 应用）；历史主按钮采用 inset focus outline，避免被缩略图裁切。
- [x] 壁纸区 axe 0 confirmed violations、1 incomplete；page errors / console
      errors 为 0。
- [x] 443 项单元测试、build、前后端入口 typecheck、修改文件
      lint/format、check:ui 通过；ownership 与 visual 违规均为 0。

## Issue #114 动效可感知性与实时预览验收（2026-10-05）

- [x] 复用 Settings utility / Home Search Canvas archetype、WallpaperSurface、
      SettingsPresetSlider；未新增控件、surface 或自由 speed。
- [x] Runtime substrate = canvas / gradient / image；gradient 不用图片补偿；
      mono 光场/根层不注入 accent，偏好 schema 与数据库迁移不变。
- [x] Motion Budget v2 的 raw/composite/final 上限与 minimum lower bound
      同时定义于 shared；A/B floor 单一、peak 35%/55%，不恢复 breathe/ripple。
- [x] Phase 0B 初始候选不满足 pronounced 热点下限；改为半径 A/B 32/26cqmax，原点
      A -14/-18cqmax、B right -12cqmax/top 18%。 canvas/gradient travel =
      3/4.8/7/9.5cqmax，image = 4/6.5/9/14cqmax；raw mix、scale、floor 保留
      candidate table。参数已回写 shared 与 DESIGN_SYSTEM。
- [x] 固定 phase 的实页标定冻结 ROI 为 x=21/50 (0.42)、y=0、w=1/18、h=4/45；A/B
      按实际 delay 换算后验证 computed
      progress。废弃早期探索的错误相位与逐档最大 ROI 数值，不把它们当作 CI
      结果。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      十二格真实首页，无横向溢出；mask z-index 2 始终高于 ambient 1。 截图
      `/tmp/omp-sshots-1599bb93f70dd3f0.webp` 至
      `/tmp/omp-sshots-1599bb986d4dd3fb.webp`。
- [x] 浅色、深色、高饱和、高频纹理、左/右/中央主体、gradient 素材实页检查；
      Search 仍为主区域，未提高壁纸自身可读性保证。八类为代表场景，
      不宣称覆盖所有任意原始图片的可读性。
- [x] ambient/drift/zoom × 四档真实播放；分别连续观察 12/8/5/3 秒，
      动效模式互斥，未见光球硬边缘、同步呼吸或快速闪烁。
- [x] Settings 390/768/1440 × light/dark 六格真实预览；播放 ambient， field A
      直径/容器最大边为 .64（测得 .63995–.63999），与首页等比例。 截图
      `/tmp/omp-sshots-1599bc539e0dd3fd.webp` 至
      `/tmp/omp-sshots-1599bc55f8cdd402.webp`。
- [x] reduced-motion 实页：显示“系统已启用‘减少动态效果’，动态预览已静止。”
      说明，光场动画数量 0；不更改用户 intent。Focal editor 保持 off。
- [x] Settings axe：0 confirmed violations、2 项需人工判断；干净 reload 后
      无新增 runtime error。
- [x] 最终 deterministic fixture、raster safety、aggregate luminance、onset
      与完整质量门禁结果：480 passed 单元测试；壁纸 E2E 全部 22 步通过； fixed
      gray texture 四档 hotspot delta 实测为 1.056 / 1.769 / 2.512 / 4.023
      （严格单调且满足 >= 0.8 / 1.5 / 2.5 / 4.0 下限）；aggregate luminance
      swing 0.380 （<= 3.0）；浏览器 phase separation 0.20（>=
      0.15）；pronounced afterMask 0.102 （<= 0.1804）；drift / zoom onset
      progress 各档在 deadline 均 >= 10%； UI Guard 0 violations / 0 allowances
      / 0 drift；build、typecheck、lint 通过。

## Issue #116 Phase 0C v2 - 壁纸 Temporal Motion System 与 Settings 外观重构（2026-10-05）

- [x] Settings Stage 与 Preview-first 架构：
  - Stage 响应式视口：>= 768px 为 `min(100%, 640px)`（16:9），< 768px 为
    100%（16:10），面积远大于任一历史壁纸；
  - 静态 `WallpaperStageContextPreview`（Searcher 搜索占位）严格
    `pointer-events: none` 与 `aria-hidden="true"`，零交互、零业务状态冲突；
  - DOM 唯一顺序：1. Stage -> 2. Actions -> 3. Recent wallpapers -> 4.
    Appearance -> 5. Motion，视觉主次与键盘焦点顺序完全一致。
- [x] Readability 与 Slider 几何：
  - Readability 扩展 `none`（0% mask），默认仍为 `balanced`（24%），无隐式补偿；
  - 纯 CSS `data-stage-count` 与 `nth-child` 坐标系统，实测 5 档 Readability 与
    4 档 Softness 的 mark 中心与 thumb 中心偏差严格 <= 1.0 CSS px（实测
    0.0px）。
- [x] Recent Wallpapers 降权：
  - 缩略图紧凑排布，选中项使用轮廓/环状光晕与角落小型“当前”badge，彻底移除整行深绿横条；操作菜单保持
    44px 点击区域。
- [x] Motion Level 离散段选择器：
  - 由 Slider 升级为四档离散 Segmented Stage Selector（`RadioGroup`），44px
    touch target；
  - 单次提交仅发 1 次 PATCH，快速连续点击遵循 latest-intent-wins；
  - 文案更新为结果导向，移除内部工程术语。
- [x] Temporal Motion System 与 WAAPI 运行时：
  - `WallpaperMotionController` 作为唯一变换渲染层，CSS 移除 drift/zoom
    keyframes；
  - 单写入者契约：图像元素活动变换动画数严格 <= 1；
  - Drift C1
    闭环曲线（$x = \sin(2\pi t), y = 0.7\sin(4\pi t)$）：相近航向角偏差实测
    16.55°（<= 30° 门禁），速度极差比 1.50，循环接缝无跳变；
  - Zoom 平滑折返（$\sin^{1.45}(\pi t)$）：峰值折返速度比实测 7.7%（<= 20%
    门禁），3s onset 达 10.6%（>= 10%）；
  - Overscan 时序安全：幅度增大先扩容器再启动运动，幅度减小保持宽包络至 300ms
    收敛后再收缩；交接窗口覆盖最大包络；
  - 状态机优先级：`reduced > paused-hidden > handing-off > retargeting > running > idle`，后台标签页同相暂停与恢复，reduced
    立即安全回中；
  - 环境光墙钟循环分析：LCM(28, 37) = 1036s，全周期 6 个最坏重叠窗口实测摆幅
    0.0004（<= 3.0 预算）。
- [x] Dev-only Motion Inspector：
  - 支持 `?motion_inspector` 激活，提供实时 phase、state、writer 监测与 0.25x /
    1x / 4x 调速。
- [x] 验证与产出物：
  - 305 项单元测试通过；壁纸 E2E 全部 23 步通过；UI Guard 0 violations / 0
    allowances / 0 drift；
  - 完整 visual evidence 与 trace 落地 `artifacts/wallpaper-motion/`，已接入
    GitHub Actions 自动上传。

## #102 M0B Editable Pagination Spike

- [x] Archetype utility；PageHeader/Section/ActionGroup/shadcn
      Button/Input/NativeSelect。
- [x] 仅实验路由，shared core 不包含分页 presentation；纸张为独立 aria-hidden
      sibling。
- [x] 物理 geometry 由唯一 runtime owner 注入；视觉复用纸张 semantic tokens 与
      Markdown。
- [x] 390×844、768×1024、1440×900 × light/dark 实页截图完成；6 组均无整页横向
      overflow、axe 0。
- [x] 先校准 theme transition；初轮瞬态 contrast 报告后等待
      animation.finished，完整矩阵复查通过。
- [x] 同实例选区/undo-redo、起始/连续/尾部空白页、gap 点击、copy/paste、CDP 中文
      composition、超长块与 PNG 等比缩放：production 1 test / 5 steps 通过。
- [x] UI Guard 0 ownership / 0 visual；baseline 和规则未放宽，runtime registry
      仅登记实际物理几何变量。
- [x] focused 6 tests / 3 steps；全量 532 tests / 28 steps；typecheck/lint
      通过。
- [x] authenticated Documents / Zen/Widgets Host / wallpaper / server assets /
      Print 不适用本阶段；留至对应阶段而非宣称已经覆盖。
- [x] 已知限制与 M5 接入路径记录于
      MARKDOWN_EDITOR_M0A.md；本报告不冒充正式业务页面验收。

## #147 Desktop viewport 几何与 Document Immersion / 竖向分页

- [x] M0 使用独立 worktree `feat/issue-147`，基于 main
      `f5d84249766f86c155907c8021174d1ef8c75b66`。保存真实 390×844 / 768×1024 /
      1024×768 / 1440×900 × Zen/Widgets × light/dark
      连续/页面截图、双页/三页横向基线及 Chrome/Dock/window geometry； 本地证据
      `/tmp/issue147-evidence/m0/`。
- [x] viewport geometry Red 4 项、沉浸入口 Red、双页竖向 geometry Red
      均在旧实现失败；不是仅比较源码、CSS 字符串或 mock forwarding。
- [x] M1/M2 focused Desktop module 73 项通过。生产 workspace-shell 1 test / 9
      steps、workspace-matrix 1 test / 7 steps 分批通过； 八方向真实
      resize、拖拽 preview/release、Snap/maximize/restore/reload、 v1–v4
      迁移、零尺寸/读取失败不覆写、账号隔离均有契约证据。
- [x] M3A 实页保留同一窗口和富文本实例；连续/页面各 20 次沉浸循环保留
      selection/history，Source 往返保留 canonical/version。纯 presentation
      无正文 PATCH；dirty blur 与普通窗口控制路径均只保存一次。 dialog Escape
      优先、键盘/12px 底边同一 Dock、自身/其他窗口/Overview、
      最小化/关闭/刷新/768 响应式退出、保存失败重试、409 与真实 PNG 上传通过。
- [x] 1024×200 受限 Surface 的关闭入口真实命中；正文容器 wheel 可滚动， 原
      snapped semantic 不被受限 frame 覆写；恢复可用视口后还原原 frame。 HTTP
      logout 后 History 请求 401 清除沉浸/账号 Surface，重新登录不恢复
      session-only flag。此扩展 focused trace 1 test 通过。
- [x] M3B 代表 fixtures 使用真实 Chromium `141.0.7390.37`、Linux x86_64、
      1440×900、DPR 1.25；UA 的 Chrome150/Windows 字符串仅为固定 fixture
      override， 不当作实际浏览器/OS 证据。每组 warm-up 3 次、测量 20 次；
      不可变横向基线为
      `web/src/spikes/editable-pagination/issue147-horizontal-baseline.json`，
      后续生产 cutover 不再把当前 owner 冒称横向基线。
- [x] 单一 editable DOM/state 的三页竖向 wheel、真实跨页鼠标拖选、
      Shift-click/copy/cut/paste、Enter/Backspace/Delete/history、 composition
      延期、A4/Letter 两方向、自动段落/代码/多行表格、 2000×3000 PNG、390
      同实例缩放字形/图像边界均取得实测。 打印 PDF 五个短夹具页数
      1/2/2/2/3，起始/连续/尾部空白位置实读验证。原 writing-mode 候选失败与成功
      prototype 的恢复源码、历史实测记录及原始截图由 PR 的证据分支提供。
- [x] 超高单个 table row 的追加边界 Red→Green：两列一短一长，prototype 曾有 18
      个字形落入 margin/gap；生产 owner 在原 cell 内独立分片， 274 个真实 Range
      字形、7 页实读未越界，canonical 不变。
- [x] M4 实验适配器已删除 prototype 分页算法，仅挂载生产 owner。
      同一冻结环境下生产 10/30 页 median 为 0.60/1.85ms，max 为 1.40/2.20ms； 30
      页低于横向基线 2.80ms 的两倍门槛。生产 PDF 五个夹具仍为 1/2/2/2/3
      页，起始/连续/末尾空白位置实读正确。
- [x] 第三页真实鼠标/键盘输入后 scrollTop 保持 2200、caret top 210.625，
      未因重新分页收缩为单页或跳回顶部。布局交易不进入历史；
      两步编辑撤销恢复原文、两步重做恢复修改，EditorView 身份不变。
- [x] 生产竖排构建后的沉浸完整 focused trace 再次通过（1 test，31s）。
- 合成 CompositionEvent + Chromium insertText 验证 composition/layout 延期。

### #147 分页技术决策与复现

- 选择普通竖向 DOM flow + 单个 ProseMirror DecorationSet，而不是 writing-mode
  多列或每页独立编辑器。纸张背景按 `height + gap` 定位；真实 DOM Range 行框和
  `view.posAtDOM` 映射到同一文档位置，手动 PageBreak 强制下一页。
- 超高 table row 保留原 tr/td；各 cell 内独立插入不可编辑间隙，后续正文只累加 该
  row 的最大高度增长。短 cell 不复制内容，也不补整页填充。
- doc、paper、scale 改变时，在同一 RAF 清除旧 Decoration、测量并提交新布局；
  保留旧纸张栈直到提交，避免 scroll owner 短暂收缩。仅补偿原本可见的 caret，
  不把离屏选区拉回视口。signature 收敛触发后续测量；IME 期间延期。
- `decoration-flow-repro.ts` 仅为生产 owner 的 fixture mount。先运行
  `deno task dev --host 127.0.0.1 --port 5173`，再运行
  `deno run -A web/src/spikes/editable-pagination/m3b-browser-experiment.ts http://127.0.0.1:5173 /tmp/issue147-pagination decorations`。
  原始性能 JSON、截图与五个 PDF 写入指定目录；冻结基线同时校验
  engine、viewport、 DPR 与 UA fixture，30 页超过两倍 median 时命令失败。
- 原临时 `verified-m3b.tgz` 与 32 张 M0 截图文件在运行环境重启后丢失。
  保留的持久会话记录可追溯 M0 的 32 组采集和 geometry；原始两/三页截图仍在。
  成功 prototype 已从首次完整写入与 24 次成功补丁恢复，并逐行核对历史工具输出；
  证据集 `historical/m3b-prototype-recovered.ts` 明确标为恢复源码，不冒充原
  tar。本轮重新采集完整 48 张实页、失败候选五个夹具、生产 JSON/PDF。
  [发布证据集](https://github.com/aawai/searcher/tree/cf0c967/historical)
  与[完整实页矩阵](https://github.com/aawai/searcher/tree/cf0c967/visual-matrix)
  已存入独立 `evidence/issue-147` 分支，不污染应用 bundle。
- 回滚：M1+M2 必须整体回滚，不能独立降级坐标或 payload writer；旧 v3 runtime
  不识别 v4
  设备窗口缓存时会按安全回退重建窗口，不影响服务器笔记/资产或设备草稿。 M3A/M4
  可分别整体 revert 对应 UI/布局 owner 增量；无数据库 migration。

### #147 最终复查与集成验收

- 集成 main `a6c33ce68f5b4c1433e5f5e72117540909bf7f72`： 保留 #149 Apps
  触屏网格与 PR #151 首页密度改动、两个新增 density E2E、 touched-file formatter
  CI 和既有 workspace-matrix 稳定等待。
- 初始 1024×350 无合法 window 的 Red 曾无法打开任何 Surface；现在复用
  WorkspaceSurface，以实测 Chrome/Dock 边界呈现，可关闭且恢复 1024×768 后
  创建普通窗口。扩展 trace 也打开初始受限便签实体和文档实体、滚动长文并关闭，
  不创建非法 window；沉浸时后台 active Apps 不截获 Escape，trigger/Dock 焦点
  保持可见。完整定向运行 4 tests / 39 steps 通过，沉浸场景 34s。
- 非文本边界 Red→Green：同段相邻图片、文字夹图片、表格 cell 图片、 100 条
  HR、hardbreak 与 self-owned viewport 的 scrollTop 坐标均实测； 图片/HR
  不再进入纸张 margin/gap，自滚动 owner 的三页位置与高度保持不变。 实验 runner
  已加入相邻/inline/cell 图片和 HR 的真实物理边界断言。
- 最新同环境 10/30 页 warm-up 3 次、测量 20 次： median 0.60/1.65ms，max
  1.10/2.10ms，30 页低于冻结横向 2.80ms 的两倍； 原始 JSON 与五个 PDF
  保存在证据集 `final-production/`，errors 为零。
- 生产 `document-vertical-layout.test.ts` 完整 1 test / 49s 通过： 16
  个纸型×方向×宽度组合、第三页编辑、真实剪贴板/历史、超高 cell、 390px
  缩放和五种打印页序；不是把多次失败运行合称一次通过。
- 实页矩阵完整采集 48 张：390/768/1024/1440 × Widgets/Zen × light/dark ×
  continuous/page/source。每组 page 为 3 张纸，rich 模式只有一个编辑器， source
  模式只有一个源码输入，应用横向 overflow 均为 false；
  `visual-matrix/geometry.json` 与联系图保留各组证据。
- 代表性 dark / wallpaper on / reduced-motion 下，normal 与 immersion 的 axe
  WCAG 2 A/AA、2.1 AA violations 均为零；reduced-motion 实测 true， 运行中的
  animation 为零。键盘与 wallpaper off 覆盖分别由 focused trace
  与完整实页矩阵提供。
- UI Guard 按新坐标合同迁移精确 owner 表达式豁免，并仅授权分页 owner 的
  实际纸张边距与零间隙 reset；未添加 baseline allowance。 实际 CLI 检查
  architecture/visual violations 均为零；新增边界测试拒绝 任意尺寸、非零 spacing
  和其他 feature 冒用纸张变量。
- malformed payload 的新 regression 先以自动 CLAMP 覆写为 v4 而失败；
  CLAMP/NORMALIZE 现在不能授予 persistence 写权限，旧账号卸载 flush 也验证
  writer authorization。完整 hook 模块 15 tests 通过，正常用户 OPEN 仍可保存。
- 第一轮完整 Workspace 20 tests / 122 steps 通过、3 tests / 12 steps 失败：
  便签拖动 fixture 仍用 safe-local y、拒绝缓存被自动 CLAMP 覆写、菜单焦点等待；
  对应修复/诊断后完整定向 4 tests / 39 steps 通过。 下一轮完整 Workspace 22
  tests / 133 steps 通过、1 step 失败： Snap 还原后正文允许进入 Dock 区域，旧
  resize fixture 在 Dock 后抓 SE handle。 fixture 改为先真实拖动到 Dock
  上方再执行八向 resize，未放宽尺寸/锚点断言。
- 本 Issue 全部变更文件：Deno fmt 58 files、lint 46 TypeScript files 通过； 不把
  affected-file 检查称为全仓库 lint/fmt 通过。
- 最终顺序门禁完整通过：`test:documents` 3 tests / 19 steps； `check:bundle`
  四个 budget/invariant gate 通过，Home initial JS gzip 261.01 KiB； `check:ui`
  architecture/visual violations 均为零； `test` 660 tests / 51 steps；显式
  backend/frontend typecheck 通过； UI Guard exception/regression 14
  tests；`test:workspace` 23 tests / 134 steps。 各专项任务包含的 production
  build 均通过。此轮完整运行 495s，未拼接局部结果。
  `deno check src/main.ts web/src/main.tsx` 通过。仓库没有
  `lint`、`fmt`、`typecheck` task，使用 Deno 原生命令替代并记录结果。 全仓库
  `deno lint` 仍有 9 项既有失败（api/local/search），全仓库 fmt 的
  `WORKSPACE_FINAL_REFACTOR_PLAN.md` 与 `scripts/ui-guard/baseline.json`
  仍为既有不规范文件；不修改无关代码、不增加忽略规则或声称全仓库通过。
- PR #152 首轮 CI：UI / Bundle+route / Docker / Wallpaper / Notes 通过；
  Workspace formatter 通过，E2E 22 tests / 130 steps 通过、1 step 失败。 Apps
  脏稿从 Window 切换到 Sheet 时，旧 fixture 在 viewport resize 后 仍可能读取旧
  input 并立即发 Escape，未等待真正的新 Host。 现等待实际 Sheet 内 input
  可见并从该 input 发键盘事件，保留 AlertDialog 与草稿不丢断言。该完整模块 1
  test / 6 steps、fmt/lint 各 1 file 通过； 产品实现与已通过
  Documents/geometry/unit/bundle 结果未改变。
- 第二轮 CI 的 Sheet 草稿 Escape 场景通过；Workspace 22 tests / 133 steps
  通过、1 step 失败于撤销期限 fixture：从运行中的 Date.now() 取样再跨进程
  pauseAt，该目标在慢 runner 上已经成为过去。现从固定初值安装时钟，并在
  删除操作前暂停；保留跨 Host 同一 live region、3000+300+300+1500ms
  原始期限与到期消失断言，不重发失败场景或延长产品期限。
  受控时钟下在删除前推进菜单调度，不使用真实 sleep；修正后完整模块 1 test / 6
  steps 通过，撤销到期语义不变。
- 第三轮 CI 的 Apps 模块全部通过；Workspace 22 tests / 133 steps 通过、 1 step
  失败于 right→top-left Snap 的 x=20（期望0）。 原等待仅检查
  mode/snap/width，两种 Snap 宽度相同，未检查完整 DOM frame。
  现复用已有真实几何等待，同时验证 x/y/width/height（误差<=1px）； 原
  Snap/preview/restore/resize 断言保留，不增加 sleep、重试或更宽容差。
- 本地追加诊断捕获 resize 未变化：760×569，点击位置的 elementFromPoint 为 Home
  main，而非 SE handle。fixture 现在先由标准 hover 等待真实 handle
  可交互，再读取坐标并验证 SE 命中；八向 resize 均保留原尺寸与锚点断言。 Dock
  键盘域切换也按“搜索应用/搜索便签”可观察标签等待，避免共用 input selector 在旧
  active Surface 上输入。没有 force、固定 sleep 或重发手势。 修正后的 Workspace
  shell 完整模块 1 test / 9 steps、fmt/lint 各 1 file 通过。
- 第四轮 CI 的 Workspace shell 与 Apps 模块通过；Workspace 22 tests / 133 steps
  通过、1 step 失败于 Launcher 375px：旧等待只确认 innerWidth， 尚未等 React
  移除 DesktopDock 就断言 count=0。fixture 改为等待 Dock detached 和实际 mobile
  Sheet，保留无 Dock、无横向 overflow 与系统主题断言。 修正后的 Launcher
  完整模块 1 test / 14 steps、fmt/lint 各 1 file 通过。
