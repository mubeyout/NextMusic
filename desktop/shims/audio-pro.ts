// react-native-audio-pro web shim：HTML5 Audio 实现 PlayerProvider 用到的 API 面
// configure/play/pause/resume/seekTo/getState/getTimings/addEventListener + 枚举
// 桌面增强：MediaSession API 接系统媒体键（播放/暂停/上一首/下一首）
export enum AudioProState { IDLE = 'IDLE', PLAYING = 'PLAYING', PAUSED = 'PAUSED', STOPPED = 'STOPPED' }
export enum AudioProContentType { MUSIC = 'MUSIC' }
export enum AudioProEventType {
  STATE_CHANGED = 'STATE_CHANGED', PLAYING = 'PLAYING', PAUSED = 'PAUSED', STOPPED = 'STOPPED', SEEKED = 'SEEKED',
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
type Listener = (e: { type: AudioProEventType; payload: { position?: number; duration?: number; state?: AudioProState; track?: Track; error?: string } }) => void;
const listeners = new Set<Listener>();

// 事件形状对齐真 lib：{ type, payload } 嵌套（PlayerProvider 读 ev.payload.position/.state）
const emit = (type: AudioProEventType, payload: Record<string, unknown> = {}) =>
  listeners.forEach(l => l({ type, payload: { position: audio.currentTime * 1000, duration: (audio.duration || 0) * 1000, track: curTrack ?? undefined, ...payload } } as never));

audio.addEventListener('timeupdate', () => { if (!audio.paused) emit(AudioProEventType.PROGRESS); });
audio.addEventListener('play', () => {
  // v1.2.0 兜底:任何播放路径(含直接操作 audio 元素)都保证 WebAudio 图+频谱 analyser 已建
  try { ensureGraph(); actx?.resume?.().catch(() => {}); } catch { /* ignore */ }
  state = AudioProState.PLAYING; emit(AudioProEventType.STATE_CHANGED, { state }); emit(AudioProEventType.PLAYING); if (curTrack) wireMediaSession();
});
audio.addEventListener('pause', () => { state = AudioProState.PAUSED; emit(AudioProEventType.STATE_CHANGED, { state }); emit(AudioProEventType.PAUSED); });
audio.addEventListener('ended', () => { state = AudioProState.STOPPED; emit(AudioProEventType.STATE_CHANGED, { state }); emit(AudioProEventType.TRACK_ENDED); });
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
const IS_ELECTRON = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
function applyUrl(t: Track) {
  let url = t.url;
  // Electron:恒走主进程媒体代理(同源)——WebAudio MediaElementSource 对跨域源会输出静音,
  // 同源代理是 EQ/混响链路可用的前提;浏览器直开(vite dev)保持原 URL。
  if (IS_ELECTRON || (headers && Object.keys(headers).length)) {
    url = `http://127.0.0.1:5198/__media__?u=${encodeURIComponent(t.url)}${headers && Object.keys(headers).length ? `&h=${encodeURIComponent(JSON.stringify(headers))}` : ''}`;
  }
  audio.src = url;
}

// ===== WebAudio DSP（桌面音效真实现:soundfx.ts → NM.SoundFx.setConfig → __nmFxSet）=====
type FxCfg = { eq?: number[]; reverb?: { id: string; mainGain: number; sendGain: number }; panner?: { enable: boolean; speed: number; distance: number } };
const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let actx: AudioContext | null = null;
let srcNode: MediaElementAudioSourceNode | null = null;
let preGain: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let panNode: StereoPannerNode | null = null;
let dryGain: GainNode | null = null;
let wetGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoDepth: GainNode | null = null;
let curReverbId = '';
let lastCfg: FxCfg = {};

function buildIR(ctx: AudioContext, id: string): AudioBuffer {
  // 程序化脉冲响应:噪声+指数衰减;时长/衰减按房间类型
  const spec: Record<string, [number, number]> = {
    none: [0.001, 0], telephone: [0.12, 22], church: [3.2, 2.2], hall: [2.4, 3.0],
    cinema: [2.0, 2.6], dining: [1.1, 4.5], living: [0.7, 7], spreader: [0.45, 9],
  };
  const [sec, decay] = spec[id] || [1.2, 4];
  const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensureGraph() {
  if (actx || !IS_ELECTRON) return;
  try {
    actx = new AudioContext();
    (typeof window !== 'undefined') && ((window as never as Record<string, unknown>).__nmActx = actx); // 频谱环复用(SpectrumRing)
    srcNode = actx.createMediaElementSource(audio);
    preGain = actx.createGain();
    eqNodes = EQ_FREQS.map(f => {
      const b = actx!.createBiquadFilter();
      b.type = 'peaking'; b.frequency.value = f; b.Q.value = 1.0; b.gain.value = 0;
      return b;
    });
    panNode = actx.createStereoPanner();
    dryGain = actx.createGain();
    wetGain = actx.createGain(); wetGain.gain.value = 0;
    convolver = actx.createConvolver();
    let node: AudioNode = srcNode;
    node.connect(preGain);
    node = preGain;
    for (const b of eqNodes) { node.connect(b); node = b; }
    node.connect(panNode);
    panNode.connect(dryGain); dryGain.connect(actx.destination);
    // v1.2.0 频谱环数据源:analyser 并联 tap 进信号链(悬空 analyser 读数恒 0——波浪不动的根因)
    try {
      const an = actx!.createAnalyser();
      an.fftSize = 256; an.smoothingTimeConstant = 0.78;
      panNode.connect(an);
      (typeof window !== 'undefined') && ((window as never as Record<string, unknown>).__nmAnalyser = an);
    } catch { /* 频谱退化伪律动 */ }
    panNode.connect(convolver); convolver.connect(wetGain); wetGain.connect(actx.destination);
    if (lastCfg && Object.keys(lastCfg).length) applyFx(lastCfg);
  } catch { /* WebAudio 不可用:裸 Audio 输出 */ }
}

function applyFx(cfg: FxCfg) {
  lastCfg = cfg;
  if (!actx) return;
  try {
    if (cfg.eq?.length === 10) cfg.eq.forEach((g, i) => { if (eqNodes[i]) eqNodes[i].gain.value = Math.max(-12, Math.min(12, g)); });
    if (cfg.eq?.length === 10) {
      const maxAbs = Math.max(...cfg.eq.map(Math.abs));
      if (preGain) preGain.gain.value = maxAbs > 6 ? 0.7 : 1; // 大推子防削波
    }
    if (cfg.reverb) {
      if (cfg.reverb.id !== curReverbId && convolver) {
        curReverbId = cfg.reverb.id;
        convolver.buffer = buildIR(actx, cfg.reverb.id);
      }
      if (dryGain && wetGain) {
        if (cfg.reverb.id === 'none') { dryGain.gain.value = 1; wetGain.gain.value = 0; }
        else {
          dryGain.gain.value = Math.min(1.2, cfg.reverb.mainGain * 0.55 + 0.45);
          wetGain.gain.value = Math.min(1.0, cfg.reverb.sendGain * 0.28);
        }
      }
    }
    if (cfg.panner && panNode) {
      if (cfg.panner.enable && !lfo && actx) {
        lfo = actx.createOscillator();
        lfoDepth = actx.createGain();
        lfo.frequency.value = 0.12 + (cfg.panner.speed || 1) * 0.25;
        lfoDepth.gain.value = Math.min(0.9, 0.25 + (cfg.panner.distance || 1) * 0.18);
        lfo.connect(lfoDepth); lfoDepth.connect(panNode.pan);
        lfo.start();
      } else if (!cfg.panner.enable && lfo) {
        try { lfo.stop(); } catch { /* ignore */ }
        lfo.disconnect(); lfo = null; lfoDepth = null;
        panNode.pan.value = 0;
      } else if (cfg.panner.enable && lfo && lfoDepth) {
        lfo.frequency.value = 0.12 + (cfg.panner.speed || 1) * 0.25;
        lfoDepth.gain.value = Math.min(0.9, 0.25 + (cfg.panner.distance || 1) * 0.18);
      }
    }
  } catch { /* ignore */ }
}
(typeof globalThis !== 'undefined') && ((globalThis as never as Record<string, unknown>).__nmFxSet = applyFx);

export const AudioPro = {
  configure(_opts: Record<string, unknown>): void { /* 桌面无需 content type / progress 间隔配置 */ },
  setPlaybackSpeed(speed: number): void {
    // web shim: HTML5 Audio playbackRate (0.25–2.0)
    const r = Math.min(2.0, Math.max(0.25, speed));
    audio.playbackRate = r;
  },
  getPlaybackSpeed(): number {
    return audio.playbackRate || 1.0;
  },
  play(track: Track, opts: PlayOpts = {}): void {
    curTrack = track; headers = opts.headers;
    ensureGraph(); actx?.resume?.().catch(() => {});
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
