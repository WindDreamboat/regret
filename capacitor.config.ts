import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 打包配置（Android）。
 *
 * 只做 Web 端包装：`webDir` 指向 Vite 产物，`cap sync` 会把它拷进原生工程。
 * 这里**不写** `server.url`——那是给真机热更新调试用的，一旦写死会随包发布，
 * 让所有用户连到某台开发机。
 */
const config: CapacitorConfig = {
  // 合法的 Java 包名，改名会导致已安装的应用被视为另一个应用
  appId: 'com.regret.companion',
  appName: '虚拟伴侣',
  webDir: 'dist',
  server: {
    // 必须保持 https：若改成 http，WebView 会变成不透明来源，
    // IndexedDB 与 localStorage 将无法持久化（对话与设置会丢）
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
}

export default config
