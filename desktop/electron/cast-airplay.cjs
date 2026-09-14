/**
 * 桌面版(Mac) AirPlay 投屏（老板 2026-09-14：mac 版把 airplay 也做了）
 * 依赖:@lox-audioserver/node-airplay-sender(RAOP/AP2 认证+ALAC,纯 JS)
 *      @wasm-audio-decoders(mp3/flac 流式 WASM 解码)
 * 管线:URL 拉流(支持 Range/代理 URL) → wasm 解码 → 44.1k 重采样 → sendPcm(RAOP)
 * 局限(RAOP 线性流本质):seek 不支持;pause=停止喂流(接收端缓冲自然排空后停)
 */
const { Bonjour } = require('bonjour-service');

const SCAN_MS = 5000;
const PCM_RATE = 44100;

let sendFn = () => {};
function setSender(fn) { sendFn = fn; }
function emit(channel, payload) { try { sendFn(channel, payload); } catch { /* ignore */ } }

// ---------- 发现:mDNS _raop._tcp + _airplay._tcp(后者仅用来判 AP2) ----------

function startDiscovery() {
  stopDiscovery();
  const bonjour = new Bonjour();
  const seen = new Map(); // deviceid -> svc
  const ap2flags = new Map(); // name/deviceid -> true
  let raopBrowser = null, airplayBrowser = null;
  const flush = () => {
    for (const [uuid, svc] of seen) {
      const name = svc.txt?.cn || svc.name || 'AirPlay';
      const host = (svc.addresses || []).find((a) => a.includes('.')) || svc.addresses?.[0];
      if (!host) continue;
      emit('airplay.found', { uuid, name, host, port: svc.port || 5000, airplay2: !!ap2flags.get(uuid) || !!ap2flags.get(name) });
    }
  };
  airplayBrowser = bonjour.find({ type: 'airplay', protocol: 'tcp' }, (svc) => {
    // AP2 设备的 _airplay._tcp TXT 带 flags(sf)/pk 等;凡成对出现的按 AP2 对待
    const id = svc.txt?.deviceid || svc.txt?.cn || svc.name;
    if (id && svc.txt && (svc.txt.sf !== undefined || svc.txt.pk !== undefined)) ap2flags.set(id, true);
  });
  raopBrowser = bonjour.find({ type: 'raop', protocol: 'tcp' }, (svc) => {
    const uuid = svc.txt?.deviceid || svc.txt?.cn || svc.name;
    if (!uuid || seen.has(uuid)) return;
    seen.set(uuid, svc);
    flush(); // 增量上报
  });
  discoveryTimer = setTimeout(() => {
    flush();
    emit('airplay.scanEnd', {});
    for (const b of [raopBrowser, airplayBrowser]) { try { b && b.stop(); } catch { /* ignore */ } }
    try { bonjour.destroy(); } catch { /* ignore */ }
  }, SCAN_MS);
  discoveryCtx = { raopBrowser, airplayBrowser, bonjour };
}
let discoveryTimer = null;
let discoveryCtx = null;
function stopDiscovery() {
  clearTimeout(discoveryTimer);
  if (discoveryCtx) {
    const { raopBrowser, airplayBrowser, bonjour } = discoveryCtx;
    for (const b of [raopBrowser, airplayBrowser]) { try { b && b.stop(); } catch { /* ignore */ } }
    try { bonjour.destroy(); } catch { /* ignore */ }
    discoveryCtx = null;
  }
}

// ---------- 解码器(wasm 懒加载;main 进程 Node WebAssembly) ----------

let decoders = null;
async function getDecoders() {
  if (decoders) return decoders;
  const [mpeg, flac] = await Promise.all([
    import('mpg123-decoder'),
    import('@wasm-audio-decoders/flac'),
  ]);
  decoders = { MPEGDecoder: mpeg.MPEGDecoder, FLACDecoder: flac.FLACDecoder };
  return decoders;
}

function pickDecoder(contentType, url) {
  const ct = (contentType || '') + ' ' + url.toLowerCase();
  if (/mp3|mpeg|mpg/.test(ct)) return 'mp3';
  if (/flac/.test(ct)) return 'flac';
  if (/wav|wave/.test(ct)) return 'wav';
  return null; // m4a/aac 等:不支持,报明确错误
}

// 简单线性重采样(planar float → 拼立体交错 int16)
function toPcm16(channels /* float32[] */, sampleRate) {
  const frames = channels[0].length;
  let ch0 = channels[0], ch1 = channels[channels.length - 1];
  const ratio = sampleRate / PCM_RATE;
  if (Math.abs(ratio - 1) > 0.001) {
    const outN = Math.floor(frames / ratio);
    const a = new Float32Array(outN), b = new Float32Array(outN);
    for (let i = 0; i < outN; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src), frac = src - i0, i1 = Math.min(i0 + 1, frames - 1);
      a[i] = ch0[i0] + (ch0[i1] - ch0[i0]) * frac;
      b[i] = ch1[i0] + (ch1[i1] - ch1[i0]) * frac;
    }
    ch0 = a; ch1 = b;
  }
  const out = Buffer.allocUnsafe(ch0.length * 4); // 2ch * int16
  for (let i = 0; i < ch0.length; i++) {
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767))), i * 4);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch1[i] * 32767))), i * 4 + 2);
  }
  return out;
}

// wav(PCM16) 直接解:跳 44/扩展头,按 fmt 块转双声道 44.1k(v1 只吃 PCM16,不追 exotic wav)
function* wavChunks(buf) {
  // 找 data 块
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') { yield buf.subarray(off + 8, off + 8 + size); return; }
    off += 8 + size + (size % 2);
  }
}

// ---------- 会话 ----------

const sessions = new Map(); // uuid -> session
function sessionOf(dev) {
  return sessions.get(dev.uuid || `${dev.host}:${dev.port}`);
}

async function cast(dev, url, title, artist) {
  const { start } = require('@lox-audioserver/node-airplay-sender');
  stop(dev.uuid || `${dev.host}:${dev.port}`);
  const key = dev.uuid || `${dev.host}:${dev.port}`;

  // 拉流 + 探类型
  const head = await fetch(url, { headers: { Range: 'bytes=0-' } });
  if (!head.ok && head.status !== 206) throw new Error(`source HTTP ${head.status}`);
  const kind = pickDecoder(head.headers.get('content-type'), url);
  if (!kind) throw new Error('AirPlay 暂不支持该格式(m4a/aac),试试 mp3/flac 音质');

  const sender = start({ host: dev.host, port: dev.port, name: 'NextMusic', airplay2: !!dev.airplay2, volume: 50 });
  sender.setMetadata({ title: title || '未知歌曲', artist: artist || '' });
  const st = {
    sender, kind, url, pos: 0, dur: 0, state: 'PLAYING', vol: 50, feeding: true,
    bytesIn: 0, pcmQueue: Promise.resolve(),
  };
  sessions.set(key, st);

  // 喂流(异步;失败→会话自杀,轮询侧看到 IDLE)
  (async () => {
    try {
      if (kind === 'wav') {
        const buf = Buffer.from(await head.arrayBuffer());
        const total = buf.length;
        for (const chunk of wavChunks(buf)) { /* v1: wav 整段按 44.1k 假设直接推 */ 
          st.sender.sendPcm(chunk);
        }
        st.dur = total / 4 / PCM_RATE;
      } else {
        const { MPEGDecoder, FLACDecoder } = await getDecoders();
        const dec = kind === 'mp3' ? new MPEGDecoder() : new FLACDecoder();
        await dec.ready;
        const reader = head.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!st.feeding) return; // 已 stop/pause 丢弃
          st.bytesIn += value.byteLength;
          const { channelData, samplesDecoded, sampleRate } = await dec.decode(new Int8Array(value));
          if (samplesDecoded > 0) {
            const pcm = toPcm16(channelData, sampleRate);
            st.pos += samplesDecoded / sampleRate;
            st.dur = Math.max(st.dur, st.pos);
            st.sender.sendPcm(pcm);
          }
        }
        const fin = await dec.decode(new Int8Array());
        if (fin.samplesDecoded > 0 && st.feeding) {
          st.sender.sendPcm(toPcm16(fin.channelData, fin.sampleRate));
          st.pos += fin.samplesDecoded / fin.sampleRate;
          st.dur = Math.max(st.dur, st.pos);
        }
        dec.free();
      }
      if (!st.feeding) return;
      // 流尽:等 drain,置 IDLE 触发自动推进(PlayerProvider: dur>0 && IDLE && pos>=dur-3)
      st.state = 'IDLE';
    } catch (e) {
      st.state = 'IDLE';
      try { st.sender.stop(); } catch { /* ignore */ }
    }
  })();

  return true;
}

function stopByKey(key) {
  const st = sessions.get(key);
  if (!st) return true;
  sessions.delete(key);
  st.feeding = false;
  try { st.sender.stop(); } catch { /* ignore */ }
  return true;
}
const stop = (dev) => stopByKey(dev.uuid || `${dev.host}:${dev.port}`);

/** pause=停喂(接收端缓冲排空即静);play=续喂不可行(RAOP 无暂停语义)→ v1 记 PAUSED 态,进度冻结 */
async function pause(dev) {
  const st = sessionOf(dev); if (!st) return false;
  st.feeding = false; st.state = 'PAUSED';
  try { st.sender.stop(); } catch { /* ignore */ }
  // 会话保留:占位保持 UI 态;真正恢复=用户点该设备重投(或停止回本机)
  sessions.set(dev.uuid || `${dev.host}:${dev.port}`, st);
  return true;
}
const play = (dev) => Promise.resolve(false); // RAOP v1 不支持无损续播:seek/恢复需重投

function getPosition(dev) {
  const st = sessionOf(dev);
  if (!st) return Promise.resolve({ pos: 0, dur: 0, state: 'STOPPED' });
  return Promise.resolve({ pos: Math.floor(st.pos), dur: Math.floor(st.dur), state: st.state });
}
async function getVolume(dev) {
  const st = sessionOf(dev); return st ? st.vol : 50;
}
async function setVolume(dev, pct) {
  const st = sessionOf(dev); if (!st) return false;
  st.vol = Math.max(0, Math.min(100, Math.round(pct)));
  try { st.sender.setVolume(st.vol); return true; } catch { return false; }
}
const seek = () => Promise.resolve(false); // RAOP 线性流:v1 不支持 seek

function closeAll() { for (const k of [...sessions.keys()]) stopByKey(k); }

module.exports = {
  setSender, startDiscovery, stopDiscovery, cast, play, pause, stop, seek,
  getPosition, getVolume, setVolume, closeAll,
};
