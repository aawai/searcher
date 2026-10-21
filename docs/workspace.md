# 首页与工作区

首页以搜索为主操作、Bento 为内容层；应用、便签、笔记的管理在 Workspace Host
中进行。本文记录首页布局、Host 形态、Widgets 窗口与快捷键的用户可观察契约。视觉
Token 与图标尺寸见
[Design System](design/DESIGN_SYSTEM.md#图标尺寸与工作区语义)。

## 工作区风格

“设置 → 外观 → 主页工作区风格”切换 Zen（极简呼吸）与 Widgets（空间轻桌面）。

- Zen 不显示品牌大标题；“显示 Searcher 标题”仅控制 Widgets 的大标题。
- 切换工作区或标题开关不改变搜索框的纵向锚点，匿名与登录状态保持一致；个人内容仍须登录。
- 渲染层只消费 `zen | widgets`；旧风格仅在输入边界通过 `normalizeStylePreset`
  映射。

## 搜索框

搜索框在中文等输入法组合期间将方向键和 Enter 留给输入法，不切换联想或提交搜索；
兼容组合结束后仍带 `keyCode=229` 的选字回车。

## Bento

- 宽布局下，两张 Bento 卡片都有内容时保持 5:3 列比，高度各自随内容变化。
- 只有一张有内容时，有内容的卡片占满整行，另一张紧凑空卡片移到下一行。
- 两张都空时保留紧凑提示与新建便签内容动作，不重复 Dock 的 root workspace
  navigation。
- 窄布局统一使用单列，不强制最小高度。

## Host 形态

| 宽度       | Widgets                            | Zen                    |
| ---------- | ---------------------------------- | ---------------------- |
| >=1024px   | 非模态独立窗口，可同时打开         | 400px 非模态右侧 Panel |
| 768–1023px | 单 active 居中 constrained 窗口    | 400px 非模态右侧 Panel |
| <768px     | 模态底部 Sheet，不显示 DesktopDock | 模态底部 Sheet         |

- 窗口或 Panel 打开不推动、不缩小 Search/Bento。破坏性确认仍使用模态 Dialog；
  材质、阴影与叠放层级由系统 Token 分别管理。
- Apps / Notes / Documents 的 route、Back stack 与搜索 query 独立。所有 surface
  只有 Body 滚动，Root Footer 固定；嵌套页 Back 返回上一级。
- 768–1023px 的 constrained 窗口可选中等、大尺寸、全屏，不能自由拖动或
  resize；切换时保持各自表单草稿。

## Widgets 窗口与 Task Dock

> =1024px 的窗口支持标题栏拖动、八向 resize、最小化、最大化与恢复。

- Task Dock 始终可见，唯一负责工作区导航，不包含 CRUD。Dock 项根据窗口状态执行
  Open、Focus 或 Restore + Focus，不重置 nested route。
- 窗口 Close 只收起对应 domain，关闭后聚焦对应 Dock item。
- 便签按 `note:<id>`、笔记按笔记 ID
  打开独立窗口：同一项重复打开只恢复并聚焦，多份可同时编辑；
  列表视图仍保留。删除便签或将笔记移至回收站会关闭对应窗口。
- 普通窗口可贴近视口边界、正文可延伸到 Dock 下方，但标题栏始终可操作；Snap /
  最大化填满 Header 与 Dock 之间的区域，不保留外围 gap。

### 布局持久化

窗口布局按登录用户保存在当前设备 IndexedDB，key 为
`searcher:desktop-layout:v1:<userId>`，payload 版本为
4，包括打开的窗口、正常/还原尺寸、模式和层级。

- v1–v3 布局自动迁移到 viewport 坐标；已失效的笔记窗口自动清理。
- 无记录、损坏或不支持的版本回到空桌面；IndexedDB
  不可用时继续使用内存态，读取失败不覆写旧记录。
- 刷新或切回 Widgets 时按当前视口恢复；切换账号不继承布局；退出只清运行态。
- 几何不写入服务端 `note_layouts`，不跨设备同步，也不转换 Zen FloatingNotes
  坐标。

同一会话中，临时缩小视口、Header/Dock 测量变化和 768–1023px
受限布局只调整当前显示，
不覆盖自由桌面最后一次明确摆放的位置与尺寸；恢复视口后回到原位置。若在缩小后的自由桌面
主动移动、调整大小或从 Snap /
最大化还原，则保留新操作的位置。受限布局的尺寸预设、工作区切换与 Dock
选择不重写自由桌面布局。刷新按启动时视口读取 v4 归一化布局，不保证
跨会话恢复绝对像素。

### 沉浸式笔记

仅 Widgets >=1024px
的独立笔记窗口可通过标题栏“进入沉浸式”覆盖应用视口；便签、Zen、受限窗口与移动
Sheet 不提供此模式。

- 保留原编辑器、笔记保存流程和窗口布局；顶部可退出、查看保存/上传状态及最小化/关闭。
- 底边 12px 热区或可 Tab 聚焦的“显示 Dock”按钮呼出原 Dock；选当前笔记继续编辑，
  选其他窗口或总览先退出沉浸。
- 刷新、账号或 Host 变化不恢复沉浸状态。

## 快捷键

| 操作         | 键位                                                  |
| ------------ | ----------------------------------------------------- |
| 打开窗口菜单 | `Ctrl+Alt+Shift+M`（或点击/Enter 标题栏常驻菜单按钮） |
| 左 / 右吸附  | `Ctrl+Alt+Shift+←` / `Ctrl+Alt+Shift+→`               |
| 打开总览     | `Ctrl+Alt+Shift+O`，Esc 退出                          |

Escape 通过统一层栈一次只消费最上层的菜单、弹窗、沉浸或工作区，不误关下层窗口。

搜索、AI 问答、便签编辑的快捷键与搜索快捷命令统一列在“设置 → 快捷键”
（`/settings/shortcuts`），无需登录即可查阅，按当前平台展示键位与生效上下文；桌面窗口
快捷键另在窗口菜单与总览中列出。编辑器本地操作优先于首页聚焦搜索；不提供快捷键自定义或同步。

开发维护：

- 通用 binding 与命令 target 在
  `web/src/features/shortcuts/shortcut-catalog.ts`。
- 桌面窗口组合键在 `web/src/features/desktop/desktop-shortcuts.ts`。
- 业务组件保留事件处理归属，说明页消费各自的同一 catalog。
