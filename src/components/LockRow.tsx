// LockRow.tsx —— 拦截态行内（LEO 契约 §三）
// 视觉：锁形前缀 + 功能名 #595959 灰置（零 emoji，LockGlyph 复用 GateSheet）。
// 交互：locked 点击 → 打开对应 GateSheet（trigger=manual——显式点击=用户意图，
//       允许弹：触发三命第 2 条「二次静默」的唯一例外）；未锁 → 透传 onPress。
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../theme/tokens';
import { navRef } from '../navRef';
import { toast } from './Dialog';
import { GateSheet, LockGlyph } from './GateSheet';
import { license } from '../services/license';
import { CTA } from '../services/benefits';
import type { GateType, BrandGateType } from '../services/licenseCore';

export interface LockRowProps {
  feature: string;          // 功能名（列表行上下文）
  locked: boolean;          // license 判定
  gate: GateType;           // 点击时打开对应 GateSheet
  brandType?: BrandGateType; // library_brand 时必传
  onPress?: () => void;     // 未锁时的原行为
}

export function LockRow({ feature, locked, gate, brandType, onPress }: LockRowProps) {
  const [open, setOpen] = useState(false);

  const handlePress = () => {
    if (!locked) { onPress?.(); return; }
    setOpen(true); // manual：bypass 频控二次静默
  };

  return (
    <>
      <TouchableOpacity
        style={[st.row, locked && st.rowLocked]}
        activeOpacity={0.7}
        onPress={handlePress}
        disabled={!locked && !onPress}
      >
        {locked ? <LockGlyph size={13} color="#595959" /> : null}
        <Text style={[st.label, locked && st.labelLocked]} numberOfLines={1}>{feature}</Text>
      </TouchableOpacity>
      {open ? (
        <GateSheet
          gate={gate}
          brandType={brandType}
          onUpgrade={() => { setOpen(false); (navRef.current as unknown as { navigate?: (n: string) => void })?.navigate?.('License'); }}
          onTrial={() => {
            const r = license.startTrial();
            setOpen(false);
            toast(r.ok ? `已开启试用 · ${CTA.trial}` : r.reason);
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 4 },
  rowLocked: { opacity: 0.85 },
  label: { color: C.text2, fontSize: 13.5, lineHeight: 19 },
  labelLocked: { color: '#595959' },
});
