// WebShell.tsx —— [APK 三版合一 WebView 壳 1112 老板令]
// car(CarShell)/HD(HDMain)两形态统一改 react-native-webview 离线壳:
// 前端产物(NextMusic-HD-Web dist 单文件自包含)内置 android/app/src/main/assets/web/,
// file:///android_asset/web/<entry> 直载,零启动网络依赖。
// API 相对路径(/api/...)在 file:// origin 下无同域——注入脚本先于页面脚本执行:
//   1) localStorage 预置 nm.real.base;2) 包装 window.fetch 把相对路径拼 REAL.base。
// 音频/封面 http 直连 → mixedContentMode=always 放行;媒体免手势自动播放。
// 返回键:web 是 SPA 自有 historyStack(非浏览器栈)——evaluateJS 探测(播放页/弹窗/内栈依次出)
// 经 onMessage 回传,ROOT 才走原生双击退出;恒拦截防根栈 pop 回 Boot。
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView as WebViewBase, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { toast } from '../components/Dialog';
import { C } from '../theme/tokens';

// RN0.87 新架构 codegen 类型与本包 NativeComponent 声明不合(props 退化 never)——一次性类型级转换,运行时原样
type WVHandle = { injectJavaScript: (js: string) => unknown; reload: () => void };
type WVComponent = React.ComponentType<WebViewProps & { ref?: React.Ref<WVHandle> }>;
const WV = WebViewBase as unknown as WVComponent;

// 服务器真实 base(1112 定):WebView 壳内 API 一律拼此域
export const WEB_REAL_BASE = 'http://op.mubey.top:9527';

// 注入脚本(injectedJavaScriptBeforeContentLoaded,页面脚本执行前):
// localStorage 预置 base + fetch 包装('/api/x' → base+'/api/x';'//host' 与绝对 URL 不动)
export const WEB_INJECT_JS = [
  '(function(){',
  "  try{localStorage.setItem('nm.real.base','" + WEB_REAL_BASE + "')}catch(e){}",
  "  var FB='" + WEB_REAL_BASE + "';",
  "  try{var v=localStorage.getItem('nm.real.base');if(v)FB=v}catch(e){}",
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
  '})();true;',
].join('\n');

// 返回键探测/执行脚本(SPA 栈,非 history.back):播放页全屏→关;弹窗→关;内页栈→pageBack;
// 首页无栈=ROOT(原生侧双击退出)。结果经 ReactNativeWebView.postMessage 回传 onMessage。
// 全局桥:activeBack 挂载即注册,navigation.tsx 根层返回键监听顶部让渡(LIFO 先消费实锤见 WebShell 注释)
let activeBack: (() => boolean) | null = null;
export function webBackActive(): boolean { return activeBack !== null; }
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
    activeBack = () => { wv.current?.injectJavaScript(WEB_BACK_JS); return true; };
    return () => { activeBack = null; };
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data !== 'NM_BACK:ROOT') return;
    if (exitArmed.current) BackHandler.exitApp();
    else {
      exitArmed.current = true;
      toast('再按一次返回键退出');
      setTimeout(() => { exitArmed.current = false; }, 2600);
    }
  };

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
        injectedJavaScriptBeforeContentLoaded={WEB_INJECT_JS}
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
