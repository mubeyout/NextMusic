// Global app state: boot mode, server connection, auth. Persisted via MMKV.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import { api, store as httpStore, normalizeBase, type ServerConfig } from '../services/server';

const kv = createMMKV({ id: 'nextmusic' });

export type RunMode = 'local' | 'server';

interface Persisted {
  mode: RunMode | null;
  base: string | null;
  token: string | null;
  username: string | null;
}

export function load(): Persisted {
  try { return { ...JSON.parse(kv.getString('app') || '{}') }; } catch { return { mode: null, base: null, token: null, username: null }; }
}

interface AppStateCtx extends Persisted {
  connected: boolean;
  serverConfig: ServerConfig | null;
  setMode: (m: RunMode | null) => void;
  connectServer: (base: string) => Promise<void>;
  setAuth: (token: string | null, username: string | null) => void;
  /** 真正断开：清空服务器绑定/凭据/连接态，进入本地模式；重新使用需直连/登录 */
  disconnectServer: () => void;
}

const Ctx = createContext<AppStateCtx>(null as unknown as AppStateCtx);

function loadFallback(): Record<string, string> {
  try { return JSON.parse(kv.getString('ipFallback') || '{}'); } catch { return {}; }
}
function portOf(b: string): string {
  const tail = b.replace(/^https?:\/\//, '').split('/')[0];
  const i = tail.lastIndexOf(':');
  return i >= 0 ? tail.slice(i + 1) : (b.startsWith('https') ? '443' : '80');
}
const isIpBase = (b: string) => /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:|$)/.test(b);
// 域名直连失败时回落：同端口最近一次成功连接的 IP（家庭网关自建服务场景，公网回环不通）
function fallbackBase(b: string): string | null {
  if (isIpBase(b)) return null;
  try { return loadFallback()[portOf(b)] || null; } catch { return null; }
}

async function probeWithFallback(b: string): Promise<{ cfg: ServerConfig; base: string }> {
  try {
    const cfg = await api.probe(b);
    return { cfg, base: b };
  } catch (e) {
    const fb = fallbackBase(b);
    if (!fb) throw e;
    const cfg = await api.probe(fb); // 回落也不通则抛出，交上层报错
    return { cfg, base: fb };
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const init = useMemo(load, []);
  const [mode, setModeState] = useState<RunMode | null>(init.mode ?? null);
  const [base, setBase] = useState<string | null>(init.base);
  const [token, setToken] = useState<string | null>(init.token);
  const [username, setUsername] = useState<string | null>(init.username);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

  // sync http store
  httpStore.base = base || '';
  httpStore.token = token || '';

  useEffect(() => {
    kv.set('app', JSON.stringify({ mode, base, token, username }));
  }, [mode, base, token, username]);

  // 浏览数据直连平台官方 API（LxEngine 沙箱），不经服务器；不再 auto-probe 默认地址。
  // 仅当用户此前手动配置过服务器时，启动时校验该地址可用性（用于同步/账号显示）。域名失败自动回落同端口已知 IP。
  useEffect(() => {
    if (!base) return;
    probeWithFallback(base)
      .then(({ cfg, base: useBase }) => {
        if (useBase !== base) { httpStore.base = useBase; setBase(useBase); } // 回落生效，落座实际可达地址
        setServerConfig(cfg);
      })
      .catch(() => setServerConfig(null));
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppStateCtx = {
    mode, base, token, username,
    connected: !!serverConfig,
    serverConfig,
    setMode: m => setModeState(m),
    connectServer: async (b: string) => {
      const norm = normalizeBase(b);
      const { cfg, base: useBase } = await probeWithFallback(norm); // throws on failure
      if (isIpBase(useBase)) {
        try { const m = loadFallback(); m[portOf(useBase)] = useBase; kv.set('ipFallback', JSON.stringify(m)); } catch { /* ignore */ }
      }
      httpStore.base = useBase; // 立即同步 http store(setState 是异步的,连续流程 connect+login 会读到空 base → 登录必败,TV 表单实测复现)
      setBase(useBase);
      setServerConfig(cfg);
      setModeState('server');
    },
    setAuth: (t, u) => { setToken(t); setUsername(u); httpStore.token = t || ''; },
    disconnectServer: () => {
      setBase(null);
      setToken(null);
      setUsername(null);
      setServerConfig(null);
      httpStore.base = '';
      httpStore.token = '';
      setModeState('local');
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
