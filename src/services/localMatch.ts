// 本地同名优先匹配(老板 2026-09-22:播放优先级=本地→服务器端→音源)
// 场景:队列曲目(在线音源/听风/同步歌单)本地其实已有同一首歌(下载记录或设备本地音乐)——
// 但跨源 identity 不同(songmid 对不上)或歌单元数据缺失,精确匹配落空后仍走音源取链,可能失败。
// 这里按「归一化歌名 + 歌手交集(+双方都有时长时 ±6s 容差)」跨源匹配,命中直接播本地文件。
import { downloads } from './downloads';
import { deviceSongs } from './devicelibrary';
import type { SongItem } from './server';

// 全角→半角(！-～)+全角空格,小写化
function halfWidth(s: string): string {
  return (s || '').toLowerCase()
    .replace(/\u3000/g, ' ')
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

// 歌名归一化:去括号注记(版本/Live/Remix 等元信息跨源不一致,是跨源匹配最大噪声),只留字母数字与 CJK
function norm(s: string): string {
  const u = halfWidth(s)
    .replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】|「[^「」]*」|『[^『』]*』/g, '');
  return u.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

// 歌手拆分:分隔符 + feat./ft. 合作者标记(拆分需在去空格前做,否则 ft 会误切 swift 这类词)
function artists(s: string): string[] {
  return halfWidth(s)
    .split(/[,/;&+、]|\s+(?:feat\.?|ft\.?)\s+/)
    .map(x => norm(x))
    .filter(Boolean);
}

// LX 系 interval 两种格式都可能出现:秒数("245")或 "m:ss"(设备库 fmtInterval)
function toSec(v?: string): number {
  if (!v) return 0;
  if (v.includes(':')) {
    const p = v.split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function sameSong(a: SongItem, b: SongItem): boolean {
  const an = norm(a.name), bn = norm(b.name);
  if (!an || !bn || an !== bn) return false;
  const aa = artists(a.singer || ''), ba = artists(b.singer || '');
  if (aa.length && ba.length) {
    const hit = aa.some(x => ba.some(y => x.includes(y) || y.includes(x)));
    if (!hit) return false;
  }
  // 双方都有时长时,差>6s 视为不同版本(Live/Remix/剪辑),不冒用本地文件
  const da = toSec(a.interval), db = toSec(b.interval);
  if (da > 0 && db > 0 && Math.abs(da - db) > 6) return false;
  return true;
}

export interface LocalMatchHit { path: string; from: 'download' | 'device' }

export function findLocalMatch(t: SongItem): LocalMatchHit | null {
  if (t.source === 'device') return null; // 设备曲目本就直播本地文件
  try {
    // 1) 本地下载记录(跨源同名;web 服务器缓存记录无本地文件,跳过)
    for (const r of downloads.all()) {
      if (r.server || !r.path || r.path === 'server-cache') continue;
      if (sameSong(r.song, t)) return { path: r.path, from: 'download' };
    }
  } catch { /* ignore */ }
  try {
    // 2) 设备本地音乐
    for (const d of deviceSongs()) {
      if (sameSong(d, t)) return { path: d.songmid, from: 'device' };
    }
  } catch { /* ignore */ }
  return null;
}
