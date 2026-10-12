// LicenseScreen.tsx —— 设置 · 授权与升级（D2 任务 C）
// 状态卡（free/pro/family/trial/beta + 试用倒计时）＋兑换码输入（GateSheet onUpgrade 落点）
// ＋试用启动链＋Pro 持有者「升级家庭 ¥68」入口（外链字段占位：BUY_LINKS，面包多后续配置）。
// 文案全部走 benefits.LICENSE_PAGE；零 emoji。
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../components/PageChrome';
import { C, FS, FW, SP } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { useLicense, license, getInstallId } from '../services/license';
import { req } from '../services/server'; // [D1 WP2] 服务端激活链
import { LICENSE_PAGE, BUY_LINKS } from '../services/benefits';
import { toast } from '../components/Dialog';

export function LicenseScreen() {
  const insets = useSafeAreaInsets();
  const view = useLicense();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const tier = view.tier as string; // 'free'|'pro'|'family'|'m1_beta'|'trial'
  const meta = LICENSE_PAGE.tiers[tier] || LICENSE_PAGE.tiers.free;

  const redeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      // [D1 WP2] 服务端激活优先：绑账号+登记设备（5 台上限/设备管理解绑）——独角数卡码池只在此径生效
      try {
        const installId = getInstallId();
        const deviceName = `${Platform.OS === 'web' ? '网页端' : Platform.OS === 'android' ? 'Android' : '桌面'}·${installId.slice(-4)}`;
        const data = await req('/api/license/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: code.trim(), installId, deviceName }),
        }) as { ok?: boolean; reason?: string; ent?: { payload: unknown } };
        if (data && data.ok) {
          const r = license.applyServerEnt(data.ent as never);
          if (r.ok) { toast(LICENSE_PAGE.redeemOk(r.tier)); setCode(''); }
          else toast(r.reason);
          return;
        }
        if (data && data.reason) { toast(data.reason); return; } // 服务端明确拒绝（码无效/已绑他账号/设备满）——不落本地
      } catch { /* 服务端不可达→离线紧凑码兜底 */ }
      const r = license.redeemCode(code);
      if (r.ok) { toast(LICENSE_PAGE.redeemOk(r.tier)); setCode(''); }
      else toast(r.reason);
    } finally { setBusy(false); }
  };

  const openShop = () => { // [D1 WP2] 店铺购买渠道（BUY_LINKS.pro——独角数卡）
    if (BUY_LINKS.pro) {
      if (Platform.OS === 'web') window.open(BUY_LINKS.pro, '_blank', 'noopener');
      else Linking.openURL(BUY_LINKS.pro);
    }
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, maxWidth: 860, alignSelf: 'center', width: '100%', gap: SP.xxl }}
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

        {/* ── 店铺购买渠道（免费态·绿 CTA 收行动） ── */}
        {!view.licensed ? (
          <TouchableOpacity style={st.shopBtn} activeOpacity={0.85} onPress={openShop}>
            <Text style={st.shopBtnText}>去店铺购买 Pro ¥19.9 · 终身</Text>
          </TouchableOpacity>
        ) : null}

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
  statusCard: { borderRadius: 16, backgroundColor: C.surface, padding: 18, gap: SP.sm },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: SP.lg },
  tierLabel: { color: C.text, fontSize: IS_HD ? 22 : 19, fontWeight: FW.heavy },
  betaChip: { backgroundColor: C.badgeOn, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  betaChipText: { color: C.brandSoft, fontSize: FS.sm, fontWeight: FW.semibold },
  tierDesc: { color: C.text2, fontSize: FS.md, lineHeight: 18 },
  trialLeft: { color: C.brandText, fontSize: FS.md, fontWeight: FW.semibold, marginTop: 2 },
  seats: { color: C.text3, fontSize: FS.body, marginTop: 2 },
  card: { borderRadius: 16, backgroundColor: C.surface, padding: 18, gap: SP.lg },
  cardTitle: { color: C.text, fontSize: FS.lg, fontWeight: FW.semibold },
  redeemRow: { flexDirection: 'row', gap: SP.lg, alignItems: 'flex-start' },
  redeemInput: {
    flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.surface2,
    color: C.text, fontSize: FS.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  redeemBtn: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  redeemBtnText: { color: C.onBrand, fontSize: FS.lg, fontWeight: FW.bold },
  shopBtn: { height: 50, borderRadius: 13, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  shopBtnText: { color: C.onBrand, fontSize: FS.lg, fontWeight: FW.bold },
  cardBtn: {
    height: 50, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1.2, borderColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBtnText: { color: C.brandText, fontSize: FS.lg, fontWeight: FW.semibold },
  familyCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    backgroundColor: C.brandDim, borderWidth: 1.2, borderColor: C.brand, padding: 16,
  },
  familyTitle: { color: C.brandText, fontSize: FS.xl, fontWeight: FW.bold },
  familySub: { color: C.text2, fontSize: FS.body, lineHeight: 17, marginTop: 3 },
});
