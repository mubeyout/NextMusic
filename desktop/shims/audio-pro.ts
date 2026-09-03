// react-native-audio-pro web shim：HTML5 Audio 实现 PlayerProvider 用到的 API 面
// configure/play/pause/resume/seekTo/getState/getTimings/addEventListener + 枚举
// 桌面增强：MediaSession API 接系统媒体键（播放/暂停/上一首/下一首）
export enum AudioProState { IDLE = 'IDLE', PLAYING = 'PLAYING', PAUSED = 'PAUSED', STOPPED = 'STOPPED' }
export enum AudioProContentType { MUSIC = 'MUSIC' }
export enum AudioProEventType {
  PLAYING = 'PLAYING', PAUSED = 'PAUSED', STOPPED = 'STOPPED', SEEKED = 'SEEKED',
  PROGRESS = 'PROGRESS', TRACK_ENDED = 'TRACK_ENDED', TRACK_CHANGED = 'TRACK_CHANGED',
  PLAYBACK_ERROR = 'PLAYBACK_ERROR', REMOTE_NEXT = 'REMOTE_NEXT', REMOTE_PREV = 'REMOTE_PREV',
  REMOTE_PLAY_PAUSE = 'REMOTE_PLAY_PAUSE', REMOTE_STOP = 'REMOTE_STOP',
}

type Track = { id: string; url: string; title?: string; artist?: string; album?: string; artwork?: string };
type PlayOpts = { startTimeMs?: number; autoPlay?: boolean; headers?: Record<string, string> };

const audio = new Audio();
// 调试:暴露实例(桌面探测用),非生产逻辑
(typeof window !== 'undefined') && ((window as never as Record<string, unknown>).__nmAudio = audio);
audio.preload = 'auto';
let state: AudioProState = AudioProState.IDLE;
let curTrack: Track | null = null;
let headers: Record<string, string> | undefined;
type Listener = (e: { type: AudioProEventType; position?: number; duration?: number; track?: Track; error?: string }) => void;
const listeners = new Set<Listener>();

const emit = (type: AudioProEventType, extra: Record<string, unknown> = {}) =>
  listeners.forEach(l => l({ type, position: audio.currentTime * 1000, duration: (audio.duration || 0) * 1000, track: curTrack ?? undefined, ...extra } as never));

audio.addEventListener('timeupdate', () => { if (!audio.paused) emit(AudioProEventType.PROGRESS); });
audio.addEventListener('play', () => { state = AudioProState.PLAYING; emit(AudioProEventType.PLAYING); if (curTrack) wireMediaSession(); });
audio.addEventListener('pause', () => { state = AudioProState.PAUSED; emit(AudioProEventType.PAUSED); });
audio.addEventListener('ended', () => { state = AudioProState.STOPPED; emit(AudioProEventType.TRACK_ENDED); });
audio.addEventListener('error', () => { state = AudioProState.STOPPED; emit(AudioProEventType.PLAYBACK_ERROR, { error: 'audio element error' }); });
audio.addEventListener('seeked', () => emit(AudioProEventType.SEEKED));

function wireMediaSession() {
  if (!('mediaSession' in navigator) || !curTrack) return;
  const ms = navigator.mediaSession;
  ms.metadata = new MediaMetadata({
    title: curTrack.title || '', artist: curTrack.artist || '', album: curTrack.album || '',
    artwork: curTrack.artwork ? [{ src: curTrack.artwork, sizes: '512x512' }] : [],
  });
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('previoustrack', () => emit(AudioProEventType.REMOTE_PREV));
  ms.setActionHandler('nexttrack', () => emit(AudioProEventType.REMOTE_NEXT));
}

// Range 请求带自定义头（WebDAV basicAuth 等）需要 MSE/ServiceWorker 转发；
// 桌面 Electron renderer 无 CORS 限制（webSecurity off 时），此处直接 fetch 流不可行——
// 简化：headers 场景（WebDAV）改走Electron 主进程代理 URL（见 electron/main.cjs /proxy 路由）。
function applyUrl(t: Track) {
  let url = t.url;
  if (headers && Object.keys(headers).length) url = `http://127.0.0.1:5198/__media__?u=${encodeURIComponent(t.url)}&h=${encodeURIComponent(JSON.stringify(headers))}`;
  audio.src = url;
}

export const AudioPro = {
  configure(_opts: Record<string, unknown>): void { /* 桌面无需 content type / progress 间隔配置 */ },
  play(track: Track, opts: PlayOpts = {}): void {
    curTrack = track; headers = opts.headers;
    applyUrl(track);
    if (opts.startTimeMs) audio.currentTime = opts.startTimeMs / 1000;
    if (opts.autoPlay !== false) audio.play().catch(() => emit(AudioProEventType.PLAYBACK_ERROR, { error: 'autoplay blocked' }));
  },
  pause(): void { audio.pause(); },
  resume(): void { audio.play().catch(() => {}); },
  stop(): void { audio.pause(); audio.removeAttribute('src'); state = AudioProState.STOPPED; },
  seekTo(ms: number): void { audio.currentTime = ms / 1000; },
  getState(): AudioProState { return audio.paused && audio.currentTime > 0 ? AudioProState.PAUSED : state; },
  getTimings(): { position: number; duration: number } {
    return { position: audio.currentTime * 1000, duration: (isFinite(audio.duration) ? audio.duration : 0) * 1000 };
  },
  addEventListener(l: Listener): { remove: () => void } { listeners.add(l); return { remove: () => listeners.delete(l) }; },
};


// zustand 式 useAudioPro hook(RouteScreen 用):selector → 播放状态
import { useSyncExternalStore } from 'react';
const stateSnap = () => ({ playerState: AudioPro.getState(), position: AudioPro.getTimings().position });
let cached = stateSnap();
const subs = new Set<() => void>();
listeners.add(() => { cached = stateSnap(); subs.forEach(f => f()); });
export function useAudioPro<T = ReturnType<typeof stateSnap>>(sel?: (s: ReturnType<typeof stateSnap>) => T): T {
  useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => cached);
  return (sel ? sel(cached) : cached) as T;
}

export default { AudioPro, AudioProState, AudioProContentType, AudioProEventType };
