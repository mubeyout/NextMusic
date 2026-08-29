// Player state on top of react-native-audio-pro (New Arch native)
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {} from 'react-native';
import { AudioPro, AudioProContentType, AudioProEventType, AudioProState } from 'react-native-audio-pro';
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { customGetMusicUrl, activeSources } from '../services/customSource';
import { providerApi, providers, PROVIDER_META, type ProviderType } from '../services/providers';
import { downloads as dlStore } from '../services/downloads';
import { settings } from '../services/settings';
import { useApp } from './AppState';
import { pushRecent } from './recent';
import { navRef } from '../navRef';
import { dialog, toast } from '../components/Dialog';
import { dlna, googleCast, airplay, type DlnaDevice, type CastDevice, type AirPlayDevice } from '../services/audioroute';

const modeKv = createMMKV({ id: 'nextmusic-playmode' });
const playbackKv = createMMKV({ id: 'nextmusic-playback' }); // 恢复上次播放状态快照

export interface QueueTrack extends SongItem {
  uid: string; // local uid
}

export type CastKind = 'dlna' | 'cast' | 'airplay';
export type CastSession = { kind: CastKind; dev: DlnaDevice | CastDevice | AirPlayDevice };

interface PlayerCtx {
  queue: QueueTrack[];
  current: QueueTrack | null;
  playing: boolean;
  position: number; // seconds
  duration: number; // seconds
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  setShuffle: (on: boolean) => void;
  cycleRepeat: () => void;
  playSong: (song: SongItem, list?: SongItem[]) => Promise<void>;
  toggle: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  seekTo: (sec: number) => Promise<void>;
  clearQueue: () => void;
  /** 正在投屏的会话（null = 本机播放）：dlna/cast = URL 推流型，airplay = 本机推流型 */
  cast: CastSession | null;
  startCast: (dev: DlnaDevice | CastDevice | AirPlayDevice, kind: CastKind) => void;
  stopCast: () => void;
}

const Ctx = createContext<PlayerCtx>(null as unknown as PlayerCtx);

let seq = 0;
const toTrack = (s: SongItem): QueueTrack => ({ ...s, uid: `${s.source}-${s.songmid}-${++seq}` });

// 第三方媒体库源：播放依赖对应账号连接（emby/jellyfin/subsonic 系/webdav）
const PROVIDER_SOURCES = ['emby', 'jellyfin', 'subsonic', 'navidrome', 'daoliyu', 'webdav'];
const isProviderSource = (s?: { source?: string } | null) => !!s?.source && PROVIDER_SOURCES.includes(s.source);

// 播放回写：songmid = "pid:itemId"，取 pid 对应账号 scrobble；找不到账号（如 webdav）静默跳过
function scrobbleProvider(t: SongItem) {
  try {
    const mid = String(t.songmid ?? '');
    const pid = mid.includes(':') ? mid.split(':')[0] : '';
    const acct = pid ? providers.get(pid) : null;
    if (acct) providerApi.scrobble(acct, mid.slice(pid.length + 1)).catch(() => {});
  } catch { /* 统计失败不影响播放 */ }
}

let configured = false;
export async function setupPlayer() {
  if (configured) return;
  configured = true;
  AudioPro.configure({
    contentType: AudioProContentType.MUSIC,
    progressIntervalMs: 500,
    showNextPrevControls: true,
  });
}

function trackToAudioPro(t: QueueTrack, url: string, headers?: Record<string, string>) {
  return {
    id: t.uid,
    url,
    title: t.name,
    artwork: t.img || '',
    artist: t.singer,
    album: t.albumName || '',
    // stash full song info for later resolution / UI
    songmid: t.songmid,
    source: t.source,
    singer: t.singer,
    _types: t._types,
    interval: t.interval,
    ...(headers ? { headers } : {}),
  };
}
// 注：headers 通过 play(track, {headers}) 传入，track 内仅作存档

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { token } = useApp();
  const tokenRef = useRef(token); tokenRef.current = token;
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [current, setCurrent] = useState<QueueTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffleState] = useState(() => {
    try { return JSON.parse(modeKv.getString('shuffle') || 'false'); } catch { return false; }
  });
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>(() => {
    const v = modeKv.getString('repeat');
    return v === 'all' || v === 'one' ? v : 'off';
  });
  const shuffleRef = useRef(shuffle); shuffleRef.current = shuffle;
  const repeatRef = useRef(repeat); repeatRef.current = repeat;

  // refs so event handlers always see fresh queue without re-subscribing
  const queueRef = useRef<QueueTrack[]>([]);
  const idxRef = useRef(0);
  queueRef.current = queue;
  // 转码重试标记（同一首只降级一次，防止错误循环）；换歌时在 STATE_CHANGED PLAYING 里不清、TRACK_ENDED 推进即可覆盖
  const tcRetryUidRef = useRef<string | null>(null);

  // 投屏状态（lx33 三通道）：castRef 供事件闭包读到最新值；dlna/cast 模式本机 ExoPlayer 暂停挂起，airplay 模式本机继续播（音频被 tap 走）
  const [cast, setCast] = useState<CastSession | null>(null);
  const castRef = useRef<CastSession | null>(null);
  /** 统一播放入口：dlna/cast 投屏中且是可投屏的 http(s) 流 → 推给设备；airplay/否则本机播放 */
  const playOrCast = useCallback((t: QueueTrack, url: string, opts?: { headers: { audio: Record<string, string>; artwork?: Record<string, string> } }) => {
    const cs = castRef.current;
    if (cs?.kind === 'airplay') {
      // AirPlay：本机继续播（DSP 后 PCM 被 tap 推流），换歌无缝
      AudioPro.play(trackToAudioPro(t, url), opts);
      return;
    }
    if (cs && /^https?:\/\//i.test(url)) {
      AudioPro.pause();
      setPosition(0);
      const dev = cs.dev as DlnaDevice & CastDevice;
      const push = cs.kind === 'dlna'
        ? dlna.cast(dev, url, t.name, t.singer || '')
        : googleCast.cast(dev, url, t.name, t.singer || '');
      push
        .then(() => setPlaying(true))
        .catch(() => {
          toast(cs.kind === 'dlna' ? '投屏失败，已回到本机播放' : 'Cast 推送失败，已回本机播放');
          // 防设备残留旧流（串台）：切流失败/断连时先停掉再回本机
          (cs.kind === 'dlna' ? dlna.stop(dev) : googleCast.stop(dev)).catch(() => {});
          castRef.current = null;
          setCast(null);
          AudioPro.play(trackToAudioPro(t, url), opts);
        });
      return;
    }
    if (cs && !/^https?:\/\//i.test(url)) {
      toast('本地文件不支持投屏，已在本机播放');
    }
    AudioPro.play(trackToAudioPro(t, url), opts);
  }, []);

  const resolveAndPlay = useCallback(async (t: QueueTrack) => {
    // 媒体库歌丬断链时的定向引导（不再误导去登录/设音源）
    const providerUnavailable = (song: QueueTrack) => {
      setPlaying(false);
      const label = PROVIDER_META[song.source as ProviderType]?.label.split(' / ')[0] ?? '媒体库';
      dialog.alert(
        '歌曲暂不可用',
        `这首歌来自「${label}」媒体库，连接已删除或失效。\n重新连接同一服务器即可恢复播放；已下载的文件不受影响。`,
        [
          { text: '取消', style: 'cancel' },
          { text: '在线播放', onPress: () => { playOnlineFallback(song).catch(() => {}); } },
          { text: '重新连接', onPress: () => navRef.current?.navigate('MediaLibs' as never) },
        ],
      );
    };
    // 在线兕底：同名同歌手去在线音源（kw）搜一条直接替换当前队列位播放
    const playOnlineFallback = async (song: QueueTrack) => {
      try {
        const kw = `${song.name} ${song.singer || ''}`.trim();
        const list = await lxapi.search(kw, 'kw', 1, 10);
        const hit = list?.[0];
        if (!hit) { toast('在线音源没有找到这首歌'); return; }
        const replaced = toTrack(hit);
        const q = [...queueRef.current];
        if (q.length) q[idxRef.current] = replaced;
        queueRef.current = q.length ? q : [replaced];
        setQueue(queueRef.current);
        idxRef.current = q.length ? idxRef.current : 0;
        toast(`已切换在线播放：${hit.name} - ${hit.singer}`);
        await resolveAndPlay(queueRef.current[idxRef.current]);
      } catch { toast('在线搜索失败，请检查网络'); }
    };
    try {
      // ① 设备本地文件：直接播（file:// 路径或 content:// uri）
      if (t.source === 'device') {
        const url = t.songmid.startsWith('content://') ? t.songmid : 'file://' + t.songmid;
        playOrCast(t, url);
        setCurrent(t);
        return;
      }
      // ② 已下载：离线播放本地文件（媒体库歌离线播也回写服务器统计——听过了就算数）
      const dlPath = dlStore.pathFor(t);
      if (dlPath) {
        playOrCast(t, dlPath);
        setCurrent(t);
        if (isProviderSource(t)) scrobbleProvider(t);
        return;
      }
      // ③ 媒体库源（emby/jellyfin/subsonic/webdav）：直接出流地址 + 鉴权头
      if (isProviderSource(t)) {
        const p = providerApi.streamFor(t);
        if (!p?.url) { providerUnavailable(t); return; }
        // audio-pro 原生层期待 headers: { audio, artwork } 嵌套结构（Controller.extractHeaders）
        const opts = p.headers ? { headers: { audio: p.headers, artwork: p.headers } } : undefined;
        playOrCast(t, p.url, opts);
        setCurrent(t);
        scrobbleProvider(t); // 播放统计回写服务器（fire-and-forget）
        return;
      }
      const token = tokenRef.current;
      // 同步歌单里的无 id 脏数据（服务器侧元数据缺失）：songmid 为空时取链必败——直接按歌名在线兜底，不发垃圾请求
      if (!String(t.songmid ?? '').trim() && !isProviderSource(t)) {
        toast('该歌曲缺少 ID，自动在线匹配同名歌曲…');
        await playOnlineFallback(t);
        return;
      }
      // 播放门槛：登录服务器 或 已启用自定义音源（对齐 lx-music：浏览免费，播放需其一）
      if (!token && activeSources().length === 0) {
        setPlaying(false);
        dialog.alert(
          '无法播放',
          '播放需要登录服务器，或添加自定义音源。浏览和搜索始终免费。',
          [
            { text: '添加音源', onPress: () => navRef.current?.navigate('Sources' as never) },
            { text: '去登录', onPress: () => navRef.current?.navigate('AuthLogin' as never) },
            { text: '取消', style: 'cancel' },
          ],
        );
        return;
      }
      const quality = pickQuality(t);
      // 1) 自定义音源（免登录）
      let url: string | null = null;
      try { url = await customGetMusicUrl(t, quality); } catch { url = null; }
      // 2) 登录态：服务器端取链
      if (!url && token) {
        try { url = (await api.musicUrl(t, quality)).url || null; } catch { url = null; }
      }
      if (!url) throw new Error('no url');
      playOrCast(t, url);
      setCurrent(t);
    } catch (e) {
      setPlaying(false);
      // 媒体库歌丬的失败统一走定向引导，不再误导去登录/设音源
      if (isProviderSource(t)) { providerUnavailable(t); return; }
      // 取链失败：已登录 → 问题在服务器侧音源；未登录 → 引导登录/设源（产品语义：只有播放才需要这些）
      // 注意：用 tokenRef.current——catch 里闭包捕获的是 useCallback([]) 创建时的组件 token（陈旧值，首渲染为 null）
      if (tokenRef.current) {
        dialog.alert(
          '暂时无法播放',
          '服务器取链失败。可在服务器端绑定可用音源，或在 App 内添加自定义音源后重试。',
          [
            { text: '重试', onPress: () => { resolveAndPlay(t).catch(() => setPlaying(false)); } },
            { text: '设置音源', onPress: () => navRef.current?.navigate('Sources' as never) },
            { text: '取消', style: 'cancel' },
          ],
        );
      } else {
        dialog.alert(
          '暂时无法播放',
          '该歌曲取链失败，可能需要登录或更换音源。',
          [
            { text: '去登录', onPress: () => navRef.current?.navigate('AuthLogin' as never) },
            { text: '设置音源', onPress: () => navRef.current?.navigate('Sources' as never) },
            { text: '取消', style: 'cancel' },
          ],
        );
      }
    }
  }, []);

  const goTo = useCallback((i: number, autoplay = true) => {
    const q = queueRef.current;
    if (!q.length) return;
    const idx = ((i % q.length) + q.length) % q.length;
    idxRef.current = idx;
    if (autoplay) {
      resolveAndPlay(q[idx]).catch(() => setPlaying(false));
    } else {
      setCurrent(q[idx]);
    }
  }, [resolveAndPlay]);

  const playSong = useCallback(async (song: SongItem, list?: SongItem[]) => {
    const items = (list && list.length ? list : [song]).map(toTrack);
    const idx = Math.max(0, items.findIndex(t => t.songmid === song.songmid && t.source === song.source));
    queueRef.current = items;
    idxRef.current = idx;
    tcRetryUidRef.current = null; // 主动点播重置转码降级标记
    setQueue(items);
    pushRecent(song);
    await resolveAndPlay(items[idx]);
  }, [resolveAndPlay]);

  // Global event wiring
  useEffect(() => {
    const sub = AudioPro.addEventListener(ev => {
      switch (ev.type) {
        case AudioProEventType.STATE_CHANGED:
          setPlaying(ev.payload?.state === AudioProState.PLAYING);
          break;
        case AudioProEventType.PROGRESS: {
          const p = ev.payload?.position ?? 0;
          const d = ev.payload?.duration ?? 0;
          setPosition(p / 1000);
          if (d > 0) setDuration(d / 1000);
          break;
        }
        case AudioProEventType.TRACK_ENDED:
          if (repeatRef.current === 'one') { AudioPro.seekTo(0); AudioPro.resume(); }
          else if (shuffleRef.current) goTo(Math.floor(Math.random() * Math.max(1, queueRef.current.length)));
          else if (repeatRef.current === 'all' || idxRef.current < queueRef.current.length - 1) goTo(idxRef.current + 1);
          else setPlaying(false);
          break;
        case AudioProEventType.REMOTE_NEXT:
          goTo(idxRef.current + 1);
          break;
        case AudioProEventType.REMOTE_PREV:
          goTo(idxRef.current - 1);
          break;
        case AudioProEventType.PLAYBACK_ERROR: {
          setPlaying(false);
          const t = queueRef.current[idxRef.current];
          // 媒体库歌：直流失败自动降级转码流重试一次（外网/弱网下无损直流常握不住，服务端转 mp3 更稳）
          if (t && isProviderSource(t) && tcRetryUidRef.current !== t.uid) {
            const tc = providerApi.transcodeFor(t);
            if (tc?.url) {
              tcRetryUidRef.current = t.uid;
              toast('直播流失败，切换转码流重试…');
              const opts = tc.headers ? { headers: { audio: tc.headers, artwork: tc.headers } } : undefined;
              playOrCast(t, tc.url, opts);
              break;
            }
          }
          // 解析成功但播放失败：按源区分原因，不让用户猜
          toast(isProviderSource(t)
            ? '播放失败：媒体库可能已断开或网络不可达'
            : '播放失败：音源链接不可用，可重试或更换音源');
          break;
        }
      }
    });
    return () => sub.remove();
  }, [goTo]);

  const setShuffle = useCallback((on: boolean) => {
    setShuffleState(on);
    modeKv.set('shuffle', JSON.stringify(on));
  }, []);
  const cycleRepeat = useCallback(() => {
    setRepeat(r => {
      const next = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
      modeKv.set('repeat', next);
      return next;
    });
  }, []);

  const toggle = useCallback(async () => {
    // dlna/cast 投屏中：控制远端设备；airplay 投屏中：本机播放键即设备播放键（音频由本机推）
    if (castRef.current && castRef.current.kind !== 'airplay') {
      const cs = castRef.current;
      const api = cs.kind === 'dlna' ? dlna : googleCast;
      try {
        const p = await api.getPosition(cs.dev as never);
        if (p.state === 'PLAYING' || p.state === 'BUFFERING') { await api.pause(cs.dev as never); setPlaying(false); }
        else { await api.play(cs.dev as never); setPlaying(true); }
      } catch { toast('投屏设备无响应'); }
      return;
    }
    const st = AudioPro.getState();
    if (st === AudioProState.PLAYING) AudioPro.pause();
    else if (st === AudioProState.PAUSED) AudioPro.resume();
    else {
      // ERROR/IDLE（如媒体库歌取流失败后）：重新取流播当前曲，否则播放键变死键
      const t = queueRef.current[idxRef.current];
      if (t) resolveAndPlay(t).catch(() => setPlaying(false));
    }
  }, [resolveAndPlay]);

  const skipNext = useCallback(async () => { goTo(idxRef.current + 1); }, [goTo]);
  const skipPrev = useCallback(async () => {
    if (position > 3) { AudioPro.seekTo(0); setPosition(0); return; }
    goTo(idxRef.current - 1);
  }, [goTo, position]);
  const seekTo = useCallback(async (sec: number) => {
    const cs = castRef.current;
    if (cs && cs.kind !== 'airplay') {
      setPosition(sec);
      (cs.kind === 'dlna' ? dlna : googleCast).seek(cs.dev as never, sec).catch(() => toast('投屏设备不支持进度调整'));
      return;
    }
    AudioPro.seekTo(Math.round(sec * 1000));
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    idxRef.current = 0;
    setQueue([]);
    playbackKv.set('snapshot', '');
  }, []);

  // —— 恢复上次播放状态（基本设置 → 启动 → 恢复上次播放状态）——
  // 持久化：队列/当前曲/索引在变化时节流写入（不含进度，恢复后从 0 开始，避免取链/版权失效时卡启动）
  const persistSnapshot = useRef<number>(0);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (queue.length && current) {
          playbackKv.set('snapshot', JSON.stringify({ q: queue.slice(0, 200), i: idxRef.current }));
        } else playbackKv.set('snapshot', '');
      } catch { /* 超大队列放弃快照 */ }
    }, 1500);
    persistSnapshot.current = Date.now();
    return () => clearTimeout(t);
  }, [queue, current]);
  // 恢复：挂载时一次性（只恢复队列与当前曲为暂停态，不自动取链播放）
  useEffect(() => {
    if (!settings.get().restorePlayback) return;
    try {
      const snap = JSON.parse(playbackKv.getString('snapshot') || 'null') as { q?: QueueTrack[]; i?: number } | null;
      if (snap?.q?.length) {
        queueRef.current = snap.q;
        setQueue(snap.q);
        idxRef.current = Math.min(Math.max(0, snap.i || 0), snap.q.length - 1);
        setCurrent(snap.q[idxRef.current]);
      }
    } catch { /* 坏快照忽略 */ }
  }, []);

  // —— 投屏控制（dlna / cast / airplay 三通道）——
  const startCast = useCallback((dev: DlnaDevice | CastDevice | AirPlayDevice, kind: CastKind) => {
    if (kind === 'airplay') {
      airplay.start(dev as AirPlayDevice)
        .then(() => {
          castRef.current = { kind, dev };
          setCast({ kind, dev });
          // 本机未在播则从当前曲起播（tap 会把声音引到 AirPlay 设备）
          if (AudioPro.getState() !== AudioProState.PLAYING) {
            const t = queueRef.current[idxRef.current];
            if (t) resolveAndPlay(t).catch(() => setPlaying(false));
          }
        })
        .catch(() => toast('AirPlay 连接失败（设备可能要求配对/加密）'));
      return;
    }
    castRef.current = { kind, dev };
    setCast({ kind, dev });
    const t = queueRef.current[idxRef.current];
    if (t) {
      AudioPro.pause();
      resolveAndPlay(t).catch(() => setPlaying(false));
    }
  }, [resolveAndPlay]);

  const stopCast = useCallback(() => {
    const cs = castRef.current;
    castRef.current = null;
    setCast(null);
    if (!cs) return;
    if (cs.kind === 'airplay') {
      airplay.stop().catch(() => {}); // 本机一直在播，停 tap 后声音自然回扬声器
      return;
    }
    (cs.kind === 'dlna' ? dlna : googleCast).stop(cs.dev as never).catch(() => {});
    // 本机续播：从投屏进度回接（本地轨还在 ExoPlayer 里挂着）
    if (queueRef.current.length && AudioPro.getState() === AudioProState.PAUSED) {
      AudioPro.seekTo(Math.round(position * 1000));
      AudioPro.resume();
    }
  }, [position]);

  // 设备主动断连（cast.lost / airplay.lost）：回本机续播 + 提示
  useEffect(() => {
    const a = googleCast.onLost(() => {
      if (castRef.current?.kind !== 'cast') return;
      castRef.current = null;
      setCast(null);
      toast('Cast 设备已断开，回本机播放');
      const t = queueRef.current[idxRef.current];
      if (t) resolveAndPlay(t).catch(() => setPlaying(false));
    });
    const b = airplay.onLost(() => {
      if (castRef.current?.kind !== 'airplay') return;
      castRef.current = null;
      setCast(null);
      toast('AirPlay 已断开，回本机播放');
    });
    return () => { a?.remove(); b?.remove(); };
  }, [resolveAndPlay]);

  // 投屏轮询（dlna/cast）：同步进度/播放态；播完自动推进队列（airplay 走本机 PROGRESS 事件，不轮询）
  useEffect(() => {
    if (!cast || cast.kind === 'airplay') return;
    const api = cast.kind === 'dlna' ? dlna : googleCast;
    let alive = true;
    const iv = setInterval(async () => {
      if (!alive || !castRef.current) return;
      try {
        const p = await api.getPosition(castRef.current.dev as never);
        if (!castRef.current || !alive) return;
        setPosition(p.pos);
        if (p.dur > 0) setDuration(p.dur);
        setPlaying(p.state === 'PLAYING' || p.state === 'BUFFERING');
        if (p.dur > 0 && p.state === 'IDLE' && p.pos >= p.dur - 3) {
          if (repeatRef.current === 'one') {
            api.seek(castRef.current.dev as never, 0).then(() => api.play(castRef.current!.dev as never)).catch(() => {});
          } else if (shuffleRef.current) {
            goTo(Math.floor(Math.random() * Math.max(1, queueRef.current.length)));
          } else if (repeatRef.current === 'all' || idxRef.current < queueRef.current.length - 1) {
            goTo(idxRef.current + 1);
          } else {
            setPlaying(false);
          }
        }
      } catch { /* 单次轮询失败静默，下轮重试 */ }
    }, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, [cast, goTo]);

  return (
    <Ctx.Provider value={{ queue, current, playing, position, duration, shuffle, repeat, setShuffle, cycleRepeat, playSong, toggle, skipNext, skipPrev, seekTo, clearQueue, cast, startCast, stopCast }}>
      {children}
    </Ctx.Provider>
  );
}

function pickQuality(s: SongItem): string {
  const want = settings.get().playQuality;
  if (want === 'flac') {
    if (s._types?.flac) return 'flac';
    if (s._types?.['320k']) return '320k';
    if (s._types) return '128k'; // 源未提供类型标记时按默认音质请求
    return 'flac';
  }
  if (want === '320k') {
    if (s._types?.['320k']) return '320k';
    if (s._types?.flac) return 'flac'; // 无 320k 有无损 → 取无损
    return '320k';
  }
  return '128k';
}

export function parseInterval(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.split(':');
  if (m.length === 2) return (+m[0]) * 60 + (+m[1]);
  return undefined;
}

export const usePlayer = () => useContext(Ctx);
