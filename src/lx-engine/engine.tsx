// LxEngine: hidden WebView hosting the platform SDK + custom LX sources.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildSandboxHtml } from './sandbox';

interface HttpMsg {
  t: 'http' | 'rpc' | 'ready' | 'log';
  hid?: string;
  id?: number;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  bodyEnc?: string;
  ok?: boolean;
  data?: unknown;
  error?: string;
  line?: string;
}

const TEXTY = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded))/i;
const isTextCT = (ct: string) => !ct || TEXTY.test(ct);

function u8ToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
  // btoa-free base64 (RN lacks btoa on some versions)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bin.length; i += 3) {
    const b1 = bin.charCodeAt(i), b2 = bin.charCodeAt(i + 1), b3 = bin.charCodeAt(i + 2);
    out += B64[b1 >> 2] + B64[((b1 & 3) << 4) | (b2 >> 4)];
    out += b2 ? B64[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    out += b3 ? B64[b3 & 63] : '=';
  }
  return out;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

class Engine {
  private wv: WebView | null = null;
  private ready = false;
  private readyWaiters: (() => void)[] = [];
  private pending = new Map<number, Pending>();
  private seq = 1;
  // LX SDK 请求对象是每平台单例：同平台并发会 cancelHttp 互杀 → 必须按平台串行
  private platQ = new Map<string, Promise<unknown>>();
  html = buildSandboxHtml();

  attach(wv: WebView | null) {
    this.wv = wv;
    if (!wv) this.ready = false;
  }

  private inject(js: string) {
    if (!this.wv) throw new Error('LxEngine WebView 未挂载');
    this.wv.injectJavaScript(js);
  }

  waitReady(timeoutMs = 8000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LxEngine 初始化超时')), timeoutMs);
      this.readyWaiters.push(() => { clearTimeout(timer); resolve(); });
    });
  }

  onMessage(ev: WebViewMessageEvent) {
    let m: HttpMsg;
    try { m = JSON.parse(ev.nativeEvent.data) as HttpMsg; } catch { return; }
    if (m.t === 'ready') {
      this.ready = true;
      console.log('[LxEngine] ready');
      const ws = this.readyWaiters; this.readyWaiters = [];
      ws.forEach(w => w());
      return;
    }
    if (m.t === 'log') { console.log('[LxEngine]', m.line); return; }
    if (m.t === 'rpc' && m.id != null) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.data);
      else { console.log('[LxEngine] rpc fail', m.error); p.reject(new Error(m.error || 'sandbox rpc failed')); }
      return;
    }
    if (m.t === 'http' && m.hid) { void this.handleHttp(m); }
  }

  private async handleHttp(m: HttpMsg) {
    const reply = (statusCode: number, headers: Record<string, string>, bodyText?: string, bodyB64?: string, err?: string) => {
      const payload = JSON.stringify({ hid: m.hid, err: err || null, statusCode, headers, bodyText: bodyText ?? null, bodyB64: bodyB64 ?? null });
      this.inject(`window.__lxhttpResp(${JSON.stringify(payload)});true;`);
    };
    try {
      const init: RequestInit = {
        method: m.method || 'GET',
        headers: m.headers || {},
      };
      if (m.body != null && m.method !== 'GET' && m.method !== 'HEAD') init.body = m.body;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      init.signal = ctrl.signal as never;
      const resp = await fetch(m.url as string, init);
      clearTimeout(t);
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      const ct = headers['content-type'] || '';
      if (isTextCT(ct) || ct === '') {
        const text = await resp.text();
        reply(resp.status, headers, text);
      } else {
        const b64 = u8ToB64(await resp.arrayBuffer());
        reply(resp.status, headers, undefined, b64);
      }
    } catch (e) { console.log('[LxEngine] http fail', m.url, (e as Error).message); reply(0, {}, undefined, undefined, (e as Error).message); }
  }

  private call(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.wv) return reject(new Error('LxEngine 未就绪'));
      const id = this.seq++;
      const timer = setTimeout(() => { this.pending.delete(id); console.log('[LxEngine] rpc TIMEOUT', payload.k, (payload as { path?: string[] }).path?.join('.')); reject(new Error('sandbox 调用超时')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const arg = JSON.stringify(JSON.stringify(payload));
      this.inject(`window.__lxcmd(${id},${arg});true;`);
    });
  }

  async sdk<T>(path: string[], args: unknown[], timeoutMs = 20000): Promise<T> {
    await this.waitReady();
    const plat = String(path[0] ?? '_');
    const prev = this.platQ.get(plat) ?? Promise.resolve();
    const run: Promise<T> = prev.catch(() => {}).then(() => this.call({ k: 'sdk', path, args }, timeoutMs)) as Promise<T>;
    this.platQ.set(plat, run as Promise<unknown>);
    try {
      return await run;
    } finally {
      if (this.platQ.get(plat) === run) this.platQ.delete(plat);
    }
  }

  async userApiInit(id: string, script: string): Promise<{ sources: Record<string, unknown> }> {
    await this.waitReady();
    return this.call({ k: 'userApiInit', id, script }, 15000) as Promise<{ sources: Record<string, unknown> }>;
  }

  async userApiGetMusicUrl(id: string, source: string, musicInfo: unknown, type: string): Promise<string | { code?: number; msg?: string; url?: string }> {
    await this.waitReady();
    // LX 协议: 脚本 request handler 返回纯 URL 字符串（标准形态）或 {url} 对象
    return this.call({ k: 'userApiUrl', id, source, musicInfo, type }, 25000) as Promise<string | { code?: number; msg?: string; url?: string }>;
  }

  // Re-init enabled scripts after WebView reload / app start. Best effort.
  async setActiveSources(list: { id: string; script: string; enabled: boolean }[]) {
    try {
      await this.waitReady();
      await Promise.all(list.filter(s => s.enabled).map(s =>
        this.userApiInit(s.id, s.script).catch(e => console.log('[LxEngine] re-init source fail', e instanceof Error ? e.message : e))
      ));
    } catch (e) {
      console.log('[LxEngine] setActiveSources skipped:', e instanceof Error ? e.message : e);
    }
  }
}

export const engine = new Engine();

// WebView typings clash with this RN/React version combo; runtime is fine.
const WV = WebView as unknown as React.ComponentType<Record<string, unknown> & { ref?: unknown }>;

export function LxEngineHost() {
  const wvRef = useRef<WebView | null>(null);
  const [html] = useState(() => engine.html);
  const onMessage = useCallback((ev: WebViewMessageEvent) => engine.onMessage(ev), []);
  useEffect(() => {
    engine.attach(wvRef.current);
    return () => engine.attach(null);
  }, []);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <WV
        ref={wvRef}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        originWhitelist={['*']}
        allowFileAccess={false}
        mixedContentMode="never"
        onError={(e: { nativeEvent: { description?: string } }) => console.log('[LxEngine] webview error', e.nativeEvent.description)}
        onLoadStart={() => console.log('[LxEngine] onLoadStart')}
        onLoadEnd={() => {
        }}
        onRenderProcessGone={() => console.log('[LxEngine] render process GONE')}
        renderToHardwareTextureAndroid={false}
      />
    </View>
  );
}
