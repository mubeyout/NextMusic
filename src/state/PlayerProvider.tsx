// Player state on top of react-native-audio-pro (New Arch native)
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { NativeModules, AppState , Platform } from 'react-native';
import { AudioPro, AudioProContentType, AudioProEventType, AudioProState } from 'react-native-audio-pro';
import { library } from './library';
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { api, store as httpStore } from '../services/server';
import { lxapi } from '../services/lxapi';
import { customGetMusicUrl, activeSources } from '../services/customSource';
import { providerApi, providers, PROVIDER_META, type ProviderType } from '../services/providers';
import { downloads as dlStore } from '../services/downloads';
import { settings } from '../services/settings';
import { useApp } from './AppState';
import { pushRecent } from './recent';
import { sync, appToLx, lxToApp } from '../services/sync'; // lx163:播放列表同步(defaultList)
import { TF_SOURCE, tfSongUrl, tfNoteRecent } from '../services/tingfeng'; // 听风音乐(RoCeOS)取链+最近播放同步
import { navRef } from '../navRef';
import { dialog, toast } from '../components/Dialog';
import { dlna, googleCast, airplay, audioRoute, type DlnaDevice, type CastDevice, type AirPlayDevice } from '../services/audioroute';

// 投屏 api 统一选择器(09-14 加 airplay)
function castApiOf(kind: CastKind) { return kind === 'dlna' ? dlna : kind === 'cast' ? googleCast : airplay; }

const modeKv = createMMKV({ id: 'nextmusic-playmode' });
const playbackKv = createMMKV({ id: 'nextmusic-playback' }); // 恢复上次播放状态快照
const castKv = createMMKV({ id: 'nextmusic-cast' }); // lx39: 投屏会话持久化（JS 重建后恢复投屏态）

// 原生真状态桥（[NextMusic-FX:state-bridge]）：JS 重建后 lib internalStore 归零，需以进程级原生状态为准
const NativeAudioPro = NativeModules.AudioPro as {
  getNativeState?: () => Promise<{ state: string; trackId?: string; trackTitle?: string; trackArtist?: string }>;
} | undefined;

export interface QueueTrack extends SongItem {
  uid: string; // local uid
}

export type CastKind = 'dlna' | 'cast' | 'airplay';
export type CastSession = { kind: CastKind; dev: DlnaDevice | CastDevice };

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
  /** 正在投屏的会话（null = 本机播放）：dlna/cast = URL 推流型 */
  cast: CastSession | null;
  startCast: (dev: DlnaDevice | CastDevice | AirPlayDevice, kind: CastKind) => void;
  stopCast: () => void;
  /** lx43：切换本机输出设备后重建音频管线（setPreferredDevice 需 track 重建才生效） */
  rebuildAudio: () => void;
  /** v1.2.4 D1:追加队列尾(不动当前播放) */
  appendQueue: (songs: SongItem[]) => void;
  /** v1.2.4 D1:插到当前曲之后(下一首播) */
  playNextUp: (song: SongItem) => void;
  /** web 播放器功能对齐:队列排序(拖拽/上下移) */
  reorderQueue: (from: number, to: number) => void;
  /** web 播放器功能对齐:倍速(0.25-2.0) */
  speed: number;
  setSpeed: (v: number) => void;
  /** web 播放器功能对齐:睡眠定时(剩余秒;null=未启用) */
  sleepRemain: number | null;
  enableSleep: (minutes: number | null) => void;
}

const Ctx = createContext<PlayerCtx>(null as unknown as PlayerCtx);

let seq = 0;
// 取链失败熔断: 连续 failCount 次失败后不再弹窗/自动跳,需用户主动重试(防队列循环弹窗轰炸)
let failStreak = 0;
const FAIL_FUSE = 3;
let errDialogOpen = false;

const toTrack = (s: SongItem): QueueTrack => ({ ...s, uid: `${s.source}-${s.songmid}-${++seq}` });

// 第三方媒体库源：播放依赖对应账号连接（emby/jellyfin/subsonic 系/webdav + v2 五协议）
const PROVIDER_SOURCES = ['emby', 'jellyfin', 'subsonic', 'navidrome', 'daoliyu', 'webdav', 'plex', 'audiobookshelf', 'audiostation', 'mstream', 'songloft', 'feiniu'];
const isProviderSource = (s?: { source?: string } | null) => !!s?.source && PROVIDER_SOURCES.includes(s.source);

// 播放回写：songmid = "pid:itemId"，取 pid 对应账号 scrobble；找不到账号（如 webdav）静默跳过
// Plex 例外：songmid 存的是流 part key，scrobble 要 ratingKey（映射时存在扩展字段 pk）
function scrobbleProvider(t: SongItem) {
  try {
    const mid = String(t.songmid ?? '');
    const pid = mid.includes(':') ? mid.split(':')[0] : '';
    const acct = pid ? providers.get(pid) : null;
    if (!acct) return;
    const key = acct.type === 'plex' ? String((t as SongItem & { pk?: string }).pk || mid.slice(pid.length + 1)) : mid.slice(pid.length + 1);
    providerApi.scrobble(acct, key).catch(() => {});
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
  const { token , connected } = useApp();
  // lx124:一次性清扫"我喜欢的"空壳歌单(setFav 旧版取消收藏也会空建)
  React.useEffect(() => {
    try { library.all().forEach(p => { if (p.name === '我喜欢的' && !(p.songs || []).length) library.remove(p.id); }); } catch { /* ignore */ }
  }, []);

  // lx107:本机歌单自动同步(老板:同步是自动的,不要手动选项)——登录后 library 变更去抖镜像上传
  React.useEffect(() => {
    if (!connected || !token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mirror = async () => {
      try {
        // lx118:本地镜像仅覆盖"本地独有"歌单——与服务器歌单同名的跳过
        // (否则服务器侧删歌/改名会被本地同名整单覆盖=移除后复活的根因)
        const snap = await sync.fetchLists();
        if (!snap) return;
        const serverNames = new Set((snap.userList || []).map(u => u.name));
        const pls = library.all()
          .filter(p => p.name !== '我喜欢的' && p.songs && p.songs.length && !serverNames.has(p.name))
          .map(p => ({ name: p.name, songs: p.songs as SongItem[] }));
        if (pls.length) await sync.mirrorLibrary(pls);
      } catch { /* 网络失败等下轮变更再试 */ }
    };
    const unsub = library.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(mirror, 2500);
    });
    timer = setTimeout(mirror, 3000); // 登录即首轮
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const tokenRef = useRef(token); tokenRef.current = token;
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const queuePushTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // lx163:队列推送节流
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

  // 投屏状态（lx33 双通道）：castRef 供事件闭包读到最新值；dlna/cast 模式本机 ExoPlayer 暂停挂起
  // lx39：会话同步持久化到 castKv——JS 重建（Activity 回收）后 revive 恢复投屏态，不再失联
  const [cast, setCast] = useState<CastSession | null>(null);
  const castRef = useRef<CastSession | null>(null);
  const persistCast = useCallback((s: CastSession | null) => {
    try { castKv.set('session', s ? JSON.stringify({ ...s, savedAt: Date.now() }) : ''); } catch { /* ignore */ }
  }, []);
  const activateCast = useCallback((s: CastSession) => {
    castRef.current = s;
    setCast(s);
    persistCast(s);
  }, [persistCast]);
  const deactivateCast = useCallback(() => {
    castRef.current = null;
    setCast(null);
    persistCast(null);
  }, [persistCast]);

  // ---------- vc78：Emby/JF 播放统计会话上报（开始/每 10s 进度/停止） ----------
  const repRef = useRef<{ acct: NonNullable<ReturnType<typeof providers.get>>; itemId: string; psid: string } | null>(null);
  const repTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repPosRef = useRef(0); repPosRef.current = position;
  // 冷启动恢复的续播回跳点（>2 生效一次后清零）：首次真正开始播时回跳到保存进度（桌面重开不丢进度）
  const resumeSeekRef = useRef(0);
  const repPlayingRef = useRef(false); repPlayingRef.current = playing;
  const stopReport = useCallback(() => {
    if (repTimerRef.current) { clearInterval(repTimerRef.current); repTimerRef.current = null; }
    const r = repRef.current;
    repRef.current = null;
    if (r) providerApi.reportPlayback(r.acct, r.itemId, 'stop', repPosRef.current, r.psid).catch(() => {});
  }, []);
  const startReport = useCallback((t: SongItem) => {
    stopReport();
    try {
      const mid = String(t.songmid ?? '');
      const pid = mid.includes(':') ? mid.split(':')[0] : '';
      const acct = pid ? providers.get(pid) : null;
      if (!acct) return;
      const itemId = mid.slice(pid.length + 1);
      const psid = 'nm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      repRef.current = { acct, itemId, psid };
      providerApi.reportPlayback(acct, itemId, 'start', 0, psid).catch(() => {});
      repTimerRef.current = setInterval(() => {
        if (!repPlayingRef.current) return; // 暂停中不上报进度（位置不动）
        const r = repRef.current;
        if (r) providerApi.reportPlayback(r.acct, r.itemId, 'progress', repPosRef.current, r.psid).catch(() => {});
      }, 10000);
    } catch { /* ignore */ }
  }, [stopReport]);
  useEffect(() => () => { if (repTimerRef.current) clearInterval(repTimerRef.current); }, []);

  // ---------- vc78：投屏中音量键转发（系统音量 delta → 投屏设备音量） ----------
  // 投屏中本机不出声，按音量键只改系统音量无效果——把变化量转给投屏设备
  const lastSysVol = useRef<number | null>(null);
  const castVolMem = useRef(50);
  useEffect(() => {
    const sub = audioRoute.onVolumeChange(v => {
      const prev = lastSysVol.current;
      lastSysVol.current = v;
      const cs = castRef.current;
      if (!cs || prev === null || v === prev) return;
      castVolMem.current = Math.max(0, Math.min(100, castVolMem.current + (v - prev)));
      castApiOf(cs.kind).setVolume(cs.dev as never, castVolMem.current).catch(() => {});
    });
    return () => { sub?.remove(); };
  }, []);
  /** 统一播放入口：dlna/cast 投屏中且是可投屏的 http(s) 流 → 推给设备；否则本机播放 */
  // lx43：记录最近一次本机播放上下文（设备切换后无感重建用）
  const lastLocalPlayRef = useRef<{ t: QueueTrack; url: string; opts?: { headers: { audio: Record<string, string>; artwork?: Record<string, string> } } } | null>(null);
  const playOrCast = useCallback((t: QueueTrack, url: string, opts?: { headers: { audio: Record<string, string>; artwork?: Record<string, string> } }) => {
    const cs = castRef.current;
    if (cs && /^https?:\/\//i.test(url)) {
      AudioPro.pause();
      setPosition(0);
      const dev = cs.dev as DlnaDevice & CastDevice;
      const push = castApiOf(cs.kind).cast(dev as never, url, t.name, t.singer || '');
      push
        .then(() => setPlaying(true))
        .catch(() => {
          toast(cs.kind === 'cast' ? 'Cast 推送失败，已回本机播放' : cs.kind === 'airplay' ? 'AirPlay 推送失败，已回本机播放' : '投屏失败，已回到本机播放');
          // 防设备残留旧流（串台）：切流失败/断连时先停掉再回本机
          castApiOf(cs.kind).stop(dev).catch(() => {});
          deactivateCast();
          AudioPro.play(trackToAudioPro(t, url), opts);
        });
      return;
    }
    if (cs && !/^https?:\/\//i.test(url)) {
      toast('本地文件不支持投屏，已在本机播放');
    }
    lastLocalPlayRef.current = { t, url, opts };
    AudioPro.play(trackToAudioPro(t, url), opts);
  }, []);

  /** lx43：设备切换后无感重建音频管线——DefaultAudioSink.setPreferredDevice 只在
   *  下一次 AudioTrack 创建时生效，播放中切换（如蓝牙→本机）声音会停在原设备。
   *  姿势：AudioPro.play 同 URL 重载（原生完整 load，track 重建），进度用原生
   *  startTimeMs 回跳（JS 侧零竞态——曾用 stop/play 双杀 MediaSession、PLAYING
   *  监听 seek 被冷启动 10s+ 吞，均实测淘汰） */
  const rebuildAudio = useCallback(() => {
    const lp = lastLocalPlayRef.current;
    if (!lp) return;
    const st = AudioPro.getState();
    if (st !== AudioProState.PLAYING && st !== AudioProState.PAUSED && st !== AudioProState.LOADING) return;
    let pos = 0;
    try { pos = Math.max(0, Math.floor(AudioPro.getTimings()?.position ?? 0)); } catch { /* ignore */ }
    const wasPlaying = st === AudioProState.PLAYING;
    AudioPro.play(trackToAudioPro(lp.t, lp.url), { ...lp.opts, startTimeMs: pos, autoPlay: wasPlaying });
  }, []);

  // 1.0.5：系统抢路由兜底（一加 ColorOS 实证：二路 A2DP 上线后 ~8s，MDM CREATE_AUDIO_PATCH 无视 App 偏好
  // 抢走媒体输出；setPreferredDevice 只能重放存量 track，赢不了 MDM patch）。原生哨兵连续两次比对
  // preferred vs 实际路由不符后通知这里 rebuildAudio（新 AudioTrack 初始化时自动重放存储的偏好）。
  // 防抖 5s + 120s 窗口最多 3 次：MDM 若反复抢不至于把音乐重启成抽风；投屏中本机挂起，跳过。
  const routeStealRef = useRef({ last: 0, attempts: [] as number[] });
  useEffect(() => {
    const sub = audioRoute.onRouteStolen(() => {
      if (castRef.current) return; // 投屏中：本机 ExoPlayer 挂起，无需重建
      const now = Date.now();
      const rs = routeStealRef.current;
      rs.attempts = rs.attempts.filter((t) => now - t < 120_000);
      if (rs.attempts.length >= 3 || now - rs.last < 5_000) return;
      rs.last = now;
      rs.attempts.push(now);
      rebuildAudio();
    });
    return () => sub?.remove();
  }, [rebuildAudio]);

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
        if (isProviderSource(t)) { scrobbleProvider(t); startReport(t); }
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
        startReport(t); // vc78：Emby/JF 会话上报（后台统计）
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
      // web 服务端部署形态豁免：服务器公共源匿名可取链（对齐原版 v2 播放器行为）
      const webSrv = Platform.OS === 'web' && typeof navigator !== 'undefined' && !/electron/i.test(navigator.userAgent);
      if (!token && activeSources().length === 0 && !webSrv) {
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
      // 0) 听风音乐(RoCeOS Tingfeng):song/{id} 直链 mp3(含 LRC,回填曲目)——独立服务,不走 lxserver 取链
      if (t.source === TF_SOURCE) {
        try {
          const r = await tfSongUrl(t);
          if (r.url) {
            if (r.lrc && !t.lrc) t.lrc = r.lrc;
            if (r.img && !t.img) t.img = r.img;
            playOrCast(t, r.url);
            setCurrent(t);
            void tfNoteRecent(t); // 写回听风「最近播放」（fire-and-forget）
            failStreak = 0;
            return;
          }
        } catch { /* 落到失败/换源流程 */ }
      }
      // web 服务端部署形态:直接走服务器取链(登录带 token,匿名亦可——公共源服务器端执行,无 CORS)
      const webSrvMode = Platform.OS === 'web' && typeof navigator !== 'undefined' && !/electron/i.test(navigator.userAgent);
      // 1) 自定义音源（免登录,Electron/原生本地引擎）
      let url: string | null = null;
      if (!webSrvMode) {
        try { url = await customGetMusicUrl(t, quality); } catch { url = null; }
      }
      // 1.5) 服务器缓存优先(原版 preferServerCache 语义): web 部署形态播放前查服务器缓存,命中直接播缓存文件(零取链零流量)
      if (!url && webSrvMode) {
        try {
          const st0 = settings.get();
          if (st0.preferServerCache !== false) {
            const q = `?name=${encodeURIComponent(t.name || '')}&singer=${encodeURIComponent(t.singer || '')}&source=${encodeURIComponent(t.source)}&songmid=${encodeURIComponent(String(t.songmid ?? ''))}&quality=${quality}`;
            const c = await (await fetch('/api/music/cache/check' + q)).json();
            if (c && c.exists && !c.isCollision && c.url) {
              playOrCast(t, c.url);
              setCurrent(t);
              failStreak = 0;
              return; // 缓存直出
            }
          }
        } catch { /* 缓存检查失败回退取链 */ }
      }
      // 1.8) 链接缓存(原版 enableSongUrlCache): localStorage 存取链结果,TTL 内直接复用
      const lcKey = `nm-urlc:${t.source}:${t.songmid}:${quality}`;
      if (!url) {
        const stlc = settings.get();
        if (stlc.enableSongUrlCache !== false) {
          try {
            const raw = localStorage.getItem(lcKey);
            if (raw) {
              const c = JSON.parse(raw);
              if (Date.now() - c.at < 30 * 60_000) { // 30 分钟 TTL(外链临时有效)
                playOrCast(t, c.url);
                setCurrent(t);
                failStreak = 0;
                return;
              }
              localStorage.removeItem(lcKey);
            }
          } catch { /* ignore */ }
        }
      }
      // 2) 服务器端取链（web 部署恒走;其余需登录态;自动降质:失败时高音质→128k 再试一次）
      if (!url && (webSrvMode || token)) {
        try { url = (await api.musicUrl(t, quality)).url || null; } catch { url = null; }
        if (!url && quality !== '128k' && settings.get().enableAutoDegradeQuality !== false) {
          try { url = (await api.musicUrl(t, '128k')).url || null; } catch { url = null; }
        }
        // 自动换源(原版 enableAutoSwitchSource): 当前源取链失败 → kw 在线搜同名替换播放
        if (!url && settings.get().enableAutoSwitchSource !== false && t.source !== 'kw') {
          try {
            const hits = await api.search(`${t.name} ${t.singer || ''}`.trim(), 'kw');
            const hit = hits?.[0];
            if (hit && String(hit.songmid) !== String(t.songmid)) {
              const hu = (await api.musicUrl(hit, quality)).url;
              if (hu) {
                toast(`已自动换源播放:${hit.name} - ${hit.singer}(kw)`);
                const replaced = toTrack(hit);
                const q = [...queueRef.current];
                if (q.length) q[idxRef.current] = replaced;
                queueRef.current = q.length ? q : [replaced];
                setQueue(queueRef.current);
                idxRef.current = q.length ? idxRef.current : 0;
                playOrCast(replaced, hu);
                setCurrent(replaced);
                failStreak = 0;
                return;
              }
            }
          } catch { /* 换源失败继续走失败流程 */ }
        }
        // 回退: 服务器无该源时再试本地引擎(Electron/原生)
        if (!url && !webSrvMode) {
          try { url = await customGetMusicUrl(t, quality); } catch { url = null; }
        }
        // 取链成功写链接缓存
        if (url) {
          const stlc2 = settings.get();
          if (stlc2.enableSongUrlCache !== false) {
            try { localStorage.setItem(lcKey, JSON.stringify({ url, at: Date.now() })); } catch { /* ignore */ }
          }
        }
      }
      if (!url) {
        // v2 对齐:失败自动下一曲(防卡死)
        const st = settings.get();
        failStreak++;
        if (st.enableAutoSkipOnError && queueRef.current.length > 1 && failStreak < FAIL_FUSE) { setTimeout(() => { goTo(idxRef.current + 1); }, 300); }
        throw new Error('no url');
      }
      // v2 对齐:播放成功后缓存歌曲到服务器(后台,不打扰播放)
      try {
        const st2 = settings.get();
        if (st2.enableServerCache && tokenRef.current && !isProviderSource(t)) {
          api.cacheDownload(t, url, quality).catch(() => {});
        }
      } catch { /* 缓存失败不影响播放 */ }
      playOrCast(t, url);
      setCurrent(t);
      failStreak = 0; // 播放成功重置熔断
      setTimeout(() => preloadNext(), 2000); // 预读下一首(不阻塞播放)
    } catch (e) {
      setPlaying(false);
      // 媒体库歌丬的失败统一走定向引导，不再误导去登录/设音源
      if (isProviderSource(t)) { providerUnavailable(t); return; }
      // 取链失败：已登录 → 问题在服务器侧音源；未登录 → 引导登录/设源（产品语义：只有播放才需要这些）
      // 注意：用 tokenRef.current——catch 里闭包捕获的是 useCallback([]) 创建时的组件 token（陈旧值，首渲染为 null）
      if (failStreak >= FAIL_FUSE) {
        // 熔断:连续失败不逐首弹窗,一次汇总
        if (!errDialogOpen) {
          errDialogOpen = true;
          dialog.alert(
            '暂时无法播放',
            `连续 ${failStreak} 首取链失败,已停止自动播放。请在服务器端(后台·音源管理)确认音源可用,或稍后再试。`,
            [
              { text: '设置音源', onPress: () => navRef.current?.navigate('Sources' as never) },
              { text: '知道了', style: 'cancel', onPress: () => { failStreak = 0; } },
            ],
          );
          setTimeout(() => { errDialogOpen = false; }, 800); // 弹窗生命周期兜底(按钮回调重置 failStreak)
        }
        return;
      }
      if (tokenRef.current) {
        if (!errDialogOpen) {
          errDialogOpen = true;
          dialog.alert(
            '暂时无法播放',
            '服务器取链失败。可在服务器端绑定可用音源，或在 App 内添加自定义音源后重试。',
            [
              { text: '重试', onPress: () => { failStreak = 0; resolveAndPlay(t).catch(() => setPlaying(false)); } },
              { text: '设置音源', onPress: () => navRef.current?.navigate('Sources' as never) },
              { text: '取消', style: 'cancel', onPress: () => { failStreak = 0; } },
            ],
          );
          setTimeout(() => { errDialogOpen = false; }, 800);
        }
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

  // 预读下一首(原版 enablePreloader): 当前曲开播后预取下一首链接写入链接缓存,切歌零等待
  const preloadedUidRef = useRef<string | null>(null);
  // 屏幕常亮(keepScreenAwake): web Wake Lock API(播放时持锁,暂停释放;不支持则静默)
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const syncWakeLock = async (playing: boolean) => {
    try {
      const st = settings.get();
      const nav = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } });
      if (!nav.wakeLock) return;
      if (playing && st.keepScreenAwake !== false) {
        if (!wakeLockRef.current) wakeLockRef.current = await nav.wakeLock.request('screen');
      } else {
        await wakeLockRef.current?.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    } catch { /* ignore */ }
  };

  const preloadNext = () => {
    try {
      const st = settings.get();
      if (st.enablePreloader === false) return;
      const q = queueRef.current;
      const ni = (idxRef.current + 1) % Math.max(1, q.length);
      const nt = q[ni];
      if (!nt || nt.uid === preloadedUidRef.current) return;
      preloadedUidRef.current = nt.uid;
      const quality = pickQuality(nt);
      const key = `nm-urlc:${nt.source}:${nt.songmid}:${quality}`;
      if (localStorage.getItem(key)) return; // 已有缓存
      api.musicUrl(nt, quality).then(r => {
        if (r?.url) { try { localStorage.setItem(key, JSON.stringify({ url: r.url, at: Date.now() })); } catch { /* ignore */ } }
      }).catch(() => {});
    } catch { /* ignore */ }
  };

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

  // v1.2.4 D1(A1/A3):队列增量操作——纯新增 API,现有行为零变化
  /** 追加到队列尾部(不改变当前播放) */
  const appendQueue = useCallback((songs: SongItem[]) => {
    if (!songs.length) return;
    const add = songs.map(toTrack).filter(t => !queueRef.current.some(q => q.uid === t.uid || (q.songmid === t.songmid && q.source === t.source)));
    if (!add.length) return;
    queueRef.current = [...queueRef.current, ...add];
    setQueue(queueRef.current);
  }, []);
  /** 下一首播:插到当前曲之后(不立即切歌) */
  const playNextUp = useCallback((song: SongItem) => {
    const t = toTrack(song);
    if (queueRef.current.some(q => q.songmid === t.songmid && q.source === t.source)) return;
    const at = Math.min(idxRef.current + 1, queueRef.current.length);
    queueRef.current = [...queueRef.current.slice(0, at), t, ...queueRef.current.slice(at)];
    setQueue(queueRef.current);
  }, []);
  // Global event wiring
  useEffect(() => {
    const sub = AudioPro.addEventListener(ev => {
      switch (ev.type) {
        case AudioProEventType.STATE_CHANGED:
          setPlaying(ev.payload?.state === AudioProState.PLAYING);
          if (ev.payload?.state === AudioProState.PLAYING) syncWakeLock(true); else if (ev.payload?.state === AudioProState.PAUSED) syncWakeLock(false);
          // 冷启动恢复的续播回跳：首次进入 PLAYING 且尚未推进 → 回跳到保存进度（一次）
          if (ev.payload?.state === AudioProState.PLAYING && resumeSeekRef.current > 2) {
            const rp = resumeSeekRef.current; resumeSeekRef.current = 0;
            setTimeout(() => { AudioPro.seekTo(rp * 1000); }, 350);
          }
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
          const errP = (ev as unknown as { payload?: { error?: string; errorCode?: number } }).payload;
          const errDetail = errP?.error ? `（${String(errP.error).slice(0, 70)}${errP.errorCode != null ? ' #' + errP.errorCode : ''}）` : '';
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
            ? `播放失败：媒体库可能已断开或网络不可达${errDetail}`
            : `播放失败：音源链接不可用，可重试或更换音源${errDetail}`);
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
    // dlna/cast 投屏中：控制远端设备
    if (castRef.current) {
      const cs = castRef.current;
      const api = castApiOf(cs.kind);
      try {
        const p = await api.getPosition(cs.dev as never);
        if (p.state === 'PLAYING' || p.state === 'BUFFERING') { await api.pause(cs.dev as never); setPlaying(false); }
        else {
          const resumed = await api.play(cs.dev as never);
          if (resumed === false) { setPlaying(false); toast('该设备不支持暂停后直接续播（AirPlay 线性流），请点击设备重新投屏'); }
          else setPlaying(true);
        }
      } catch { toast('投屏设备无响应'); }
      return;
    }
    const st = AudioPro.getState();
    if (st === AudioProState.PLAYING) AudioPro.pause();
    else if (st === AudioProState.PAUSED) AudioPro.resume();
    else {
      // JS 可能刚重建（Activity 回收）还没来得及 hydrate：先问原生真状态，避免误走重播分支
      try {
        const ns = (await NativeAudioPro?.getNativeState?.())?.state;
        const hydrate = (AudioPro as unknown as { hydrateFromNative?: (t: unknown) => Promise<boolean> }).hydrateFromNative;
        const t0 = queueRef.current[idxRef.current];
        if (t0 && (ns === 'PLAYING' || ns === 'BUFFERING' || ns === 'PAUSED')) {
          await hydrate?.({ id: t0.uid, url: 'hydrated://native', title: t0.name, artwork: t0.img || '', artist: t0.singer, album: t0.albumName || '' });
          if (ns === 'PAUSED') { AudioPro.resume(); setPlaying(true); }
          else { AudioPro.pause(); setPlaying(false); }
          return;
        }
      } catch { /* 旧原生/lib 无此方法，走重播 */ }
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
    if (cs) {
      setPosition(sec);
      castApiOf(cs.kind).seek(cs.dev as never, sec).catch(() => toast('投屏设备不支持进度调整'));
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
  // 持久化：队列/当前曲/索引在变化时节流写入；lx163h:快照序列化再加 5s 节流(此前 position 每秒打点→每秒 200 首全量 stringify,弱芯片 JS 线程常态卡)
  const persistSnapshot = useRef<number>(0);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (queue.length && current) {
          if (Date.now() - persistSnapshot.current < 5000) return; // 5s 内已写过,跳过重序列化(pos 丢最近 4s,可接受)
          persistSnapshot.current = Date.now();
          // pos/p/d:断点续播(settings.__rr 时消费)与桌面冷启动恢复(web 默认带进度);手机冷启动仍从 0,避免取链失效卡启动
          playbackKv.set('snapshot', JSON.stringify({ q: queue.slice(0, 200), i: idxRef.current, pos: Math.floor(position), p: playing, d: Math.floor(duration) }));
        } else playbackKv.set('snapshot', '');
      } catch { /* 超大队列放弃快照 */ }
    }, 1500);
    persistSnapshot.current = Date.now();
    // lx163:播放列表同步——队列变化(节流 3s)推服务器 defaultList(他端/网页可恢复);冷启本地空队列时从服务器拉回
    if (queue.length) {
      clearTimeout(queuePushTimer.current);
      queuePushTimer.current = setTimeout(() => {
        if (!httpStore.base || !httpStore.token) return;
        (async () => {
          try {
            const snap = await sync.fetchLists();
            if (!snap) return;
            const lxq = queue.slice(0, 300).map(appToLx);
            if (JSON.stringify((snap.defaultList || []).map((x: { id?: string }) => x.id)) === JSON.stringify(lxq.map((x: { id?: string }) => x.id))) return;
            snap.defaultList = lxq;
            await sync.pushLists(snap);
          } catch { /* ignore */ }
        })();
      }, 3000);
    }
    return () => clearTimeout(t);
  }, [queue, current]);
  // 恢复/自愈：JS 重建（Activity 被系统回收后重开）而原生前台服务仍在播/暂停时，lib 的 internalStore 已归零，
  // current=null → MiniPlayer 不渲染、播放页进不去（喇叭在响但 UI 失联）。
  // 挂载时 + 每次回前台探测一次：原生在持有音频而 UI 无队列 → 从快照复活。
  // 普通冷启动（原生 IDLE）：按设置恢复队列与当前曲为暂停态，不自动取链播放
  useEffect(() => {
    let dead = false;
    const revive = async () => {
      if (queueRef.current.length) return; // UI 状态在，无需复活
      try {
        let nativeState: string | undefined;
        try { nativeState = (await NativeAudioPro?.getNativeState?.())?.state; } catch { /* 旧原生无此方法 */ }
        if (dead || queueRef.current.length) return;
        const nativeHolding = nativeState === 'PLAYING' || nativeState === 'PAUSED' || nativeState === 'BUFFERING';
        const snap = JSON.parse(playbackKv.getString('snapshot') || 'null') as { q?: QueueTrack[]; i?: number; pos?: number; p?: boolean; d?: number } | null;
        if (snap?.q?.length && (nativeHolding || settings.get().restorePlayback)) {
          // lx45：无网/弱网冷启动也恢复队列——纯 JS 内存操作，零网络请求；快照内含离线文件元数据，不依赖服务器
          // 重新分配 uid：快照里的旧 uid 会与新 toTrack 的自增 seq 撞车
          const q = snap.q.map(t => ({ ...t, uid: `${t.source}-${t.songmid}-${++seq}` }));
          queueRef.current = q;
          setQueue(q);
          idxRef.current = Math.min(Math.max(0, snap.i || 0), q.length - 1);
          setCurrent(q[idxRef.current]);
          if (nativeHolding) {
            // 原生还在持有音频：把真状态灌回 lib internalStore——否则 pause/resume/seek 的
            // guardTrackPlaying 拦死，toggle 会误走重播分支（暂停不了、重启当前曲）。
            // 合成 track 随后会被真实 PROGRESS 事件里的原生 activeTrack 覆盖。
            const t0 = q[idxRef.current];
            try {
              await (AudioPro as unknown as { hydrateFromNative?: (t: unknown) => Promise<boolean> })
                .hydrateFromNative?.({
                  id: t0.uid, url: 'hydrated://native', title: t0.name,
                  artwork: t0.img || '', artist: t0.singer, album: t0.albumName || '',
                });
            } catch { /* 旧 lib 无此方法 */ }
            setPlaying(nativeState === 'PLAYING');
            const tm = AudioPro.getTimings();
            if (tm.position > 0) setPosition(tm.position / 1000);
            if (tm.duration > 0) setDuration(tm.duration / 1000);
          } else if (playbackKv.getString('rr') === '1' && snap.p && q[idxRef.current]) {
            // 主题/缩放重启断点续播:hdRestart 写 rr(仅重启前在播时)——重载本曲并回跳进度
            playbackKv.set('rr', '');
            const t0 = q[idxRef.current];
            const resumePos = Math.max(0, snap.pos || 0);
            setTimeout(() => {
              playSong(t0, q);
              if (resumePos > 2) setTimeout(() => seekTo(resumePos), 1400);
            }, 400);
          } else if (Platform.OS === 'web') {
            // 冷启动恢复（桌面默认开）：队列+当前曲+进度显示恢复为暂停态；首次点播放时从保存进度继续
            // 仅 web——Android 冷启动行为保持原样（恢复队列从 0，避免原生侧未验证的 seek 路径）
            setPosition(Math.max(0, snap.pos || 0));
            if ((snap.d || 0) > 0) setDuration(snap.d || 0);
            resumeSeekRef.current = Math.max(0, snap.pos || 0);
          }

          // lx39：投屏会话恢复——JS 重建前正在投屏，从 castKv 恢复投屏态（不再失联）
          // dlna/cast：探测设备存活，活则恢复（本机继续挂起，轮询 effect 随 cast state 自起）
          try {
            const rawCast = castKv.getString('session');
            const saved = rawCast ? JSON.parse(rawCast) as { kind: CastKind; dev: DlnaDevice & CastDevice; savedAt: number } : null;
            if (saved && Date.now() - saved.savedAt < 24 * 3600_000) {
              const api = castApiOf(saved.kind);
              try {
                const p = await api.getPosition(saved.dev as never);
                if (dead) return;
                castRef.current = { kind: saved.kind, dev: saved.dev };
                setCast({ kind: saved.kind, dev: saved.dev });
                setPosition(p.pos);
                if (p.dur > 0) setDuration(p.dur);
                setPlaying(p.state === 'PLAYING' || p.state === 'BUFFERING');
                // 投屏模式本机应挂起：把本机 hydrate 成 PAUSED（stopCast 时 resume 才能接回）
              } catch {
                persistCast(null); // 设备已死：清会话，留在本机
              }
            }
          } catch { /* 坏会话忽略 */ }
        } else if (httpStore.base && httpStore.token) {
          // lx163:本地无快照→从服务器 defaultList 恢复队列(他端/网页推上来的播放列表,暂停态展示不自动播)
          try {
            const s = await sync.fetchLists();
            if (!dead && s?.defaultList?.length && !queueRef.current.length) {
              const q = s.defaultList.map(lxToApp).map(t => ({ ...t, uid: `${t.source}-${t.songmid}-${++seq}` }));
              queueRef.current = q; setQueue(q);
              idxRef.current = 0; setCurrent(q[0]);
            }
          } catch { /* ignore */ }
        }
      } catch { /* 坏快照忽略 */ }
    };
    revive();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') revive(); });
    return () => { dead = true; sub.remove(); };
  }, []);

  // —— 投屏控制（dlna / cast 双通道）——
  const startCast = useCallback((dev: DlnaDevice | CastDevice | AirPlayDevice, kind: CastKind) => {
    // 切换协议/设备：先停旧会话（否则渲染器残留旧流/双唱）
    const prev = castRef.current;
    if (prev && (prev.kind !== kind || (prev.dev as { uuid?: string }).uuid !== (dev as { uuid?: string }).uuid)) {
      deactivateCast();
      castApiOf(prev.kind).stop(prev.dev as never).catch(() => {});
    }
    activateCast({ kind, dev });
    // vc78：音量键转发基线——拉当前系统音量+设备音量
    audioRoute.getVolume().then(v => { lastSysVol.current = v; }).catch(() => {});
    castApiOf(kind).getVolume(dev as never).then(v => { castVolMem.current = v; }).catch(() => {});
    const t = queueRef.current[idxRef.current];
    if (t) {
      AudioPro.pause();
      resolveAndPlay(t).catch(() => setPlaying(false));
    }
  }, [resolveAndPlay]);

  const stopCast = useCallback(() => {
    const cs = castRef.current;
    deactivateCast();
    if (!cs) return;
    castApiOf(cs.kind).stop(cs.dev as never).catch(() => {});
    // 本机续播：从投屏进度回接（本地轨还在 ExoPlayer 里挂着）
    if (queueRef.current.length && AudioPro.getState() === AudioProState.PAUSED) {
      AudioPro.seekTo(Math.round(position * 1000));
      AudioPro.resume();
    }
  }, [position]);

  // 设备主动断连（cast.lost）：回本机续播 + 提示
  useEffect(() => {
    const a = googleCast.onLost(() => {
      if (castRef.current?.kind !== 'cast') return;
      deactivateCast();
      toast('Cast 设备已断开，回本机播放');
      const t = queueRef.current[idxRef.current];
      if (t) resolveAndPlay(t).catch(() => setPlaying(false));
    });
    return () => { a?.remove(); };
  }, [resolveAndPlay]);

  // 投屏轮询（dlna/cast）：同步进度/播放态；播完自动推进队列
  useEffect(() => {
    if (!cast) return;
    const api = castApiOf(cast.kind);
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

  // ===== web 播放器功能对齐:队列排序 =====
  const reorderQueue = useCallback((from: number, to: number) => {
    setQueue(q => {
      if (from < 0 || from >= q.length) return q;
      if (to === -2) { // 约定语义:移除该曲目
        const nq = q.filter((_, i) => i !== from);
        const cur = q[idxRef.current];
        if (cur && q[from] === cur) return q; // 不移除正在播放曲目
        if (from < idxRef.current) idxRef.current = Math.max(0, idxRef.current - 1);
        return nq;
      }
      if (to < 0 || to >= q.length || from === to) return q;
      const nq = [...q];
      const [it] = nq.splice(from, 1);
      nq.splice(to, 0, it);
      // 修正当前索引指向同一曲目
      const cur = q[idxRef.current];
      const nIdx = Math.max(0, nq.findIndex(t => t === cur));
      idxRef.current = nIdx;
      return nq;
    });
  }, []);

  // ===== web 播放器功能对齐:倍速 + 睡眠定时 =====
  const [speed, setSpeedState] = useState(1.0);
  const setSpeed = useCallback((v: number) => {
    const r = Math.min(2.0, Math.max(0.25, v));
    setSpeedState(r);
    try { (AudioPro as unknown as { setPlaybackSpeed?: (s: number) => void }).setPlaybackSpeed?.(r); } catch { /* 原生无该 API 时忽略 */ }
  }, []);
  const [sleepRemain, setSleepRemain] = useState<number | null>(null);
  const sleepTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const enableSleep = useCallback((minutes: number | null) => {
    if (sleepTick.current) { clearInterval(sleepTick.current); sleepTick.current = null; }
    if (minutes == null || minutes <= 0) { setSleepRemain(null); return; }
    setSleepRemain(Math.round(minutes * 60));
    sleepTick.current = setInterval(() => {
      setSleepRemain(prev => {
        if (prev == null) return null;
        if (prev <= 1) {
          // 到点:暂停并清定时
          AudioPro.pause();
          if (sleepTick.current) { clearInterval(sleepTick.current); sleepTick.current = null; }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);
  useEffect(() => () => { if (sleepTick.current) clearInterval(sleepTick.current); }, []);

  return (    <Ctx.Provider value={{ queue, current, playing, position, duration, shuffle, repeat, setShuffle, cycleRepeat, playSong, toggle, skipNext, skipPrev, seekTo, clearQueue, cast, startCast, stopCast, rebuildAudio, appendQueue, playNextUp, reorderQueue, speed, setSpeed, sleepRemain, enableSleep }}>
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
