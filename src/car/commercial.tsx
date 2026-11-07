// commercial.tsx —— [商业化三件·LEO 1107 规格] TrialBar/QuotaBar/PaywallCard
// 纪律:文案零硬编码(走 services/benefits.ts)·结构性色全 C token·字号只用 31/22/18/16/15/13/12·投影禁用·触控热区≥44
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, FS } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { ProTag } from '../components/ProTag';
import { LockGlyph } from '../components/GateSheet';
import { CTA, FAMILY, GATE_COPY } from '../services/benefits';
import { CAR } from './cartokens';

const FSZ = { sec: 22, title: 18, body: 16, sub: 15, mini: 13, tiny: 12 } as const;

/** 试用条:内容区顶部通栏(h44/底 surface2/下边线 border/r12) */
export function TrialBar({ daysLeft, onOpen, onClose }: { daysLeft: number; onOpen: () => void; onClose: () => void }) {
  return (
    <View style={st.trial}>
      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={onOpen}>
        <Text style={st.trialText}>{CTA.trial}</Text>
        <View style={st.trialBadge}><Text style={st.trialBadgeText}>{`试用剩余 ${daysLeft} 天`}</Text></View>
      </TouchableOpacity>
      <TouchableOpacity style={st.trialX} onPress={onClose} hitSlop={10}><Icon name="close" size={14} color={C.text3} /></TouchableOpacity>
    </View>
  );
}

/** 配额条:标签行(13/15)+轨道(8/r4,满载 danger)+底部说明(13) */
export function QuotaBar({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const full = ratio >= 0.9;
  return (
    <View style={{ gap: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={st.quotaLabel}>{label}</Text>
        <Text style={[st.quotaValue, full && { color: C.danger }]}>{`${used}/${limit} 台`}</Text>
      </View>
      <View style={st.quotaTrack}>
        <View style={{ flex: ratio, backgroundColor: full ? C.danger : C.brand, borderRadius: 4 }} />
      </View>
      {hint ? <Text style={st.quotaHint}>{hint}</Text> : null}
    </View>
  );
}

/** 付费墙卡:卡位形态(不重做 GateSheet,点击仍走弹层) */
export function PaywallCard({ title, desc, bullets, onPrimary, onTrial, onDismiss, locked }: {
  title: string; desc?: string; bullets?: string[]; onPrimary: () => void; onTrial?: () => void; onDismiss?: () => void; locked?: boolean;
}) {
  return (
    <View style={st.pay}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ProTag />
        <Text style={st.payTitle} numberOfLines={1}>{title}</Text>
        {locked ? <LockGlyph size={14} color={C.text3} /> : null}
      </View>
      {desc ? <Text style={st.payDesc} numberOfLines={2}>{desc}</Text> : null}
      {bullets?.length ? (
        <View style={{ gap: 8 }}>
          {bullets.slice(0, 4).map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={st.check}><Icon name="check" size={12} active color={C.brand} /></View>
              <Text style={st.bullet}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <TouchableOpacity style={st.payCta} onPress={onPrimary}>
        <Text style={st.payCtaText}>{CTA.main}</Text>
      </TouchableOpacity>
      {onTrial ? <TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={onTrial}><Text style={st.payTrial}>{CTA.trial}</Text></TouchableOpacity> : null}
      {onDismiss ? <TouchableOpacity style={{ minHeight: 44, justifyContent: 'center' }} onPress={onDismiss}><Text style={st.payDismiss}>{CTA.dismiss}</Text></TouchableOpacity> : null}
    </View>
  );
}

const st = {
  trial: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 44, paddingHorizontal: 18, backgroundColor: C.surface2, borderBottomWidth: 1, borderBottomColor: C.border, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  trialText: { color: C.text2, fontSize: FSZ.mini },
  trialBadge: { height: 22, borderRadius: 11, paddingHorizontal: 10, backgroundColor: C.brandDim, justifyContent: 'center' as const },
  trialBadgeText: { color: C.brandText, fontSize: FSZ.tiny },
  trialX: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  quotaLabel: { color: C.text2, fontSize: FSZ.mini, flex: 1 },
  quotaValue: { color: C.text, fontSize: FSZ.sub },
  quotaTrack: { flexDirection: 'row' as const, height: 8, borderRadius: 4, backgroundColor: C.track, overflow: 'hidden' as const },
  quotaHint: { color: C.text3, fontSize: FSZ.mini },
  pay: { backgroundColor: C.surface2, borderRadius: 17, borderWidth: 1, borderColor: C.border, padding: 22, gap: 18 },
  payTitle: { color: C.text, fontSize: FSZ.title, fontWeight: '700' as const, flex: 1 },
  payDesc: { color: C.text2, fontSize: FSZ.mini },
  check: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  bullet: { color: C.text2, fontSize: FSZ.sub },
  payCta: { height: 56, borderRadius: 999, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  payCtaText: { color: C.onBrand, fontSize: FSZ.body, fontWeight: '700' as const },
  payTrial: { color: C.brandText, fontSize: FSZ.sub, textAlign: 'center' as const },
  payDismiss: { color: C.text3, fontSize: FSZ.mini, textAlign: 'center' as const },
};
