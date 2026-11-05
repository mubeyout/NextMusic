// mediaTree.ts —— [NM 内容树 1105] 车机/系统媒体中心浏览数据源
// 规格:LEO 2026-11-05(nm-media-browse-tree-leo.md)——root 四分类(songs/playlists/artists/albums)
// 协议:MediaLibraryService 兜底四分类(原生 MediaTreeStore);JS 推整树快照(单层≤100,v1 截断)
// 点播:原生 onAddMediaItems 拦截→'NMMediaTreePlay' 事件→playSong(song, 父容器队列)
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { myLib, toSongItem, type LibSong, type LibArtist, type LibAlbum } from './myLibrary';
import { tfUserLib, tfToSongItem, type TfSess } from './tingfeng';
import { providers, type ProviderAcct } from './providers';
import { fixCoverUrl } from '../utils/cover';
import type { SongItem } from './server';

interface TreeNode {
  mediaId: string;
  title: string;
  subtitle?: string;
  description?: string;
  iconUri?: string;
  durationMs?: number;
  browsable: boolean;
}

/** 点播反查表:mediaId → 歌 + 所在容器队列(播放上下文) */
const songIndex = new Map<string, { song: SongItem; queue: SongItem[] }>();

/** interval "mm:ss" → ms(解析失败返 0) */
function intervalMs(v: string | undefined): number {
  if (!v) return 0;
  const p = v.split(':').map(Number);
  if (p.length === 2 && p.every(n => Number.isFinite(n))) return Math.round((p[0] * 60 + p[1]) * 1000);
  return 0;
}

function songNode(s: SongItem): TreeNode {
  return {
    mediaId: `sng:${s.source}:${s.songmid}`,
    title: s.name || '未知曲目',
    subtitle: s.singer || undefined,
    description: s.albumName || undefined,
    iconUri: fixCoverUrl(s.img),
    durationMs: intervalMs(s.interval) || undefined,
    browsable: false,
  };
}

/** 容器层登记:全部曲目建索引(queue=容器内全部歌曲,LEO 规格播放上下文) */
function leafList(songs: SongItem[]): TreeNode[] {
  songs.forEach(s => songIndex.set(`sng:${s.source}:${s.songmid}`, { song: s, queue: songs }));
  return songs.map(songNode);
}

const DETAIL_PREFETCH = 40; // artists/albums 详情预取数(局域网并发;单层列表 100,详情 v1 截 40)

/** 聚合曲库快照(逐块容错:单块失败不炸整树) */
export async function buildTree(): Promise<{ subtitle: string; children: Record<string, TreeNode[]> }> {
  const children: Record<string, TreeNode[]> = {};
  let subtitle = '';

  // ── NAS 曲库(myLib 一揽子端点) ──
  const home = await myLib.home().catch(() => null);
  if (home) {
    const st = home.stats;
    subtitle = `${st.songs} 首 · ${st.artists} 位歌手 · ${st.albums} 张专辑`;

    // 全部歌曲(recent 排序截 100)
    const all = await myLib.songs('recent', 100).catch(() => null);
    if (all?.songs?.length) children.songs = leafList(all.songs.map(l => toSongItem(l)));
    else if (home.recent?.length) children.songs = leafList(home.recent.map(l => toSongItem(l)));

    // 最近添加(songs 子分类)
    if (home.recent?.length) children.recent = leafList(home.recent.slice(0, 100).map(l => toSongItem(l)));

    // 歌手(首屏 100;前 40 预取详情)
    if (home.artists?.length) {
      const top = home.artists.slice(0, 100);
      const withCover = (a: LibArtist): TreeNode => ({
        mediaId: `ar:${a.id}`,
        title: a.name || '未知歌手',
        subtitle: `${a.songCount} 首`,
        description: `${a.albumCount} 张专辑`,
        browsable: true,
      });
      children.artists = top.map(withCover);
      const details = await Promise.allSettled(top.slice(0, DETAIL_PREFETCH).map(a => myLib.artist(a.id)));
      details.forEach(d => {
        if (d.status === 'fulfilled' && d.value?.songs?.length) {
          children[`ar:${d.value.artist.id}`] = leafList(d.value.songs.map(l => toSongItem(l)));
        }
      });
    }

    // 专辑(newest 截 100;前 40 预取详情)
    if (home.albums?.length) {
      const top = home.albums.slice(0, 100);
      const albNode = (a: LibAlbum): TreeNode => ({
        mediaId: `al:${a.id}`,
        title: a.name || '未知专辑',
        subtitle: a.artist || undefined,
        description: `${a.songCount} 首`,
        browsable: true,
      });
      children.albums = top.map(albNode);
      const details = await Promise.allSettled(top.slice(0, DETAIL_PREFETCH).map(a => myLib.album(a.id)));
      details.forEach(d => {
        if (d.status === 'fulfilled' && d.value?.songs?.length) {
          children[`al:${d.value.album.id}`] = leafList(d.value.songs.map(l => toSongItem(l)));
        }
      });
    }
  }

  // ── 听风用户库(我喜欢的/最近播放/自建歌单;未登录则歌单分类空——规格空态) ──
  const tf = (providers.all() || []).find((a: ProviderAcct) => a.type === 'tingfeng');
  if (tf) {
    const sess: TfSess = { base: tf.base, token: tf.token, refresh: tf.tfRefresh, user: tf.user, pass: tf.pass };
    const lib = await tfUserLib(sess).catch(() => null);
    if (lib) {
      const pl: TreeNode[] = [];
      if (lib.liked?.length) {
        pl.push({ mediaId: 'pl:liked', title: '我喜欢的音乐', subtitle: `${lib.liked.length} 首`, browsable: true });
        children['pl:liked'] = leafList(lib.liked.map(x => tfToSongItem(x as never, tf.id)));
      }
      if (lib.recent?.length) {
        pl.push({ mediaId: 'pl:recent', title: '最近播放', subtitle: `${lib.recent.length} 首`, browsable: true });
        children['pl:recent'] = leafList(lib.recent.map(x => tfToSongItem(x as never, tf.id)));
      }
      (lib.playlists || []).forEach(p => {
        const id = `pl:mine:${p.id}`;
        pl.push({ mediaId: id, title: p.name || '未命名歌单', subtitle: `${p.songs?.length ?? 0} 首`, iconUri: fixCoverUrl(p.coverUrl || p.songs?.[0]?.thumbnail), browsable: true });
        if (p.songs?.length) {
          const queue = p.songs.map(y => tfToSongItem(y as never, tf.id));
          children[id] = leafList(queue);
        }
      });
      children.playlists = pl;
    }
  }

  // root 四分类(顺序=规格:songs/playlists/artists/albums)
  children.root = [
    { mediaId: 'songs', title: '全部歌曲', browsable: true },
    { mediaId: 'playlists', title: '歌单', browsable: true },
    { mediaId: 'artists', title: '歌手', browsable: true },
    { mediaId: 'albums', title: '专辑', browsable: true },
  ];
  return { subtitle, children };
}

let lastPush = 0;
const PUSH_INTERVAL = 10 * 60 * 1000; // 前台节流 10min

/** 构建并推送原生(force=true 跳过节流) */
export async function pushMediaTree(force = false): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const now = Date.now();
  if (!force && now - lastPush < PUSH_INTERVAL) return false;
  try {
    const tree = await buildTree();
    const NMMediaTree = NativeModules.NMMediaTree;
    if (!NMMediaTree?.setMediaLibraryTree) return false;
    await NMMediaTree.setMediaLibraryTree(JSON.stringify(tree));
    lastPush = now;
    return true;
  } catch {
    return false; // 树失败不影响 app 主流程
  }
}

/** 点播请求 → playSong(由 MediaTreeBridge 挂载,queue=父容器上下文) */
export function songOf(mediaId: string): { song: SongItem; queue: SongItem[] } | undefined {
  return songIndex.get(mediaId);
}

export const MEDIA_TREE_PLAY_EVENT = 'NMMediaTreePlay';
