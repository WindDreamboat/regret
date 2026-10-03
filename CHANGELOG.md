# 变更日志

本文件记录项目所有值得注意的变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> **本项目额外规约：每条变更必须记录回滚条件。**

---

## [未发布]

### 新增

- 项目规约文档 `docs/项目规约.md`：确立 OCP 落地规则、目录与依赖方向、工程规约、Git 规约。
  - **回滚条件**：删除该文件即可，无代码依赖。
- 变更日志 `CHANGELOG.md`。
  - **回滚条件**：删除本文件，同时移除《项目规约》第六节中对 CHANGELOG 的引用。
- 需求与设计文档纳入版本控制（`docs/` 从 `.gitignore` 移除）。
  - **回滚条件**：在 `.gitignore` 中恢复 `docs/` 忽略项。
- 新增 `.gitattributes` 换行符规约：文本文件以 LF 存入仓库并在各平台检出为 LF；`.bat` / `.cmd` 保持 CRLF；图片与字体声明为 binary。同时将 `docs/项目规约.md` 工作区换行符由 CRLF 归一为 LF。
  - **回滚条件**：`git revert 205468d`，随后执行 `git add --renormalize .`。
- 迭代 1：搭建可运行的应用骨架（架构路线为前端 TypeScript prompt 编排层）。
  - `core`：`ChatProvider`、`MemoryStore` 两个接口（均有第二个实现或测试替身），`protocol.ts` 消息与流式事件类型，`persona` / `memory` 实体类型，`composePrompt`（拼人设卡 + 历史裁剪，截断点落在 assistant 时丢弃）。
  - `adapters`：`MockChatProvider`（默认，逐字回显，无需密钥）、`DeepSeekAdapter`（手工守卫 + 解析 SSE，处理跨 chunk 半行）、`IdbStore`（Dexie）、`InMemoryStore`（测试替身）。
  - `server`：`createChatHandler` 基于 Web 标准 Request / Response 编写，`devApiPlugin` 将其挂到 Vite dev server。**API Key 只在服务端读取，不进前端产物**（已扫描 `dist/` 确认无泄漏）。
  - `features` / `app` / `composition`：对话界面（流式气泡、分列配色）与人设页（localStorage）；[root.ts](file:///g:/ai/regret/src/composition/root.ts) 为全项目唯一实例化具体实现之处。
  - 测试：Vitest 33 个用例（compose 9、handler 9、DeepSeekAdapter 7、InMemoryStore 4、IdbStore 4）。
  - **回滚条件**：迭代 1 为项目起点，无「上一版本」可回退。如需整体撤销，`git revert` 对应提交即可回到仅含文档与规约的状态。
- 新增浏览器端到端测试：`e2e/app.spec.ts`（5 个用例）+ `playwright.config.ts`。用例覆盖首屏渲染、逐字流式、气泡分列与配色、刷新后 IndexedDB 恢复、人设保存与刷新后保留，在 desktop 与 390×844 移动视口各跑一遍。Playwright 自动拉起 Vite dev server（端口 5174）并强制 `VITE_CHAT_PROVIDER=mock`，不依赖真实密钥。同步新增 `test:e2e` 脚本、`@playwright/test` 开发依赖、`.gitignore` 中的测试产物条目。
  - **回滚条件**：删除 `e2e/` 与 `playwright.config.ts`，移除 `@playwright/test` 依赖与 `test:e2e` 脚本，并从 `.gitignore` 移除测试产物条目；随后可从 `tsconfig.json` 的 `include` 中移除 `e2e`、`playwright.config.ts`。**注意**：回滚后「逐字流式」这一行为将重新失去自动化保护。
- 迭代 2：记忆系统（事实 KV、关系状态、异步抽取、分层摘要决策）。
  - `core/memory/types.ts`：新增 `Fact` / `FactOp` / `FactStatus` / `Relation` / `Summary` 与 `createDefaultRelation`。
  - `core/memory/extract.ts`：`parseFactOps`（手写守卫，不引 zod）、`applyFactOps`（同 key 覆盖式更新，对应「改口」；`confidence < 0.6` 先记 `pending`，二次出现升 `confirmed`）、`filterActiveFacts`（过滤 `pending` 与过期，按 key 字典序）、`buildExtractionPrompt`。
  - `core/memory/state.ts`：`parseStateBlock` 剥离 `<state>{...}</state>` 并校验字段，模型输出按不可信边界处理。
  - `core/memory/summarize.ts`：`selectSummaryRange` 决定是否把最老 20 条未摘要消息压为 level-1 摘要（未摘要 > 40 条为触发条件）。
  - `core/memory/MemoryStore.ts`：接口扩展 `listFacts` / `applyFactOps` / `getRelation` / `updateRelation` / `listSummaries` / `appendSummary`，已由 `IdbStore` 与 `InMemoryStore` 两个实现落地。
  - `adapters/storage/IdbStore.ts`：Dexie 升到 version 2，仅新增 `facts`（复合主键 `[sessionId+key]`）/ `relations` / `summaries` 三张表，`messages` 不变，无数据迁移。
  - `features/chat/useChat.ts`：注入关系状态 / 事实 / 摘要；回复后按状态块累加亲密度（夹在 0-100）；距上次抽取满 6 轮往返时异步触发抽取，独立 `try/catch`，失败只记 console，主链路仍只有一次模型调用。
  - 测试：Vitest 增至 90 个用例（新增 `extract` 25、`compose` 15、`state` 9、`summarize` 7 等）。
  - **回滚条件**：`git revert` 该功能提交；Dexie 降回 version 1 需先删除本地 `regret` 库（v2 新增的表在 v1 代码中不会被读取，但降级版本号会让 Dexie 拒绝打开旧库）。抽取失败不影响对话，故无数据安全风险。
  - **注意**：本迭代不做向量检索与记忆可视化管理界面（需求 5.7）。
- 迭代 3 批次 1：关系状态与当前情绪的前端展示。
  - `core/memory/types.ts`：`Relation` 新增 `mood`（当前心情）与 `energy`（精力 0-1），`createDefaultRelation` 给默认值。
  - `core/memory/compose.ts`：`renderRelation` 追加「你现在的心情是…」，`mood` 为空时整行省略。
  - `features/chat/useChat.ts`：`applyState` 同时写入 `mood`/`energy`；新增并暴露 `relation` 状态。
  - `features/chat/ChatPage.tsx`：头部下方新增「阶段 · 亲密度 · 情绪」状态条。
  - `adapters/storage/IdbStore.ts` 与 `InMemoryStore.ts`：`getRelation` 读取时以默认值兜底，兼容缺少新字段的旧数据，无需 Dexie 版本迁移。
  - 测试：`compose.test.ts` 新增情绪渲染 2 例（单测 92）；e2e 新增关系状态条用例（14）。
  - **回滚条件**：`git revert` 该功能提交；`mood`/`energy` 读取时均以默认值兜底，回滚后旧数据仍可正常读出，无数据风险。
- 迭代 3 批次 2：事件时间与后续追问选择（纯逻辑）。
  - `core/memory/types.ts`：`Fact` 新增 `eventAt`（事件发生时间）与 `followedUpAt`（已追问时间）；upsert op 支持 `eventAt`。
  - `core/memory/extract.ts`：解析并校验 `eventAt`；覆盖式更新时保留既有 `followedUpAt`；抽取指令要求事件类事实附 `eventAt`。
  - 新增 `core/memory/followUp.ts`：`selectFollowUp` 选出已发生、未追问、落在 7 天窗口内的 confirmed 事件，多个候选取事件时间最近的一条。
  - `core/memory/MemoryStore.ts` 与两个实现：新增 `markFactFollowedUp`（只改该字段，事实不存在时静默返回）。
  - 测试：单测增至 111（新增 `followUp` 10 例，extract 与两个 store 各补若干）。
  - **回滚条件**：`git revert` 该功能提交；新字段均为可选、不参与索引，无需 Dexie 迁移，回滚后旧数据不受影响，且无 UI 行为变化。
- 迭代 3 批次 3：打开时主动开场、后续追问延续与冷启动默认人设。
  - `core/memory/followUp.ts`：新增 `buildProactivePrompt(persona, kind, event?)`（`welcome` / `followUp`）与 `PROACTIVE_MARKER` / `FOLLOW_UP_MARKER`，复用 `compose` 的人设卡渲染。
  - `core/memory/compose.ts`：导出 `renderPersonaCard`；`ComposeContext` 新增 `pendingFollowUp`，渲染为「你想跟进的话题」独立 system 段。
  - `core/persona/types.ts` 与 `features/persona/personaStorage.ts`：新增 `DEFAULT_PERSONA`，首次进入（本地无人设）使用，避免冷启动面对空白；数据损坏仍退回空人设。
  - `features/chat/useChat.ts`：打开时无消息则说欢迎语，距上次消息超 4 小时且存在到期事件（`selectFollowUp`）则主动追问，追问后落库并 `markFactFollowedUp`，把话题延续到下一条回复；用 ref 守卫规避 StrictMode 重复开场。开场独立于发消息主链路，失败只记 console。
  - `features/chat/ChatPage.tsx`：移除「还没有对话」空态，由开场白承担。
  - `adapters/llm/MockChatProvider.ts`：识别开场/追问/待跟进标记，返回确定性文案。
  - 测试：单测增至 117；e2e 增至 18，新增「首次开场白」「返回访问主动追问」「追问后续延续且不重复追问」。
  - **回滚条件**：`git revert` 该功能提交；`DEFAULT_PERSONA` 仅影响无本地人设的首屏，回滚后恢复空白人设；追问相关字段与存储能力在批次 2 已存在，回滚不影响数据。
- 迭代 3 批次 4：手工评测集与自动跑分脚本。
  - 新增 `eval/cases.json`：25 个多轮脚本，覆盖记忆覆盖 / 改口 / 事件进展 / 出戏与人设一致性，每轮带自然语言判分标准。
  - 新增 `eval/llm.ts` 与 `eval/run.ts`：复用 `/api/chat` 代理与真实 prompt、抽取链路回放脚本，逐轮由 LLM 按「记忆 / 人设」判分并汇总通过率；支持 `--mock` 离线冒烟、`--limit`、`--verbose`、`--min-rate`；调用带节流与指数退避重试，避免限流被误判为不通过。
  - `package.json` 新增 `eval` 脚本与 `tsx` 开发依赖；`tsconfig.json` 的 `include` 纳入 `eval`。
  - **回滚条件**：删除 `eval/`，移除 `eval` 脚本与 `tsx` 依赖，并从 `tsconfig.json` 的 include 移除 `eval`。评测为开发工具，不影响产品运行。

### 变更

- `core/memory/compose.ts` 的 `composePrompt` 签名由 `(persona, history, options)` 改为 `(context, options)`，`context` 汇聚人设、关系状态、事实与摘要。渲染顺序为「人设卡 → 输出协议（含状态块格式与不点破记忆的约束）→ 关系状态 → 事实（按 key 字典序）→ 摘要 → 历史」，每段各占一条独立 system 消息，空段整节省略以保住缓存前缀。同步更新调用点 `features/chat/useChat.ts`。
  - **回滚条件**：`git revert` 该提交；旧签名的调用点仅 `useChat.ts` 一处，回滚后 e2e 全量用例可验证行为未变。
- 新增 `.gitignore` 条目 `.trae/`，避免本地计划与临时文件入库。
  - **回滚条件**：从 `.gitignore` 移除 `.trae/` 条目。
- 默认分支由 `master` 更名为 `main`。
  - **回滚条件**：`git branch -m main master`。
- `src/composition/root.ts` 中 `MockChatProvider` 传入 `delayMs: 30`。此前默认值为 `0`，助手回复会一次性渲染完整句子，导致无密钥的默认演示路径上看不到流式效果（已由浏览器测试证实）。
  - **回滚条件**：改回 `new MockChatProvider()` 即可恢复即时返回；此时 `e2e/app.spec.ts` 的「助手回复是逐字流式出现的」会失败（实测 `partials.length` 为 0），属预期，需一并调整该用例。
- `docs/项目规约.md` 同步：目录树补充 `e2e/` 与 `playwright.config.ts`；测试条目明确跨层行为由浏览器测试覆盖，仍不写 React 单组件测试。
  - **回滚条件**：`git checkout HEAD~1 -- docs/项目规约.md`。
- `.gitignore` 调整：移除 `docs/`；新增 `node_modules/`、`dist/`、`.env`、编辑器与系统文件等条目。
  - **回滚条件**：`git checkout HEAD~1 -- .gitignore`。
- 重写需求简报与开发里程碑文档 `docs/虚拟伴侣应用_需求简报与开发里程碑.md`。架构路线由"Rust 端侧 LAAP 移植"改为"前端 TypeScript 编排层"；记忆系统缩减为三类并取消向量检索；情绪表达改为模型输出结构化状态；里程碑重排为四个迭代并将产品验证提前；补充留存、冷启动、评测集与 API Key 代理等缺失章节。
  - **回滚条件**：`git checkout 3eb6b38 -- "docs/虚拟伴侣应用_需求简报与开发里程碑.md"`，恢复至原始方案。

### 修复

- `server/handler.ts`：DeepSeek Base URL 已包含 `/v1`（多数 OpenAI 兼容网关如此）时不再重复拼接，避免 `.../v1/v1/chat/completions` 导致 404；现按 Base URL 是否以 `/v1` 结尾决定拼接路径。此前该问题同时使真实网关下的对话链路与评测脚本不可用。
  - **回滚条件**：`git revert` 该修复提交；回滚后 Base URL 必须使用不含 `/v1` 的官方形式（`https://api.deepseek.com`），否则会再次 404。
