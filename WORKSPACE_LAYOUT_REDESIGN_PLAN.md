# Searcher 主页布局与工作区风格重构方案 (WORKSPACE LAYOUT REDESIGN PLAN)

## 一、 背景与重构目标

当前 Searcher 具备完整的全栈能力（Deno + Hono + React 19 + SQLite + Drizzle），但现有 UI 呈现出“构件拼装脚手架”状态，主要体现在：
1. **空间荒漠与极低密度**：1440px 桌面视口下大面积留白无序，设置页与弹窗空旷失衡。
2. **“弹窗地狱”（Modal Overuse）**：常用网站与便签使用近千像素的巨型居中弹窗，严重打断核心浏览流。
3. **单项固定网站左偏失衡**：首页固定少量网站时，图标靠左对齐导致整个居中视觉轴坍塌。
4. **低感知伪配置**：现有“界面风格”（Quiet / Minimal / Glass / Soft / Classic）仅修改若干像素的 `border-radius` 与 `box-shadow`，无法改变产品的交互心智与信息结构。

**重构目标**：
将现有低效的“界面风格”升级为驱动主页信息架构与交互心智的 **三种高感知工作区布局风格（Workspace Layout Modes）**：
- **`command`（效率控制台）**：Raycast / Linear 质感，高密度、紧凑内联、自平衡药丸卡片、键盘优先、无打断式全屏弹窗。
- **`zen`（极简呼吸工作区）**：Arc / Notion 质感，去大标题、极致留白、纯净微光搜索框、右侧轻量抽屉滑出。
- **`widgets`（空间轻桌面）**：macOS / iPadOS 质感，通透毛玻璃 Bento 卡片、便利贴式便签板、系统级流光 Dock 栏。

---

## 二、 系统架构与正交配置层级

配置系统解耦为三个正交维度，彻底消除配置项重叠冲突：
1. **工作区布局与风格 (`style`: "command" | "zen" | "widgets")**：决定主页骨架、信息密度、容器形态与交互链路。
2. **色彩与明暗 (`theme`: "system" | "light" | "dark" + `accent`: 6种强调色)**：决定前景色、背景色与激活高亮色。
3. **背景与材质 (`wallpaper` + `blur` + `grayscale` + `mask`)**：决定底层 Canvas 表现。

---

## 三、 实施阶段与步骤拆解

### 阶段 1：契约、数据库与后端无损迁移
- [ ] 1.1 更新前后端共享契约 `src/shared/contracts.ts`：
  - `StylePreset` 更新为 `"command" | "zen" | "widgets"`。
  - 导出旧值至新值的平滑映射函数 `normalizeStylePreset(raw: string): StylePreset`。
- [ ] 1.2 更新数据库 Schema `src/db/schema.ts`：
  - 更新 `preferences.style` check 约束为 `in ('command','zen','widgets')`。
  - 生成并执行数据库迁移，将存量数据平滑归一化：
    - `quiet`, `classic` $\rightarrow$ `command`
    - `minimal` $\rightarrow$ `zen`
    - `glass`, `soft` $\rightarrow$ `widgets`
- [ ] 1.3 更新后端路由与校验 `src/features/preferences/` 及相关测试用例，确保契约测试全部通过。

### 阶段 2：设计系统基础 Tokens 与微质感表面
- [ ] 2.1 强化 `web/src/design-system/tokens.css`：
  - 固化严格的 8px 空间网格阶梯。
  - 建立四级表面与深度体系（Level 0 Canvas, Level 1 Card, Level 2 Popover/Dock, Level 3 Modal）。
  - 建立统一的同心圆角几何算法与暗黑模式微光描边（`subtle-border`、`glass-edge`）。
- [ ] 2.2 修复全局基础排版与单项居中失衡：
  - 修复 `.pinned-area` 的网格居中逻辑，彻底根除 1 个或少量网站时的左倾失衡。

### 阶段 3：抽象 `useHomeWorkspace` 逻辑层
- [ ] 3.1 提取 `web/src/app/useHomeWorkspace.ts`：
  - 将 `SearchHome.tsx` 中过于庞大的状态机解耦为纯逻辑 Hook：
    - 搜索引擎与搜索提交逻辑。
    - 常用网站加载、拖拽排序、增删改查、文件夹管理状态。
    - 便签加载、拖拽排序、增删改查、固定到首页状态。
    - 快捷键监听与弹窗/抽屉开关调度。
- [ ] 3.2 保持主页渲染与业务逻辑的解耦，为三种布局提供统一数据接口。

### 阶段 4：实现三种高感知主页布局组件
- [ ] 4.1 **`CommandLayout.tsx`（效率控制台）**：
  - 居中自平衡的常用网站药丸流（Pill Chips），支持内联直接操作与右键上下文菜单。
  - 固定的便签以轻量精致的 Widget 卡片内嵌在搜索区下方，形成一体化日常工作台。
  - 弱化大标题视觉权重，突出搜索框核心地位。
- [ ] 4.2 **`ZenLayout.tsx`（极简呼吸工作区）**：
  - 完全隐藏 `Searcher.` 大标题，搜索栏采用微光极简轮廓。
  - 常用网站采用轻盈微小图标居中漂浮，背景通透。
  - 取消居中巨型弹窗，点击右下角微型浮岛时，以右侧边缘抽屉（Slide-over Sheet）优雅滑出常用网站与便签，不打断主视线。
- [ ] 4.3 **`WidgetsLayout.tsx`（空间轻桌面）**：
  - 打造 Bento Box 风格的毛玻璃卡片组（半透明磨砂、微描边高光）。
  - 便签以桌面便利贴形态错落呈现。
  - 底部配置具备悬浮动态反馈的 macOS 风格流光 Dock 托盘。
- [ ] 4.4 在 `SearchHome.tsx` 中建立分发器，根据 `appearance.style` 无缝渲染对应布局。

### 阶段 5：设置页面与视觉卡片选择器升级
- [ ] 5.1 升级 `SettingsPage.tsx` 中的“界面风格”配置：
  - 替换原有的文本下拉菜单，设计 **3 块带有布局线框图缩略示意、标题与设计特点的视觉卡片选择器（Visual Mode Selector）**。
  - 支持即选即换、免刷新实时热重载。
- [ ] 5.2 优化设置页面的大屏空旷感：
  - 施加受限的居中版心容器（`max-w-4xl mx-auto`），重构左侧导航与右侧卡片的比例关系，消除无限留白荒漠。

### 阶段 6：次级页面容器化与视觉统一
- [ ] 6.1 登录 / 注册页面（`AuthPage.tsx`）：
  - 增加玻璃质感卡片容器（Level 1 Surface），重塑品牌标题与说明文案层级，移除右上角重复的“登录”按钮。
- [ ] 6.2 账户页（`AccountPage.tsx`）与回收站（`TrashPage.tsx`）：
  - 统一为标准居中受限容器与优雅空状态插画。
- [ ] 6.3 统一“添加/编辑 APP”表单：
  - 去除 4 层互相打架的嵌套灰度边框，收敛为紧凑、整齐、节奏分明的现代表单。

### 阶段 7：真实端到端验证与工程交付
- [ ] 7.1 启动前后端服务，使用 Headless Chromium 对 3 种布局、深浅模式、移动/桌面端进行实页无死角验证与截图核对。
- [ ] 7.2 运行全套单元测试与契约测试（`deno task test`），确保无破坏性变更。
- [ ] 7.3 更新 `CHANGELOG.md` 与相关文档。
