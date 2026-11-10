// [老板 1110 全平台] 播放页点歌手名→种词→跳搜索页检出同歌手的歌
// phone 走 route params,car 走 prop 种子;HD 无 prop 通道(Main tab 切换)→本模块事件总线:
// HDMain 订阅切 tab+popToTop;HDSearch 订阅实时搜 + 懒挂载时 takeSearchSeed 补搜(plant 广播时可能未 mounted——1110 老板报「跳过去没词」根因)
type Sub = (q: string) => void;
const subs = new Set<Sub>();
let last = '';
let ver = 0;
let consumedVer = 0;
export function plantSearchSeed(q: string): void { last = q; ver++; subs.forEach(f => f(q)); }
export function subSearchSeed(f: Sub): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
// 晚挂载消费:取走未消费的种子(取后即标记,防重复搜)
export function takeSearchSeed(): string {
  if (ver > consumedVer && last) { consumedVer = ver; return last; }
  return '';
}
export function markSearchSeedConsumed(): void { consumedVer = ver; }
