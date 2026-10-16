# 最终复核（主代理，2026-10-16）

两项追加 reviewer 作业均因模型 usage_limit_reached 失败，没有产出有效复核；用户随后要求子代理不使用 GPT-6.1 Sol，因此未重启。不得将它们列为已通过的独立复核。本次最终核对由主代理完成；此前 CSS/交互/历史三份只读研究及 probe-review 是实际产出的独立输入，不等于最终方案背书。

## 已纠正

1. 核对 matrix-summary.json：160计划/154截图/2open超时/4后继跳过，report未写全通过；fixed48单列。
2. 核对 apps-route-loss.json：实际 Link navigation，settings dialogs0，返回字段空；不是edge切换丢失。核对 note-logout.json：local新title/server旧title、PATCH[]、warningfalse；保留恢复证据，不称数据丢失。
3. 核对 widgets-notes-feedback.json：loading/error皆empty、noteCards0；纯首页probe排除其他窗口alert。offline使用真实network abort，不把503当离线。
4. 撤回safe-area fallback误述：合法0不是fallback；Ask/Home不同route owner；普通自由窗口Escape有明确不关闭contract。
5. 历史附件错误把CI wallpaper失败归因动画超时：实际读取run38724051121 log-failed，失败是wallpaper.test.ts:2027，sync actual0/expected1；根因未知。本次full同路径通过，只能Not Reproduced，不能报修复/flake已确认。
6. interactions I-3至I-6未执行异常组合改为“未验证”，不再误用Not Reproduced。I-2运行证据升级Confirmed，以REPORT为最终裁决。
7. 探针初次独立review指出等待、Presenter选择、真实hit target、失败诊断风险；修订后先8场景校准再跑matrix。结果仍仅证明所列geometry/capture断言；额外真实点击证据才用于遮挡问题。未使用force去绕过产品失败。

## 方案核对边界

- C2现有BrowserRouter不能使用useBlocker，issue明确最小data-router cutover、唯一确认owner、reset/proceed和Back/Forward；不是给Settings Link打补丁。修复实现时需检查Router hooks上下文与阻塞注册位置，已有AppState/Layout/Routes保持。
- C5明确canonical用户key、鉴权归属验证legacy migration、写成功后清旧、失败留原、auth epoch、防跨账号；无数据损失实证，不允许借机unmount flush。迁移回滚必须先转换/备份新格式，不能把“回滚代码”当安全数据回滚。
- C1/C4共享Host改动但独立根因，互相回归；C3只改默认无坐标placement；C6只消费现有状态与semantic反馈。六份计划含目标模块、ordered steps、非目标、验收/禁止回归、回滚及依赖。

## 明确不做/待决策

真机keyboard/address bar/safe-area/pinch/rotation及真实IME未验证；未就这些创建缺陷。edge-to-edge需产品选择与WebKit证据。CSS静态候选：Zen入口Button重叠声明、Widgets新建按钮的旧height、home--widgets死选择器、warning raw色均未证明独立用户可见回归；不创建推测性修复，不以清理为由扩大Search720到960或降低44px触点。Notes域色/feature命名token保留。过期便签草稿语义另需合同与实验；IDB故障组合未执行。
