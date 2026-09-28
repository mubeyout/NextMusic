// benefits.ts —— D2 gating 文案字段源（copy pack §3§8 + gating-ui-handoff-spec v1 逐字直引）
// 纪律：GateSheet/LockRow/品牌拦截/授权页 一切用户可见字符串只从本模块取（组件内零硬编码句）。
// 禁 ✗ 纪律：本文件全部文案不含 ✗/贬低语；免费面只写「免费」，禁「限时免费」。
import { PRO_TYPE_ALTS, type BrandGateType, type GateType } from './licenseCore';

// ── 价格/动作行（benefits.cta / links） ──
export const CTA = {
  main: '升级 Pro ¥19.9',
  trial: '先免费试用 7 天',
  dismiss: '稍后再说',
} as const;

// ── 频控降级 Toast（触发三命第 3 命） ──
export const TOAST_DOWNGRADE = '升级 Pro 解锁此功能 →';

// ── 家庭位（§8 canonical + handoff §二场景加权） ──
export const FAMILY = {
  silentLine: '全家一起用？ 家庭版 ¥88 一次买断 · ≤6 人共享全部 Pro · 已购补差 ¥68 · 了解家庭版',
  deviceCap: '设备到顶了？家庭版全家 6 人每人各 5 台 · ¥88 终身',
  shareIntent: '想和家人共享曲库？一人整理全家直接听 · ¥88 终身',
} as const;

// ── 品牌门（handoff §三：品牌五名单 + PRO 角标 + 等价物句式——先免费路径后升级，语序锁死禁倒置） ──
export const BRAND_LABELS: Record<BrandGateType, string> = {
  emby: 'Emby', plex: 'Plex', audiostation: '群晖', feiniu: '飞牛', daoliyu: '道理鱼',
};
export const BRAND_BADGE = 'PRO';            // 品牌卡金边角标
export const BRAND_ECO_SUFFIX = '品牌 NAS 生态'; // 品牌类型卡标题后缀（契约 mock：「Emby · 品牌 NAS 生态」）

/** 等价物三行（类型卡正文；消费 licenseCore.PRO_TYPE_ALTS，语序锁死：免费先/升级后） */
export function brandAltLines(brand: BrandGateType): [string, string, string] {
  const label = BRAND_LABELS[brand];
  const alt = PRO_TYPE_ALTS[brand] || 'Jellyfin';
  return [`想要 ${label} 生态？`, `${alt} 免费也能连，`, `或 ¥19.9 解锁全品牌`];
}

// ── 四 gate 文案（copy pack §3 逐字；library_brand 说明句由等价物三行替代） ──
export interface GateCopy { title: string; desc: string; bullets: [string, string, string] }
export const GATE_COPY: Record<GateType, GateCopy> = {
  eq_custom: {
    title: 'Pro 功能',
    desc: '免费已有基础 EQ 面板 → Pro 增加 10 段自定义 + 空间音效',
    bullets: ['10 段自定义 EQ', '空间音效', '一次买断 ¥19.9 · 终身无订阅'],
  },
  lyrics_deep: {
    title: 'Pro 功能',
    desc: '免费已有歌词显示 → Pro 增加逐字 · 双语 · 桌面悬浮',
    bullets: ['逐字歌词', '双语对照', '桌面悬浮歌词'],
  },
  webdav_backup: {
    title: 'Pro 功能',
    desc: 'WebDAV 云备份——歌单、设置、预设一处备份，多处还原',
    bullets: ['全量备份（歌单/设置/预设）', '换机多端一键还原', '一次买断 ¥19.9 · 终身'],
  },
  library_brand: {
    title: 'Pro 功能',
    desc: '', // 品牌门说明区=类型卡形态（brandAltLines），不走通用说明句
    bullets: ['', '', ''],
  },
};

// ── 授权与升级页（LicenseScreen 文案字段） ──
export const LICENSE_PAGE = {
  title: '授权与升级',
  statusTitle: '当前状态',
  tiers: {
    free: { label: '免费版', desc: '获取和播放音乐的能力永久免费——以上不设关卡' },
    pro: { label: 'Pro', desc: '一次买断 ¥19.9 · 终身使用 · 无订阅无广告' },
    family: { label: '家庭版', desc: '¥88 一次买断 · ≤6 人共享全部 Pro' },
    trial: { label: 'Pro 试用', desc: 'Pro 全权益开放中' },
    m1_beta: { label: '内测通道', desc: 'M1 内测 · 全功能开放' },
  } as Record<string, { label: string; desc: string }>,
  trialDaysLeft: (n: number) => `试用剩 ${n} 天`,
  trialExpired: '试用已结束 → ¥19.9 买断继续',
  redeemTitle: '兑换码',
  redeemHint: '输入激活码（NM- 开头或紧凑兑换码）',
  redeemBtn: '兑换',
  redeemOk: (t: string) => `兑换成功 · 已激活 ${t}`,
  trialStart: '开始 7 天免费试用',
  trialUsed: '免费试用已使用过一次',
  trialStarted: '试用已开启 · Pro 全权益开放 7 天',
  familyEntry: '升级家庭 ¥68',
  familyEntrySub: '已是 Pro？补差 ¥68 升级家庭版 · ≤6 人共享',
  familyLinkSoon: '家庭版购买链接即将开放，请稍后再试',
  betaNote: '内测版本 · 功能全开',
} as const;

// ── 外链占位（面包多商品链接后续配置；空串=入口降级 toast） ──
export const BUY_LINKS = {
  pro: '',   // 生产：面包多 Pro ¥19.9 商品链接
  family: '',// 生产：面包多 家庭版 ¥88 / 补差 ¥68 商品链接
} as const;
