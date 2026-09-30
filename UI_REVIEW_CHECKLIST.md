# UI PR Review Checklist

参考 [Principles](DESIGN_PRINCIPLES.md) 与
[System](DESIGN_SYSTEM.md)。适用项填写证据，不适用写原因；build/test
不代替实页。

## 设计与所有权

- [ ] Page Archetype：****；primary interaction：****。
- [ ] 新 surface level：****；background/border/shadow/blur token：****。
- [ ] 复用 semantic component：____；无另造基础控件或 box-on-box。
- [ ] 每区域最多一个 primary；同目的地无重复同级入口。
- [ ] 唯一 page title；component title 不抢层级；关键提示不依赖 caption/muted。
- [ ] 未新增 raw spacing/font/shadow/radius/inline style，或正式 owner
      与系统语义：____。
- [ ] 不以现有实现证明正确；偏离规范的系统语义/范围/验收：____。

## 实页证据

- [ ] 390×844 / 768×1024 / 1440×900 页面和 screenshot：____。
- [ ] 640/960/1280 临界宽度、长文案、guest/authenticated：____。
- [ ] light/dark、Zen/Widgets、wallpaper on/off、title preference：____。
- [ ] empty/populated/loading/error、hover/focus-visible/active/selected-current/disabled、overlay
      open：____。
- [ ] reduced motion；Tab、focus restoration、touch target、overflow：____。
- [ ] Console 无新增 warning/error；Accessibility Tree / axe：____。
- [ ] Design Lab 与真实业务页面验证分别记录，不互相替代。

## 自动化门禁

- [ ] deno task check:ui；baseline 只删除迁移旧项，不增加 allowlist 债务。
- [ ] deno task build 与 affected focused tests；路由变更用 deno task
      test:routing。
- [ ] API 权限、history、conversation model 保持
      contract；只有直接相关的改动才追加验证。

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
