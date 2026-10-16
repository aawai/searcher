## #169 重新审计：撤回误判，非修复完成

撤回原 Confirmed：Ask thread 与 Home Workspace Sheet 位于不同路由，未对同一 Surface 并行校正。Ask 短屏可通过外层 thread scroll 到达 composer；真实移动键盘仍未验证。不能因两个 visualViewport listener 就删除 Ask 的兼容逻辑。

基线 main@0c8d36d2f0203f5289ab981bad0913d8bc241b29。详见[最终审计报告](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)及 sections/css-ownership.md、sections/interactions.md。

原实施计划不再有效，不应执行。本 Issue 以 **not_planned** 关闭，不表示生产代码已修复。若后续有设备/实际路径新证据，再以具体 contract 与独立复现重新评估。
