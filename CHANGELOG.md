# 变更日志

本文件记录项目所有值得注意的变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> **本项目额外规约：每条变更必须记录回滚条件。**

---

## [未发布]

### 新增

- **原生流式传输**：直连模式下，上游逐字吐出的内容现在实时显示（此前要等整包读完才出现）。
  - 背景（实测）：厂商**其实是流式生成的**——首字 18.8 s，之后以每 ~134 ms 一块连续吐约 52 s；而 Capacitor 自带的 `CapacitorHttp` 是**整包返回**（读完整段 body 才 resolve），于是这七十秒界面上只有一个光标，最后整段"啪"地出现。客户端补节奏救不了七十秒的空白。
  - 新增本地原生插件 `plugins/stream-http/`（包名 `@regret/stream-http`，在 `package.json` 里以 `file:` 依赖引入）：原生层用 `HttpURLConnection` 发请求，`readLine()` 逐行回调 `streamStart / streamLine / streamEnd / streamError`，事件带**客户端生成的请求 id**，因此支持并发与中断。**刻意不用 OkHttp**：Capacitor 的 android 模块并未把 OkHttp 暴露出来，自引一份等于多一个依赖，而 `HttpURLConnection` 的 `readLine()` 本来就是流式的。
  - `src/adapters/llm/nativeStreamFetch.ts`：把插件事件包成标准 `ReadableStream` 并返回 `Response`，因此**适配器零改动**——SSE 解析、逐字节奏、光标、跟随滚动全部照旧生效。事件可能早于建流到达（原生层拿到响应头就开始吐），因此先入队、建流时冲刷。
  - `composition/root.ts`：`createNativeStreamFetch() ?? createNativeFetch()`——优先流式，插件不可用或读流失败时退回整包路径，**不会比原来更差**。
  - **明确的代价**：仓库**首次出现原生代码**（约 150 行 Java + 一个 gradle 模块）。`android/` 仍不入库，但插件源随仓库走，`npx cap sync` 会把它接进生成工程（`capacitor.settings.gradle` 出现 `:regret-stream-http`）。
  - 测试：单测 213 → 221（包装层 7 例：平台/插件判定、事件还原成流、请求参数透传、未 start 即失败、读到一半断流、取消时中断原生请求、非 2xx 照传状态码）。
  - **真机验证**（用设备上那份原样配置）：两百字请求的观测序列 `t=6s 51 字 → t=8s 75 → t=12s 151 → t=14s 220（完成）`，即文字是长出来的；修复前同一请求是"空格子 → 整段出现"。
  - **回滚条件**：删掉 `plugins/stream-http/`、移除 `package.json` 里的 `file:` 依赖、删 `nativeStreamFetch.ts` 并去掉 `root.ts` 回退链的第一段（`cap sync` 会自动摘掉原生模块）。回滚后直连退回整包返回——功能不变，只是没有逐字。

- 界面改版：**设置分类化 + 人设并入设置 + 双主题 + 打字体验重做**。
  - **信息架构**：设置按「要改的是什么」分成四类——人设 / 说话方式 / 连接 / 数据，一次只呈现一类（`role="tablist"` + `role="tabpanel"`，指示条从左展开）；**人设不再是独立一页**，删除 `features/persona/PersonaPage.tsx`，表单搬到设置里的 `PersonaPanel`，并改为**改动即时生效**（去掉「保存」按钮，与旋钮、连接配置一致）。对话页头部随之只留一个「设置」入口（原来有「人设」「设置」两个按钮）。
  - **交互与画面**：对话页头部不再 sticky（名字与关系随对话滚走，屏幕留给内容）；关系状态由三枚胶囊标签改为一行安静的文字（阶段用主色，其余为次要色）；气泡改为「同色字、不同底色」，靠对齐与底色区分，并按说话方分组调整疏密（同方连续消息更紧）；输入区改为胶囊输入框 + 圆形发送键（`aria-label="发送"`，保持可访问名不变）；危险操作由居中胶囊改为带细线分隔的列表行。
  - **打字体验**（此前"像抽搐"）：新增 `features/chat/pacing.ts`（纯函数 `nextRevealCount`，基础 20ms/字、积压分档加速）+ `usePacedReveal`——**上游整包返回时把节奏补回来**（原生回退路径尤其明显），逐字流时只是跟着走；生成中显示闪烁光标（`.caret` 用空元素实现，不污染气泡文本）；新增 `useStickToBottom`，内容增长时跟随到底部，**但用户主动上翻时不抢滚动**。
  - **双主题**：`index.css` 重写为语义令牌（canvas / surface / line / text / muted / accent / danger…），暗色与浅色各一套值、经 `prefers-color-scheme` 切换；浅色不是反相而是「白天同一盏灯」——暖纸底 + 发丝线托起气泡，且光晕刻意收得很小（整屏泛粉会变成糖纸）。`index.html` 补两段 `theme-color`。旧的中性灰 `neutral-*` 与 `ink-*`/`accent-*` 色阶全部退役。
  - 新增 `.impeccable.md`：落盘设计上下文（使用者情境、品牌性格、美学方向、明确的反例、五条设计原则、以及"离线中文场景不打包字体"的约束），后续界面工作以它为准。
  - 字体：中文场景 + 离线 App 无法打包 CJK 字体，改用系统字栈（PingFang SC / HarmonyOS Sans / Noto Sans / 微软雅黑），特色靠字号阶梯、clamp 与 tabular-nums，而非异体字。
  - 测试：单测 194 → 201（新增 `pacing.test.ts` 7 例：结束时立即补齐、时间不足不跳字、20ms/字、积压加速、不超总量、单调递增）；e2e 42 → 44（新增「新消息自动跟随到底部」，并因信息架构变化更新了全部涉及设置与人设的用例；气泡配色断言由"字色不同"改为"底色不同、字色相同"）。
  - **真机验证**：暗色与（CDP 模拟）浅色两套均截图确认；状态栏在浅色系统下由原生 `DayNight` 主题跟随，无需额外处理。
  - **回滚条件**：`git revert` 该提交。回滚后设置回到一长条（人设需另开一页）、对话页头部恢复两个按钮、打字恢复成"整段一次性出现"（原生回退路径下尤其明显）、浅色系统下将回落到暗色界面（旧 CSS 只有一套暗色值）；对话、记忆与配置数据不受影响。

- **跨域不再是必须部署代理的理由**：厂商接口不回 CORS 头时，App 改由**系统（原生）网络栈**发请求，直连模式对任意网关都成立。
  - 背景（实测）：打包版 WebView 来源是 `https://localhost`，对 `https://gateway.example.com/api/v1/chat/completions` 的预检返回 `405`、响应里没有任何 `Access-Control-Allow-*`，浏览器 fetch 必然失败——此前这类网关只能自建代理。
  - 新增 `src/adapters/llm/nativeFetch.ts`：`createNativeFetch()` 用 `@capacitor/core` 自带的 `CapacitorHttp` 把整包响应还原成 `Response`，因此适配器的 SSE 解析逻辑完全复用。**刻意不开启 `plugins.CapacitorHttp.enabled`**——那会把全局 fetch 换成原生实现，连能流式的厂商也一起牺牲；这里只在需要时显式调用插件。Web 上返回 `undefined`。
  - `DeepSeekAdapter`：新增可选 `nativeFetch`。发请求**先走浏览器 fetch（唯一能拿到逐字流的通道），被跨域拦下或网络出错时回退原生**；相对地址（代理模式的默认 `/api/chat`）不参与回退——原生请求需要绝对地址。回退时请求头与请求体完全一致。
  - `composition/root.ts`：组装根构造并注入原生传输。
  - 设置页直连模式提示改为「厂商不支持跨域时，App 会自动改用系统网络请求」。
  - **代价**：原生 HTTP 整包返回，回退后没有逐字流（该网关本就一次性返回，实测整包往返 4.9 s / 6.8 s，无差别）。**代理的价值随之只剩「Key 不落设备 + 服务端限流」**。
  - 测试：单测 184 → 194（`nativeFetch` 5 例：平台判定、参数透传与超时、整包还原、JSON 错误体、原生异常向上抛；`DeepSeekAdapter` 回退 5 例：跨域失败后回退并正常出流、回退时头与体一致、浏览器正常时不回退、相对地址不回退、原生也失败时的错误文案）。
  - **真机验证**：清空对话后把厂商地址与原有密钥写进设置，开场白与后续对话都是真实模型在人设内生成（「（翻着书页头也不抬）啊，你来了…」）；CDP 抓到的原生响应带 `X-Android-Response-Source: NETWORK 200`，确认请求发自系统网络栈而非 WebView。
  - **回滚条件**：`git revert` 该提交。回滚后不支持 CORS 的厂商只能靠自建代理，直连模式仅对允许跨域的接口可用；对话数据与连接配置不受影响。

- 新增**直连模式**（`provider: 'direct'`）：App 直接调厂商接口，**不必再部署代理**。在「设置 → 连接」选「真实模型（直连厂商）」，填厂商接口地址与 API Key 即可；与既有的走代理模式并存，可随时切回。
  - `core/llm/config.ts`：`ChatProviderKind` 增加 `direct`（枚举外仍退 `mock`），新增 `DEFAULT_DIRECT_MODEL = 'deepseek-chat'`——直连时模型名由客户端写进请求体，留空会让厂商按自己的默认模型处理、结果不可预期。
  - `adapters/llm/DeepSeekAdapter.ts`：新增 `mode: 'proxy' | 'direct'`（默认 `proxy`，代理路径逐字节不变）。直连时**模型名与 `stream: true` 由客户端写进请求体**、只发 `Authorization`（`X-Chat-*` 是自建代理的约定，发给厂商只会多触发一次预检）；端点留空不再回落到相对路径 `/api/chat`，而是给出「请到设置页填接口地址」的可读错误；非 2xx 文案按模式区分（`接口返回 401` / `代理返回 401`）。
  - `composition/root.ts`：`createServices` 内的选路抽成 `createChatProvider`，`deepseek` → proxy、`direct` → direct，`mock` 仍走 `MockChatProvider`。
  - `features/settings/chatConfigStorage.ts`：`VITE_CHAT_PROVIDER` 直接交给 `normalizeChatConfig` 兜底（原先是 `=== 'deepseek'` 的二元判断，会吞掉 `direct`），`.env` 现在可以写 `direct`。
  - `SettingsPage.tsx`：「对话服务」由二选一变三选一；选直连时字段文案切换为「接口地址 / API Key（必填）/ 模型名（留空用 `deepseek-chat`）」，并**隐藏「网关地址」**（那是代理侧概念，直连填了也没用）。
  - 测试：单测 184（新增 `DeepSeekAdapter` 直连 6 例——请求体带模型与流式、只带 Authorization、默认模型、缺地址时不发请求、错误文案、SSE 解析；`config` 枚举 1 例）；e2e 40（新增「切到直连后直接请求厂商接口，配置刷新后保留」，用 `page.route` 拦厂商域名并断言实际请求，不依赖外网）。
  - **前提：厂商接口必须允许跨源访问**。实测 `https://api.deepseek.com/v1/chat/completions` 的 `OPTIONS` 返回 `access-control-allow-origin: https://localhost`，并**逐条回显**请求头（含我们约定的 `X-Chat-*`）→ WebView 可直连；反之 `https://gateway.example.com/api`（当前 `.env` 默认网关）的 `OPTIONS` 返回 `405` 且响应里没有任何 `Access-Control-Allow-*` → 走这条网关只能靠代理。
  - **代价**：直连模式下 Key 必须在设备上（设置页 localStorage 明文）且随请求直发厂商，没有代理层代持或脱敏；也放弃了代理的「来源白名单 + 限流」。
  - **回滚条件**：`git revert` 该功能提交。回滚后 `provider` 枚举不再认 `direct`，已把设置改成直连的设备会**静默退回演示模式**（`normalizeChatConfig` 把未知值判为 `mock`，表现为「回声机」），用户需重新选「真实模型」并改回代理地址；对话、记忆与人设数据不受影响。

- 「暖夜玫瑰」视觉改版：界面由中性灰换成带玫瑰色相的自有令牌，并补齐打包版需要的安全区与形态细节。
  - `src/index.css`：新增 `@theme` 令牌——`ink-*` 中性色阶每档都带一丝玫瑰色相（chroma ≈ 0.010–0.016，与主色同温，暗色下不发死）、`accent-*` 主色阶；新增 `.app-canvas`（暖玫瑰光晕自顶部泻下，纯色渐变、不含透明度，WebView 上渲染稳）、`.bubble` / `.bubble-from-her` / `.bubble-from-you`（说话的一侧收一个角，用长写属性单独覆盖，避开与 Tailwind 圆角简写的层序不确定）、`.safe-top` / `.safe-bottom`（`max(0.75rem, env(safe-area-inset-*))`，桌面浏览器下 `env()` 为 0 自然退化）、`rise-in` 入场动画（仅在 `prefers-reduced-motion: no-preference` 下启用，且只动位移与不透明度——**绝不碰颜色**，e2e 会读气泡的 computed 颜色）。
  - `src/app/App.tsx`：根容器改用 `app-canvas` + `text-ink-100`。
  - `src/features/chat/ChatPage.tsx`：页头与底部输入栏接入安全区；页头按钮抽成 `HeaderButton`；输入框与发送键改胶囊形态（发送键 `accent-500` 实心 + `active:scale-95`）；错误提示由 `red-*` 改为 `accent-*`；关系条与时间戳随令牌换色。
  - `src/features/persona/PersonaPage.tsx` 与 `src/features/settings/SettingsPage.tsx`：卡片、控件外皮与文案层级统一到新令牌。
  - 测试：单测与 e2e 全绿（渲染断言只涉及文案与行为，不依赖具体色值）；真机确认安全区在非边到边 WebView 下退化正常、深色状态栏文字可读。
  - **说明**：`SettingsPage.tsx` 的视觉改动与「连接」区块的功能改动在同一个文件里，无法按文件拆分，因此该文件的视觉部分随 `feat(llm)` 提交进入。
  - **回滚条件**：`git revert` 该提交；回滚后界面回到中性灰（`neutral-*`）配色，`index.css` 的 `@theme` 令牌与 `.app-canvas` 等类名一并移除，功能与数据不受影响。

- 连接配置改为**页面可配置**（设置页新增「连接」区块）：对话服务（演示模式 / 真实模型）、代理地址、API Key、网关地址、模型名均可即时填写并保存在本机，**打包出 APK 后不必为改这些值重新构建**。
  - `core/llm/config.ts`：新增 `ChatConfig` / `DEFAULT_CHAT_CONFIG` / `normalizeChatConfig`（localStorage 属不可信边界：非对象退默认、`provider` 非枚举退 `mock`、文本去空白并截断、地址只接受 `http(s)://` 或 `/` 开头）与 `CHAT_CONFIG_HEADERS`（前后端共用的头名常量，避免字面量漂移）。
  - `features/settings/chatConfigStorage.ts`：localStorage key `regret.chatConfig`；**无本地记录时回退构建期 `.env`**，因此 Web 与开发环境行为不变。
  - `adapters/llm/DeepSeekAdapter.ts`：连接配置随 `Authorization` / `X-Chat-Base-Url` / `X-Chat-Model` **条件透传**（为空不发送该头，未配置时请求与引入前逐字节一致）。
  - `server/handler.ts`：连接配置优先级 **请求头 > 环境变量 > 内置默认**；空白头视同未提供（否则页面留空会覆盖代理 env）；预检 `Access-Control-Allow-Headers` 增补这三个头（`Authorization` 不在 CORS 安全名单内，不声明则跨源预检必失败）。
  - `composition/root.ts`：`createServices(config)` 由配置派生；`App.tsx` 以 `useMemo` 随配置重建服务（设置页与对话页互斥，不会打断进行中的对话）。
  - `SettingsPage.tsx` 新增「连接」区块，即时生效、无保存按钮；`dataManagement.ts` 的「恢复出厂设置」一并清除连接配置。**导出不含连接配置**——备份文件不该带明文 Key。
  - 测试：单测 171（新增 config 8、DeepSeekAdapter 2、handler 6）；e2e 38（新增「连接配置刷新后保留」「恢复出厂清空连接配置」各 1，desktop / mobile 各半）。
  - **安全取舍**：这与迭代 1「API Key 绝不进前端」的决策相反。Key 明文存于设备 localStorage，并会出现在代理访问日志的 `Authorization` 头里 → 代理侧需关闭或脱敏 header 日志；代理仍是**无鉴权中继**，页面留空时会消耗代理 env 里的 Key，**来源白名单与限流仍然必要**。
  - **回滚条件**：`git revert` 该功能提交。回滚后页面不再有「连接」区块，`regret.chatConfig` 成为孤立 localStorage 键（用户手动删除即可）；代理头覆盖逻辑移除后请求退回只读 env，打包版将重新只能靠 `.env`（即回到「回声机」问题）。回滚不影响对话数据与既有配置键。

- 迭代 4 批次 4：Capacitor Android 打包配置与打包指南。
  - 依赖：`@capacitor/core`、`@capacitor/cli`、`@capacitor/android`（同一主版本 8.5.2）。
  - 新增 `capacitor.config.ts`：`appId`、`appName`、`webDir: 'dist'`、**显式 `server.androidScheme: 'https'`**（若为 `http`，WebView 会变成不透明来源，IndexedDB 与 localStorage 将无法持久化）、`android.allowMixedContent: false`、`webContentsDebuggingEnabled: false`；不写 `server.url`（那是热更新调试用，写死会随包发布）。
  - `package.json` 新增 `cap:add` / `cap:sync` / `cap:open` 脚本；`tsconfig.json` 纳入 `capacitor.config.ts`。
  - `.gitignore` 排除 `android/`、`ios/`、`*.keystore`、`*.jks`、`local.properties`、`.gradle/`。**原生工程不入库**：`local.properties` 会写入本机 SDK 绝对路径，`assets/public/` 会重复拷入 `dist/` 产物；由 `npx cap add android` 在装有 SDK 的机器上生成。
  - 新增打包指南 `docs/Android打包指南.md`：SDK 与 JAVA_HOME 配置、构建与安装命令、**构建期必须设 `VITE_CHAT_PROVIDER=deepseek` 与 `VITE_CHAT_API_ENDPOINT`**（否则会产出一个只会回显的「回声机」APK）、真机验收清单、已知局限。
  - **本机验证**：`npx cap add android` 与 `npx cap sync android` 均成功（不调用 Gradle），生成工程中 `applicationId`、`app_name`、`androidScheme` 均与配置一致；确认 `android/` 被 git 正确忽略。
  - **未验证**：**本机无 Android SDK，APK 从未构建或安装**。验收项「可安装运行」「体积 < 30MB」「延迟 < 2s」「无崩溃/内存泄漏」**全部未验证**，需在装有 SDK 的机器上按指南执行。
  - **回滚条件**：`git revert` 该提交会移除配置与依赖；`android/` 从未入库，回滚不需要清理。删除三个 `@capacitor/*` 依赖与脚本即可完全恢复。
- 新增 `docs/Android打包指南.md`：Android 打包的完整步骤、必需的环境变量、真机验收清单与已知局限（含返回键、安全区、签名与代理限流）。
  - **回滚条件**：删除该文件即可，无代码依赖。

- 迭代 4 批次 2：记忆导出与两项清除（设置页）。
  - **修复** `clearSession` 只删 `messages`：名字与 `MemoryStore` 注释都表明它应清空整个会话，实际残留事实、关系与摘要（`src` 下无生产调用方，仅测试引用，因此现在修零风险）。现改为单事务删除 `messages / facts / relations / summaries`，两个实现同步，两个 store 测试各加「清 s1 会清掉四类数据且不碰 s2」。
  - 新增 `core/memory/export.ts`：纯函数 `buildMemoryExport`，输出含 `format` / `version` / `exportedAt` / 五类内容（对话、事实、关系、摘要）以及**人设与旋钮**，深拷贝；配 `export.test.ts` 5 例。
  - `core/memory/types.ts` 新增 `DEFAULT_SESSION_ID`，`useChat` 改引用（行为不变）。
  - `features/persona/personaStorage.ts` 与 `features/settings/strategyStorage.ts` 各加 `clearPersona` / `clearStrategy`（key 保持私有）。
  - 新增 `features/settings/dataManagement.ts`：`downloadMemoryExport`（Blob + anchor，文件名带日期）、`clearConversation`（清会话，保留人设与旋钮）、`resetToFactory`（清会话 + 两个 localStorage 键）。清除后统一 `location.reload()`——`useChat` 持有消息、抽取游标、待跟进话题三个 ref，局部复位易漏。
  - `SettingsPage` 新增「数据」区块：导出记忆备份、清除对话与记忆、恢复出厂设置；两项破坏性操作**就地二次确认**（不用 `window.confirm`）。
  - 测试：单测 151；e2e 34，新增导出触发下载、清除后回到开场（只剩欢迎语、关系归初识/0）且人设旋钮保留、恢复出厂后人设与旋钮回默认、取消不清除。
  - **回滚条件**：`git revert` 该功能提交。回滚后 `clearSession` 会重新只删消息（若已有用户用过「清除对话与记忆」，其残留的事实/关系/摘要会与新对话共存，需手动清理或改回本次实现）；导出与清除 UI 一并消失，导出文件格式无版本兼容负担。
  - **注意**：本期**只导出不导入**。

- 迭代 4 批次 1：代理可打包化（跨源预检 + 可配置绝对地址）。
  - `server/handler.ts`：新增 `OPTIONS` 预检处理（`204` + `Access-Control-Allow-Origin/Methods/Headers` + `Access-Control-Max-Age`），所有响应（含 SSE 透传）补 `Access-Control-Allow-Origin` 与 `Vary: Origin`；允许来源由 `CHAT_ALLOWED_ORIGIN` 逗号分隔白名单给出，默认 `https://localhost`（Capacitor WebView 来源）。**此修复是打包版能否发出请求的前提**：此前非 POST 一律 405，WebView 的跨源预检会被直接拒绝，即使 endpoint 写对也一条消息发不出去。
  - `src/composition/root.ts`：`createServices` 新增 `VITE_CHAT_API_ENDPOINT`，非空时作为 `DeepSeekAdapter` 的绝对端点；留空仍用相对路径 `/api/chat`，Web 与开发行为逐字节不变。
  - `.env.example`：补 `CHAT_ALLOWED_ORIGIN` 与 `VITE_CHAT_API_ENDPOINT` 说明，重申密钥绝不加 `VITE_` 前缀。
  - 测试：`server/handler.test.ts` 新增 6 例（预检 204 与请求头、预检不发上游、POST 与流式响应带来源、白名单外不返回来源、无 Origin 不注入、多来源白名单）；单测 144。
  - **回滚条件**：`git revert` 该功能提交；回滚后 Web 与开发环境行为不变（同源不需要 CORS），但**打包版将无法与代理通信**。CORS 不是安全边界（非浏览器客户端会忽略它），代理仍应自行做来源校验与限流。

- 交互风格旋钮（端到端与测试替身）：`MockChatProvider` 探测风格段标记并给回复加确定性前缀（哑探测，不解析渲染文本）；`e2e/app.spec.ts` 新增 4 个用例——调整旋钮后回复带上风格设定且刷新后设置保留、`challenge` 滑块下限为 0.15、恢复默认后不再注入、界面不暴露参数名或 JSON 字面量。
  - 同时修复 e2e 既有竞态：助手气泡在流式结束时就显示完整文本，而落库在其后，原先「发送后直接刷新」的用例会与写入竞争（本次跑分中暴露为 desktop 失败 / mobile flaky）。新增 `waitForStoredMessages` 辅助，凡发送后刷新的用例先等落库完成。
  - 测试：单测 138、e2e 26（desktop/mobile 各半）、`tsc` 与 `build` 通过；`npm run eval -- --mock` 为 31 用例 / 61 轮。评测不传 `strategy`，默认路径提示词逐字节不变，故 G1/G3 基线不受本次变更影响。
  - **回滚条件**：`git revert` 该测试提交；回滚后旋钮的端到端接线失去自动化保护（单测仍覆盖 core 渲染与夹紧），且「发送后刷新」的竞态会重新出现。

- 交互风格旋钮（core）：`core/strategy/types.ts` 新增 `StrategyProfile`（`proactivity` / `empathyDensity` / `humor` / `pace` / `verbosity` / `challenge`，均 0-1，默认 0.5）、`CHALLENGE_MIN = 0.15`、`normalizeStrategy`（localStorage 是不可信边界：类型非法退回默认、越界夹紧、`challenge` 取 0.15 下限、不改入参）。`composePrompt` 新增 `strategy` 上下文，风格段置于**输出协议之后、关系状态之前**（落在稳定缓存前缀内），且**只渲染偏离默认的旋钮**；六项全默认时整节省略，因此默认路径的提示词逐字节不变。
  - 测试：新增 `core/strategy/types.test.ts` 11 例、`compose.test.ts` 策略段 7 例（位置、省略、局部渲染、无 JSON/无旋钮英文名、下限表述、前缀稳定）。
  - **回滚条件**：`git revert` 该功能提交；`strategy` 为可选上下文，回滚后 `composePrompt` 行为与引入前一致。**注意**：回滚会让 `compose.test.ts` 中策略段的 7 个用例一并失败，需同步移除。

- 交互风格旋钮（设置页）：新增 `features/settings/strategyStorage.ts`（localStorage key `regret.strategy`，读写两侧都过 `normalizeStrategy`）与 `features/settings/SettingsPage.tsx`（6 个滑块 + 三档人话提示 + 「恢复默认」+ 返回，**即时生效**，无保存按钮，界面不暴露参数名与数值）。`App.tsx` 的 `View` 扩为 `chat | persona | settings` 并加载/保存策略；`ChatPage` 头部新增「设置」入口；`useChat` 把策略透传进 `composePrompt`。
  - **回滚条件**：`git revert` 该功能提交；策略节点仅存于 localStorage 的 `regret.strategy`，回滚后该键成为孤立数据，不影响人设与对话（清理方式：删除该 localStorage 键）。
  - **已知边界**：主动开场与追问走 `buildProactivePrompt`，不经 `composePrompt`，**旋钮不影响它们**，只作用于主对话链路。旋钮为纯手动设置，无自动写入路径，故没有变更日志与快照。

- 评测加入 G3 人设一致性维度：判分新增 `grounding`（0-1，逐轮衡量回复与**人设卡**的贴合度，与"是否切题"解耦），低于 `0.7` 记违规并参与逐轮通过判定；汇总输出平均 grounding 与违规轮数，平均低于阈值触发 G3 告警。`eval/cases.json` 新增 1 条掉人设探测用例（通用任务下仍须保持角色口吻）。
  - **实测基线**：`npm run eval` → grounding 平均 **0.94**、低于 0.7 的轮数 **0/61**、通过率 100%。评测集扩至 31 用例 / 61 轮（原 25 + 反谄媚 5 + 掉人设 1）。
  - **回滚条件**：`git revert` 对应提交；`eval/` 为开发工具，不影响产品运行。
- 评测加入判分健壮性处理：判分输出解析失败时**重试一次**；仍失败则单独记为「评判失败」，**不计入 grounding 均值，也不计入 G1 分母**（无有效测量值不应算作内容违规），并把原始输出片段带进失败原因以便定位。
  - **回滚条件**：`git revert` 对应提交；回滚后判分崩溃会重新伪装成内容违规，G1/G3 读数将出现假告警。
  - **已知局限**：LLM 判分不稳定，单轮判分失败率实测 **0–5%**（三次全量跑分分别 3/61、3/61、0/61）。修复前它同时压低 G1 与 G3：第三轮 G1 曾因 2 个探测轮判分失败而显示为 60%（判定为噪声，非行为退化）。修复后**剔除判分失败**，三次历史跑分的 G1 均还原为 5/5 = 100%，G3 稳定在 0.94。**仍存在的局限**：G1 仅 5 条探测，单次翻转即 20%，粒度偏粗；判分原始输出的根因尚未坐实（诊断已内置，待下次复现捕获）。
  - **回滚条件**：见上一条。

- 评测加入 G1 反谄媚维度：`eval/run.ts` 的判分新增 `antisycophancy`（仅对探测脚本判定，非探测轮不适用），新增 `--probe` 只跑探测脚本；`eval/cases.json` 新增 5 条反谄媚探测用例（错误说法 / 有风险打算 / 贬损他人 / 伤身打算 / 无依据吹捧）。汇总输出「反驳率」作为 G1 基线。
  - **实测基线**：`npm run eval -- --probe` → 反驳率 5/5 = 100%，通过率 100%。相对下降 > 35% 即触发 G1 告警（规范 §5）。
  - **回滚条件**：`git revert` 该功能提交；`eval/` 为开发工具，回滚不影响产品运行与既有 25 条用例的判分。
  - **注意**：基线处于 100% 天花板，该探测集当前是**回归护栏**而非区分度指标；若后续需要更高灵敏度，应增加探测轮数（5 轮下需连丢 2 轮才触发 35% 阈值）。

- 决策纪要 `docs/虚拟伴侣自适应进化_决策纪要.md`：确立 V1 不执行自适应进化，`engagement` 仅作守门信号；附 V1 瘦身版范围、被否决机制的存档依据（7 万轮/月门槛、TOST 要求、聚类与幸存者偏差修正）与重启触发条件。
  - 同步：`docs/虚拟伴侣自适应进化规范.md` 加状态抬头，保留为设计参考；删除三份被取代的记录期草稿（`V1记录期规范.md` / `V1记录期规范修订.md` / `V1记录期规范v0.2.md`），其内容在删除前已由 `cfad9ec` 归档。
  - **回滚条件**：`git revert e4e1d05` 可恢复三份草稿并移除决策纪要；如需同时撤销归档提交，再 `git revert cfad9ec`。

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

### 修复

- **「导出记忆备份」在真机上点了毫无反应**（真机实测，`adapters/files/fileSave.ts` + 新增原生插件 `plugins/file-save`）：打包版 WebView 不处理 `<a download href="blob:">`——点完 `/sdcard/Download` 无新文件、logcat 无任何下载活动，是一次**静默空点击**（界面上也什么都不会显示）。取证结论是这条路由根本没人接：Capacitor 自带的 60 个 Java 文件里**没有任何 `DownloadListener`**；另一条常见出路 Web Share 也堵死（真机 WebView 实测 `typeof navigator.share === 'undefined'`，Chrome 114）。**Web 与开发环境一直是好的**——e2e 能用 `page.waitForEvent('download')` 接住下载，所以此前没暴露。
  - 现改为：原生平台走新插件的 `saveText`（SAF `ACTION_CREATE_DOCUMENT`），弹系统「另存为」由用户选位置后写入；Web 仍走 Blob 下载，行为不变。选 SAF 而不是往公共下载目录写：**不需要任何权限**（API 24–36 一套代码），且不必为 API 29 以下再备一条需要存储权限的老路——本机只有 API 29 可验证，那等于留一条没验证过的分支。
  - 取消与失败分开：用户在对话框里放弃时以 `code: 'CANCELLED'` 拒绝，界面提示「已取消导出」；真失败才报红，且**不回退浏览器下载**（否则文件悄悄进了下载目录，用户以为保存成功）。
  - 界面补结果回显（成功、取消都说一声）：真机上「保存好了」与「点了没反应」肉眼无法区分，这正是这次报障的由来。
  - `features/settings/dataManagement.ts`：`downloadMemoryExport` 更名 `exportMemoryBackup` 并返回结果（它已不再总是"下载"）。
  - 真机复验：系统对话框预填 `regret-backup-2026-10-04.json` → 保存 → `/sdcard/Download/` 落盘 1073 B、JSON 结构完整（`format`/`version`/`persona`/`relation`/`strategy` 齐备）；再点一次并在对话框里按返回 → 界面「已取消导出」、无文件、无报错。测试文件已从设备删净。
  - 测试：单测 221 → 226（`fileSave.test.ts` 5 例：原生选路、MIME 可覆盖、取消不算失败、失败不回退、Web 与插件缺失时兜底）；e2e 断言导出后回显文案。
  - **回滚条件**：`git revert` 该提交（连 `package.json` 里 `@regret/file-save` 依赖一并移除）。回滚后打包版的导出恢复成静默空点击，Web 与开发环境不受影响。

- **长对话下底部输入栏被顶出屏幕**（浏览器实测量化）：外壳用的是 `min-h-dvh`——它只给高度**下限**，内容一长就把整页撑高，于是中间的滚动容器不再内部滚动：实测输入栏底边落在 **926px**、视口只有 **844px**，输入栏有 82px 在屏幕外，用户必须整页滚动才能打字。
  - `App.tsx`：外壳改 `h-dvh overflow-hidden`；`ChatPage` / `SettingsPage` 的滚动容器补 `min-h-0`（flex 子项默认 `min-height: auto`，不写它即使有 `overflow` 也不会收缩）；输入栏补一条发丝分隔线，消息列表底部留白 8px → 16px。
  - 验证：同一场景 `inputBottom 926 → 832`、`inputVisible false → true`、整页不再滚动（`documentScrollable false`）、中段自己滚（`mainScrollable true`）。
  - **回滚条件**：`git revert` 该提交；回滚后长对话下输入栏重新会被顶出屏幕。

- **直连模式填「网关地址」时只回一句「接口返回 307」**（真机实测，`core/llm/config.ts` + `adapters/llm/nativeFetch.ts`）：
  - 根因：设置里的「接口地址」被填成了网关地址（`https://gateway.example.com/api/v1`），厂商对该路径回 `307`、`location: http://…/v1/`；而**原生请求（OkHttp）不会自动跟随重定向**（浏览器会），于是 307 被原样当成错误抛出，界面上只剩一句状态码，用户无从改起。
  - `core/llm/config.ts` 新增 `resolveDirectEndpoint`：直连时按**与代理侧完全相同的规则**补成完整接口地址（已是 `chat/completions` 原样使用；以 `/v1` 结尾补 `/chat/completions`；其余补 `/v1/chat/completions`）。`DeepSeekAdapter` 仅在直连模式使用它，**代理模式的端点不做任何改动**。
  - `nativeFetch.ts` 自己跟随重定向：同域最多 3 跳（保住"厂商把 http 跳成 https"这类正常情况）；**跨域重定向不跟随**，改为抛出「接口被重定向到 X：请把接口地址直接填成这个地址」——既不把 API Key 送去另一个域，又给出可执行的下一步。
  - `DeepSeekAdapter` 的 3xx 文案带上 `Location`；设置页在补过路径时显示「实际请求：<完整地址>」。
  - 测试：单测 201 → 213（`resolveDirectEndpoint` 5 例；适配器"补路径"与"代理模式不补"各 1 例；原生重定向跟随 / 相对 Location / 跨域拒绝 / 跳数上限 4 例；3xx 文案 1 例）；e2e 44 → 46（新增「直连只填到网关时，提示实际请求地址」）。
  - **真机复验**：用设备上那份原样的配置（只填到 `/v1`）发消息，请求打到 `/v1/chat/completions` 并返回 200 与真实回复，307 消失。
  - **回滚条件**：`git revert` 该提交。回滚后直连必须手填完整接口地址，填网关地址会重新得到「接口返回 307」（原生路径不跟随重定向），跨域重定向也会退回成一句状态码。

- **设置页的连接字段逐字输入时会被吞掉前缀**（真机实测暴露，`features/settings/SettingsPage.tsx`）：受控输入框直接把 `normalizeChatConfig` 的结果回填，而地址字段只接受 `http(s)://` 或 `/` 开头，于是手敲 `https://api.deepseek.com/v1/chat/completions` 时，前半截还不合法的前缀被当场抹掉——真机表现为输入框里只剩 `//api.deepseek.com/v1/chat/completions`，即**手输 URL 根本输不进去**（e2e 用 `fill()` 一次性赋值，所以此前没暴露）。
  - 现改为：输入框显示本地草稿，规范化后的值照旧入库；草稿没被采纳时（如 `ftp://…`）在该字段下方直接说明原因，不再让用户对着「填了却没生效」的哑谜。
  - 测试：e2e 新增「地址字段填了非法值时给出提示」，并把「切到直连」用例的接口地址改为 `pressSequentially` **逐字输入**（用 `fill()` 的话这个 bug 会溜过去）；e2e 40 → 42。
  - **回滚条件**：`git revert` 该提交。回滚后手输完整 URL 会重新丢前缀（可改用粘贴），非法值也会重新静默变空。

- **开发期代理与线上代理行为不一致的两处缺陷**（真机联调时实测暴露，`server/devApiPlugin.ts`）：
  - **`.env` 从未加载**：Vite 只把 `.env` 给 `import.meta.env`，**不会注入 `process.env`**，而 `createChatHandler()` 默认只读 `process.env` → `npm run dev` 下选真实模型必然返回 500「代理未配置 DEEPSEEK_API_KEY」（已用 curl 复现）。现于 `configResolved` 用 `loadEnv(config.mode, config.root, '')` 加载后注入 handler；**前缀传空串是有意的**——代理侧变量刻意不带 `VITE_` 前缀，沿用默认的 `VITE_` 前缀恰好会漏掉 `DEEPSEEK_API_KEY`。
  - **客户端请求头被整体丢弃**：`forward` 原先只透传 `Content-Type`，设置页填的 `Authorization` / `X-Chat-Base-Url` / `X-Chat-Model` 在开发环境静默失效（与「页面填了就以页面为准」相矛盾，且链路与经 serverless 部署时不同）。现改为逐条转发并剔除逐跳头（`host` / `connection` / `content-length` / `transfer-encoding`）。
  - 测试：新增 `server/devApiPlugin.test.ts` 6 例（头转发、逐跳头剔除、重复头合并、`.env` 空前缀读取、多个代理变量一并读出、目录内没有 `.env` 时不报错），单测 171 → 177。
  - **回滚条件**：`git revert` 该提交。回滚后开发环境退回「必须把 Key 导出成 shell 环境变量，否则 /api/chat 一律 500」，且设置页的连接配置在 `npm run dev` 下不生效；打包版与经 serverless 部署的代理路径不受影响。

- `core/memory/state.ts`：新增 `stripStateBlock`，**未闭合的 `<state>` 尾巴也一并剥离**。原先只处理完整状态块，流式过程中标签尚未收尾，用户会短暂看到 `<state>{"mood"...` 这样的原文（由 e2e 暴露）。`parseStateBlock` 改用它取展示文本；`state.test.ts` 中「只有开标签没有闭标签时不剥离」的用例断言的是旧行为，已改为正确期望。**回滚条件**：`git revert` 该提交；回滚后流式过程中会重新露出半截状态块。
- `features/chat/ChatPage.tsx` 的 `submit`：生成中按回车会先清空输入框、再被 `send` 丢弃，等于用户白打字；现改为生成中直接返回，保留已输入内容。**回滚条件**：`git revert` 该提交；回滚后输入内容会在生成中被无谓清空。

### 变更

- 等待第一个字时改用**呼吸点**而不是单个光标（`index.css` 的 `.typing-dots` + `ChatPage`）：实测该网关**首字要 18.8 s**（之后以每 ~134 ms 一块连续吐 50 s），而原生回退路径是整包返回、这段时间没有任何字可显示——单个光标闪 70 秒看着像卡死。三个错开呼吸的点，是不用文字就能读懂的"她在打字"；有字之后交回光标；`prefers-reduced-motion` 下退化成亮度递减的静态三点。用空元素实现，气泡 `textContent` 仍是空串，不影响 e2e 对"逐字中间态"的判定。
  - **回滚条件**：`git revert` 该提交；回滚后等待期回到单个闪烁光标。

- **备份文件名改用本地日期**（`features/settings/dataManagement.ts`）：原先是 `new Date(ts).toISOString().slice(0, 10)`——**UTC**，东八区凌晨导出会写成前一天（真机实测本地 10-05 00:50 导出得到 `regret-backup-2026-10-04.json`，用户按日期找备份时对不上号）。现改按本地日历取年月日并补零，命名抽成 `backupFileName` 并补单测（单测 226 → 228；断言用**本地字段**构造时刻，因此不依赖运行机器的时区，换 UTC 组装就成了只在东八区成立的脆弱断言）。
  - 真机复验：本地 01:05 导出得到 `regret-backup-2026-10-05.json`。
  - **回滚条件**：`git revert` 该提交；回滚后文件名回到 UTC 日期（跨午夜导出会与本地日期差一天）。

- 文档同步「导出记忆备份」的修复：`docs/Android打包指南.md` 的「二·补」由单插件改写为双插件（新增 `plugins/file-save` 小节——为何 WebView 必须由原生弹对话框、为何选 SAF 而非公共下载目录、取消与失败的区别、不想要它时怎么删）；`docs/虚拟伴侣应用_需求简报与开发里程碑.md` 补「第二个原生插件」的决策变更（原生模块从 1 个变 2 个的取舍）。
  - **回滚条件**：`git checkout HEAD~1 -- docs/Android打包指南.md "docs/虚拟伴侣应用_需求简报与开发里程碑.md"`，纯文档。

- 文档同步本批改动：`docs/Android打包指南.md` 新增「二·补、原生插件 `plugins/stream-http`」小节（为什么需要它、`cap sync` 如何接线、整包回退链、以及"不想要它时怎么删"），直连用法那行补「只填到网关也可以，缺的路径会自动补上，设置页会显示实际请求」；`docs/虚拟伴侣应用_需求简报与开发里程碑.md` 补「首次允许仓库包含原生代码」的决策变更（背景、范围控制、回退路径）。
  - **回滚条件**：`git checkout HEAD~1 -- docs/Android打包指南.md "docs/虚拟伴侣应用_需求简报与开发里程碑.md"`，纯文档，不影响代码与运行。

- `docs/Android打包指南.md` 同步真机实测结论：第三节改写为「直连厂商 / 走自建代理」两种用法的对照与各自前提（含两组厂商 CORS 实测：`api.deepseek.com` 放行、`gateway.example.com` 返回 405 且无 `Access-Control-Allow-*`）；第二节补两条本机已踩过的命令坑（PATH 里的老 `adb` 会杀掉 adb server、编辑器注入的 `NODE_OPTIONS` 删除垫片会让 `cap sync` 失败）；第四节的产物体积与第五节的验收清单更新为实测值（APK 4.17 MB、冷启动数据保留、键盘不遮挡、深色状态栏可读均已验证）。
  - **第五节「与代理连通」已补齐验证**：把同一份 `server/handler.ts` 起成裸 http server（等价于线上 serverless，而不是 Vite 插件——后者的 CORS 中间件会抢答 `OPTIONS`，开发环境永远测不到线上预检路径）＋ `adb reverse`，打包版实测 `OPTIONS 204`（`Allow-Origin` 与 `Allow-Methods: POST, OPTIONS` 来自我们的 handler）后 `POST 200` 两次（主对话 1478ms + 记忆抽取 2036ms）。为跑通该链路改了**生成工程**（不入库）：清单加 `android:usesCleartextTraffic="true"`、`assets/capacitor.config.json` 加 `cleartext/allowMixedContent/webContentsDebuggingEnabled`——实测仅靠 `server.cleartext` 无效，WebView 直接报 `net::ERR_CLEARTEXT_NOT_PERMITTED`。**仍未验证**：真正公网 https 代理（TLS 与跨网时延）。
  - 第六节已知局限新增三条：打包版只能走 https（明文策略）、真机排查用 `webContentsDebuggingEnabled` + CDP 读 `Network.loadingFailed.blockedReason`、**演示模式的回声历史会污染真实模型**（模型照着 Mock 的 `我听到你说：…` 格式回话，实测出现过）。
  - **回滚条件**：`git checkout HEAD~1 -- docs/Android打包指南.md`，不影响代码与运行。

- `docs/虚拟伴侣应用_需求简报与开发里程碑.md`：6.3 节补「代理降为可选」的决策变更——原先「必须有代理」的硬理由只有跨源，现已由 App 侧原生回退解决；待决项「代理部署方式」注明仅在选择走代理时才需要。
  - **回滚条件**：`git checkout HEAD~1 -- docs/虚拟伴侣应用_需求简报与开发里程碑.md`，纯文档。

- 迭代 4 批次 3：主链路的体积与渲染有界化（三处实测的无界增长，非猜测性优化）。
  - `features/chat/useChat.ts`：抽取游标 `extractedCountRef` 不持久化、刷新后归零，此前一次触发会把**整段历史**打包发给模型；现单次最多送入 40 条（`EXTRACTION_WINDOW_MESSAGES`），更早原文此前已抽取、事实已在库中。
  - `features/chat/ChatPage.tsx`：此前为每条消息生成气泡，长对话下 DOM 与每次按键的重渲成本随历史线性增长；现只渲染最近 **60** 条，并在顶部提示「更早的 N 条仍保存在本地」，数据不丢。
  - `core/memory/compose.test.ts`：新增长历史回归护栏（历史 500 条时只保留最近一段、窗口外原文不进入提示）。
  - 测试：单测 152、e2e 34、`tsc` 与 `build` 通过。**体积基线：`dist` JS 341.8 kB（gzip 109.8 kB）、CSS 12.5 kB（gzip 3.1 kB）。**
  - **回滚条件**：`git revert` 该提交；两处均为常量与切片，回滚后功能不变，仅恢复无界增长。
  - **未验证**：验收项「长对话响应延迟 < 2s」需真实部署的代理与密钥在真机实测，本轮**未验证**；上述改动只保证客户端侧提示与渲染成本有界，延迟主因仍在模型 API。

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
