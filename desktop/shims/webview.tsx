// react-native-webview web shim：iframe 承载 sandbox HTML（engine 生成字符串，srcdoc 直载）
// 桥协议：iframe 内 window.ReactNativeWebView.postMessage → 父 onMessage；
//         父 injectJavaScript → iframe.contentWindow.postMessage({__injected: js})
// sandbox HTML(sandbox.ts) 运行在 iframe，其中用 addEventListener('message') 收注入。
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

type Props = {
  source: { html: string; uri?: string };
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
  onError?: (e: { nativeEvent: { description?: string } }) => void;
  javaScriptEnabled?: boolean;
  originWhitelist?: string[];
  [k: string]: unknown;
};

export type WebView = {
  injectJavaScript: (js: string) => void;
  postMessage: (data: string) => void;
};

// 桥 bootstrap:iframe 内复到 RN WebView 全局接口(RN→JS 注入用 eval 执行)
const BOOT = `<script>
window.ReactNativeWebView={postMessage:function(d){parent.postMessage(d,'*');}};
window.addEventListener('message',function(e){var d=e.data;if(d&&d.__injected!==undefined){try{eval(d.__injected);}catch(err){console.error(err);}}});
</script>`;

export const WebView = forwardRef<WebView, Props>(function WebView({ source, onMessage, onError, style }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = source.html || '';

  useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => { frame.current?.contentWindow?.postMessage({ __injected: js }, '*'); },
    postMessage: (data: string) => { frame.current?.contentWindow?.postMessage({ __rnw: data }, '*'); },
  }), []);

  useEffect(() => {
    const h = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const d = ev.data;
      if (d && typeof d === 'object' && '__injected' in d) return; // 自己发的注入指令
      onMessage?.({ nativeEvent: { data: typeof d === 'string' ? d : JSON.stringify(d) } });
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [onMessage]);

  return (
    <iframe
      ref={frame}
      title="lx-sandbox"
      srcDoc={BOOT + html}
      sandbox="allow-scripts"
      style={{ width: 0, height: 0, border: 0, position: 'absolute', ...(style as object) }}
      onError={() => onError?.({ nativeEvent: { description: 'iframe load error' } })}
    />
  );
});
export default { WebView };
