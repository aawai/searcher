# 修复 Issue 索引与完成记录

审计基线：0c8d36d2f0203f5289ab981bad0913d8bc241b29；行为执行2026-10-15，最终发布2026-10-16。原始证据commit：[5840ce6](https://github.com/aawai/searcher/tree/5840ce6/evidence/issue-169)。生产代码未修改，证据仅位于 evidence/issue-169 分支，不要求合并main。

|顺序|审计项|裁决/优先级|独立计划|负责人/依赖|
|---|---|---|---|---|
|1|C2 Apps真实路由离开丢草稿|Confirmed/P1|[#174](https://github.com/aawai/searcher/issues/174)，已重写|未分配；#141契约，router seam调整|
|2|C1 Widgets短受限初次打开不可用|Confirmed/P1|[#181](https://github.com/aawai/searcher/issues/181)，新建|未分配；#147/#163均已合并|
|3|C3 Zen默认便签遮Search submit|Confirmed/P1|[#180](https://github.com/aawai/searcher/issues/180)，新建|未分配；保留Search anchor及用户坐标|
|4|C5退出漏未同步Note提醒|Confirmed/P2|[#178](https://github.com/aawai/searcher/issues/178)，新建|未分配；账号隔离/旧draft迁移|
|5|C4 Zen Panel遮banner Retry|Confirmed/P2|[#179](https://github.com/aawai/searcher/issues/179)，新建|未分配；与C1同Host互验，无阻塞依赖|
|6|C6 Widgets状态反馈误报/遗漏|Confirmed/P2|[#177](https://github.com/aawai/searcher/issues/177)，已重写|未分配；复用semantic反馈|

#173/#175/#176已撤回并以not_planned关闭，不是生产修复完成。#174明确撤回edge切换丢失的旧说法，#177明确撤回feature :root/fallback/任意import order的全局清理。Note立即关闭取消云端debounce且本地恢复是By Design，不需产品决定unmount flush。

所有六项为独立修复计划，尚未实现；#169只完成审计、证据和建Issue。每份计划包含具体expected/actual、viewport、证据、根因、目标模块、步骤、非目标、回归/验收矩阵、依赖与回滚、完成定义。真实设备未验证项详见REPORT，不能由桌面仿真代签。

追加两个最终reviewer调用失败，未当作独立复核通过。已完成的静态研究与探针review见sections，最终主代理复核见final-review.md。
