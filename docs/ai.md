# AI 问答与 Provider

AI
问答工作区是登录用户的 AI 窗口（`/ask`），提供多模型对话、分支历史和个人上下文检索；`/ask/:id` 直接打开指定会话（可分享、刷新、浏览器前进后退，侧栏切换会话与新建对话同步更新地址）。首页不再有 AI 模式：问题从首页搜索框交给 AI，在框下以流式卡片回答，再“展开”在 AI 窗口打开 `/ask/:id`，见 [工作区 · AI 回答卡片](workspace.md#ai-回答卡片)。会话数据、分支树、Provider
凭证、模型注册表、能力裁决与鉴权均由 Searcher 本地服务和 SQLite
管理，不依赖第三方会话托管服务。AI 应用图标生成见 [应用](apps.md#ai-生成图标)。

## 工作区布局

- 登录用户的 AI 问答是桌面上的一个窗口（`data-window-id="ai"`，1440×900 下初始 960×720），会话标题位于工作区 Header，不重复展示页面 breadcrumb 或“AI 问答”大标题；窗口标题栏提供最小化、最大化 / 还原、关闭与键盘移动 / 调整，不再有页面内“返回首页”。会话列表按窗口实测宽度（<768px）收进历史抽屉，历史抽屉、会话操作与窗口按钮命中区至少 44px。
- 历史与消息各自滚动，输入面板保留在工作区内；移动端通过历史入口打开 Sheet。
- 未登录访问 `/ask` 保留页面标题与登录入口，不创建窗口。
- 会话头部与消息列共用 `--layout-ask-message-max` 和中轴；滚动区上下边缘使用同一画布背景渐隐，不硬切正文。
- 窗口最小化、被其他窗口覆盖或切换到设置、回收站等窗口时不卸载：生成继续，Composer 草稿、当前会话、分支选择、来源与撤销提示保留，恢复后显示最新内容。关闭窗口才销毁内容并中止生成。
- 窗口层 Escape 不关闭、最小化或销毁 AI 窗口，只处理菜单、对话框、会话内搜索等内部层。
- 浏览器地址只表示活动窗口：AI 窗口在后台时，新会话取得 ID 只更新该窗口的局部地址，不改变当前页面地址或抢占焦点；之后点击任务栏回到该窗口得到 `/ask/:id`，回到当时的历史条目也会以 replace 对齐到该会话。已销毁的临时会话再次通过历史或链接打开时显示既有不可用提示，不会复活。

## 交互契约

- Enter 发送，Shift+Enter
  换行；输入法组合期间不发送。输入框随内容增高，达到上限后在内部滚动。
- 空会话仅保留一句提问引导和输入框，不展示示例问题；没有可用模型时仅显示一句配置提示和“配置模型”入口。
- 不支持工具的模型给出可见原因；已启用的工具以标签显示在输入框上方。
- 生成失败或中断时，在对应助手消息中显示 alert 与“重试”操作。
- 流式状态由 polite 区域播报开始、结束与失败；进度至多每 10
  秒播报一次，不逐字播报正文。
- 复制成功后才显示复制反馈。
- 删除会话保留 5 秒撤销。
- 减少动态效果偏好下关闭工作区过渡与流式光标动画。

## 实现边界

- 前端使用 `@assistant-ui/react`
  的会话原语（Thread、Message、Composer、BranchPicker、附件渲染与滚动），通过
  `SearcherAssistantRuntimeProvider`（基于 `useExternalStoreRuntime` 与
  `ExportedMessageRepository.fromBranchableArray`）接入服务端数据。
- 数据表：`ai_conversations`、`ai_temporary_leases`、`ai_messages`、`ai_blobs`、`ai_providers`、`ai_models`。
- Provider API Key 以 AES-256-GCM 加密，密钥为 `ENCRYPTION_KEY`（见
  [README · 配置](../README.md#配置)）。

## 模型能力

模型能力（尤其推理能力 `supportsReasoning`）按以下优先级裁决：

`manual（手动覆写）> provider（Provider 发现）> preset（内置预设）> inferred（模型名推断）> unknown`

- 管理员刷新 Provider 模型列表（`/api/ai/providers/:id/refresh-models`）只更新
  `metadataJson` 中的 `discovered` 元数据，不覆盖手动覆写
  `overrides.reasoning`。
- 清除手动覆写后回退至自动发现或预设能力，已发现的原始元数据保留。
- 未识别出推理元数据且无预设的模型标记为 `unknown`，不推断为 `unsupported`。

## 推理参数

规范化推理级别：`none`、`auto`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。

| Reasoning Transport       | 上游请求                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `openai_reasoning_effort` | `{ reasoning_effort: effort }`                                                |
| `boolean`                 | 按配置的布尔参数（如 `thinking`）传递；`effort !== "none"` 为 `true`          |
| `custom`                  | 按 `valueMap` 映射为服务商专有参数名与取值                                    |
| `unsupported`             | 请求显式传入推理强度时抛出 `ReasoningValidationError`（HTTP 400），不静默丢弃 |

严格推理模型（如 OpenAI o1 / o3）显式传入 `temperature` 或 `top_p` 返回 HTTP
400；继承用户或全局默认配置时自动剔除采样参数。

### 生成参数继承

单次请求的 `reasoningEffort`、`temperature`、`topP`、`maxTokens`
按以下顺序取值：

1. 本次 Composer 显式指定（或局部工具栏选定）
2. 用户对该模型保存的偏好（`aiGenerationDefaults.models[modelId]`）
3. 用户全局默认（`aiGenerationDefaults.default`）
4. 模型默认级别（`capability.defaultLevel` 或
   `ai_models.default_reasoning_effort`）
5. `undefined`

UI
切换模型时，目标模型支持当前推理级别则保留；否则按上述顺序回退至目标模型支持的默认值或置空。

## 会话

### 分支、编辑与重新生成

- 每条消息记录 `id`、`conversationId`、`parentMessageId` 与 `variantGroupId`。
- 上下文从活跃叶子 `activeLeafMessageId` 沿 `parentMessageId` 回溯到根，不按
  `createdAt` 扁平排序，避免跨分支串话。
- 编辑并重发历史提问时基于原父节点创建新分支，原轨迹保留；分支选择器（`< 1/2 >`）切换分支。
- 重新生成基于同一父节点产生回复，作为相同 `variantGroupId` 下的变体展示。

### Token 计量

`inputTokens` / `outputTokens` 仅在 Provider 的 SSE 分块 `usage`
实际包含统计时持久化；未返回时保持 `null`，不做本地估算。

### 临时会话与草稿

- 新建对话或当前会话可切换为临时模式（History-off），不进入历史侧边栏。
- 每个持有临时会话的标签页有独立租约。新建临时会话时服务端原子创建会话和未认领的初始租约，通过流的 `meta.temporaryLease` 返回；页面认领初始租约，直达已有临时会话的其他标签页各自获取租约。租约不含对话内容，属于当前账号及会话，并在 SQLite 中保存，服务重启后仍有效。
- `POST /api/ai/conversations/:id/temporary/leases` 获取租约，`PUT /api/ai/conversations/:id/temporary/leases/:leaseId` 认领或续期；每次续期将有效期设为服务端当前时间后 30 分钟。AI 窗口持有会话期间（包括最小化和位于其他窗口之后）每 5 分钟续期。
- 切换会话或关闭 AI 窗口时先中止流，再以 `keepalive: true` 调用 `DELETE /api/ai/conversations/:id/temporary`，在 `X-Searcher-Temporary-Lease` 中携带本标签页的租约 ID；最小化、切换到其他窗口、返回桌面不释放租约。最后一个有效租约释放后，没有进行中的流则立即删除临时会话、消息及附件；有流时记录待删除标记，等待其结束落库后删除。若服务先退出，重启后的定时清理会处理待删除会话；其他标签页获得租约时取消该标记。
- 旧客户端无租约凭证的 DELETE 只释放未认领的初始租约；仍有其他有效租约时保留会话。列表请求不清理临时会话。服务实例每 5 分钟清理一次：会话有效期取未释放租约的最大到期时间与 `updatedAt + 30 分钟` 的较大值，且正在生成的会话不清理；没有租约的旧数据按 `updatedAt` 处理。
- 页面离开前尚未收到会话 ID、释放请求失败、离线或进程异常时依赖到期清理。后台冻结、离线或休眠超过租约期可能导致会话过期；恢复失败会提示复制仍在页面内存中的内容，不保证离线无限保留。
- Composer 草稿按会话 ID 保存在前端内存，跨会话切换时暂存与恢复，不持久化到服务端；关闭窗口即丢弃。

### 离开保护

只有会销毁内容的转换才确认；切换到其他窗口、最小化、恢复、返回桌面、在窗口地址之间前进后退以及进入登录等独立页面都不确认。确认对话框（全局模态，阻断所有窗口与任务栏）按实际后果列出：

| 转换 | 确认条件 | 取消后 |
| ---- | -------- | ------ |
| 切换到另一个会话或新对话（侧栏、`/ask/:id` 链接、浏览器前进后退到另一个 `/ask/:id`） | 正在生成、当前为临时会话、或有未发送的附件；文本草稿按会话暂存，不单独触发 | 地址、会话、焦点与流不变 |
| 关闭 AI 窗口 | 正在生成、当前为临时会话、或有任何未发送的文本 / 附件 | 窗口、地址与流不变 |
| 退出登录 / 切换账号 | 与关闭相同，经唯一导航保护聚合；取消则不退出 | 保持登录 |
| 刷新、关闭标签页、当前标签页打开外链 | 正在生成或有未发送内容时由浏览器 `beforeunload` 提示；浏览器可能抑制提示 | 由浏览器决定 |

对话框说明后果：历史会话的生成会被中断，已生成的内容由服务端在中止时保存并标记为“已中断”，客户端不等待落库、不宣称已保存；临时会话及其消息、附件和未发送的输入被删除且无法恢复。进程崩溃或断电时不保证每个已流出的 token 已保存。

## 附件

单条消息最多 4 个附件（`MAX_ATTACHMENTS = 4`）。

| 类型 | 格式                                                 | 单文件上限 | 处理                                      |
| ---- | ---------------------------------------------------- | ---------- | ----------------------------------------- |
| 图片 | PNG、JPEG、WebP                                      | 5 MiB      | 存于 `ai_blobs`，以 base64 发送给视觉模型 |
| 文本 | 界面支持 TXT、Markdown、CSV、JSON；API 接受 `text/*` | 1 MiB      | 作为纯文本传给模型，不按 HTML 执行或渲染  |

- 服务端校验图片 base64 数据大小及文件头与声明 MIME
  一致；文件头检查不等同于完整图片解码。
- 图片通过 owner 鉴权的 `/api/ai/blobs/:id` 读取，响应
  `Cache-Control: no-store`；删除会话后返回 404，不从浏览器缓存重放。
- `POST /api/ai/chat/stream` 请求体上限 32 MiB（全站限制见
  [部署 · 请求体限制](deployment.md#请求体限制)）。

## 工具与联网搜索

工具均只读，必须由用户在会话配置中显式启用：
`tools: { documents: boolean, apps: boolean, webSearch: boolean }`。

| 工具               | 检索范围                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `lookup_documents` | 当前用户未删除的全部笔记（含固定到首页的笔记）；结果以“笔记”来源展示，点击在笔记工作区打开 |
| `lookup_apps`      | 当前用户的应用                                                                             |
| `web_search`       | `SEARXNG_URL` 指定的 SearXNG 实例                                                          |

- 模型不支持工具调用时工具不可用；服务端能力通过 `AiCapabilitiesDto.tools`
  协商。
- SearXNG 实例须启用 JSON 输出（`search.formats: [..., json]`）。未设置或 URL
  无效时禁用联网搜索；连接失败、超时或 HTTP
  错误在工具结果中明确呈现，不伪造结果。Sources 独立于 Assistant 正文展示。

## Provider 传输契约

Provider 使用 OpenAI-compatible Chat Completions API，支持自定义 Base
URL：模型通过 `/models` 发现，聊天请求发送到
`/chat/completions`。`src/features/ai/client.ts` 使用固定版本的 OpenAI 官方 npm
SDK；SDK 类型不进入 `AiService`、共享 DTO 或前端的 `meta/token/done/error` SSE
协议。

### 超时与重试

- 模型发现与聊天流均设置 `maxRetries: 0`，禁用 SDK
  自动重试，避免重复计费与上游堆积。
- 标准 `/v1/models` 硬超时 15 秒（`DEFAULT_MODELS_TIMEOUT_MS`）；扩展探针（如
  CLIProxyAPIHome `/user/models`）硬超时 5
  秒（`DEFAULT_EXTENDED_TIMEOUT_MS`）。发现请求禁止跟随重定向（`redirect: "error"`），防止
  API Key 随重定向泄露。
- 流式聊天不设人工截止时间：连接超时为运行时 timer 上限（约 24.8
  天），仅由生成结束或用户 Abort 终止。

### 中断与错误

- 用户停止生成会取消上游请求，已输出内容保留并标记为 `interrupted`。
- 上游 HTTP 错误、SSE error 消息或损坏的 SSE JSON 转换为 Searcher
  错误事件，已输出内容标记为 `failed`。
- 客户端断开时，响应 `ReadableStream.cancel()` 中止上游 Provider
  请求并保留已输出内容；正常完成与异常结束在流的返回路径关闭响应。不依赖 Deno
  成功响应后触发 `request.signal` abort 的 legacy 行为，不需要 unstable 配置。
  笔记事件流（`/api/documents/events`）使用相同机制注销当前用户的事件监听。

`AiServiceDeps.fetchFn` 支持注入 custom fetch，用于独立验证 Provider contract。
