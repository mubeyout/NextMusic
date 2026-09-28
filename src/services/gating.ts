// gating.ts —— GateSheet 触发频控（D2 契约 §四：触发三命）
// MMKV 键：gate_seen:{gate}:{day}（当日已弹标记，day=本地日期 YYYY-MM-DD）
//          gate_quiet:{gate}（最近弹出时间戳，7 天静默窗）
// 三命：条件命中首弹 sheet → 当日已弹 toast 降级 → 7 天内二次静默（LockRow only）。
// LockRow 显式点击 = manual，直通 sheet（三命第 2 条例外：用户意图=允许弹）。
// 家庭行不单独记频（随宿主 Sheet 继承）。
import { createMMKV } from 'react-native-mmkv';
import { gateDecision, type GateDecision, type GateType } from './licenseCore';

const kv = createMMKV({ id: 'nextmusic-gating' });
const QUIET_MS = 7 * 86400000;

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const gating = {
  /**
   * 触发判定。manual=LockRow 点击等显式意图（bypass 三命）；
   * auto=条件命中（启用 Pro 功能/点品牌添加卡）——按频控三命返回。
   */
  shouldShow(gate: GateType, trigger: 'auto' | 'manual' = 'auto', now: number = Date.now()): GateDecision {
    const d = new Date(now);
    const seenToday = kv.getString(`gate_seen:${gate}:${dayKey(d)}`) === '1';
    const lastShown = kv.getNumber(`gate_quiet:${gate}`);
    const withinQuiet = typeof lastShown === 'number' && now - lastShown < QUIET_MS;
    return gateDecision({ manual: trigger === 'manual', seenToday, withinQuiet7d: withinQuiet });
  },
  /** 记弹（Sheet 展示即记：当日键 + 7 天静默时间戳；顺清历史日键） */
  markShown(gate: GateType, now: number = Date.now()) {
    const d = new Date(now);
    const today = `gate_seen:${gate}:${dayKey(d)}`;
    for (const k of kv.getAllKeys()) {
      if (k.startsWith(`gate_seen:${gate}:`) && k !== today) kv.remove(k);
    }
    kv.set(today, '1');
    kv.set(`gate_quiet:${gate}`, now);
  },
};
