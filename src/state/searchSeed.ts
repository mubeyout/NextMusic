// [老板 1110 全平台] 播放页点歌手名→种词→跳搜索页检出同歌手的歌
// phone 走 route params,car 走 prop 种子;HD 无 prop 通道(Main tab 切换)→本模块事件总线:HDMain 订阅切 tab,HDSearch 订阅执行搜索
type Sub = (q: string) => void;
const subs = new Set<Sub>();
export function plantSearchSeed(q: string): void { subs.forEach(f => f(q)); }
export function subSearchSeed(f: Sub): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
