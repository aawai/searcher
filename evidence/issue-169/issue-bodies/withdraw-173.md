## #169 重新审计：撤回误判，非修复完成

撤回原 Confirmed：viewport meta 未声明 cover 是静态事实，不证明全站 safe-area 退化。WebKit 默认 auto 会自动 inset；合法 env() 零值不触发 fallback。实际真机遮挡未验证，禁止以一行 cover 作为已确认修复。是否采用 edge-to-edge 属 Needs Decision，需真实 Safari 证据。

基线 main@0c8d36d2f0203f5289ab981bad0913d8bc241b29。详见[最终审计报告](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)及 sections/css-ownership.md、sections/interactions.md。

原实施计划不再有效，不应执行。本 Issue 以 **not_planned** 关闭，不表示生产代码已修复。若后续有设备/实际路径新证据，再以具体 contract 与独立复现重新评估。
