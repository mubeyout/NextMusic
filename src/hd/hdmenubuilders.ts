// v1.2.4 D1(A3):三上下文菜单 builder——歌曲/歌单/专辑
// 三入口(桌面右键/行尾⋯/TV长按)共用;本文件纯数据+回调,无渲染
import type { CtxMenuItem } from './hdctxmenu';
import type { SongItem } from '../services/server';
import { isFav, setFav } from '../state/favorites';
import { library } from '../state/library';
import { sync } from '../services/sync';
import { enqueueDownload, webDownloadToServer, webDownloadLocal, isWebServerMode } from '../services/downloads';
import { toast } from '../components/Dialog';
import { Platform } from 'react-native';
const IS_WEB_L = Platform.OS === 'web';

// v1.2.12(Leo P0-3):平台快捷键分派——nmDesktop 桥(HDMain 同款),非 web 恒 mac 风格无所谓(TV 无菜单快捷键)
const nmIsMac = !IS_WEB_L || String((globalThis as unknown as { nmDesktop?: { platform?: string } }).nmDesktop?.platform || '') === 'darwin';

// v3.32(老板 2026-09-18:web 下载缺选项):web 形态下载二选一动作项(hdActions.menu 形态)
// 缓存到服务器=原链路;下载到本地=服务端同源代理 tag 嵌元数据→浏览器落盘
export function webDownloadActionItems(songs: SongItem[], dirHint = '后台·设置·存储备份可查'): { label: string; icon: string; onPress: () => void }[] {
  const n = songs.length;
  return [
    { label: n > 1 ? `缓存 ${n} 首到服务器` : '缓存到服务器', icon: 'cloud', onPress: async () => {
        try {
          if (n > 1) toast('正在缓存到服务器…');
          const r = await webDownloadToServer(songs);
          toast(r.ok ? `已缓存 ${r.ok} 首到服务器(${dirHint})${r.fail ? ` · 失败 ${r.fail}` : ''}` : '缓存失败:取链失败');
        } catch (e) { toast('缓存失败:' + (e as Error).message); }
      } },
    { label: n > 1 ? `下载 ${n} 首到本地` : '下载到本地', icon: 'download', onPress: async () => {
        try {
          const r = await webDownloadLocal(songs);
          toast(r.ok ? (n > 1 ? `已发起 ${r.ok} 首本地下载,进度见浏览器${r.fail ? ` · 失败 ${r.fail}` : ''}` : '已开始本地下载,进度见浏览器下载栏') : '下载失败:取链失败');
        } catch (e) { toast('下载失败:' + (e as Error).message); }
      } },
  ];
}

interface MenuDeps {
  playSong: (s: SongItem, list?: SongItem[]) => Promise<void>;
  playNextUp: (s: SongItem) => void;
  appendQueue: (s: SongItem[]) => void;
  navigate?: (screen: string, params?: unknown) => void;
  connected: boolean;
  token: string | null;
}

/** A3① 歌曲行菜单(禁用/隐藏规则按交互稿) */
export function songMenu(song: SongItem, list: SongItem[], deps: MenuDeps): CtxMenuItem[] {
  const local = song.source === 'device';
  const inQueue = false; // 队列成员态由调用方查(此处简化:恒可加)

  const noUrl = local === false && !song.songmid; // 无 id 取链必败
  return [
    { key: 'play', label: '播放', shortcut: 'Enter', disabled: noUrl, onPress: () => { deps.playSong(song, list); } },
    { key: 'next', label: '下一首播', shortcut: nmIsMac ? '\u2318\u21B5' : 'Ctrl+\u21B5', disabled: noUrl, onPress: () => { deps.playNextUp(song); toast('下一首将播放'); } }, // v1.2.12:平台分派
    { key: 'queue', label: inQueue ? '已在队列' : '加入队列', disabled: inQueue || noUrl, onPress: () => { deps.appendQueue([song]); toast('已加入队列'); } },
    { key: 'fav', label: isFav(song) ? '取消收藏' : '收藏', onPress: async () => {
      try {
        await setFav(song, !isFav(song),
          deps.connected && deps.token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
          deps.connected && deps.token ? () => sync.fetchLists() : undefined);
        toast(isFav(song) ? '已取消收藏' : '已收藏');
      } catch { toast('操作失败'); }
    } },
    { key: 'addpl', label: '添加到歌单', children: recentPlaylists(song, deps) },
    ...(isWebServerMode()
      ? [
          { key: 'dlsrv', label: '缓存到服务器', disabled: local, onPress: () => { void webDownloadToServer([song]).then(r => toast(r.ok ? '已缓存到服务器(后台·设置·存储备份可查)' : '缓存失败:取链失败')).catch(e => toast('缓存失败:' + (e as Error).message)); } },
          { key: 'dlweb', label: '下载到本地', disabled: local, onPress: () => { void webDownloadLocal([song]).then(r => toast(r.ok ? '已开始本地下载,进度见浏览器下载栏' : '下载失败:取链失败')).catch(e => toast('下载失败:' + (e as Error).message)); } },
        ]
      : [{ key: 'dl', label: '下载', disabled: local, onPress: () => { try { enqueueDownload([song]); toast('已加入下载队列'); } catch { toast('下载失败'); } } }]),
    { key: 'album', label: '查看专辑', hidden: !song.albumId && !song.albumName, onPress: () => deps.navigate?.('BoardsSquare') },
    { key: 'artist', label: '查看歌手', hidden: true, onPress: () => deps.navigate?.('BoardsSquare') }, // SongItem 无 singerId,数据层补齐前隐藏
    { key: 'comments', label: '查看评论', hidden: local, onPress: () => deps.navigate?.('Comments') },
    { key: 'copy', label: '复制链接', hidden: local, onPress: () => {
      const url = `${song.source}://${song.songmid} · ${song.name} - ${song.singer}`;
      try { (globalThis as never as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator?.clipboard?.writeText(url); toast('已复制'); } catch { toast(url); }
    } },
  ];
}

/** 添加到歌单子菜单:本机+服务器歌单前 5 个 */
function recentPlaylists(song: SongItem, deps: MenuDeps): CtxMenuItem[] {
  const locals = library.all().slice(0, 5).map(pl => ({
    label: pl.name,
    onPress: () => {
      const cur = library.get(pl.id);
      library.update(pl.id, { songs: [song, ...(cur?.songs || []).filter((x: SongItem) => !(x.source === song.source && x.songmid === song.songmid))] });
      toast(`已加入「${pl.name}」`);
    },
  }));
  if (locals.length) return locals;
  return [{ label: '暂无歌单', disabled: true }];
}

/** A3② 歌单卡菜单 */
export function playlistMenu(pl: { name: string; songs: SongItem[]; count?: number }, deps: MenuDeps): CtxMenuItem[] {
  const empty = !pl.songs.length;
  return [
    { key: 'playall', label: '播放全部', disabled: empty, onPress: () => { if (pl.songs.length) deps.playSong(pl.songs[0], pl.songs); } },
    { key: 'next', label: '下一首播', disabled: empty, onPress: () => { if (pl.songs.length) { deps.playNextUp(pl.songs[0]); toast('下一首将播放'); } } },
    { key: 'queue', label: `加入队列(${pl.songs.length})`, disabled: empty, onPress: () => { deps.appendQueue(pl.songs); toast(`已加入 ${pl.songs.length} 首`); } },
    ...(isWebServerMode()
      ? webDownloadActionItems(pl.songs, '后台·设置·存储备份可查').map((it, i) => ({ key: i ? 'dlallweb' : 'dlallsrv', label: it.label, disabled: empty, onPress: it.onPress }))
      : [{ key: 'dl', label: '下载全部', disabled: empty, onPress: () => { try { const n = enqueueDownload(pl.songs); toast(n ? `已加入下载队列 ${n} 首` : '均已下载'); } catch { toast('下载失败'); } } }]),
    { key: 'copy', label: '复制链接', onPress: () => { try { (globalThis as never as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator?.clipboard?.writeText(pl.name); toast('已复制歌单名'); } catch { toast(pl.name); } } },
  ];
}

/** A3③ 专辑卡菜单(歌单卡场景按专辑语义复用) */
export const albumMenu = playlistMenu;

/** React 组件内便捷封装:HDSongRow ⋯钮/右键共用 */
export function openSongMenuAt(el: { getBoundingClientRect?: () => { left: number; bottom: number } }, song: SongItem, list: SongItem[], deps: MenuDeps) {
  const r = el.getBoundingClientRect?.() || { left: 0, bottom: 0 };
  (globalThis as never as { __nmCtxMenu?: (x: number, y: number, items: CtxMenuItem[]) => void }).__nmCtxMenu?.(Math.round(r.left), Math.round(r.bottom + 4), songMenu(song, list, deps));
}
