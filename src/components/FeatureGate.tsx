// FeatureGate.tsx —— D2 补完：三功能 gate 入口接线共用件（LEO 契约 §四触发三命）
// 模式同 ProviderEditScreen 品牌拦截：入口 guard(run) → license.canUse 拦免费 →
// gating.shouldShow(auto) 三命：首弹 Sheet → 当日已弹 Toast 降级 → 7 天内二次静默。
// 授权（pro/family/m1_beta/试用期内 trial）即过；试用启动成功后重放原意图（=Pro 全权益即过）。
import React, { useState } from 'react';
import { BenefitsSheet } from './BenefitsSheet'; // [1013] 全屏权益页
import { toast } from './Dialog';
import { navRef } from '../navRef';
import { license, useLicense } from '../services/license';
import { gating } from '../services/gating';
import { CTA, TOAST_DOWNGRADE } from '../services/benefits';
import type { GateType } from '../services/licenseCore';

/** 本期接弹层的三功能 gate（library_brand 走 ProviderEditScreen 品牌门独立判定） */
export type FeatureGateKind = Exclude<GateType, 'library_brand'>;

export interface FeatureGateState {
  gate: FeatureGateKind;
  locked: boolean;                    // 入口锁标判定（免费=锁；兑换/试用后即时刷新）
  open: boolean;                      // GateSheet 展示态
  guard: (run: () => void) => void;   // 入口三命触发：授权过→run；免费拦→sheet/toast/silent
  close: () => void;
  retry: (() => void) | null;         // 弹 Sheet 时暂存的原意图（试用成功后重放）
}

export function useFeatureGate(gate: FeatureGateKind): FeatureGateState {
  useLicense(); // 订阅授权变化：兑换/试用/清除后锁标与判定即时刷新
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const locked = !license.canUse(gate).ok;
  const guard = (run: () => void) => {
    if (license.canUse(gate).ok) { run(); return; } // Pro/family/beta/试用内 trial 即过
    // [1012 老板⑤①闭环断裂核修] guard=按钮 onPress=显式用户意图→manual 直通 sheet——
    // 原实现硬编码 'auto'：首弹后当日点击=toast 闪现、7 天静默期点击=零反应(老板实测"点了没跳转"实况)。
    // 频控三命(auto)保留给被动触发场景;D2 契约"manual bypass"自此真正接线。
    const d = gating.shouldShow(gate, 'manual');
    if (d === 'sheet') { setRetry(() => run); setOpen(true); }
    else if (d === 'toast') toast(TOAST_DOWNGRADE);
    // silent：静默吞（入口锁标即视觉提示）
  };
  const close = () => { setOpen(false); setRetry(null); };
  return { gate, locked, open, guard, close, retry };
}

/** [1013 MOMO 升级令] 全屏权益页装配——取代小弹窗(老板:「就一个弹窗就这么点内容?」)
 *  输码/购买全内嵌(不再跳 License 页);试用→开启+原意图重放;品牌门(library_brand)保留 GateSheet 品牌卡形态。 */
export function FeatureGateModal({ fg }: { fg: FeatureGateState }) {
  if (!fg.open) return null;
  return (
    <BenefitsSheet
      visible={fg.open}
      onClose={fg.close}
      onTrial={() => {
        const r = license.startTrial();
        fg.close();
        if (r.ok) { toast(`已开启试用 · ${CTA.trial}`); fg.retry?.(); } // 试用=Pro 全权益，原意图即过
        else toast(r.reason);
      }}
    />
  );
}
