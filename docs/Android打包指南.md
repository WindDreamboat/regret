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

## 三、连接配置：默认值 vs 设置页

`.env` 里的 `VITE_*` 只是**默认值**，已不是打包版可用的前提：App 内置「设置 → 连接」页，可以直接填对话服务、代理地址、API Key、网关地址与模型名，改动**即时生效，不必重新打包**。

仍建议在 `.env` 给出默认值（页面留空的项会回退到这里或代理侧）：

```dotenv
VITE_CHAT_PROVIDER=deepseek
VITE_CHAT_API_ENDPOINT=https://<你的代理域名>/api/chat
```

- 页面留空的项：前端项回退 `.env`；Key / 网关 / 模型回退**代理侧**环境变量。
- 代理侧需设 `CHAT_ALLOWED_ORIGIN=https://localhost`，否则预检不会返回允许来源，浏览器会拦截（代理已实现 `OPTIONS` 预检，见 `server/handler.ts`）。
- 密钥**不要**写进 `VITE_` 变量（会被打进前端产物）：要么留在代理的 `DEEPSEEK_API_KEY`，要么填在设置页（只存设备本地、随请求头透传）。

> 初始 `.env` 若仍是 `VITE_CHAT_PROVIDER=mock` 且未在页面切换，APK 就是只会回显的「回声机」——现在可直接在页面里改为「真实模型」，无需重打包。

## 四、体积预期

前端产物约 **342 KB JS（gzip 110 KB）+ 12 KB CSS**，其余为 WebView 壳与 Capacitor 运行时，
距 30 MB 上限很远。实测：

```powershell
(Get-Item android\app\build\outputs\apk\debug\app-debug.apk).Length / 1MB
```

## 五、真机验收清单（**未在本仓库验证**）

本仓库的开发环境**没有 Android SDK**，因此下列项目从未在本机验证过，需在真机上逐条确认：

- [ ] APK 可安装并启动
- [ ] 安装包体积 < 30 MB
- [ ] 与代理连通（先确认预检通过：抓包应看到 `OPTIONS 204` 后再 `POST 200`）
- [ ] 长对话响应延迟 < 2 s（需真实代理与密钥）
- [ ] 关闭再打开应用，对话与设置仍在（`androidScheme: 'https'` 保证来源可持久化）
- [ ] 键盘弹出不遮挡输入框
- [ ] 深色界面下状态栏文字可读

## 六、已知局限

1. **返回键会直接退出应用**：应用没有路由，`canGoBack()` 恒为 false；在设置页按返回不会回到对话页。后续可用 `history.pushState` + `popstate` 修复。
2. **未处理边到边安全区**：`index.html` 已有 `viewport-fit=cover`，但页头与底部输入栏未加 `env(safe-area-inset-*)` 内边距；Android WebView 对 `env()` 支持不稳定，需真机确认后再补。
3. **只有 debug 包可安装**：release 包未签名无法安装；若要发布，keystore 必须在本地生成并**绝不入库**（`.gitignore` 已排除 `*.keystore` / `*.jks`）。
4. **代理会成为公网入口**：代理本身不鉴权，CORS 只约束浏览器。页面留空时会消耗代理 env 里的 Key，请务必加来源校验与限流，否则任何人都能消耗你的 API Key。
5. **API Key 会落在设备上**：设置页填的 Key 明文存于设备 localStorage，并随 `Authorization` 头发给代理，会出现在代理访问日志里——代理侧需关闭或脱敏 header 日志。
6. **清除应用数据会删掉全部本地内容**：对话、记忆、人设与设置都存在设备本地（IndexedDB + localStorage），这是预期行为。
7. V1 不做 iOS。
