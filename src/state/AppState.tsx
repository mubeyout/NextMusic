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

function load(): Persisted {
  try { return { ...JSON.parse(kv.getString('app') || '{}') }; } catch { return { mode: null, base: null, token: null, username: null }; }
}

interface AppStateCtx extends Persisted {
  connected: boolean;
  serverConfig: ServerConfig | null;
  setMode: (m: RunMode | null) => void;
  connectServer: (base: string) => Promise<void>;
  setAuth: (token: string | null, username: string | null) => void;
}

const Ctx = createContext<AppStateCtx>(null as unknown as AppStateCtx);

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
  // 仅当用户此前手动配置过服务器时，启动时校验该地址可用性（用于同步/账号显示）。
  useEffect(() => {
    if (!base) return;
    api.probe(base)
      .then(cfg => setServerConfig(cfg))
      .catch(() => setServerConfig(null));
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppStateCtx = {
    mode, base, token, username,
    connected: !!serverConfig,
    serverConfig,
    setMode: m => setModeState(m),
    connectServer: async (b: string) => {
      const norm = normalizeBase(b);
      const cfg = await api.probe(norm); // throws on failure
      setBase(norm);
      setServerConfig(cfg);
      setModeState('server');
    },
    setAuth: (t, u) => { setToken(t); setUsername(u); httpStore.token = t || ''; },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
