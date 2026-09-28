// FeatureGate.tsx —— D2 补完：三功能 gate 入口接线共用件（LEO 契约 §四触发三命）
// 模式同 ProviderEditScreen 品牌拦截：入口 guard(run) → license.canUse 拦免费 →
// gating.shouldShow(auto) 三命：首弹 Sheet → 当日已弹 Toast 降级 → 7 天内二次静默。
// 授权（pro/family/m1_beta/试用期内 trial）即过；试用启动成功后重放原意图（=Pro 全权益即过）。
import React, { useState } from 'react';
import { GateSheet } from './GateSheet';
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
    // 触发三命（auto）：首弹 Sheet → 当日已弹 Toast 降级 → 7 天内二次静默
    const d = gating.shouldShow(gate, 'auto');
    if (d === 'sheet') { setRetry(() => run); setOpen(true); }
    else if (d === 'toast') toast(TOAST_DOWNGRADE);
    // silent：静默吞（入口锁标即视觉提示）
  };
  const close = () => { setOpen(false); setRetry(null); };
  return { gate, locked, open, guard, close, retry };
}

/** 标准 GateSheet 装配（与 LockRow/ProviderEditScreen 同径：升级→授权页；试用→开启+原意图重放） */
export function FeatureGateModal({ fg }: { fg: FeatureGateState }) {
  if (!fg.open) return null;
  return (
    <GateSheet
      gate={fg.gate}
      onUpgrade={() => { fg.close(); (navRef.current as unknown as { navigate?: (n: string) => void })?.navigate?.('License'); }}
      onTrial={() => {
        const r = license.startTrial();
        fg.close();
        if (r.ok) { toast(`已开启试用 · ${CTA.trial}`); fg.retry?.(); } // 试用=Pro 全权益，原意图即过
        else toast(r.reason);
      }}
      onDismiss={fg.close}
    />
  );
}
