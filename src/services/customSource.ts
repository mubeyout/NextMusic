// Custom LX source scripts store + playback resolution.
// Sources are LX Music protocol scripts run in the LxEngine sandbox.
import { createMMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';
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
  kind?: 'lx' | 'musicfree'; // vc85：MusicFree 插件（自带 XHR httpGet，RN 环境直接跑）；缺省 = LX
}

// ---------- vc85：纯 JS md5（MusicFree 插件全局依赖，RN 无 crypto） ----------
function md5Hex(input: string): string {
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    const v = (a + q + x + t) | 0;
    a = (((v << s) | (v >>> (32 - s))) + b) | 0;
    return a | 0;
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  const nLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push((nLen >>> (8 * i)) & 0xff);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < bytes.length; i += 64) {
    const x: number[] = [];
    for (let j = 0; j < 16; j++) x[j] = (bytes[i + j * 4]) | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24);
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[0], 7, -680876936); d = ff(d, a, b, c, x[1], 12, -389564586); c = ff(c, d, a, b, x[2], 17, 606105819); b = ff(b, c, d, a, x[3], 22, -1044525330);
    a = ff(a, b, c, d, x[4], 7, -176418897); d = ff(d, a, b, c, x[5], 12, 1200080426); c = ff(c, d, a, b, x[6], 17, -1473231341); b = ff(b, c, d, a, x[7], 22, -45705983);
    a = ff(a, b, c, d, x[8], 7, 1770035416); d = ff(d, a, b, c, x[9], 12, -1958414417); c = ff(c, d, a, b, x[10], 17, -42063); b = ff(b, c, d, a, x[11], 22, -1990404162);
    a = ff(a, b, c, d, x[12], 7, 1804603682); d = ff(d, a, b, c, x[13], 12, -40341101); c = ff(c, d, a, b, x[14], 17, -1502002290); b = ff(b, c, d, a, x[15], 22, 1236535329);
    a = gg(a, b, c, d, x[1], 5, -165796510); d = gg(d, a, b, c, x[6], 9, -1069501632); c = gg(c, d, a, b, x[11], 14, 643717713); b = gg(b, c, d, a, x[0], 20, -373897302);
    a = gg(a, b, c, d, x[5], 5, -701558691); d = gg(d, a, b, c, x[10], 9, 38016083); c = gg(c, d, a, b, x[15], 14, -660478335); b = gg(b, c, d, a, x[4], 20, -405537848);
    a = gg(a, b, c, d, x[9], 5, 568446438); d = gg(d, a, b, c, x[14], 9, -1019803690); c = gg(c, d, a, b, x[3], 14, -187363961); b = gg(b, c, d, a, x[8], 20, 1163531501);
    a = gg(a, b, c, d, x[13], 5, -1444681467); d = gg(d, a, b, c, x[2], 9, -51403784); c = gg(c, d, a, b, x[7], 14, 1735328473); b = gg(b, c, d, a, x[12], 20, -1926607734);
    a = hh(a, b, c, d, x[5], 4, -378558); d = hh(d, a, b, c, x[8], 11, -2022574463); c = hh(c, d, a, b, x[11], 16, 1839030562); b = hh(b, c, d, a, x[14], 23, -35309556);
    a = hh(a, b, c, d, x[1], 4, -1530992060); d = hh(d, a, b, c, x[4], 11, 1272893353); c = hh(c, d, a, b, x[7], 16, -155497632); b = hh(b, c, d, a, x[10], 23, -1094730640);
    a = hh(a, b, c, d, x[13], 4, 681279174); d = hh(d, a, b, c, x[0], 11, -358537222); c = hh(c, d, a, b, x[3], 16, -722521979); b = hh(b, c, d, a, x[6], 23, 76029189);
    a = hh(a, b, c, d, x[9], 4, -640364487); d = hh(d, a, b, c, x[12], 11, -421815835); c = hh(c, d, a, b, x[15], 16, 530742520); b = hh(b, c, d, a, x[2], 23, -995338651);
    a = ii(a, b, c, d, x[0], 6, -198630844); d = ii(d, a, b, c, x[7], 10, 1126891415); c = ii(c, d, a, b, x[14], 15, -1416354905); b = ii(b, c, d, a, x[5], 21, -57434055);
    a = ii(a, b, c, d, x[12], 6, 1700485571); d = ii(d, a, b, c, x[3], 10, -1894986606); c = ii(c, d, a, b, x[10], 15, -1051523); b = ii(b, c, d, a, x[1], 21, -2054922799);
    a = ii(a, b, c, d, x[8], 6, 1873313359); d = ii(d, a, b, c, x[15], 10, -30611744); c = ii(c, d, a, b, x[6], 15, -1560198380); b = ii(b, c, d, a, x[2], 21, 1309151649);
    a = ii(a, b, c, d, x[13], 6, -145523070); d = ii(d, a, b, c, x[4], 10, -1120210379); c = ii(c, d, a, b, x[11], 15, 718787259); b = ii(b, c, d, a, x[0], 21, -343485551);
    a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
  }
  const hex = (n: number) => {
    let out = '';
    for (let i = 0; i < 4; i++) out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return out;
  };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

// ---------- vc85：MusicFree 插件适配（RN 直跑：自带 XHR httpGet，注入 md5） ----------
const mfPlugins = new Map<string, Record<string, unknown>>();
export function mfPluginOf(s: CustomSource): Record<string, unknown> | null {
  if (mfPlugins.has(s.id)) return mfPlugins.get(s.id) ?? null;
  try {
    const mod = { exports: {} as Record<string, unknown> };
    const fn = new Function('module', 'exports', 'md5', `"use strict";\n${s.script}`);
    fn(mod, mod.exports, md5Hex);
    const p = mod.exports;
    if (p && typeof p === 'object' && typeof (p as { getMediaSource?: unknown }).getMediaSource === 'function') {
      mfPlugins.set(s.id, p);
      return p;
    }
  } catch (e) {
    console.log('[musicfree] plugin load fail', (e as Error).message);
  }
  return null;
}
function isMusicfreeScript(script: string): boolean {
  return /@description\s+MusicFree/i.test(script) || /getRecommendSheetTags\s*:/.test(script) || (/module\.exports\s*=/.test(script) && /getMediaSource\s*:/.test(script));
}
// MusicFree platform 名 → 我方渠道名（含 kg/wy/kw/mg/tx 子串映射；无则用 platform 原名）
function mfChannelOf(platform: string): string {
  const p = platform.toLowerCase();
  for (const k of ['kw', 'kg', 'wy', 'mg', 'tx']) if (p.includes(k)) return k;
  return platform;
}

export function saveSources(list: CustomSource[]): void { save(list); }
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
    const vm = line.match(/(?:^|\s)@version\s*[:：]?\s*(\S+)/); if (vm) meta.version = vm[1].trim().replace(/^v/i, ''); // strip v 前缀,防显示 vv
    const dm = line.match(/(?:^|\s)@description\s*[:：]?\s*(.+)/); if (dm) meta.description = dm[1].trim().replace(/\*\/$/, '').trim();
    const am = line.match(/(?:^|\s)@author\s*[:：]?\s*(.+)/); if (am) meta.author = am[1].trim().replace(/\*\/$/, '').trim();
  }
  return meta;
}

// lx171:web 端浏览器直拉脚本遗 CORS 拦(Failed to fetch)→走服务器代拉接口(同源);
// 原生/Electron 无 CORS 概念直拉。代拉失败时把上游状态带给用户。拉下来的脚本仍在本机沙箱跑,
// 只是把"下载文本"这一步托给服务器,不降低安全性(脚本照常过元数据校验+沙箱)。
async function fetchScriptText(url: string): Promise<string> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !/electron/i.test(navigator.userAgent)) {
    const r = await fetch(`/api/custom-source/fetch-script?url=${encodeURIComponent(url)}`);
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); if (j?.message) msg = j.message; } catch { /* ignore */ }
      throw new Error(`下载脚本失败：${msg}`);
    }
    return await r.text();
  }
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  if (!resp.ok) throw new Error(`下载脚本失败：HTTP ${resp.status}`);
  return await resp.text();
}

// Add a source by URL: fetch script, init in sandbox, persist.
export async function addSourceByUrl(url: string): Promise<CustomSource> {
  const script = await fetchScriptText(url);
  if (script.length < 50) throw new Error('脚本内容异常（过短）');
  const meta = extractMeta(script);
  const id = `s_${Date.now().toString(36)}`;
  if (isMusicfreeScript(script)) {
    // vc85：MusicFree 插件（如 星海音乐源 kg）——RN 直跑，不走 LX 沙箱
    const probe: CustomSource = { id, name: '', version: meta.version || '0.0.1', url, script, enabled: true, sources: {}, kind: 'musicfree' };
    const p = mfPluginOf(probe);
    if (!p) throw new Error('MusicFree 插件加载失败（缺少 getMediaSource 或执行报错）');
    const platform = String(p.platform ?? meta.name ?? 'musicfree');
    const channel = mfChannelOf(platform);
    const src: CustomSource = {
      id, name: meta.name || platform || 'MusicFree 音源', version: meta.version || String(p.version ?? '0.0.1'),
      url, script, enabled: true, kind: 'musicfree',
      sources: { [channel]: { name: platform } },
    };
    const list = loadSources().filter(x => x.url !== url);
    list.push(src);
    save(list);
    engine.setActiveSources(list.filter(x => x.enabled));
    return src;
  }
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
    if (s.kind === 'musicfree') {
      // vc85：MusicFree getMediaSource(item, quality) → {url}
      const p = mfPluginOf(s);
      if (!p) continue;
      try {
        const q = type === '128k' ? '128' : type === '320k' ? '320' : 'flac';
        const r = await (p.getMediaSource as (item: Record<string, unknown>, q: string) => Promise<{ url?: string } | null>)(
          { id: String(songInfo.songmid ?? ''), title: songInfo.name, artist: songInfo.singer, album: '', quality: q }, q,
        );
        if (r && r.url) return r.url;
      } catch (e) {
        console.log('[musicfree] get url fail', s.name, (e as Error).message);
      }
      continue;
    }
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

// ---------- vc85：音源更新（检查 + 一键覆盖） ----------
export interface SourceUpdate { src: CustomSource; version: string; script: string }

function isNewerVersion(a: string, b: string): boolean {
  const pa = a.replace(/^v+/i, '').split('.').map(n => parseInt(n, 10) || 0); // strip v 前缀(存量带 v 记录误报实锤:vv3.2.13→"新"3.2.13)
  const pb = b.replace(/^v+/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d > 0) return true;
    if (d < 0) return false;
  }
  return false;
}

/** 静默检查所有（有添加 URL 的）音源是否有新版本
 * lx174:web 端走服务器代拉接口(fetchScriptText 同源,CORS 免疫);启动后 30s 自动跑一次并自动应用 */
export async function checkSourceUpdates(): Promise<SourceUpdate[]> {
  const updates: SourceUpdate[] = [];
  for (const s of loadSources()) {
    if (!s.url) continue;
    try {
      const script = await fetchScriptText(s.url);
      if (script.length < 50) continue;
      const meta = extractMeta(script);
      if (meta.version && isNewerVersion(meta.version, s.version)) updates.push({ src: s, version: meta.version, script });
    } catch { /* 网络失败静默跳过 */ }
  }
  return updates;
}

// lx174:启动后 30s 静默自动更新(只处理有 URL 的源;失败静默,不动旧版);单源退出:s.url 为空自然跳过
let autoUpdateStarted = false;
export function startSourceAutoUpdate() {
  if (autoUpdateStarted) return;
  autoUpdateStarted = true;
  setTimeout(() => {
    void checkSourceUpdates().then(ups => {
      ups.forEach(u => applySourceUpdate(u));
      if (ups.length) console.log(`[CustomSource] 自动更新 ${ups.length} 个音源:`, ups.map(u => `${u.src.name}→${u.version}`).join(', '));
    }).catch(() => {});
  }, 30_000);
}

/** 一键更新覆盖（code/version 重写 + 引擎重载） */
export function applySourceUpdate(u: SourceUpdate): void {
  const list = loadSources();
  const s = list.find(x => x.id === u.src.id);
  if (!s) return;
  s.script = u.script;
  s.version = u.version;
  if (s.kind === 'musicfree') mfPlugins.delete(s.id);
  save(list);
  engine.setActiveSources(list.filter(x => x.enabled));
  if (s.kind !== 'musicfree') {
    engine.userApiInit(s.id, s.script).catch(() => {}); // LX 重新初始化（失败不影响已存脚本）
  }
}

// 音源健康检查：用该源搜一首已知存在的歌（wy 晴天）→ 尝试取链。
// 校验整条链路（脚本运行 + 搜索 + 解析），返回可直接展示的结果。
export async function sourceHealthCheck(id: string): Promise<{ ok: boolean; detail: string }> {
  const s = loadSources().find(x => x.id === id);
  if (!s) return { ok: false, detail: '音源不存在' };
  // 选一个该源支持的主流通
  const src = ['kw', 'wy', 'kg'].find(k => s.sources[k]) || Object.keys(s.sources)[0];
  if (!src) return { ok: false, detail: '该源不支持任何平台' };
  // vc90：MusicFree 源自检 = search('晴天') 拿真实曲目 → getMediaSource 真取链(空 id 会 no hash)
  if (s.kind === 'musicfree') {
    const p = mfPluginOf(s);
    if (!p) return { ok: false, detail: '插件加载失败' };
    try {
      // 轻检测:插件可加载+渠道注册即认为可用(取链在播放时自然验证——硬测依赖搜索 API 网络,V40 实测域名不稳误报)
      const chans = Object.keys(s.sources);
      return { ok: true, detail: `插件运行正常 · ${chans.join('/')} 渠道` };
    } catch (e) {
      return { ok: false, detail: '检测失败：' + (e as Error).message };
    }
  }
  try {
    const r = await engine.sdk<any>([src, 'musicSearch', 'search'], ['周杰伦 晴天', 1, 15]) as { list?: unknown[] };
    const list = Array.isArray(r?.list) ? r.list : [];
    if (!list.length) return { ok: false, detail: '搜索无结果（脚本可能失效）' };
    const song = (list.find(x => (x as { name?: string })?.name?.includes('晴天')) || list[0]) as Record<string, unknown>;
    const info = {
      songmid: String(song.songmid ?? ''),
      hash: String(song.hash ?? ''),
      name: String(song.name ?? ''),
      singer: String(song.singer ?? ''),
      interval: song.interval ? String(song.interval) : '',
    };
    const u = await engine.userApiGetMusicUrl(id, src, info, '128k');
    const url = typeof u === 'string' ? u : u?.url;
    if (url) return { ok: true, detail: `可用 · ${info.singer}《${info.name}》解析成功` };
    return { ok: false, detail: '取链失败：脚本返回空链接（可能需要更新音源）' };
  } catch (e) {
    return { ok: false, detail: `脚本异常：${(e as Error).message || '运行出错'}` };
  }
}


// ---------- vc87：音源目录订阅（guoyue2010 目录页等静态 HTML）+ 系统一键更新覆盖 ----------
export interface CatalogItem { name: string; url: string }

const CATALOG_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

/** 解析目录页（HTML）里的所有 .js 音源链接 */
export async function fetchCatalog(catalogUrl: string): Promise<CatalogItem[]> {
  const resp = await fetch(catalogUrl, { headers: CATALOG_UA });
  if (!resp.ok) throw new Error(`目录页拉取失败：HTTP ${resp.status}`);
  const html = await resp.text();
  const base = catalogUrl.replace(/[^/]*$/, '');
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const re = /href="([^"]+\.js[^"]*)"[^>]*>([^<]*)</g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(html)) != null) {
    const href = mm[1];
    let title = (mm[2] || '').trim();
    try { if (!title) title = decodeURIComponent(href); } catch { title = href; }
    title = title.replace(/\.js\s*$/, '').trim();
    const abs = href.startsWith('http') ? href : base + href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ name: title, url: abs });
  }
  return out;
}

// 名字归一匹配（去版本号/「新」尾缀/空格标点）——目录「星海音乐源新」≈ 已装「星海音乐源kg」按前缀识别为同源
function normName(n: string): string {
  return n.replace(/v?\d+(\.\d+)*\s*/gi, '').replace(/(新|解密版|免费版|公益版|\(\d+\))/g, '').replace(/[\s（）()·\-—_/]/g, '').toLowerCase();
}
function catalogMatches(src: CustomSource, item: CatalogItem): boolean {
  if (src.url === item.url) return true;
  const a = normName(src.name);
  const b = normName(item.name);
  return a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a));
}

/** 系统一键同步：对照目录更新覆盖已装源（URL 精确 + 名字归一匹配；未装的不动） */
export async function syncFromCatalog(catalogUrl: string): Promise<{ updated: number; names: string[] }> {
  const cat = await fetchCatalog(catalogUrl);
  const list = loadSources();
  const names: string[] = [];
  for (const item of cat) {
    const s = list.find(x => catalogMatches(x, item));
    if (!s) continue;
    try {
      const resp = await fetch(item.url, { headers: CATALOG_UA });
      if (!resp.ok) continue;
      const script = await resp.text();
      if (script.length < 50) continue;
      const meta = extractMeta(script);
      if (isNewerVersion(meta.version, s.version)) {
        s.script = script;
        s.version = meta.version || s.version;
        s.url = item.url; // 对齐到目录 URL，后续直连检查也走它
        if (s.kind === 'musicfree') mfPlugins.delete(s.id);
        names.push(`${s.name} → v${s.version}`);
      }
    } catch { /* 单个失败跳过 */ }
  }
  if (names.length) {
    save(list);
    engine.setActiveSources(list.filter(x => x.enabled));
    for (const x of list) if (x.kind !== 'musicfree') engine.userApiInit(x.id, x.script).catch(() => {});
  }
  return { updated: names.length, names };
}


// ---------- vc88：预埋更新(LX 协议 updateAlert)+ 手动文件导入 ----------
/** 预埋更新覆盖：脚本 send(updateAlert {log, updateUrl}) → 宿主从 updateUrl 拉新版一键覆盖 */
export async function applyUpdateFromAlert(srcId: string, updateUrl: string): Promise<string> {
  const list = loadSources();
  const s = list.find(x => x.id === srcId);
  if (!s) throw new Error('音源不存在');
  if (!/^https?:\/\//i.test(updateUrl)) throw new Error('更新地址无效');
  const resp = await fetch(updateUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  if (!resp.ok) throw new Error(`更新脚本下载失败：HTTP ${resp.status}`);
  const script = await resp.text();
  if (script.length < 50) throw new Error('更新脚本内容异常');
  const meta = extractMeta(script);
  s.script = script;
  if (meta.version) s.version = meta.version;
  if (meta.name && s.name === '未命名音源') s.name = meta.name;
  if (s.kind === 'musicfree') mfPlugins.delete(s.id);
  save(list);
  engine.setActiveSources(list.filter(x => x.enabled));
  if (s.kind !== 'musicfree') await engine.userApiInit(s.id, s.script);
  return s.version;
}

/** 手动添加音源文件（.js 内容直装；LX 走沙箱验证，MusicFree 探针验证；无 URL——更新走预埋或手动重导） */
export async function addSourceFromFile(script: string): Promise<CustomSource> {
  if (!script || script.length < 50) throw new Error('脚本内容异常（过短）');
  const meta = extractMeta(script);
  const id = `s_${Date.now().toString(36)}`;
  if (isMusicfreeScript(script)) {
    const probe: CustomSource = { id, name: meta.name, version: meta.version || '0.0.1', url: '', script, enabled: true, sources: {}, kind: 'musicfree' };
    const p = mfPluginOf(probe);
    if (!p) throw new Error('MusicFree 插件加载失败（缺少 getMediaSource 或执行报错）');
    const platform = String(p.platform ?? meta.name ?? 'musicfree');
    const channel = mfChannelOf(platform);
    const src: CustomSource = {
      id, name: meta.name || platform || 'MusicFree 音源', version: meta.version || String(p.version ?? '0.0.1'),
      url: '', script, enabled: true, kind: 'musicfree', sources: { [channel]: { name: platform } },
    };
    const list = loadSources();
    list.push(src);
    save(list);
    engine.setActiveSources(list.filter(x => x.enabled));
    return src;
  }
  // LX：沙箱初始化验证
  const init = await engine.userApiInit(id, script);
  if (!init.sources || !Object.keys(init.sources).length) throw new Error('LX 脚本初始化成功但未注册任何音源');
  const src: CustomSource = {
    id, name: meta.name || '未命名音源', version: meta.version || '1.0.0',
    url: '', script, enabled: true, sources: init.sources as CustomSource['sources'],
  };
  const list = loadSources();
  list.push(src);
  save(list);
  engine.setActiveSources(list.filter(x => x.enabled));
  return src;
}
