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

### 变更

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
