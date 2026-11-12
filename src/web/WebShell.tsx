// WebShell.tsx —— [APK 三版合一 WebView 壳 1112 老板令]
// car(CarShell)/HD(HDMain)两形态统一改 react-native-webview 离线壳:
// 前端产物(NextMusic-HD-Web dist 单文件自包含)内置 android/app/src/main/assets/web/,
// file:///android_asset/web/<entry> 直载,零启动网络依赖。
// API 相对路径(/api/...)在 file:// origin 下无同域——注入脚本先于页面脚本执行:
//   1) localStorage 预置 nm.real.base;2) 包装 window.fetch 把相对路径拼 REAL.base。
// 音频/封面 http 直连 → mixedContentMode=always 放行;媒体免手势自动播放。
// 返回键:web 是 SPA 自有 historyStack(非浏览器栈)——evaluateJS 探测(播放页/弹窗/内栈依次出)
// 经 onMessage 回传,ROOT 才走原生双击退出;恒拦截防根栈 pop 回 Boot。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, NativeEventEmitter, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView as WebViewBase, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { toast } from '../components/Dialog';
import { C } from '../theme/tokens';
import { store } from '../services/server';
import { settings } from '../services/settings';

// RN0.87 新架构 codegen 类型与本包 NativeComponent 声明不合(props 退化 never)——一次性类型级转换,运行时原样
// 批18(1112 老板令 1554):真遥控器 DPAD/OK 全链路——原生 MainActivity 拦截 keycode
// {19-23,66,96,160} 的 DOWN+UP(含 repeat)emit onTVKey → 组件内 listener 合成 Chrome 74
// 可用的 KeyboardEvent 注入页面 document(方向键 keydown+keyup;确认键只发 keydown——页面
// real15 对 Enter 族 keydown/keyup 双监听都 click activeElement,两发=双击=toggle 抵消)。
// 合成事件 target=document + Object.defineProperty 覆写 keyCode/which(Chrome 的
// KeyboardEvent 构造器 init 字典不认这两个字段,不覆写恒 0——real15/real14 只看 e.keyCode
// 的 handler 全收不到)。页面消费端:real16 分区导航(接管 spatialFocus)+real15/14 确认键
// 栈+app.js keyboard()——dist 全文 0 处 isTrusted 检查,合成事件畅通。
// (考古注:批14d 原实现把 useEffect 放在了模块顶层引用组件内 wv——TS 编译从未通过,且
// MainActivity 侧 reactHost 取值链与 RN 0.87 API 不符;v185 坏包 dex 考古实锤两边的代码
// 都没进过任何 APK,本批为全链重写。)
const TV_KEY_MAP: Record<number, { key: string; keyCode: number }> = {
  19: { key: 'ArrowUp', keyCode: 38 },
  20: { key: 'ArrowDown', keyCode: 40 },
  21: { key: 'ArrowLeft', keyCode: 37 },
  22: { key: 'ArrowRight', keyCode: 39 },
  23: { key: 'Enter', keyCode: 13 }, // DPAD_CENTER(小米蓝牙遥控 OK=标准 23,TV logcat 实锤)
  66: { key: 'Enter', keyCode: 13 }, // KEYCODE_ENTER(部分蓝牙遥控/键盘 OK 映射)
  160: { key: 'Enter', keyCode: 13 }, // NUMPAD_ENTER
  96: { key: 'Enter', keyCode: 13 }, // BUTTON_A(手柄 A=TV 语境确认)
};
const TV_CONFIRM_KEYCODES = new Set([23, 66, 160, 96]);

// 批14:开 WebView chrome inspect(电视排障——chrome://inspect 看真实 console)
try { (WebViewBase as unknown as { setWebContentsDebuggingEnabled?: (v: boolean) => void }).setWebContentsDebuggingEnabled?.(true); } catch (e) { /* 旧版本忽略 */ }
type WVHandle = { injectJavaScript: (js: string) => unknown; reload: () => void };
type WVComponent = React.ComponentType<WebViewProps & { ref?: React.Ref<WVHandle> }>;
const WV = WebViewBase as unknown as WVComponent;

// 服务器真实 base(1112 定;批14:多候选探测——TV 在内网时公网域名 hairpin 常失败,先通的用)
export const WEB_REAL_BASE = 'http://op.mubey.top:9527';
export const WEB_REAL_BASE_FALLBACK = 'http://10.0.0.1:9527';

// 注入脚本(injectedJavaScriptBeforeContentLoaded,页面脚本执行前):
// localStorage 预置 base + fetch 包装('/api/x' → base+'/api/x';'//host' 与绝对 URL 不动)
export const WEB_INJECT_JS = [
  '(function(){',
  "  var FB='" + WEB_REAL_BASE + "';",
  "  try{var v=localStorage.getItem('nm.real.base');if(v)FB=v}catch(e){}",
  // 批14:双候选连通探测(公网域名失败自动切内网 10.0.0.1,先通的用并写回 localStorage)
  "  var C1='" + WEB_REAL_BASE + "',C2='" + WEB_REAL_BASE_FALLBACK + "';",
  "  try{",
  "    var pick=function(b){if(FB!==b){FB=b;try{localStorage.setItem('nm.real.base',b)}catch(e){}}};",
    "    var t1=setTimeout(function(){pick(C2)},2500);",
  "    fetch(C1+'/health').then(function(r){clearTimeout(t1);if(r.ok)pick(C1)}).catch(function(){clearTimeout(t1);pick(C2)});",
  "  }catch(e){}",
  '  if(window.fetch&&!window.fetch.__nmw){',
  '    var of=window.fetch;',
  '    var wf=function(input,init){',
  '      try{',
  "        var u=null;if(typeof input==='string')u=input;else if(input&&typeof input.url==='string')u=input.url;",
  "        if(u&&u.charAt(0)==='/'&&u.charAt(1)!=='/'){",
  "          u=FB+u;if(typeof input==='string')input=u;else input=new Request(u,input);",
  '        }',
  '      }catch(e){}',
  '      return of.call(window,input,init);',
  '    };',
  '    try{wf.__nmw=1}catch(e){}',
  '    window.fetch=wf;',
  '  }',
  '})();',
  // 诊断+握手:装好后即回传 onMessage(验证 messaging 桥连通)
  "  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('NM_BOOT:'+(location&&location.href||''))}catch(e){}",
  'true;',
].join('\n');

// 返回键探测/执行脚本(SPA 栈,非 history.back):播放页全屏→关;弹窗→关;内页栈→pageBack;
// 首页无栈=ROOT(原生侧双击退出)。结果经 ReactNativeWebView.postMessage 回传 onMessage。
// 全局桥:activeBack 挂载即注册,navigation.tsx 根层返回键回调调用(根层 BackHandler LIFO 先消费实锤见上)
let activeBack: (() => boolean) | null = null;
/** navigation.tsx 返回键回调调用:web 壳挂载期由壳消化(SPA 栈出栈/ROOT 双击退出),未挂载 false=原行为 */
export function popWebBack(): boolean { const f = activeBack; return f ? f() : false; }
export const WEB_BACK_JS = [
  '(function(){try{',
  "  var r='ROOT';",
  "  var pl=(typeof byId==='function')?byId('player'):null;",
  "  if(pl&&pl.classList&&pl.classList.contains('on')){if(typeof closePlayer==='function')closePlayer();r='PAGE'}",
  "  else if(typeof dialogKind==='string'&&dialogKind){if(typeof closeDialog==='function')closeDialog();r='PAGE'}",
  "  else if((typeof historyStack!=='undefined'&&historyStack&&historyStack.length)||(typeof page==='string'&&page&&page!=='home')){",
  "    if(typeof pageBack==='function')pageBack();r='PAGE'}",
  "  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('NM_BACK:'+r)}catch(e){}",
  "}catch(e){try{window.ReactNativeWebView.postMessage('NM_BACK:ROOT')}catch(e2){}}})();true;",
].join('\n');

export function WebShell({ entry }: { entry: string }) {
  const wv = useRef<WVHandle>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const exitArmed = useRef(false);
  const uri = Platform.OS === 'android' ? 'file:///android_asset/web/' + entry : entry;

  // 返回键桥:本组件 BackHandler 会被 navigation.tsx 根层监听 LIFO 先消费(实锤 V40:按返回弹根层退出框)——
  // 改注册全局桥,navigation.tsx 顶部让渡(web 壳挂载期返回键全权归壳:SPA 栈出栈/ROOT 双击退出)
  useEffect(() => {
    activeBack = () => { console.log('[WebShell] back→injectJS'); wv.current?.injectJavaScript(WEB_BACK_JS); return true; };
    return () => { activeBack = null; };
  }, []);

  // 批18(1112 老板令 1554):真遥控器按键 → 合成页面 KeyboardEvent。native onTVKey
  // {keyCode, action(0=down/1=up), repeat} → Chrome 74 兼容注入(keyCode/which defineProperty
  // 覆写);每次合成 postMessage 'NM_KEY:key:type' 回传,logcat 看端到端全链证据。
  useEffect(() => {
    const emitter = new NativeEventEmitter();
    // RN0.87 NativeEventEmitter 回调签名为宽松 Object[]——参数 any + 运行时守卫
    const sub = emitter.addListener('onTVKey', (ev: any) => {
      if (!ev || typeof ev.keyCode !== 'number' || typeof ev.action !== 'number') return;
      const kc = ev.keyCode as number;
      const m = TV_KEY_MAP[kc];
      if (!m) return;
      const isConfirm = TV_CONFIRM_KEYCODES.has(kc);
      const type: 'keydown' | 'keyup' = ev.action === 0 ? 'keydown' : 'keyup';
      if (type === 'keyup' && isConfirm) return; // 确认键只发 keydown(real15 双监听防双击)
      const rep = ev.repeat === true;
        const js =
          "(function(){var K='" + m.key + "',C=" + m.keyCode + ",T='" + type + "',R=" + (rep ? 'true' : 'false') + ';' +
          "var e;try{e=new KeyboardEvent(T,{key:K,bubbles:true,cancelable:true,composed:true})}catch(x){e=document.createEvent('KeyboardEvent');e.initKeyboardEvent(T,true,true,window,K,0,'',false,'')}" +
          "try{Object.defineProperty(e,'keyCode',{get:function(){return C}})}catch(x){}" +
          "try{Object.defineProperty(e,'which',{get:function(){return C}})}catch(x){}" +
          "try{Object.defineProperty(e,'charCode',{get:function(){return 0}})}catch(x){}" +
          "try{Object.defineProperty(e,'repeat',{get:function(){return R}})}catch(x){}" +
          'document.dispatchEvent(e);' +
          "try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('NM_KEY:'+K+':'+T+(R?':rep':''))}catch(x){}" +
          '})();true;';
        try { wv.current?.injectJavaScript(js); } catch (err) { /* ignore */ }
    });
    return () => sub.remove();
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    // 批17:carMode 切换消息
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg && msg.type === 'carMode') {
        settings.set('carModeUi', msg.value === true);
        return;
      }
    } catch (_) { /* 非 JSON */ }
    const d = e.nativeEvent.data;
    if (d && d.indexOf('NM_KEY:') === 0) { console.log('[WebShell]', d); return; } // 批18:TV 键端到端回执
    console.log('[WebShell] onMessage:', d);
    if (d !== 'NM_BACK:ROOT') return;
    if (exitArmed.current) { console.log('[WebShell] exitApp'); BackHandler.exitApp(); }
    else {
      console.log('[WebShell] arm exit');
      exitArmed.current = true;
      toast('再按一次返回键退出');
      setTimeout(() => { exitArmed.current = false; }, 2600);
    }
  };

  // 批14:App 原生侧已登录态注入 WebView(TV 遥控器输密码痛苦——原生 store 有 token 直接透传,免二次登录)
  const injectJs = useMemo(() => {
    let js = WEB_INJECT_JS;
    try {
      if (store.token && store.username) {
        js =
          "try{localStorage.setItem('nmk:nextmusic:app',JSON.stringify({mode:'server',base:'',token:'" +
          String(store.token).replace(/'/g, '') +
          "',username:'" +
          String(store.username).replace(/'/g, '') +
          "'}))}catch(e){};\n" +
          js;
      }
    } catch (e) { /* 未登录则跳过注入 */ }
    return js;
  }, []);

  return (
    <View style={st.host}>
      <WV
        ref={wv}
        source={{ uri }}
        style={st.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        textZoom={100}
        injectedJavaScriptBeforeContentLoaded={injectJs}
        onMessage={onMessage}
        onError={(e) => setErr(String(e.nativeEvent.description || '加载失败'))}
        onLoadEnd={() => { setLoading(false); setErr(null); }}
      />
      {loading && !err ? (
        <View style={st.center}><ActivityIndicator size="large" color={C.brand} /></View>
      ) : null}
      {err ? (
        <View style={st.center}>
          <Text style={st.errText}>页面加载失败</Text>
          <Text style={st.errSub}>{err}</Text>
          <Text
            style={st.retry}
            onPress={() => { setErr(null); setLoading(true); wv.current?.reload(); }}
          >重试</Text>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  host: { flex: 1, backgroundColor: '#121212' },
  web: { flex: 1, backgroundColor: '#121212' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121212' },
  errText: { color: C.text, fontSize: 16, fontWeight: '700' },
  errSub: { color: C.text2, fontSize: 12, marginTop: 6, maxWidth: '80%' },
  retry: { color: C.brand, fontSize: 15, fontWeight: '700', marginTop: 18, paddingVertical: 8, paddingHorizontal: 24 },
});
