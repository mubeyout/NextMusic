// MMKV web shim：localStorage 后端，实现主仓用到的 API 面
// createMMKV({id}) → 独立命名空间前缀的 KV 存储
type Config = { id: string };

export function createMMKV(cfg: Config) {
  const P = `nmk:${cfg.id}:`;
  const ok = (() => { try { const k = P + '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; } })();
  const mem = new Map<string, string>();
  const get = (k: string): string | undefined => (ok ? (localStorage.getItem(P + k) ?? undefined) : mem.get(k));
  const set = (k: string, v: string) => { if (ok) localStorage.setItem(P + k, v); else mem.set(k, v); };
  return {
    getString: (k: string) => get(k),
    getNumber: (k: string) => { const v = get(k); return v == null ? undefined : Number(v); },
    getBoolean: (k: string) => { const v = get(k); return v == null ? undefined : v === 'true'; },
    set: (k: string, v: string | number | boolean) => set(k, String(v)),
    delete: (k: string) => { if (ok) localStorage.removeItem(P + k); else mem.delete(k); },
    remove: (k: string) => { if (ok) localStorage.removeItem(P + k); else mem.delete(k); },
    contains: (k: string) => get(k) !== undefined,
    getAllKeys: (): string[] => {
      if (!ok) return [...mem.keys()];
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(P)) out.push(k.slice(P.length)); }
      return out;
    },
    clearAll: () => {
      // lx164 修复:原先用 this.getAllKeys()/this.delete()——箭头函数在 ESM 顶层 this=undefined,web/desktop 端一调即 TypeError;
      // 且迭代中 removeItem 会跳项。改闭包直扫+先收集后删。
      if (!ok) { mem.clear(); return; }
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P)) keys.push(k); }
      for (const k of keys) localStorage.removeItem(k);
    },
  };
}
export type MMKV = ReturnType<typeof createMMKV>;
export default { createMMKV };
