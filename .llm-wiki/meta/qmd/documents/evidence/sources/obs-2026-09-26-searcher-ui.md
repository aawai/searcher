---
type: source
title: "Observation: Searcher UI 重构与克制效率工具落地完成"
tags:
  - ui-redesign
  - design-system
  - shadcn-base-ui
  - content-sheet
  - a11y
status: observation
created: 2026-09-26
updated: 2026-09-26
slug: obs-2026-09-26-searcher-ui
relevance: critical
observed_at: 2026-09-26T23:27:22.363Z
source_context: Searcher 克制效率工具 UI 改版执行计划
---

# 🔴 Observation: Searcher UI 重构与克制效率工具落地完成

完成了 Searcher 克制效率工具 UI 改版执行计划的所有 6 个步骤并在独立测试实例（34569 端口与隔离数据库）及全量测试中完成闭环验证：
1. tokens.css & global.css：收敛 quiet 默认，引入 --surface-solid 与 --control-radius，消除了在 glass/wallpaper 模式下表单与面板透穿壁纸的透明度 bug；实测 light 模式对比度 14.40:1、dark 模式 15.43:1；全量 6 种 accent 及 5 种 style 经 60 组排列组合实页验证；
2. 基础组件库：基于官方 shadcn v4 Base UI registry 源在 components/ui/ 补齐 input.tsx、textarea.tsx、native-select.tsx、tabs.tsx、alert-dialog.tsx，统一 2px focus ring 与 2px offset；
3. 首页：搜索框宽度上限 720px，高度 56px（移动端 52px），顶栏距离 clamp(80px, 18dvh, 180px)，距离固定区精确 24px；底栏 Dock 实底轻阴影，按钮 44px 高度；壁纸仅在首页展示，其他路由中性画布；EngineSelector 移除折叠态绿点，下拉保留检测重试并提供最近可连接/失败文案；搜索建议与输入框等宽并支持快捷键和 WebApp 匹配；
4. APP 单一工作区与文件夹体系：ContentSheet 桌面 960x720 居中模态，移动端 80/100dvh 底部 Sheet，标题前提供 onBack 按钮，Escape 逐层退回；移除 WebAppLauncher 的嵌套 Dialog 及 pointerdown 捕获，实现同层内联文件夹详情与滚动/焦点恢复；AppFormDialog 区分 panel/dialog 呈现，在工作区内保留 launcher 隐藏实例；文件夹管理使用 AlertDialog 进行非空文件夹删除确认，实测验证组内 APP 迁移至未放入文件夹 (groupId=null)；
5. 便签工作区：复用 ContentSheet，列表与编辑器通过 onBack 切换，移除底部重复返回按钮；编辑器采用标准 Input、Textarea、Tabs，桌面 1:1 分栏自适应高度，移动端垂直堆叠；固定状态栏并保留本地草稿及版本历史；
6. 设置页统一行结构：左侧标签说明、右侧控件，行高 >= 64px；窄屏 2x2 网格导航；Choices 明确 control 类型；Slider 桌面 240px、窄屏整行堆叠；Switch 保持同行动画；
7. 账户、AI、回收站：Card/Header/Content 统一语言；AI 工作区 224px 侧栏 + calc(100dvh - 152px) 消息区，未配置模型引导到设置；回收站移动端堆叠卡片免横滚；
8. 全量 161 个测试全部 pass，零 lint 错误，生产构建一次性成功。

*Relevance: critical*
*Context: Searcher 克制效率工具 UI 改版执行计划*
*Tags: ui-redesign design-system shadcn-base-ui content-sheet a11y*

---
*Observed: 2026-09-26T23:27:22.363Z*
