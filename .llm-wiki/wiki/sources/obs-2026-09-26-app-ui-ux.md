---
type: source
title: "Observation: 添加 APP 对话框 UI/UX 精致化与实页验证"
tags:
  - ui-ux
  - webapp
  - dialog
  - segmented-control
  - mobile-sticky
status: observation
created: 2026-09-26
updated: 2026-09-26
slug: obs-2026-09-26-app-ui-ux
relevance: high
observed_at: 2026-09-26T03:47:34.263Z
source_context: 优化添加 APP 页面的 UI/UX 并验证实际效果
---

# ⭐ Observation: 添加 APP 对话框 UI/UX 精致化与实页验证

完成了“添加 APP”对话框的 UI/UX 精致化重构，涉及 AppFormDialog 组件抽取、LogoCandidatePicker AI 状态完善以及 global.css 样式升级。1) 信息层级拆分为“基础信息”、“打开设置”、“图标”三个清晰区域；2) URL 输入框支持自动防抖识别与 onBlur 抓取，显示「✓ 已获取网站名称和图标」状态反馈与「重新获取」重试按钮，移除原「识别」按钮；3) 打开方式改用紧凑 Segmented Control，并在「跟随全局」时动态显示系统生效策略；4) “固定在搜索首页”优化为紧凑两行 Switch 控件；5) 图标来源重构为 [ 自动获取 ] [ 上传图片 ] [ 网络图片 ] [ AI 生成 ] 选项卡；6) 增加实时图标与名称预览；7) 修复 AI 生成在未配置模型时的不可用状态，展示配置提示与前往设置入口，隐藏无效表单与按钮；8) 移除 AI 区域内多余的“取消”；9) 底部操作按钮统一样式与文案（取消/添加 APP/保存更新），并在移动端实现吸底（sticky footer）。通过全部 153 个单元测试与端到端真实浏览器验证。

*Relevance: high*
*Context: 优化添加 APP 页面的 UI/UX 并验证实际效果*
*Tags: ui-ux webapp dialog segmented-control mobile-sticky*

---
*Observed: 2026-09-26T03:47:34.263Z*
