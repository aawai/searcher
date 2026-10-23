# UI 验收清单

UI PR 在描述中逐项勾选；不适用写原因。依据 [VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md)，条目按其三层组织：底线不可放宽，系统语法的偏离须按修订门槛写明语义与验证方式，风格方向的变更须有对应契约子任务。build / test 通过不能代替实页验证；验收记录写在 PR 中，不写回本文件。

## 底线

- [ ] 文字对比度 ≥ 4.5:1，控件边界与焦点环 ≥ 3:1（light / dark 均检查）。
- [ ] 焦点环为 2px `--ring`，只在 `:focus-visible` 出现；选中不只靠颜色。
- [ ] 粗指针下可操作目标 ≥ 44px；hover 才出现的操作在触屏常显或进入 `⋯` 菜单。
- [ ] `prefers-reduced-motion` 与 `prefers-reduced-transparency` 下表现正确。
- [ ] 键盘可完成主要流程；Escape 每次只关闭一层；关闭后焦点回到触发控件。

## 系统语法

- [ ] 只使用 Token；字号与圆角只取 VISUAL_LANGUAGE 阶梯登记的 Token；`deno task check:ui` 通过。
- [ ] 无卡片套卡片；内容层无阴影；边框只用于细线分隔或独立表单控件。
- [ ] 字重只用 400 / 500 / 600；不用全大写。
- [ ] 每个区域最多一个 primary 按钮。
- [ ] 没有复述标签的说明行、使用说明段落或“登录后可用”类提示；空状态为一句话 + 至多一个操作。
- [ ] 动作名称全流程一致；领域词汇（应用、笔记、Dock、首页纸张）符合 Visual Language。
- [ ] hover / focus-visible / active / selected / disabled / loading / error 均可辨识，且不改变尺寸。
- [ ] 次要操作可通过 hover、`⋯`、右键或长按发现。
- [ ] 破坏性操作经 AlertDialog 确认或提供撤销。
- [ ] 新增 Token、例外或阶梯登记项已写入 VISUAL_LANGUAGE，并说明语义、owner 与验证方式。

## 风格方向

- [ ] 强调色只用于已登记的交互语义与个性化画布；作为 background / fill 的位置已登记；未用于装饰、大面积背景或渐变。
- [ ] 材质只出现在壁纸之上；透明度、模糊只取 `data-glass` 档位 Token，并有实色回退与 `--shadow-material-edge`。
- [ ] 动效回应操作；出现与消失成对；入场位移不超过 8px（底部 Sheet 除外）；共享元素仅变形同一对象，reduced-motion 下同时长纯透明度、无尺寸 / 位置插值，无 API 时立即切换；展开后焦点进入目标，关闭后返回触发控件。
- [ ] 偏离风格方向的改动已有对应契约子任务，原型停留在 `/design-lab/*` 的不进入生产。

## 实页矩阵

实验通道（`/design-lab/*`）不适用本节。

- [ ] 受影响页面在 390×844、768×1024、1440×900 × light / dark 实页截图逐张审阅；无横向溢出、无裁切、无重叠。
- [ ] 首页另检查：访客 / 登录、无壁纸 / 图片壁纸。
- [ ] 截图路径与发现的问题写入 PR 描述。
