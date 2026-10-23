# UI 验收清单

UI PR 在描述中逐项勾选；不适用写原因。依据
[VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md)。 build / test
通过不能代替实页验证；验收记录写在 PR 中，不写回本文件。

## 视觉

- [ ] 只使用 Token；`deno task check:ui` 通过。
- [ ] 无卡片套卡片；内容层无阴影；边框只用于细线分隔或独立表单控件。
- [ ] 字号只用 12 / 14 / 17 / 24（及搜索框、代码专用角色）；字重只用 400 / 500 /
      600。
- [ ] 每个区域最多一个 primary 按钮；强调色未用于装饰。
- [ ] 材质只出现在壁纸之上；透明度、模糊只取 `data-glass` 档位
      Token，并有实色回退与 `--shadow-material-edge`。

## 文案

- [ ] 没有复述标签的说明行、使用说明段落或“登录后可用”类提示。
- [ ] 空状态为一句话 + 至多一个操作。
- [ ] 动作名称全流程一致；领域词汇符合 Visual Language。

## 交互

- [ ] hover / focus-visible / active / selected / disabled / loading / error
      均可辨识，且不改变尺寸。
- [ ] 次要操作可通过 hover、`⋯`、右键或长按发现；触屏下常显或在菜单中。
- [ ] 键盘可完成主要流程；Escape 每次只关闭一层；关闭后焦点回到触发控件。
- [ ] 破坏性操作经 AlertDialog 确认或提供撤销。

## 可访问性

- [ ] 文字对比度 ≥ 4.5:1，控件边界与焦点环 ≥ 3:1（light / dark 均检查）。
- [ ] 粗指针下可操作目标 ≥ 44px。
- [ ] `prefers-reduced-motion` 与 `prefers-reduced-transparency` 下表现正确。

## 实页矩阵

- [ ] 受影响页面在 390×844、768×1024、1440×900 × light / dark
      实页截图逐张审阅；无横向溢出、 无裁切、无重叠。
- [ ] 首页另检查：访客 / 登录、无壁纸 / 图片壁纸。
- [ ] 截图路径与发现的问题写入 PR 描述。
