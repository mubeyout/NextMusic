// Custom LX source scripts store + playback resolution.
// Sources are LX Music protocol scripts run in the LxEngine sandbox.
import { createMMKV } from 'react-native-mmkv';
import { engine } from '../lx-engine/engine';

const kv = createMMKV({ id: 'nextmusic' });

export interface CustomSource {
  id: string;
  name: string;
  version: string;
  url: string;
  script: string;
  enabled: boolean;
  sources: Record<string, { name: string; type?: string; actions?: string[]; qualitys?: string[] }>;
}

export function loadSources(): CustomSource[] {
  try { return JSON.parse(kv.getString('customSources') || '[]'); } catch { return []; }
}

function save(list: CustomSource[]) {
  kv.set('customSources', JSON.stringify(list));
}

// Extract @name/@version/@description prefixes from LX script header (same heuristic as lxserver)
function extractMeta(script: string): { name: string; version: string; description: string; author: string } {
  const meta = { name: '', version: '', description: '', author: '' };
  const m = script.match(/\/\*[\s\S]*?\*\//) || script.match(/^\/\/[^\n]*/m) as RegExpMatchArray | null;
  const lines = (m ? m[0] : '').split('\n');
  for (const line of lines) {
    const nm = line.match(/(?:^|\s)@name\s*[:：]?\s*(.+)/); if (nm) meta.name = nm[1].trim().replace(/\*\/$/, '').trim();
    const vm = line.match(/(?:^|\s)@version\s*[:：]?\s*(\S+)/); if (vm) meta.version = vm[1].trim();
    const dm = line.match(/(?:^|\s)@description\s*[:：]?\s*(.+)/); if (dm) meta.description = dm[1].trim().replace(/\*\/$/, '').trim();
    const am = line.match(/(?:^|\s)@author\s*[:：]?\s*(.+)/); if (am) meta.author = am[1].trim().replace(/\*\/$/, '').trim();
  }
  return meta;
}

// Add a source by URL: fetch script, init in sandbox, persist.
export async function addSourceByUrl(url: string): Promise<CustomSource> {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  if (!resp.ok) throw new Error(`下载脚本失败：HTTP ${resp.status}`);
  const script = await resp.text();
  if (script.length < 50) throw new Error('脚本内容异常（过短）');
  const meta = extractMeta(script);
  const id = `s_${Date.now().toString(36)}`;
  const init = await engine.userApiInit(id, script);
  if (!init.sources || !Object.keys(init.sources).length) throw new Error('脚本初始化成功但未注册任何音源');
  const src: CustomSource = {
    id, name: meta.name || '未命名音源', version: meta.version || '1.0.0',
    url, script, enabled: true, sources: init.sources as CustomSource['sources'],
  };
  const list = loadSources().filter(s => s.url !== url);
  list.push(src);
  save(list);
  engine.setActiveSources(list.filter(s => s.enabled));
  return src;
}

export async function removeSource(id: string) {
  const list = loadSources().filter(s => s.id !== id);
  save(list);
  engine.setActiveSources(list.filter(s => s.enabled));
}

export async function toggleSource(id: string, enabled: boolean) {
  const list = loadSources();
  const s = list.find(x => x.id === id);
  if (s) s.enabled = enabled;
  save(list);
  engine.setActiveSources(list.filter(x => x.enabled));
}

export function activeSources(): CustomSource[] {
  return loadSources().filter(s => s.enabled);
}

// Resolve a music URL through enabled custom sources (in order).
export async function customGetMusicUrl(songInfo: { source: string; songmid: string; hash?: string; name: string; singer: string; interval?: string }, type = '128k'): Promise<string | null> {
  const actives = activeSources();
  for (const s of actives) {
    if (!s.sources[songInfo.source]) continue;
    try {
      const r = await engine.userApiGetMusicUrl(s.id, songInfo.source, songInfo, type);
      if (typeof r === 'string' && r) return r;       // LX 标准：纯 URL 字符串
      if (r && typeof r === 'object' && r.url) return r.url;
    } catch (e) {
      console.log('[customSource] get url fail', s.name, (e as Error).message);
    }
  }
  return null;
}
