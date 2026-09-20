// 封面 URL 域名自愈:img.kuwo.cn 2026-09-20 全球 NXDOMAIN(kuwo 弃用),同路径平移到 img4.kuwo.cn。
// 库里存量歌曲的旧 URL 全是死链——所有封面渲染入口都过这个函数,幂等。
export function fixCoverUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  return u.replace(/^https?:\/\/img\.kuwo\.cn\//, 'https://img4.kuwo.cn/');
}
