// LicenseScreen.tsx —— 设置 · 授权与升级（D2 任务 C）
// 状态卡（free/pro/family/trial/beta + 试用倒计时）＋兑换码输入（GateSheet onUpgrade 落点）
// ＋试用启动链＋Pro 持有者「升级家庭 ¥68」入口（外链字段占位：BUY_LINKS，面包多后续配置）。
// 文案全部走 benefits.LICENSE_PAGE；零 emoji。
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../components/PageChrome';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { useLicense, license } from '../services/license';
import { LICENSE_PAGE, BUY_LINKS } from '../services/benefits';
import { toast } from '../components/Dialog';

export function LicenseScreen() {
  const insets = useSafeAreaInsets();
  const view = useLicense();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const tier = view.tier as string; // 'free'|'pro'|'family'|'m1_beta'|'trial'
  const meta = LICENSE_PAGE.tiers[tier] || LICENSE_PAGE.tiers.free;

  const redeem = () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const r = license.redeemCode(code);
      if (r.ok) { toast(LICENSE_PAGE.redeemOk(r.tier)); setCode(''); }
      else toast(r.reason);
    } finally { setBusy(false); }
  };

  const startTrial = () => {
    const r = license.startTrial();
    toast(r.ok ? LICENSE_PAGE.trialStarted : r.reason);
  };

  const openFamily = () => {
    if (BUY_LINKS.family) { // 生产：面包多家庭版/补差商品链接
      if (Platform.OS === 'web') window.open(BUY_LINKS.family, '_blank', 'noopener');
      else Linking.openURL(BUY_LINKS.family);
    } else {
      toast(LICENSE_PAGE.familyLinkSoon);
    }
  };

  return (
    <View style={st.screen}>
      <PageHeader title={LICENSE_PAGE.title} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxWidth: 860, alignSelf: 'center', width: '100%', gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 状态卡 ── */}
        <View style={st.statusCard}>
          <View style={st.statusHead}>
            <Text style={st.tierLabel}>{meta.label}</Text>
            {view.isBeta ? <View style={st.betaChip}><Text style={st.betaChipText}>{LICENSE_PAGE.betaNote}</Text></View> : null}
          </View>
          <Text style={st.tierDesc}>{meta.desc}</Text>
          {view.isTrial && !view.trialExpired ? (
            <Text style={st.trialLeft}>{LICENSE_PAGE.trialDaysLeft(view.trialDaysLeft)}</Text>
          ) : null}
          {view.trialExpired ? <Text style={st.trialLeft}>{LICENSE_PAGE.trialExpired}</Text> : null}
          {tier === 'family' ? <Text style={st.seats}>≤ {view.seats || 6} 人共享</Text> : null}
        </View>

        {/* ── 兑换码 ── */}
        <View style={st.card}>
          <Text style={st.cardTitle}>{LICENSE_PAGE.redeemTitle}</Text>
          <View style={st.redeemRow}>
            <TextInput
              style={st.redeemInput}
              value={code}
              onChangeText={setCode}
              placeholder={LICENSE_PAGE.redeemHint}
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              multiline={Platform.OS !== 'web'}
            />
            <TouchableOpacity style={[st.redeemBtn, busy && { opacity: 0.6 }]} activeOpacity={0.75} onPress={redeem} disabled={busy}>
              <Text style={st.redeemBtnText}>{LICENSE_PAGE.redeemBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 试用启动链（免费态） ── */}
        {!view.licensed ? (
          <TouchableOpacity style={st.cardBtn} activeOpacity={0.75} onPress={startTrial}>
            <Text style={st.cardBtnText}>{LICENSE_PAGE.trialStart}</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Pro 持有者：升级家庭（补差 ¥68）── */}
        {tier === 'pro' ? (
          <TouchableOpacity style={st.familyCard} activeOpacity={0.75} onPress={openFamily}>
            <View style={{ flex: 1 }}>
              <Text style={st.familyTitle}>{LICENSE_PAGE.familyEntry}</Text>
              <Text style={st.familySub}>{LICENSE_PAGE.familyEntrySub}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  statusCard: { borderRadius: 16, backgroundColor: C.surface, padding: 18, gap: 6 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierLabel: { color: C.text, fontSize: IS_HD ? 22 : 19, fontWeight: '800' },
  betaChip: { backgroundColor: C.badgeOn, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  betaChipText: { color: C.brandSoft, fontSize: 11, fontWeight: '600' },
  tierDesc: { color: C.text2, fontSize: 13, lineHeight: 18 },
  trialLeft: { color: C.brandText, fontSize: 13, fontWeight: '600', marginTop: 2 },
  seats: { color: C.text3, fontSize: 12, marginTop: 2 },
  card: { borderRadius: 16, backgroundColor: C.surface, padding: 18, gap: 10 },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  redeemRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  redeemInput: {
    flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.surface2,
    color: C.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10,
  },
  redeemBtn: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  redeemBtnText: { color: C.onBrand, fontSize: 14, fontWeight: '700' },
  cardBtn: {
    height: 50, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1.2, borderColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBtnText: { color: C.brandText, fontSize: 14.5, fontWeight: '600' },
  familyCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    backgroundColor: C.brandDim, borderWidth: 1.2, borderColor: C.brand, padding: 16,
  },
  familyTitle: { color: C.brandText, fontSize: 15, fontWeight: '700' },
  familySub: { color: C.text2, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
