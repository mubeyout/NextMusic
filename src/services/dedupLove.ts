// lx165:一次性存量去重迁移(老板 2026-09-19 批准,独立 commit 便于回滚)。
// 背景:lx122 时期 setFav 把无 id 的原始 SongItem 直推 loveList,服务器收下后匹配恒失败→
// 重推复制(实锤 1188 条中 1187 条无 id);取消收藏也删不掉这些条目。
// 做法:成功拉到服务器快照后,loveList/userList 内条目统一 lxNormKey 归一——
//   无 id 但带 songmid+source 的原始条目按 App 字段重建为 LX 形态(保住名称/封面等 meta),
//   归一后重复的丢弃;有变化整快照推回,成功后置完成标记(失败下次启动重试)。
import { kvSync, sync, appToLx, lxNormKey, type LXSong } from './sync';
import type { SongItem } from './server';

const FLAG = 'loveDedupDone';

function fixList(arr: LXSong[]): { list: LXSong[]; changed: boolean } {
  const seen = new Set<string>();
  const out: LXSong[] = [];
  let changed = false;
  for (const x of arr || []) {
    let e = x;
    if (!e.id || typeof e.id !== 'string') {
      const s = e as unknown as SongItem;
      if (s.songmid && s.source) { e = appToLx(s); changed = true; } // 原始 SongItem → LX 归一重建
      else if (e.meta?.songId != null && e.source) { e = { ...e, id: `${e.source}_${e.meta.songId}` }; changed = true; } // 仅缺 id 但 meta 有 songId
    }
    const k = lxNormKey(e as never);
    if (seen.has(k)) { changed = true; continue; } // 归一后重复:丢弃
    seen.add(k);
    out.push(e);
  }
  return { list: out, changed };
}

/** 幂等:标记已置直接返回;离线(拉不到快照)下次再试;只在推送成功后置标记 */
export async function dedupLoveListOnce(): Promise<void> {
  if (kvSync.getBoolean(FLAG)) return;
  if (!kvSync.getString('snap')) return; // 从未同步过:无存量问题
  const snap = await sync.fetchLists({ force: true });
  if (!snap) return; // 不可达:下次再试
  let changed = false;
  const love = fixList(snap.loveList || []);
  if (love.changed) { snap.loveList = love.list; changed = true; }
  for (const u of snap.userList || []) {
    const r = fixList(u.list || []);
    if (r.changed) { u.list = r.list; changed = true; }
  }
  if (!changed) { kvSync.set(FLAG, true); return; } // 干净:只置标记
  const ok = await sync.pushLists(snap);
  if (ok) {
    kvSync.set(FLAG, true);
    console.log('[dedupLove] 存量去重完成: loveList', snap.loveList.length, '条');
  }
}
