// KAI HD(TV):react-native-webview 沙箱 WebView 禁 D-pad 焦点(隐藏层吞焦点 bug 的根治)
// focusable prop 在 13.17 不透传,直接补 ManagerImpl
import { readFileSync, writeFileSync } from 'fs';
const p = 'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewManagerImpl.kt';
let d;
try { d = readFileSync(p, 'utf8'); } catch { console.log('[patch-webview-focus] file missing, skip'); process.exit(0); }
if (d.includes('KAI HD(TV) patch')) { console.log('[patch-webview-focus] already patched'); process.exit(0); }
const anchor = 'fun createViewInstance(context: ThemedReactContext, webView: RNCWebView): RNCWebViewWrapper {\n        setupWebChromeClient(webView)';
if (!d.includes(anchor)) { console.log('[patch-webview-focus] anchor not found, skip'); process.exit(0); }
d = d.replace(anchor, 'fun createViewInstance(context: ThemedReactContext, webView: RNCWebView): RNCWebViewWrapper {\n        // KAI HD(TV) patch: sandbox WebView 仅执行 JS,禁参与 D-pad 焦点搜索(否则推屏页面焦点被隐藏 WebView 吞掉)\n        webView.isFocusable = false\n        webView.isFocusableInTouchMode = false\n        setupWebChromeClient(webView)');
writeFileSync(p, d);
console.log('[patch-webview-focus] patched');
