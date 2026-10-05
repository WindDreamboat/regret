# Android 打包指南

> 本仓库**不提交** `android/` 原生工程：它由 `npx cap add android` 生成，且会写入本机 SDK 绝对路径
> （`local.properties`）、重复拷入 `dist/` 产物。首次打包时按本文生成即可，`.gitignore` 已覆盖。

## 一、前置条件

| 依赖 | 说明 |
|---|---|
| JDK 21 | 本机已存在于 `E:\tools\JDK\jdk21`，需设 `JAVA_HOME` 并加入 PATH |
| Android SDK | cmdline-tools、platform-tools、platform（API 35）、build-tools |

SDK 安装后二选一让 Gradle 找到它：

- 设环境变量 `ANDROID_HOME`（推荐）
- 或在首次生成工程后，在 `android/local.properties` 写 `sdk.dir=<你的 SDK 绝对路径>`

```powershell
$env:JAVA_HOME = 'E:\tools\JDK\jdk21'
$env:ANDROID_HOME = 'C:\Users\<你>\AppData\Local\Android\Sdk'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

## 二、每次打包

```powershell
npm run build          # 必须先构建，cap sync 依赖 dist/ 存在
npx cap sync android   # 首次用 npx cap add android 生成工程
cd android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

仓库已提供脚本：`npm run cap:add`、`npm run cap:sync`、`npm run cap:open`（打开 Android Studio）。

## 二·补、两个原生插件

仓库里有**两个原生插件**（原生代码是被这两件事逼出来的），各只做一件事。

### `plugins/stream-http`：由原生层发请求并逐行回调

- 为什么要它：浏览器侧跨源失败后，原本靠 Capacitor 自带的 `CapacitorHttp` 兜底，而它是**整包返回**。实测上游网关首字 18.8 s、之后连续吐约 52 s——整包返回意味着这七十秒界面上只有光标在闪、最后整段出现。插件把那段时间变成逐字。
- 怎么接进来的：`package.json` 里 `"@regret/stream-http": "file:./plugins/stream-http"`；`npx cap sync android` 会在生成的 `android/capacitor.settings.gradle` 里加上 `include ':regret-stream-http'`（指向 `plugins/stream-http/android`）。`android/` 仍不入库，插件源随仓库走。
- 回退链：`createNativeStreamFetch() ?? createNativeFetch()`——插件不可用或读流失败时退回整包路径，不会比之前更差。
- 不想要它：删掉 `plugins/stream-http/`、`package.json` 里的那条依赖、`src/adapters/llm/nativeStreamFetch.ts`，并把 `composition/root.ts` 的回退链第一段去掉，再 `cap sync` 一次即可。

### `plugins/file-save`：把文本交给系统「另存为」

- 为什么要它：**WebView 自己不处理下载**。`<a download href="blob:…">` 在打包版里是一次静默空点击（实测点完 `/sdcard/Download` 无新文件、logcat 无任何下载活动），Capacitor 自带的 60 个 Java 文件里也没有任何 `DownloadListener`；`navigator.share` 同样不可用（Chrome 114 WebView 实测 `typeof navigator.share === 'undefined'`）。所以「导出记忆备份」只能由原生层弹系统对话框。
- 怎么实现的：走 SAF 的 `ACTION_CREATE_DOCUMENT`——**不需要任何权限**，位置由用户自己选（也能存到 SD 卡或网盘）。没走「往公共下载目录写」的路子：那要为 API 29 以下再备一条需要存储权限的老路，而本机只有 API 29 能验证，等于留一条没验证过的分支。
- 怎么接进来的：与上一条同构，`"@regret/file-save": "file:./plugins/file-save"`，`include ':regret-file-save'`。
- 取消与失败是两回事：用户在对话框里放弃时以 `code: 'CANCELLED'` 拒绝，界面提示「已取消导出」；真失败才报红，且**不会偷偷改成浏览器下载**——否则用户会以为已保存。
- 不想要它：删掉 `plugins/file-save/`、依赖与 `src/adapters/files/fileSave.ts`，把 `features/settings/dataManagement.ts` 的导出卖改回 Blob 下载，再 `cap sync` 一次。

> 本机实测踩过的两个坑：
> 1. **PATH 里的 `adb` 是老版本**（`C:\Windows\adb.exe` 为 1.0.31），一执行就会「adb server is out of date」并杀掉正在服务的 adb server，连带丢掉 `adb reverse` 映射与 `cap run` 会话。请显式使用 `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`。
> 2. **编辑器注入的 `NODE_OPTIONS` 删除垫片会让 `cap sync` / `cap copy` 失败**（重建 `assets/` 时报 `[safe-delete] ... trash operation ... aborted`）。跑 Capacitor CLI 前先 `set NODE_OPTIONS=`。

## 三、连接配置：设置页里填，两种用法

`.env` 里的 `VITE_*` 只是**默认值**，已不是打包版可用的前提：App 内置「设置 → 连接」页，可以直接选对话服务、填接口地址、API Key 与模型名，改动**即时生效，不必重新打包**。

真实模型有两种用法，「对话服务」里二选一：

| 用法 | 设置项 | 前提 |
|----|----|----|
| **直连厂商**（`direct`） | 接口地址填厂商的**完整接口地址**（如 `https://api.deepseek.com/v1/chat/completions`）；**只填到网关也可以**（如 `https://api.deepseek.com` 或 `…/v1`），缺的路径会自动补上，设置页会显示「实际请求」；API Key 必填，模型名留空即用 `deepseek-chat` | 只要能访问到该接口；**不要求厂商支持跨源**（见下）；Key 存在设备上 |
| **走自建代理**（`deepseek`） | 代理地址填你的代理 `/api/chat`；Key / 网关 / 模型可留空由代理侧兜底 | 需要自己部署一个转发用 serverless function；代理侧需设 `CHAT_ALLOWED_ORIGIN=https://localhost` |

直连为什么连**不支持 CORS** 的厂商也能用（打包后 WebView 来源是 `https://localhost`，跨源请求会先发 `OPTIONS` 预检）：

- 厂商允许跨源（如 `OPTIONS https://api.deepseek.com/v1/chat/completions` → `200` + `access-control-allow-origin: https://localhost`，且逐条回显请求头）时，走浏览器 fetch，**能拿到逐字流**。
- 厂商不允许（如 `OPTIONS https://gateway.example.com/api/v1/chat/completions` → `405`，响应里没有任何 `Access-Control-Allow-*`）时，浏览器 fetch 必然失败，App **自动改用系统（原生）网络请求**——原生请求没有同源策略，因此照样直连。此时是**整包返回，没有逐字流**（该网关本来就一次性返回，无差别）。
- 代理则两条路都用不上：它的存在意义只剩「Key 不落设备 + 服务端限流」，跨域已不是理由。

也可以把默认值写进 `.env`：

```dotenv
# 直连
VITE_CHAT_PROVIDER=direct
VITE_CHAT_API_ENDPOINT=https://api.deepseek.com/v1/chat/completions
```

- 密钥**不要**写进 `VITE_` 变量（会被打进前端产物）：直连模式的 Key 只能填在设置页（只存设备本地、随请求直接发给厂商）；走代理时可留在代理的 `DEEPSEEK_API_KEY`。
- 页面留空的项：走代理时回退 `.env` 与**代理侧**环境变量；直连时接口地址与 Key 都必填，缺地址会在对话里给出「请到设置页填接口地址」的提示。
- 代理已实现 `OPTIONS` 预检与来源白名单，见 `server/handler.ts`。

> 初始 `.env` 若仍是 `VITE_CHAT_PROVIDER=mock` 且未在页面切换，APK 就是只会回显的「回声机」——现在可直接在页面里改为「真实模型」，无需重打包。

## 四、体积预期

前端产物约 **347.5 KB JS（gzip 111.8 KB）+ 19.7 KB CSS（gzip 4.6 KB）**，其余为 WebView 壳与
Capacitor 运行时，距 30 MB 上限很远（真机实测 APK 4.17 MB）。实测：

```powershell
(Get-Item android\app\build\outputs\apk\debug\app-debug.apk).Length / 1MB
```

## 五、真机验收清单

2026-10-04 在一台 HarmonyOS 真机（GLK-AL00）上实测：

- [x] APK 可安装并启动
- [x] 安装包体积 < 30 MB（实测 **4.17 MB**）
- [x] 关闭再打开应用，对话与设置仍在（`androidScheme: 'https'` 保证来源可持久化；实测冷启动后对话、人设、关系与说话方式全部保留，且没有重复写开场白）
- [x] 键盘弹出不遮挡输入框（WebView 自动缩放，输入框上移后完整可见）
- [x] 深色界面下状态栏文字可读
- [x] 与代理连通，预检通过——真机实测（`OPTIONS 204` 后 `POST 200`，两次 POST 分别是主对话与记忆抽取）：
  - **验证方式**（无公网代理时的等价做法）：把同一份 `server/handler.ts` 起成一个裸 http server 顶替 serverless（**不是** Vite 插件——Vite 自带 CORS 中间件会抢在 handler 之前应答 `OPTIONS`，开发环境因此永远测不到线上那条预检路径），再 `adb reverse tcp:5176 tcp:5176`，让打包版把接口地址填成 `http://localhost:5176/api/chat`。
  - 代理侧日志（`OPTIONS` 的 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Methods: POST, OPTIONS` 均来自我们的 handler）：
    ```
    OPTIONS /api/chat origin=https://localhost → 204 allow-origin=https://localhost
    POST    /api/chat origin=https://localhost → 200  耗时=1478ms 请求体=2062B
    POST    /api/chat origin=https://localhost → 200  耗时=2036ms 请求体=1076B（记忆抽取）
    ```
  - **为了在真机上跑通这条链路，改的是生成工程（不入库），不是仓库配置**：`android/app/src/main/AndroidManifest.xml` 加 `android:usesCleartextTraffic="true"`，`assets/capacitor.config.json` 加 `server.cleartext` / `android.allowMixedContent` / `android.webContentsDebuggingEnabled`。**`server.cleartext` 不会自己写进清单**——实测 WebView 对 `http://localhost:5176` 直接报 `net::ERR_CLEARTEXT_NOT_PERMITTED`，这是 Android 的明文策略，与混合内容无关。
  - **仍未验证**：真正公网 https 代理（TLS 握手、真实跨网时延、代理侧限流）。上述验证覆盖了除去 TLS 以外的全部代码路径。
- [x] 直连模式的跨源可达性：真机上填厂商接口地址 + 一个**无效** Key，回复为「接口返回 401」而非 `Failed to fetch`，说明 WebView 的预检被厂商放行、请求确实到了厂商（能拿到 401 就说明连上了，只差有效密钥）。
- [ ] 长对话响应延迟 < 2 s——**不达标**：真机经 USB 探针实测首字节 **3.17 s**；用同一份请求体在电脑侧复测为 1.9 / 2.3 / 4.3 / 9.8 s，并连续三次出现 **43–46 s**，换短提示词立刻回到 2.4 s。**波动来自上游网关排队，与客户端无关**，此项不由客户端改动决定。

> 直连模式不需要公网代理，可直接在真机上按上一节填厂商接口地址来验证（前提是该厂商接口允许跨源访问）。

## 六、已知局限

1. **返回键会直接退出应用**：应用没有路由，`canGoBack()` 恒为 false；在设置页按返回不会回到对话页（真机已复现）。后续可用 `history.pushState` + `popstate` 修复。
2. **边到边安全区只在部分设备上生效**：`index.html` 有 `viewport-fit=cover`，页头与底部栏也加了 `env(safe-area-inset-*)` 内边距；但本机真机的 WebView 并非边到边绘制，`env()` 取值为 0，因此**未在真正边到边的设备上验证过**。
3. **release 包需要自己接签名**：生成工程默认不带签名配置，`assembleRelease` 只会产出**装不上的未签名包**。本机已在生成的 `app/build.gradle` 里加了签名配置：仓库根的 `keystore.properties`（storeFile / storePassword / keyAlias / keyPassword，**不入库**）存在时用它，否则退回本机调试密钥——当前即调试密钥签名，好处是与已安装的 debug 包**同签名、覆盖安装不丢本地数据**，也适合直接把 release 包发人试用（实测 3.1 MB）。分发产物（如 `虚拟伴侣-1.0.apk`）不入库（`.gitignore` 的 `apk`）。**正式对外发布前**应生成自己的发布密钥（`keytool -genkeypair`，密钥与密码绝不入库），并注意：换签名后所有已安装用户必须卸载重装，数据先用「导出记忆备份」带走。
4. **走代理时，代理会成为公网入口**：代理本身不鉴权，CORS 只约束浏览器。页面留空时会消耗代理 env 里的 Key，请务必加来源校验与限流，否则任何人都能消耗你的 API Key。**直连模式没有这个入口**（请求直接发往厂商）。
5. **API Key 会落在设备上**：设置页填的 Key 明文存于设备 localStorage。走代理时它随 `Authorization` 头发给代理、会出现在代理访问日志里（需关闭或脱敏 header 日志）；直连时它直接发给厂商，没有任何中间层可以代持或脱敏。
6. **清除应用数据会删掉全部本地内容**：对话、记忆、人设与设置都存在设备本地（IndexedDB + localStorage），这是预期行为。
7. **打包版只能走 HTTPS**：`androidScheme: 'https'` 下 WebView 的来源是 `https://localhost`，请求 `http://…` 会被 Android 的明文策略拦成 `net::ERR_CLEARTEXT_NOT_PERMITTED`（要放开得在清单里显式 `android:usesCleartextTraffic="true"` 或用 network security config 放行）。因此代理**必须**提供 https；本地联调只能靠 `adb reverse` 把设备端口映射到本机的 http 服务，并临时放开明文。
8. **真机排查手段**：`capacitor.config.json` 里打开 `android.webContentsDebuggingEnabled` 后，可用 `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` + CDP 直接读 WebView 的控制台与网络事件，`Network.loadingFailed` 会给出 `blockedReason`/`errorText`。这条路径比在客户端猜「为什么 `Failed to fetch`」快得多（本次就是靠它定位到 `ERR_CLEARTEXT_NOT_PERMITTED`）。
9. **演示模式会污染真实模型的对话**：切到真实模型时，历史里若全是 Mock 的回声（`我听到你说：…`），模型会**照着模仿这个格式**。本机实测出现过「真实模型回复成了回声体」的现象——排查时不要据此断定走的是 Mock，应先看代理日志里有没有请求。要干净体验请先「清除对话与记忆」。
10. **直连不支持跨域的厂商时没有逐字流**：浏览器 fetch 被跨域拦下后由系统网络请求兜底，而原生 HTTP 是**整包返回**，回复会一次性出现（实测该网关整包往返 4.9 s / 6.8 s）。厂商允许跨域时照旧走浏览器、保留逐字流。
11. **状态栏不跟随 App 内的主题**（EMUI + 老 WebView 实测）：主题切换只作用于 WebView 里的内容。真机（GLK-AL00，WebView 114）实测，即便用 `@capacitor/status-bar` 把状态栏底色设成主题画布色——`dumpsys` 确认 `statusBarColor=#ff110a0a` 已写入窗口参数——屏幕上状态栏区域**仍是窗口底色 `#fafafa`**（对截图逐像素取样确认）：EMUI 把窗口底色画进了状态栏区域，盖过 App 的设置。曾按主题改写底色与图标色，结果深色主题下"白底白图标"完全不可见，**比不改更糟**，已回退该插件。现状：状态栏跟随系统主题、图标始终可读；在 WebView ≥ 140 / Android 15+ 的边到边设备上，状态栏区域透出的就是 App 自己的画布，会自然跟随主题。
12. V1 不做 iOS。
