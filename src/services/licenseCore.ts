// licenseCore.ts —— D2 客户端授权底座（纯 TS，零 RN 依赖：Node 冒烟脚本可直跑）
// 对齐源：nextmusic-release/server/server/licenseCore.js（signCompact/verifyCompact 载荷格式、
// TIER_FEATURES/PRO_TYPE_ALTS/TIER_LIMITS 逐字段镜像——客户端服务层与发码器字节级同径）。
// 验签：纯 TS Ed25519（BigInt）——RN/Hermes、web、desktop、node 同一份实现，无原生模块依赖。
// 冒烟：scripts/d2-smoke.mjs 用 node:crypto（发码器同款）签码 → 本模块 verifyCompactCode 验签，
//       字节级互通即证 canonicalJson/b64url/Ed25519 与 release 端一致。

// ── SHA-512（纯 BigInt，RFC 6234 常量表） ──
const M64 = (1n << 64n) - 1n;
const K512: readonly bigint[] = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];
const rotr64 = (x: bigint, n: number): bigint => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64;

export function sha512(msg: Uint8Array): Uint8Array {
  const H: bigint[] = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
  ];
  const l = msg.length;
  const k = (112 - ((l + 1) % 128) + 128) % 128; // 追加 0x80 后补 0 至 ≡112 mod 128，再拼 16 字节位长
  const total = l + 1 + k + 16;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[l] = 0x80;
  const bits = BigInt(l) * 8n; // 16 字节大端位长（消息 <2^53 字节，BigInt 精确）
  for (let i = 0; i < 16; i++) buf[total - 16 + i] = Number((bits >> BigInt(8 * (15 - i))) & 0xffn);
  const W: bigint[] = new Array(80);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 16; i++) {
      const o = off + i * 8;
      W[i] = ((BigInt(buf[o]) << 56n) | (BigInt(buf[o + 1]) << 48n) | (BigInt(buf[o + 2]) << 40n) |
        (BigInt(buf[o + 3]) << 32n) | (BigInt(buf[o + 4]) << 24n) | (BigInt(buf[o + 5]) << 16n) |
        (BigInt(buf[o + 6]) << 8n) | BigInt(buf[o + 7])) & M64;
    }
    for (let t = 16; t < 80; t++) {
      const s0 = rotr64(W[t - 15], 1) ^ rotr64(W[t - 15], 8) ^ (W[t - 15] >> 7n);
      const s1 = rotr64(W[t - 2], 19) ^ rotr64(W[t - 2], 61) ^ (W[t - 2] >> 6n);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) & M64;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 80; t++) {
      const S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K512[t] + W[t]) & M64;
      const S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & M64;
      h = g; g = f; f = e; e = (d + t1) & M64;
      d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    H[0] = (H[0] + a) & M64; H[1] = (H[1] + b) & M64; H[2] = (H[2] + c) & M64; H[3] = (H[3] + d) & M64;
    H[4] = (H[4] + e) & M64; H[5] = (H[5] + f) & M64; H[6] = (H[6] + g) & M64; H[7] = (H[7] + h) & M64;
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((H[i] >> BigInt(8 * (7 - j))) & 0xffn);
  }
  return out;
}

// ── Ed25519 验签（RFC 8032，纯 BigInt；只实现 verify——签发在发码器/服务端） ──
const P = (1n << 255n) - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n; b %= m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const D = ((-121665n * modPow(121666n, P - 2n, P)) % P + P) % P;
const SQRT_M1 = modPow(2n, (P - 1n) / 4n, P);
const Bx = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
const By = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;

interface Pt { x: bigint; y: bigint; z: bigint; t: bigint } // 扩展齐次坐标：x=X/Z, y=Y/Z, xy=T/Z
const B: Pt = { x: Bx, y: By, z: 1n, t: (Bx * By) % P };

const modP = (v: bigint): bigint => { const r = v % P; return r >= 0n ? r : r + P; }; // JS BigInt % 保留负号——归一到 [0,P)
function ptAdd(p: Pt, q: Pt): Pt {
  const A = modP((p.y - p.x) * (q.y - q.x));
  const Bv = modP((p.y + p.x) * (q.y + q.x));
  const C = modP(2n * p.t * q.t * D);
  const Dd = modP(2n * p.z * q.z);
  const E = modP(Bv - A), F = modP(Dd - C), G = modP(Dd + C), Hh = modP(Bv + A);
  return { x: modP(E * F), y: modP(G * Hh), z: modP(F * G), t: modP(E * Hh) };
}
function ptMul(s: bigint, p: Pt): Pt {
  let r: Pt = { x: 0n, y: 1n, z: 1n, t: 0n };
  let q = p;
  while (s > 0n) {
    if (s & 1n) r = ptAdd(r, q);
    q = ptAdd(q, q);
    s >>= 1n;
  }
  return r;
}
function leToBigInt(b: Uint8Array, from: number, len: number): bigint {
  let v = 0n;
  for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[from + i]);
  return v;
}
function decodePoint(bytes: Uint8Array): Pt | null {
  if (bytes.length !== 32) return null;
  const x0 = (bytes[31] >> 7) & 1;
  const y = leToBigInt(bytes, 0, 32) & ((1n << 255n) - 1n);
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  const v3 = (v * v * v) % P;
  const v7 = (v3 * v3 * v) % P;
  let x = (u * v3 * modPow((u * v7) % P, (P - 5n) / 8n, P)) % P;
  if (((v * x * x) % P) === (P - u) % P) x = (x * SQRT_M1) % P;
  if (((v * x * x) % P) !== u) return null;
  if (x === 0n && x0 === 1) return null;
  if ((x & 1n) !== BigInt(x0)) x = (P - x) % P;
  return { x, y, z: 1n, t: (x * y) % P };
}

/** Ed25519 验签（msg=原始字节；sig 64B=R‖S；pub 32B raw） */
export function verifyEd25519(msg: Uint8Array, sig: Uint8Array, pub: Uint8Array): boolean {
  if (sig.length !== 64 || pub.length !== 32) return false;
  const A = decodePoint(pub);
  const R = decodePoint(sig.subarray(0, 32));
  if (!A || !R) return false;
  const S = leToBigInt(sig, 32, 32);
  if (S >= L) return false;
  const hIn = new Uint8Array(64 + msg.length);
  hIn.set(sig.subarray(0, 32), 0); hIn.set(pub, 32); hIn.set(msg, 64);
  const k = leToBigInt(sha512(hIn), 0, 64) % L;
  // 校验 [S]B = R + [k]A（交叉相乘判等，免除歧）
  const lhs = ptMul(S, B);
  const rhs = ptAdd(R, ptMul(k, A));
  const xEq = modP(lhs.x * rhs.z) === modP(rhs.x * lhs.z);
  const yEq = modP(lhs.y * rhs.z) === modP(rhs.y * lhs.z);
  return xEq && yEq;
}

// ── base64 / base64url 解码（无 Buffer 依赖） ──
const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function unb64(s: string, alpha: string): Uint8Array {
  const out: number[] = [];
  let val = 0, bits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const i = alpha.indexOf(ch);
    if (i < 0) throw new Error('bad base64 char');
    val = (val << 6) | i; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}
export function unb64u(s: string): Uint8Array { return unb64(s, B64_URL); }
export function unb64std(s: string): Uint8Array { return unb64(s, B64_STD); }
const utf8 = new TextEncoder();
export function utf8Bytes(s: string): Uint8Array { return utf8.encode(s); }

// ── canonicalJson（与 release licenseCore.js 字节一致：键排序/数组保序/JSON.stringify 原子值） ──
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const o = obj as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

/**
 * 紧凑码验签（= release licenseCore.verifyCompact 客户端同款）
 * 码格式：b64u(canonicalJson(payload)) + '.' + b64u(Ed25519 sig)（vendor 私钥签发，公钥内置）
 * @param code 兑换码原文（首尾空白容忍）
 * @param pubkeyB64 raw 32 字节公钥的 base64（标准字母表）
 * @returns 验签通过且 JSON 可解析 → payload；否则 null
 */
export function verifyCompactCode(code: string, pubkeyB64: string): Record<string, unknown> | null {
  try {
    const parts = String(code).trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const body = unb64u(parts[0]);
    const sig = unb64u(parts[1]);
    const pub = unb64std(pubkeyB64);
    if (!verifyEd25519(body, sig, pub)) return null;
    return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── tier 语义（镜像 release licenseCore：pro/family=买断 perpetual；trial=限时 Pro 全权益；m1_beta=全开） ──
export type LicenseTier = 'pro' | 'family' | 'm1_beta' | 'trial';
export const TIER_FEATURES: Record<string, string[]> = {
  free: [],
  pro: ['eq_custom', 'lyrics_deep', 'webdav_backup', 'offline_batch', 'progress_roam', 'tv_pack', 'carlink', 'theme_store'],
  family: ['share_group'], // = pro 全集 + share_group（payload 布尔节已并集展开）
  m1_beta: ['*'],
  trial: [],
};
export const PROVIDER_FEATURES = ['provider_emby', 'provider_plex', 'provider_audiostation', 'provider_feiniu', 'provider_daoliyu'];
export const TIER_LIMITS: Record<string, Record<string, number>> = {
  free: { library_connections: 2 },
  trial: { library_connections: -1 },
  pro: { library_connections: -1 },
  family: { library_connections: -1 },
  m1_beta: { library_connections: -1 },
};
/** 等价物引导表（镜像 release PRO_TYPE_ALTS——品牌门拦截提示用，语序锁死：先免费路径后升级） */
export const PRO_TYPE_ALTS: Record<string, string> = {
  emby: 'Jellyfin', plex: 'Jellyfin', audiostation: 'WebDAV', feiniu: 'WebDAV', daoliyu: 'Navidrome',
};
/** 品牌门五类型（audiostation=群晖；d2 契约写 synology，客户端/发码器正名 audiostation） */
export type BrandGateType = 'emby' | 'plex' | 'audiostation' | 'feiniu' | 'daoliyu';
export const BRAND_GATE_TYPES: readonly BrandGateType[] = ['emby', 'plex', 'audiostation', 'feiniu', 'daoliyu'];
export function isBrandGateType(t: string): t is BrandGateType {
  return (BRAND_GATE_TYPES as readonly string[]).includes(t);
}

export function tierLimits(tier: string): Record<string, number> {
  return { ...(TIER_LIMITS[tier] || TIER_LIMITS.free) };
}
export function featuresFor(tier: string, extra?: string[]): string[] {
  const base = (tier === 'family' || tier === 'trial') ? [...TIER_FEATURES.pro] : [...(TIER_FEATURES[tier] || [])];
  if (tier === 'family') base.push('share_group');
  if (Array.isArray(extra)) base.push(...extra);
  return base;
}
/** payload v2 features 布尔节（镜像 featuresPayloadMap：'*' 展开 + 五源恒真） */
export function featuresPayloadMap(featureList: string[] | Record<string, boolean>): Record<string, boolean> {
  if (!Array.isArray(featureList)) return { ...featureList };
  const all = featureList.includes('*');
  const map: Record<string, boolean> = {};
  for (const f of new Set([...Object.values(TIER_FEATURES).flat(), ...featureList])) {
    if (f !== '*') map[f] = all || featureList.includes(f);
  }
  for (const p of PROVIDER_FEATURES) map[p] = true;
  return map;
}

// ── 兑换载荷校验 → 本机存储记录 ──
export interface LicenseRecord {
  v: 2;
  tier: LicenseTier;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  seats: number;
  iat: number;
  exp: number | null; // trial=限时；pro/family/m1_beta=perpetual(null)
  key?: string;
  source: 'redeem' | 'trial-local';
}
export type LicensePayload = Record<string, unknown>;

export function validatePayload(p: LicensePayload | null, now: number): { ok: true } | { ok: false; reason: string } {
  if (!p || typeof p !== 'object') return { ok: false, reason: '兑换码格式错误' };
  const tier = p.tier;
  if (tier !== 'pro' && tier !== 'family' && tier !== 'm1_beta' && tier !== 'trial') return { ok: false, reason: '不支持的授权类型' };
  const exp = p.exp;
  if (exp != null && (typeof exp !== 'number' || !Number.isFinite(exp))) return { ok: false, reason: '兑换码有效期字段无效' };
  if (typeof exp === 'number' && exp <= now) return { ok: false, reason: '兑换码已过期' };
  return { ok: true };
}

export function toRecord(p: LicensePayload, source: 'redeem' | 'trial-local' = 'redeem'): LicenseRecord {
  const tier = (p.tier as LicenseTier) || 'pro';
  const rawFeatures = p.features;
  const features = Array.isArray(rawFeatures)
    ? featuresPayloadMap(rawFeatures)
    : (rawFeatures && typeof rawFeatures === 'object' ? featuresPayloadMap(rawFeatures as Record<string, boolean>) : featuresPayloadMap(featuresFor(tier)));
  return {
    v: 2,
    tier,
    features,
    limits: (p.limits && typeof p.limits === 'object' ? { ...p.limits as Record<string, number> } : tierLimits(tier)),
    seats: typeof p.seats === 'number' ? p.seats : 1,
    iat: typeof p.iat === 'number' ? p.iat : Date.now(),
    exp: typeof p.exp === 'number' ? p.exp : null,
    key: typeof p.key === 'string' ? p.key : undefined,
    source,
  };
}

// ── 状态视图（trial 到期自动降 free；m1_beta 直通全开） ──
export interface LicenseView {
  tier: LicenseTier | 'free';
  licensed: boolean;          // pro/family/m1_beta/试用期内 trial
  isTrial: boolean;
  trialExpired: boolean;
  trialDaysLeft: number;      // 非 trial 或已过期 = -1
  isBeta: boolean;
  exp: number | null;
  seats: number;
  limits: Record<string, number>;
}
export const FREE_VIEW: LicenseView = {
  tier: 'free', licensed: false, isTrial: false, trialExpired: false, trialDaysLeft: -1,
  isBeta: false, exp: null, seats: 1, limits: tierLimits('free'),
};
export function deriveView(rec: LicenseRecord | null, now: number): LicenseView {
  if (!rec) return { ...FREE_VIEW };
  const expired = rec.exp != null && rec.exp <= now;
  const base: LicenseView = {
    tier: rec.tier, licensed: !expired,
    isTrial: rec.tier === 'trial', trialExpired: rec.tier === 'trial' && expired,
    trialDaysLeft: -1, isBeta: rec.tier === 'm1_beta',
    exp: rec.exp, seats: rec.seats, limits: rec.limits || tierLimits(rec.tier),
  };
  if (expired) {
    // trial 到期 → 自动降 free（记录保留：TrialBar 显「试用已结束」）；pro/family 无 exp 不至此
    return { ...base, tier: 'free', licensed: false, trialDaysLeft: -1, limits: tierLimits('free') };
  }
  if (rec.tier === 'trial' && rec.exp != null) {
    base.trialDaysLeft = Math.max(0, Math.ceil((rec.exp - now) / 86400000));
  }
  return base;
}

// ── 门控判定（library_server 基础直通；免费默认=无 license 记录） ──
export type GateType = 'eq_custom' | 'lyrics_deep' | 'webdav_backup' | 'library_brand';
/** 客户端本期接弹层的三个功能 gate（品牌门走 isBrandAllowed 独立判定） */
export const CLIENT_GATES: Partial<Record<string, GateType>> = {
  eq_custom: 'eq_custom', lyrics_deep: 'lyrics_deep', webdav_backup: 'webdav_backup',
};
const UNGATED_FEATURES = new Set(['library_server']);
export interface GateResult { ok: boolean; gate?: GateType }
export function canUse(feature: string, rec: LicenseRecord | null, now: number): GateResult {
  if (UNGATED_FEATURES.has(feature)) return { ok: true };
  const v = deriveView(rec, now);
  if (v.licensed) return { ok: true };
  return { ok: false, gate: CLIENT_GATES[feature] };
}
/** 品牌门：五类型新增连接拦免费（grandfather：存量连接不经此判——UI 侧只在新增时调用） */
export function isBrandAllowed(brand: string, rec: LicenseRecord | null, now: number): boolean {
  if (!isBrandGateType(brand)) return true;
  return deriveView(rec, now).licensed;
}

// ── 触发频控纯判定（MMKV 键由 services/gating.ts 管；键名：gate_seen:{gate}:{day} + gate_quiet:{gate}） ──
export type GateDecision = 'sheet' | 'silent' | 'toast';
/**
 * 触发三命：条件命中首弹 sheet → 当日已弹 toast 降级 → 7 天内二次静默（LockRow only）。
 * manual=LockRow 显式点击（用户意图=允许弹，三命第 2 条的例外）。
 */
export function gateDecision(o: { manual?: boolean; seenToday?: boolean; withinQuiet7d?: boolean }): GateDecision {
  if (o.manual) return 'sheet';
  if (o.seenToday) return 'toast';
  if (o.withinQuiet7d) return 'silent';
  return 'sheet';
}
