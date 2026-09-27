// audiotags.ts —— 本地曲库识别链第一环(模块② v3 A3):ID3v2 / Vorbis(OGG) / FLAC / MP4 标签 + 时长解析
// 设计:ChunkReader 抽象(按需切片读)——web 传 File.slice,原生后续可接 blob-util 切片;零第三方依赖。
// 手写 latin1/utf8/utf16 解码(Hermes 不保证 TextDecoder);所有读取有界(头部窗口 ≤512KB/尾部 8KB)。
// 解析失败一律返回空对象(调用方走文件名启发式兜底),永不抛错——识别链是尽力而为链。

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number; // 拿不到就 undefined(不过滤——<30s 过滤只对已知时长生效)
}
export type ChunkReader = (start: number, length: number) => Promise<Uint8Array>;

// ---------- 基础字节工具 ----------
function latin1(b: Uint8Array, s: number, e: number): string {
  let r = '';
  const end = Math.min(e, b.length);
  for (let i = s; i < end; i++) r += String.fromCharCode(b[i]);
  return r;
}
function utf8(b: Uint8Array, s: number, e: number): string {
  let r = '';
  const end = Math.min(e, b.length);
  let i = s;
  while (i < end) {
    const c = b[i];
    if (c < 0x80) { r += String.fromCharCode(c); i += 1; }
    else if (c < 0xE0 && i + 1 < end) { r += String.fromCharCode(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2; }
    else if (c < 0xF0 && i + 2 < end) { r += String.fromCharCode(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)); i += 3; }
    else if (i + 3 < end) {
      const cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      const v = cp - 0x10000;
      r += v >= 0 ? String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)) : String.fromCharCode(cp);
      i += 4;
    } else { r += String.fromCharCode(0xfffd); i += 1; }
  }
  return r;
}
function utf16(b: Uint8Array, s: number, e: number, bigEndian: boolean): string {
  let r = '';
  const end = Math.min(e, b.length - 1);
  for (let i = s; i < end; i += 2) {
    const u = bigEndian ? (b[i] << 8) | b[i + 1] : (b[i + 1] << 8) | b[i];
    r += String.fromCharCode(u);
  }
  return r;
}
function be32(b: Uint8Array, p: number): number { return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }
function le32(b: Uint8Array, p: number): number { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
function syncsafe32(b: Uint8Array, p: number): number { return ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f); }
function trimNull(s: string): string { return s.replace(/\u0000+$/g, '').replace(/^\uFEFF/g, ''); }

// ID3 文本帧解码(enc 首字节:0 latin1 / 1 utf16+BOM / 2 utf16BE / 3 utf8)
function decodeId3Text(d: Uint8Array): string {
  if (!d.length) return '';
  const enc = d[0];
  const body = d.subarray(1);
  if (enc === 1) {
    if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) return trimNull(utf16(body, 2, body.length, false));
    if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) return trimNull(utf16(body, 2, body.length, true));
    return trimNull(utf16(body, 0, body.length, false));
  }
  if (enc === 2) return trimNull(utf16(body, 0, body.length, true));
  if (enc === 3) return trimNull(utf8(body, 0, body.length));
  return trimNull(latin1(body, 0, body.length));
}

// ---------- ID3v2 (MP3 头部) ----------
const ID3_FRAME_WINDOW = 512 * 1024; // 帧区读取窗口(封面帧可能很大,标题帧一般在前)

async function parseId3(read: ChunkReader): Promise<{ tags: AudioTags; tagEnd: number } | null> {
  const h = await read(0, 10);
  if (h.length < 10 || latin1(h, 0, 3) !== 'ID3') return null;
  const ver = h[3]; // 2/3/4
  const flags = h[5];
  const size = syncsafe32(h, 6);
  const end = 10 + size;
  let pos = 10;
  if (flags & 0x40) {
    // 扩展头:v3=4 字节长度(不含自身),v4=syncsafe 含自身
    const eh = await read(pos, 6);
    if (eh.length >= 6) pos += ver === 4 ? syncsafe32(eh, 0) : be32(eh, 0) + 4;
  }
  const buf = await read(pos, Math.min(end - pos, ID3_FRAME_WINDOW));
  const tags: AudioTags = {};
  let p = 0;
  const idLen = ver === 2 ? 3 : 4;
  const headLen = ver === 2 ? 6 : 10;
  while (p + headLen <= buf.length) {
    const id = latin1(buf, p, p + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding/越界
    let fsize: number;
    if (ver === 2) fsize = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
    else if (ver === 4) fsize = syncsafe32(buf, p + 4);
    else fsize = be32(buf, p + 4);
    if (fsize <= 0 || p + headLen + fsize > buf.length) break;
    const dataStart = p + headLen;
    const want = ver === 2
      ? { TT2: 'title', TP1: 'artist', TAL: 'album' } as Record<string, keyof AudioTags>
      : { TIT2: 'title', TPE1: 'artist', TALB: 'album' } as Record<string, keyof AudioTags>;
    const field = want[id];
    if (field) {
      const v = decodeId3Text(buf.subarray(dataStart, dataStart + fsize)).trim();
      if (v) (tags as Record<string, unknown>)[field] = v;
    }
    p = dataStart + fsize;
    if (tags.title && tags.artist && tags.album) break; // 拿齐即止,少读封面大帧
  }
  return { tags, tagEnd: end };
}

// ---------- MP3 时长(Xing/Info 帧计数优先,退 CBR 估算) ----------
const MP3_BR_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MP3_BR_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MP3_SR: Record<number, number[]> = { 3: [44100, 48000, 32000, 0], 2: [22050, 24000, 16000, 0], 0: [11025, 12000, 8000, 0] };

async function mp3Duration(read: ChunkReader, size: number, skip: number): Promise<number | undefined> {
  const probe = await read(skip, 4096);
  let fp = 0;
  while (fp + 4 <= probe.length) {
    if (probe[fp] === 0xff && (probe[fp + 1] & 0xe0) === 0xe0) {
      const verBits = (probe[fp + 1] >> 3) & 3;
      const layerBits = (probe[fp + 1] >> 1) & 3;
      const brIdx = probe[fp + 2] >> 4;
      const srIdx = (probe[fp + 2] >> 2) & 3;
      if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) { fp++; continue; }
      const sr = MP3_SR[verBits]?.[srIdx];
      if (!sr) { fp++; continue; }
      const br = (verBits === 3 ? MP3_BR_V1L3 : MP3_BR_V2L3)[brIdx] * 1000;
      const samples = verBits === 3 ? 1152 : 576;
      const mono = ((probe[fp + 3] >> 6) & 3) === 3;
      // Xing/Info 定位:帧头 4B + 边信息(L3:V1 立体声 32/单声道 17;V2 立体声 17/单声道 9)
      const side = verBits === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
      const xOff = fp + 4 + side;
      const tag = latin1(probe, xOff, xOff + 4);
      if (tag === 'Xing' || tag === 'Info') {
        const xflags = be32(probe, xOff + 4);
        if (xflags & 1) {
          const frames = be32(probe, xOff + 8);
          if (frames > 0) return frames * samples / sr;
        }
      }
      if (br > 0 && size > skip) return (size - skip) * 8 / br; // CBR 估算
      return undefined;
    }
    fp++;
  }
  return undefined;
}

// ---------- Vorbis Comment(FLAC 块 / OGG 页共用) ----------
function parseVorbisComment(d: Uint8Array, out: AudioTags): void {
  let p = 0;
  if (d.length < 8) return;
  const vlen = le32(d, 0);
  p = 4 + vlen;
  if (p + 4 > d.length) return;
  const count = le32(d, p);
  p += 4;
  if (count > 10000) return; // 损坏防护
  for (let i = 0; i < count && p + 4 <= d.length; i++) {
    const l = le32(d, p);
    p += 4;
    if (l <= 0 || l > d.length - p || l > 4096) break;
    const key = latin1(d, p, p + l);
    const eq = key.indexOf('=');
    if (eq > 0) {
      const k = key.slice(0, eq).toUpperCase();
      const v = utf8(d, p + eq + 1, p + l).trim();
      if (v) {
        if (k === 'TITLE' && !out.title) out.title = v;
        else if (k === 'ARTIST' && !out.artist) out.artist = v;
        else if (k === 'ALBUM' && !out.album) out.album = v;
      }
    }
    p += l;
  }
}

// ---------- FLAC ----------
async function parseFlac(read: ChunkReader): Promise<AudioTags | null> {
  const h = await read(0, 4);
  if (h.length < 4 || latin1(h, 0, 4) !== 'fLaC') return null;
  const tags: AudioTags = {};
  let pos = 4;
  for (let i = 0; i < 64; i++) {
    const bh = await read(pos, 4);
    if (bh.length < 4) break;
    const last = (bh[0] & 0x80) !== 0;
    const type = bh[0] & 0x7f;
    const len = (bh[1] << 16) | (bh[2] << 8) | bh[3];
    if (len < 0 || pos + 4 + len > (64 << 20)) break; // 荒谬长度=损坏
    if (type === 0 && len >= 34) {
      const d = await read(pos + 4, 34);
      if (d.length >= 34) {
        const sr = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
        const total = (d[13] & 0x0f) * 0x100000000 + be32(d, 14);
        if (sr > 0 && total > 0) tags.durationSec = total / sr;
      }
    } else if (type === 4 && len > 8 && len <= (1 << 20)) {
      const d = await read(pos + 4, len);
      if (d.length > 8) parseVorbisComment(d, tags);
    }
    pos += 4 + len;
    if (last) break;
  }
  return tags;
}

// ---------- OGG(Vorbis / Opus) ----------
async function parseOgg(read: ChunkReader, size: number): Promise<AudioTags | null> {
  const head = await read(0, Math.min(size, 65536));
  if (head.length < 27 || latin1(head, 0, 4) !== 'OggS') return null;
  const tags: AudioTags = {};
  let sampleRate = 0;
  let preSkip = 0;
  let sawComment = false;
  let p = 0;
  while (p + 27 <= head.length) {
    if (latin1(head, p, p + 4) !== 'OggS') break;
    const segCount = head[p + 26];
    const dataStart = p + 27 + segCount;
    let dataLen = 0;
    for (let i = 0; i < segCount && p + 27 + i < head.length; i++) dataLen += head[p + 27 + i];
    const end = Math.min(dataStart + dataLen, head.length);
    const payload = head.subarray(dataStart, end);
    if (!sampleRate && payload.length >= 30 && payload[0] === 1 && latin1(payload, 1, 7) === 'vorbis') {
      sampleRate = le32(payload, 12);
    } else if (!sampleRate && payload.length >= 12 && latin1(payload, 0, 8) === 'OpusHead') {
      sampleRate = 48000;
      preSkip = payload[10] | (payload[11] << 8);
    }
    if (payload.length >= 8 && payload[0] === 3 && latin1(payload, 1, 7) === 'vorbis') {
      parseVorbisComment(payload.subarray(7), tags);
      sawComment = true;
    } else if (payload.length >= 8 && latin1(payload, 0, 8) === 'OpusTags') {
      parseVorbisComment(payload.subarray(8), tags);
      sawComment = true;
    }
    p = end;
  }
  // 时长:尾窗找最后一页的 granulepos(OggS 后偏移 6..13,LE int64;-1 页跳过)
  if (size > 8192) {
    const tl = Math.min(size, 8192);
    const tail = await read(size - tl, tl);
    for (let i = tail.length - 14; i >= 0; i--) {
      if (latin1(tail, i, i + 4) === 'OggS') {
        let allFF = true;
        let g = 0;
        for (let k = 13; k >= 6; k--) {
          const byt = tail[i + k];
          if (byt !== 0xff) allFF = false;
          g = g * 256 + byt;
        }
        if (!allFF && sampleRate) {
          tags.durationSec = Math.max(0, (g - preSkip) / sampleRate);
          break;
        }
      }
    }
  }
  if (!sawComment && !tags.durationSec) return tags; // 可能整页注释超出首窗——仍回已知信息
  return tags;
}

// ---------- MP4 / M4A ----------
async function parseMp4(read: ChunkReader, size: number): Promise<AudioTags | null> {
  const tags: AudioTags = {};
  const r8 = async (pos: number): Promise<{ sz: number; tp: string } | null> => {
    const h = await read(pos, 8);
    if (h.length < 8) return null;
    return { sz: be32(h, 0), tp: latin1(h, 4, 8) };
  };
  // 容器原子:一层 moov → (mvhd|udta>meta>ilst)
  let pos = 0;
  for (let g = 0; g < 64 && pos + 8 <= size; g++) {
    const a = await r8(pos);
    if (!a || a.sz < 8) break;
    if (a.tp === 'moov') {
      let q = pos + 8;
      const mEnd = Math.min(pos + a.sz, size);
      for (let g2 = 0; g2 < 32 && q + 8 <= mEnd; g2++) {
        const b = await r8(q);
        if (!b || b.sz < 8) break;
        if (b.tp === 'mvhd' && b.sz >= 32) {
          const d = await read(q + 8, 32);
          if (d.length >= 32 && d[0] === 0) {
            const ts = be32(d, 12);
            const dur = be32(d, 16);
            if (ts > 0 && dur > 0) tags.durationSec = dur / ts;
          }
        } else if (b.tp === 'udta' || b.tp === 'meta') {
          // meta 有 4 字节 version/flags 前缀;udta 无
          const inner = q + 8 + (b.tp === 'meta' ? 4 : 0);
          let r = inner;
          const uEnd = Math.min(q + b.sz, size);
          for (let g3 = 0; g3 < 16 && r + 8 <= uEnd; g3++) {
            const c = await r8(r);
            if (!c || c.sz < 8) break;
            if (c.tp === 'ilst') {
              await parseIlst(r + 8, Math.min(r + c.sz, size), read, tags);
            }
            r += c.sz;
          }
        }
        q += b.sz;
      }
      break; // moov 处理完即止
    }
    pos += a.sz;
  }
  return tags;
}

async function parseIlst(start: number, end: number, read: ChunkReader, tags: AudioTags): Promise<void> {
  // 条目原子名带 0xA9 前缀(©nam/©ART/©alb)——latin1 解出非打印字符,按第 2 字节判
  const map: Record<string, keyof AudioTags> = { nam: 'title', ART: 'artist', alb: 'album' };
  let p = start;
  for (let i = 0; i < 64 && p + 8 <= end; i++) {
    const h = await read(p, 8);
    if (h.length < 8) break;
    const sz = be32(h, 0);
    if (sz < 8) break;
    const t2 = latin1(h, 6, 8); // 跳过可能的 0xA9 首字节
    const field = map[t2];
    if (field) {
      const d = await read(p + 8, Math.min(sz - 8, 4096));
      if (d.length >= 16 && latin1(d, 4, 8) === 'data') {
        const v = utf8(d, 16, d.length).trim();
        if (v) (tags as Record<string, unknown>)[field] = v;
      }
    }
    p += sz;
  }
}

// ---------- 入口 ----------
const EXT_KIND: Record<string, string> = {
  mp3: 'mp3', flac: 'flac', ogg: 'ogg', oga: 'ogg', opus: 'ogg',
  m4a: 'mp4', mp4: 'mp4', m4b: 'mp4',
};

/** 读标签 + 时长;ext 为小写扩展名。任何失败返回空对象(识别链兜底)。 */
export async function readAudioTags(ext: string, read: ChunkReader, size: number): Promise<AudioTags> {
  try {
    const kind = EXT_KIND[ext];
    if (!kind) return {};
    if (kind === 'flac') return (await parseFlac(read)) || {};
    if (kind === 'ogg') return (await parseOgg(read, size)) || {};
    if (kind === 'mp4') return (await parseMp4(read, size)) || {};
    // mp3:ID3 标签 + 时长
    const id3 = await parseId3(read);
    const tags: AudioTags = id3?.tags || {};
    if (!tags.durationSec) tags.durationSec = await mp3Duration(read, size, id3 ? id3.tagEnd : 0);
    return tags;
  } catch {
    return {};
  }
}
