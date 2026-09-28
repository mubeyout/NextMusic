// license.ts —— D2 客户端授权服务层（MMKV 持久化 + 轻量订阅，模式同 settings.ts）
// 免费缺省 = 无 license 记录；trial 到期自动降 free（deriveView，记录保留供状态卡展示）。
// 紧凑码兑换：verifyCompactCode（纯 TS Ed25519，与发码器 licenseCore.signCompact 字节同径）。
import { useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';
import {
  verifyCompactCode, validatePayload, toRecord, deriveView, canUse as coreCanUse,
  isBrandAllowed as coreBrandAllowed, featuresPayloadMap, featuresFor, tierLimits,
  BRAND_GATE_TYPES, PRO_TYPE_ALTS, TIER_FEATURES, TIER_LIMITS,
  type LicenseRecord, type LicenseView, type LicensePayload, type GateResult, type BrandGateType, type LicenseTier,
} from './licenseCore';

const kv = createMMKV({ id: 'nextmusic-license' });

// ── 内置验签公钥（raw 32 字节 Ed25519，base64） ──
// ⚠️ 开发钥占位（2026-09-28 生成于本机，私钥不入库）——生产发码钥上线时：
//   1) 用生产 vendor 公钥替换下方常量（与 nextmusic-release 发码器 signCompact 的 privateKey 配对）；
//   2) 发码器侧保持 canonicalJson/payload v2 格式不变即天然互通。
export const LICENSE_PUBKEY_B64 = '7JYEEoaY/qRaPqfF3/W/3I1O/5jeLO9qpkmqnSHv9Ek='; // DEV-KEYPLACEHOLDER（生产替换点）
const TRIAL_DAYS = 7;
const DAY_MS = 86400000;

function loadRecord(): LicenseRecord | null {
  try {
    const raw = kv.getString('license');
    if (!raw) return null;
    const rec = JSON.parse(raw) as LicenseRecord;
    if (!rec || typeof rec !== 'object' || !rec.tier) return null;
    return rec;
  } catch {
    return null;
  }
}

let current: LicenseRecord | null = loadRecord();
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }

export type RedeemResult = { ok: true; tier: LicenseTier } | { ok: false; reason: string };

export const license = {
  /** 当前存储记录（原始；状态视图用 view()） */
  get(): LicenseRecord | null { return current; },
  /** 状态视图：tier/licensed/试用倒计时/到期降级（trial 过期→free） */
  view(now: number = Date.now()): LicenseView { return deriveView(current, now); },
  /** 紧凑码兑换：Ed25519 验签 + 载荷校验 → 覆盖存储并广播 */
  redeemCode(code: string): RedeemResult {
    const compact = String(code).replace(/\s+/g, '');
    const payload: LicensePayload | null = verifyCompactCode(compact, LICENSE_PUBKEY_B64);
    if (!payload) return { ok: false, reason: '兑换码无效（签名校验未通过）' };
    const v = validatePayload(payload, Date.now());
    if (!v.ok) return { ok: false, reason: v.reason };
    current = toRecord(payload, 'redeem');
    kv.set('license', JSON.stringify(current));
    emit();
    return { ok: true, tier: current.tier };
  },
  /** 试用启动链：本机自启 7 天 Pro 全权益（每安装一次；正式授权后不可再启） */
  startTrial(): RedeemResult {
    if (current) {
      const v = deriveView(current, Date.now());
      if (v.licensed) return { ok: false, reason: '当前已是授权状态，无需试用' };
    }
    if (kv.getString('trialUsed') === '1') return { ok: false, reason: '免费试用已使用过一次' };
    const now = Date.now();
    current = {
      v: 2, tier: 'trial',
      features: featuresPayloadMap(featuresFor('trial')),
      limits: tierLimits('trial'), seats: 1,
      iat: now, exp: now + TRIAL_DAYS * DAY_MS, source: 'trial-local',
    };
    kv.set('license', JSON.stringify(current));
    kv.set('trialUsed', '1');
    emit();
    return { ok: true, tier: 'trial' };
  },
  /** 门控判定（library_server 直通；免费→gate 建议弹层） */
  canUse(feature: string, now: number = Date.now()): GateResult {
    return coreCanUse(feature, current, now);
  },
  /** 品牌门（五类型新增连接拦免费；grandfather 语义=存量连接不经此判） */
  isBrandAllowed(brand: string, now: number = Date.now()): boolean {
    return coreBrandAllowed(brand, current, now);
  },
  /** 退出登录/调试：清除本机授权记录（不消 trialUsed——试用一次性） */
  clear() {
    kv.remove('license');
    current = null;
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

export function useLicense(): LicenseView {
  const [v, setV] = useState<LicenseView>(() => license.view());
  useEffect(() => {
    const fn = () => setV(license.view());
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return v;
}

export { BRAND_GATE_TYPES, PRO_TYPE_ALTS, TIER_FEATURES, TIER_LIMITS };
export type { BrandGateType, LicenseRecord, LicenseView, LicenseTier };
