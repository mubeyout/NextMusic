// react-native-audio-pro web shim：HTML5 Audio 实现 PlayerProvider 用到的 API 面
// configure/play/pause/resume/seekTo/getState/getTimings/addEventListener + 枚举
// 桌面增强：MediaSession API 接系统媒体键（播放/暂停/上一首/下一首）
// v3.20(老板:音效开了无效): WebAudio DSP 链不再限 Electron——浏览器部署同样建图;
//   浏览器下媒体恒走同源代理 /api/music/download?inline=1(MediaElementSource 对跨域源输出静音,
//   同源代理是 EQ/混响链路可用的前提;代理实测支持 Range,seek 正常);
//   ViPER-lite: 低音/细节/清澈/响度/限幅/AutoEQ 全接入;变调(原生 Sonic)web 无实现不假装生效
export enum AudioProState { IDLE = 'IDLE', PLAYING = 'PLAYING', PAUSED = 'PAUSED', STOPPED = 'STOPPED' }
import { store } from '../../src/services/server'; // [Gate 2026-09-14] 媒体代理 nm_auth 用
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
// lx170c:匿名直连场景(听风/CDN)必须 crossorigin——WebAudio MediaElementSource 对无 crossorigin 的跨域媒体输出静音;
// 126.net 等实测返 ACAO:* 可用。走同源代理时此属性无害。
audio.crossOrigin = 'anonymous';
// lxfix: NaN/Infinity 守卫——浏览器对 non-finite currentTime 直接抛错(拖动条 duration 未就绪时 pct*duration=NaN)
const seekSec = (sec: number) => { if (Number.isFinite(sec) && sec >= 0) audio.currentTime = sec; };
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

// 运行形态:Electron=主进程媒体代理(5198);浏览器部署=服务端同源代理(/api/music/download inline);
// vite dev(5173/3000)=直连原 URL(DSP 可能因跨域静音,dev 容忍)
const IS_ELECTRON = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
const IS_DEV = typeof location !== 'undefined' && (location.port === '5173' || location.port === '3000');
// lx170:本次 play() 是否命中「匿名公开直连」(applyUrl 里判定)——供后续拦截豁免
let isPublicDirectApplied = false;
function applyUrl(t: Track) {
  let url = t.url;
  const hasHeaders = !!(headers && Object.keys(headers).length);
  isPublicDirectApplied = false;
  if (IS_ELECTRON) {
    // Electron：主进程媒体代理(5198)——带鉴权头的流也走它
    url = `http://127.0.0.1:5198/__media__?u=${encodeURIComponent(t.url)}${hasHeaders ? `&h=${encodeURIComponent(JSON.stringify(headers))}` : ''}`;
  } else if (!IS_DEV) {
    // lx170(老板 0923):匿名+无鉴权头的公开直链(听风/CDN) → audio 直连原 URL,不走代理。
    // 原先恒走代理→匿名无 nm_auth 无 h= 必 401(NotSupportedError);媒体库/听风不依赖服务器账号。
    // 代价:未登录时 DSP 因跨域可能静音(可接受——能播 > 有音效);登录后仍走代理(DSP 全功能)。
    const isPublicDirect = !store.token && !hasHeaders && /^https?:\/\//i.test(t.url || '');
    if (isPublicDirect) {
      isPublicDirectApplied = true;
      audio.src = t.url;
      return;
    }
    // v3.20:浏览器部署走服务端 inline 代理(同源)——WebAudio MediaElementSource 不再跨域静音,Range 实测 206 可 seek
    // [Gate 2026-09-14] 代理接口已加登录门:audio 标签带不了 header → token 走 nm_auth query(store 同源,登录后/凭据重登后必有)
    // v3.31(2026-09-21 修 WebDAV/Emby 浏览器播放失败)：带鉴权头 previously 误路由到 Electron 127.0.0.1:5198(浏览器没有)必挂;
    // 浏览器恒走服务端代理,鉴权头经 h= 由服务端转发上游
    url = `/api/music/download?url=${encodeURIComponent(t.url)}&inline=1${store.token ? `&nm_auth=${encodeURIComponent(store.token)}` : ''}${hasHeaders ? `&h=${encodeURIComponent(JSON.stringify(headers))}` : ''}`;
  }
  audio.src = url;
}

// ===== WebAudio DSP(soundfx.ts → __nmFxSet / NM.SoundFx.setConfig) =====
type FxViperCfg = {
  bassMode?: 0 | 1 | 2 | 3; bassLevel?: number;
  dcvEnable?: boolean; dcvLevel?: number;
  cureEnable?: boolean; cureLevel?: number;
  limiterEnable?: boolean; loudnessEnable?: boolean;
  autoeqName?: string; autoeqOn?: boolean;
};
type FxCfg = { eq?: number[]; reverb?: { id: string; mainGain: number; sendGain: number }; panner?: { enable: boolean; speed: number; distance: number }; viper?: FxViperCfg; pitch?: number };
const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let actx: AudioContext | null = null;
let srcNode: MediaElementAudioSourceNode | null = null;
let preGain: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let autoeqNodes: BiquadFilterNode[] = [];
let curAutoeqKey = '';
let bassNode: BiquadFilterNode | null = null;      // ViPER 低音(lowshelf)
let bassPresNode: BiquadFilterNode | null = null;  // 清澈人声临场峰(peaking)
let dcvHigh: BiquadFilterNode | null = null;       // 动态细节高频架
let cureNode: BiquadFilterNode | null = null;      // 声场矫正近似(中频曲线,非真卷积)
let loudLow: BiquadFilterNode | null = null;       // 响度补偿低/高架
let loudHigh: BiquadFilterNode | null = null;
let limiter: DynamicsCompressorNode | null = null; // 恒定限幅(恒挂链,禁用时 ratio=1 透明)
let panNode: StereoPannerNode | null = null;
let dryGain: GainNode | null = null;
let wetGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoDepth: GainNode | null = null;
let curReverbId = '';
let lastCfg: FxCfg = {};

function buildIR(ctx: AudioContext, id: string): AudioBuffer {
  // 程序化脉冲响应:噪声+指数衰减;时长/衰减按房间类型(v_* 系列按听感映射)
  const spec: Record<string, [number, number]> = {
    none: [0.001, 0], telephone: [0.12, 22], church: [3.2, 2.2], hall: [2.4, 3.0],
    cinema: [2.0, 2.6], dining: [1.1, 4.5], living: [0.7, 7], spreader: [0.45, 9],
    stereo: [0.6, 3.2], matrix1: [1.2, 4.0], matrix2: [1.0, 3.6], cardiod: [0.8, 5.0],
    magnetic: [0.5, 2.6], spring: [1.4, 5.4],
    v_clear: [0.4, 4.2], v_creek: [1.8, 3.4], v_resound2: [0.7, 3.0], v_surround: [0.9, 2.8], v_valley: [2.2, 3.8], v_presence: [0.8, 3.2],
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
  if (actx) return; // 一次建图(元素级唯一 MediaElementSource)
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
    bassNode = actx.createBiquadFilter(); bassNode.type = 'lowshelf'; bassNode.frequency.value = 100; bassNode.gain.value = 0;
    bassPresNode = actx.createBiquadFilter(); bassPresNode.type = 'peaking'; bassPresNode.frequency.value = 2800; bassPresNode.Q.value = 0.9; bassPresNode.gain.value = 0;
    dcvHigh = actx.createBiquadFilter(); dcvHigh.type = 'highshelf'; dcvHigh.frequency.value = 9000; dcvHigh.gain.value = 0;
    cureNode = actx.createBiquadFilter(); cureNode.type = 'peaking'; cureNode.frequency.value = 2400; cureNode.Q.value = 0.8; cureNode.gain.value = 0;
    loudLow = actx.createBiquadFilter(); loudLow.type = 'lowshelf'; loudLow.frequency.value = 70; loudLow.gain.value = 0;
    loudHigh = actx.createBiquadFilter(); loudHigh.type = 'highshelf'; loudHigh.frequency.value = 10000; loudHigh.gain.value = 0;
    limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = 0; limiter.knee.value = 0; limiter.ratio.value = 1; limiter.attack.value = 0.003; limiter.release.value = 0.25;
    panNode = actx.createStereoPanner();
    dryGain = actx.createGain();
    wetGain = actx.createGain(); wetGain.gain.value = 0;
    convolver = actx.createConvolver();
    let node: AudioNode = srcNode;
    node.connect(preGain);
    node = preGain;
    for (const b of eqNodes) { node.connect(b); node = b; }
    node.connect(bassNode!); node = bassNode!;
    node.connect(bassPresNode!); node = bassPresNode!;
    node.connect(dcvHigh!); node = dcvHigh!;
    node.connect(cureNode!); node = cureNode!;
    node.connect(loudLow!); node = loudLow!;
    node.connect(loudHigh!); node = loudHigh!;
    node.connect(limiter!); node = limiter!;
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

// v3.20:AutoEQ 参数化滤波链(增删重建;preamp 并入 preGain)——vite ESM 静态导入 json(Metro 的 require 写法 web 不通用)
import autoeqPackJson from '../../src/assets/autoeq_pack.json';
const autoeqPack = autoeqPackJson as unknown as Record<string, { preamp: number; f: [string, number, number, number][] }>;
function rebuildAutoeq(name: string, on: boolean) {
  if (!actx) return;
  const key = on && name ? name : '';
  if (key === curAutoeqKey) return;
  // 摘除旧链:autoeqNodes 夹在 eqNodes 尾与 bassNode 之间——重建首尾连接
  try {
    if (autoeqNodes.length) {
      const headIn = eqNodes[eqNodes.length - 1] ?? preGain!;
      const tail = autoeqNodes[autoeqNodes.length - 1];
      headIn.disconnect(); tail.disconnect();
      autoeqNodes = [];
      headIn.connect(bassNode!);
    }
    curAutoeqKey = '';
    const prof = key ? autoeqPack[key] : null;
    if (!prof) return;
    let node: AudioNode = eqNodes[eqNodes.length - 1] ?? preGain!;
    node.disconnect();
    for (const [type, fc, gain, q] of prof.f) {
      const b = actx!.createBiquadFilter();
      b.type = type as BiquadFilterType; b.frequency.value = fc; b.gain.value = gain; b.Q.value = q;
      node.connect(b); node = b; autoeqNodes.push(b);
    }
    node.connect(bassNode!);
    curAutoeqKey = key;
  } catch { /* 链重建失败保持旧链 */ }
}

function applyFx(cfg: FxCfg) {
  lastCfg = cfg;
  // v3.34(老板:有时无法启用/很久才生效):两道保险——①未建图则立即建(暂停态改音效也能挂上链,播放即生效)
  // ②AudioContext 被浏览器挂起(后台标签页节流等)则 resume,否则参数全对但无声/延迟
  if (!actx) { try { ensureGraph(); } catch { /* 保持 lastCfg,play 时再建 */ } }
  else if (actx.state === 'suspended') { try { actx.resume().catch(() => {}); } catch { /* ignore */ } }
  if (!actx) return;
  try {
    // ---- EQ 10 段 + 防削波 ----
    if (cfg.eq?.length === 10) {
      cfg.eq.forEach((g, i) => { if (eqNodes[i]) eqNodes[i].gain.value = Math.max(-12, Math.min(12, g)); });
      const maxAbs = Math.max(...cfg.eq.map(Math.abs));
      let pre = maxAbs > 6 ? 0.7 : 1;
      if (cfg.viper?.autoeqOn && cfg.viper.autoeqName) {
        const prof = autoeqPack[cfg.viper.autoeqName];
        if (prof?.preamp) pre *= Math.pow(10, Math.max(-6, Math.min(3, -prof.preamp)) / 20); // dB→增益,AutoEQ preamp 常为负
      }
      if (preGain) preGain.gain.value = pre;
      rebuildAutoeq(cfg.viper?.autoeqName || '', !!cfg.viper?.autoeqOn);
    }
    // ---- 混响 ----
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
    // ---- ViPER-lite ----
    const v = cfg.viper;
    if (v && bassNode) {
      const lvl = v.bassLevel ?? 0;
      switch (v.bassMode) {
        case 1: bassNode.frequency.value = 110; bassNode.gain.value = lvl * 6; break;   // 自然低音
        case 2: bassNode.frequency.value = 75; bassNode.gain.value = lvl * 9; break;    // 纯净低音
        case 3: bassNode.frequency.value = 130; bassNode.gain.value = lvl * 3.5; break; // 清澈人声
        default: bassNode.gain.value = 0;
      }
      if (bassPresNode) bassPresNode.gain.value = v.bassMode === 3 ? 2 : 0;
      if (dcvHigh) dcvHigh.gain.value = v.dcvEnable ? (v.dcvLevel ?? 0.5) * 5 : 0;
      // 声场矫正近似:中频微亮+低频让位(非原生卷积,听感取向)
      if (cureNode) cureNode.gain.value = v.cureEnable ? 1 + (v.cureLevel ?? 0.3) * 2.5 : 0;
      if (loudLow) loudLow.gain.value = v.loudnessEnable ? 3.5 : 0;
      if (loudHigh) loudHigh.gain.value = v.loudnessEnable ? 2.5 : 0;
      // 限幅:禁用时 ratio=1/threshold=0 近似直通
      if (limiter) {
        if (v.limiterEnable) { limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; }
        else { limiter.threshold.value = 0; limiter.knee.value = 0; limiter.ratio.value = 1; }
      }
    }
    // ---- 3D 环绕 ----
    if (cfg.panner && panNode) {
      if (cfg.panner.enable && !lfo && actx) {
        lfo = actx.createOscillator();
        lfoDepth = actx.createGain();
        lfo.frequency.value = 0.04 + ((cfg.panner.speed || 25) / 50) * 0.46; // v3.34:量纲映射修正(1-50 原生标度→0.04-0.5Hz,默认 25→0.27Hz 缓旋)
        lfoDepth.gain.value = 0.1 + ((cfg.panner.distance || 5) / 30) * 0.8;
        lfo.connect(lfoDepth); lfoDepth.connect(panNode.pan);
        lfo.start();
      } else if (!cfg.panner.enable && lfo) {
        try { lfo.stop(); } catch { /* ignore */ }
        lfo.disconnect(); lfo = null; lfoDepth = null;
        panNode.pan.value = 0;
      } else if (cfg.panner.enable && lfo && lfoDepth) {
        lfo.frequency.value = 0.04 + ((cfg.panner.speed || 25) / 50) * 0.46;
        lfoDepth.gain.value = 0.1 + ((cfg.panner.distance || 5) / 30) * 0.8;
      }
    }
    // pitch(变调):web 无 Sonic 级实现,不假装生效(playbackRate 会连带变速,不采用)
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
    curTrack = track;
    // v3.31(2026-09-21 修 WebDAV/鉴权流播放失败):PlayerProvider 传的是原生 audio-pro 的嵌套结构
    // {headers:{audio:{...},artwork:{...}}}(Controller.extractHeaders 语义);shim 此前原样收——
    // applyUrl 序列化出 {"audio":{...}} → 服务端 h= 白名单只收字符串值 → Authorization 整个被滤掉 → 上游 401。
    // 浏览器形态只需 audio 头;裸平铺结构(测试用)也兼容。
    const h = opts.headers as unknown as Record<string, unknown> | undefined;
    headers = (h && typeof h === 'object' && 'audio' in h && h.audio && typeof h.audio === 'object')
      ? h.audio as Record<string, string>
      : (h as Record<string, string> | undefined);
    ensureGraph(); actx?.resume?.().catch(() => {});
    applyUrl(track);
    if (opts.startTimeMs) seekSec(opts.startTimeMs / 1000);
    // 0922:同源代理 401(未登录 nm_auth 缺失)时 <audio> 只报 NotSupportedError——主动探测回明确错误,不再甩媒体格式错
    // lx170(老板 0923 03:22 修):此拦截误伤匿名直连场景——lx170 后匿名公开直链(听风/CDN,无鉴权头)
    // 不走代理可直接播,不应被拦截;仅当「本曲确实要走代理且无凭据」才拦截(有鉴权头 h= 的媒体库流服务端已放行)。
    const needProxyAuth = !IS_ELECTRON && !IS_DEV && !store.token && !(headers && Object.keys(headers).length);
    if (needProxyAuth && !isPublicDirectApplied) {
      emit(AudioProEventType.PLAYBACK_ERROR, { error: '播放失败：请先登录服务器账号（右上角设置→服务器连接）后再播放媒体库歌曲' });
      return;
    }
    // v3.31:play() 拒绝原因分类——NotAllowedError 才是真 autoplay blocked;
    // NotSupportedError/AbortError=媒体加载失败(src 401/404/格式),原标签把一切拒收都谎报成 autoplay
    if (opts.autoPlay !== false) audio.play().catch((err: { name?: string; message?: string }) => {
      const isAutoplay = err && (err.name === 'NotAllowedError' || /permission|gesture/i.test(String(err.message)));
      emit(AudioProEventType.PLAYBACK_ERROR, { error: isAutoplay ? 'autoplay blocked' : ('播放失败: ' + (err?.name || 'media error') + ' ' + (err?.message || '')).slice(0, 120) });
    });
  },
  pause(): void { audio.pause(); },
  resume(): void { audio.play().catch(() => {}); },
  stop(): void { audio.pause(); audio.removeAttribute('src'); state = AudioProState.STOPPED; },
  seekTo(ms: number): void { seekSec(ms / 1000); },
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
