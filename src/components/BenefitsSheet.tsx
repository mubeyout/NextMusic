// BenefitsSheet.tsx —— [1013 MOMO 升级令] 全屏权益页(取代小弹窗,老板:「就一个弹窗就这么点内容?」)
// 形态:phone 全高 sheet / HD·web 大幅居中模态(90% 高)
// 三态:gate(免费) / 输码(内嵌激活) / owned(license 派生)
// 文案源:MAX PRO 文案包价值句 + 独角数卡渠道(BUY_LINKS);纪律:零锁词/零 emoji/免费尊严
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, ActivityIndicator } from 'react-native';
import { Modal } from 'react-native';
import { C, SP, FS, FW } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { Icon } from '../theme/Icon';
import { ProTag } from './ProTag';
import { req } from '../services/server';
import { license, useLicense, getInstallId } from '../services/license';
import { BUY_LINKS } from '../services/benefits';

interface BenefitsSheetProps {
  visible: boolean;
  onClose: () => void;
  onTrial?: () => void;   // 试用入口(FeatureGate 装配传入:启动+原意图重放)
}

// 四功能卡(MOMO 令口径:10段EQ/空间音效/WebDAV/品牌NAS五源)
const FEATURES = [
  { icon: 'sliders', title: '10 段自定义 EQ', line: '调出你耳朵想要的那个低音' },
  { icon: 'wave', title: '空间音效', line: '混响·变调·3D 环绕,现场感拉满' },
  { icon: 'cloud', title: 'WebDAV 云备份', line: '歌单和设置一键备份到自己网盘,换机不慌' },
  { icon: 'server', title: '品牌 NAS 五源直连', line: 'Emby / Plex / 群晖 / 飞牛 / 道理鱼,Jellyfin 本来就免费' },
] as const;

// Free vs Pro 对比(免费尊严:免费已有大方列)
const COMPARE: { cap: string; free: string; pro: string }[] = [
  { cap: '听歌·搜索·播放·缓存', free: '免费', pro: '免费' },
  { cap: '本地曲库·在线五源', free: '免费', pro: '免费' },
  { cap: '自定义 EQ·空间音效', free: '—', pro: '全部' },
  { cap: 'WebDAV 云备份', free: '—', pro: '全量' },
  { cap: '品牌 NAS 直连', free: '—', pro: '五源' },
  { cap: '设备数', free: '本机', pro: '5 台' },
  { cap: '价格', free: '0 元', pro: '¥19.9 终身' },
];

const TRUST = ['已解锁永久有效 · 权益只增不减', '数据永不删,不买了只读保留', '先试 7 天再买,不用注册'];

export function BenefitsSheet({ visible, onClose, onTrial }: BenefitsSheetProps) {
  const view = useLicense();
  const owned = view.licensed;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  if (!visible) return null;

  const activate = async () => {
    const key = code.trim().toUpperCase();
    if (!key || key.length < 10 || busy) return;
    setBusy(true); setMsg(null);
    try {
      const installId = getInstallId();
      const deviceName = `${Platform.OS === 'web' ? '网页端' : Platform.OS === 'android' ? 'Android' : '桌面'}·${installId.slice(-4)}`;
      const data = await req('/api/license/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, installId, deviceName }),
      }) as { ok?: boolean; reason?: string; ent?: unknown };
      if (data && data.ok) {
        const r = license.applyServerEnt(data.ent as never);
        if (r.ok) { setMsg(`激活成功!${r.tier === 'family' ? '家庭版' : 'Pro'} 权益已生效`); setCode(''); }
        else setMsg(r.reason || '激活码无效');
      } else setMsg((data && data.reason) || '激活码无效');
    } catch { setMsg('网络错误,请重试'); }
    finally { setBusy(false); }
  };

  const openShop = () => {
    if (typeof window !== 'undefined') window.open(BUY_LINKS.pro, '_blank', 'noopener');
  };

  const centered = IS_HD || Platform.OS === 'web';

  return (
    <Modal animationType={centered ? 'fade' : 'slide'} transparent visible onRequestClose={onClose}>
      <View style={[st.scrim, centered && st.scrimCenter]}>
        <TouchableOpacity style={st.scrimTouch} activeOpacity={1} onPress={onClose} />
        <View style={[st.sheet, centered && st.sheetCenter]}>
          <View style={st.head}>
            {owned ? <ProTag variant="owned" size="large" /> : <ProTag size="large" />}
            <Text style={st.headTitle}>{owned ? 'Pro 已生效' : 'Pro ¥19.9 · 一次买断 · 终身有效'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={C.text3} /></TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SP.xl, paddingBottom: SP.wider }}>
            {/* 价值主张 */}
            <Text style={st.pitch}>{owned
              ? '感谢支持——你的全部 Pro 权益已在所有登录设备生效。'
              : '一杯奶茶的价格,解锁全部进阶能力。免费版的一切照旧,Pro 只是更爽。'}</Text>

            {/* 四功能卡 */}
            <View style={st.grid}>
              {FEATURES.map(f => (
                <View key={f.title} style={st.feat}>
                  <View style={st.featIcon}><Icon name={f.icon as never} size={16} color={C.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.featTitle}>{f.title}</Text>
                    <Text style={st.featLine}>{f.line}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Free vs Pro 对比 */}
            <View style={st.compareCard}>
              <Text style={st.compareTitle}>免费 vs Pro</Text>
              <View style={st.compareHead}>
                <Text style={[st.compareHeadCell, { flex: 2 }]}>能力</Text>
                <Text style={[st.compareHeadCell, { flex: 1 }]}>免费</Text>
                <Text style={[st.compareHeadCell, { flex: 1 }]}>Pro</Text>
              </View>
              {COMPARE.map(r => (
                <View key={r.cap} style={st.compareRow}>
                  <Text style={[st.compareCell, { flex: 2 }]}>{r.cap}</Text>
                  <Text style={[st.compareCell, { flex: 1, color: r.free === '—' ? C.text3 : C.text2 }]}>{r.free}</Text>
                  <Text style={[st.compareCell, { flex: 1, color: r.pro === '免费' ? C.text2 : C.brandText, fontWeight: r.pro === '免费' ? FW.normal : FW.semibold }]}>{r.pro}</Text>
                </View>
              ))}
            </View>

            {/* 信任语 */}
            <View style={{ gap: SP.sm }}>
              {TRUST.map(t => (
                <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
                  <View style={st.trustDot} />
                  <Text style={st.trustText}>{t}</Text>
                </View>
              ))}
            </View>

            {/* 输码区(免费态) */}
            {!owned && showInput ? (
              <View style={st.inputCard}>
                <Text style={st.inputLabel}>粘贴激活码(NM-XXXXX-XXXXX-XXXXX)</Text>
                <View style={st.inputRow}>
                  <TextInput
                    style={st.input}
                    value={code}
                    onChangeText={t => setCode(t.toUpperCase())}
                    placeholder="NM-…"
                    placeholderTextColor={C.text3}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={[st.activateBtn, (busy || code.trim().length < 10) && { opacity: 0.4 }]} disabled={busy || code.trim().length < 10} activeOpacity={0.85} onPress={() => void activate()}>
                    {busy ? <ActivityIndicator size="small" color="#0B0F0D" /> : <Text style={st.activateBtnText}>激活</Text>}
                  </TouchableOpacity>
                </View>
                {msg ? <Text style={[st.msg, msg.includes('成功') && { color: C.brand }]}>{msg}</Text> : null}
              </View>
            ) : null}

            {/* 家庭版 */}
            <TouchableOpacity style={st.familyRow} activeOpacity={0.8} onPress={openShop}>
              <Text style={st.familyText}>全家一起用?家庭版 ¥88 · ≤6 人共享 · 已购 Pro 补差 ¥68</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* 底部 CTA */}
          {!owned ? (
            <View style={st.ctaZone}>
              <TouchableOpacity style={st.ctaMain} activeOpacity={0.85} onPress={() => setShowInput(true)}>
                <Text style={st.ctaMainText}>升级 Pro ¥19.9 · 终身</Text>
              </TouchableOpacity>
              <View style={st.ctaSubRow}>
                <TouchableOpacity onPress={openShop} hitSlop={8}><Text style={st.ctaLink}>去店铺购买</Text></TouchableOpacity>
                {onTrial ? <TouchableOpacity onPress={onTrial} hitSlop={8}><Text style={st.ctaLink}>先免费试用 7 天</Text></TouchableOpacity> : null}
                <TouchableOpacity onPress={onClose} hitSlop={8}><Text style={st.ctaGhost}>稍后再说</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={st.ctaZone}>
              <TouchableOpacity style={[st.ctaMain, { backgroundColor: C.surface2 }]} activeOpacity={0.85} onPress={onClose}>
                <Text style={[st.ctaMainText, { color: C.text }]}>开始使用</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  scrimCenter: { justifyContent: 'center', alignItems: 'center' },
  scrimTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { height: '92%', backgroundColor: C.elev, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SP.wider, paddingTop: SP.xl, gap: SP.md },
  sheetCenter: { height: '88%', maxWidth: 720, width: '92%', borderRadius: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: SP.md },
  headTitle: { flex: 1, color: C.text, fontSize: FS.h2, fontWeight: FW.bold },
  pitch: { color: C.text2, fontSize: FS.md, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md },
  feat: { width: '48%', flexGrow: 1, backgroundColor: C.surface, borderRadius: 14, padding: SP.lg, flexDirection: 'row', gap: SP.md, alignItems: 'flex-start' },
  featIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  featTitle: { color: C.text, fontSize: FS.sm, fontWeight: FW.semibold },
  featLine: { color: C.text3, fontSize: FS.xs, lineHeight: 16, marginTop: 2 },
  compareCard: { backgroundColor: C.surface, borderRadius: 14, padding: SP.lg, gap: SP.xs },
  compareTitle: { color: C.text, fontSize: FS.lg, fontWeight: FW.semibold, marginBottom: SP.xs },
  compareHead: { flexDirection: 'row', paddingBottom: SP.xs, borderBottomWidth: 1, borderBottomColor: C.stroke },
  compareHeadCell: { color: C.text3, fontSize: FS.xs, fontWeight: FW.semibold },
  compareRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.strokeFaint },
  compareCell: { color: C.text2, fontSize: FS.sm },
  trustDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  trustText: { color: C.text2, fontSize: FS.sm },
  inputCard: { backgroundColor: C.surface, borderRadius: 14, padding: SP.lg, gap: SP.sm },
  inputLabel: { color: C.text2, fontSize: FS.sm },
  inputRow: { flexDirection: 'row', gap: SP.sm },
  input: { flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: C.surface2, paddingHorizontal: SP.md, color: C.text, fontSize: FS.md, fontWeight: FW.semibold, letterSpacing: 1 },
  activateBtn: { backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: SP.xl, alignItems: 'center', justifyContent: 'center' },
  activateBtnText: { color: '#0B0F0D', fontSize: FS.md, fontWeight: FW.bold },
  msg: { color: '#E8618C', fontSize: FS.sm },
  familyRow: { alignItems: 'center', paddingVertical: SP.xs },
  familyText: { color: C.text3, fontSize: FS.sm, textAlign: 'center' },
  ctaZone: { gap: SP.sm, paddingBottom: SP.md },
  ctaMain: { height: 48, borderRadius: 13, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  ctaMainText: { color: '#0B0F0D', fontSize: FS.lg, fontWeight: FW.bold },
  ctaSubRow: { flexDirection: 'row', justifyContent: 'center', gap: SP.xl },
  ctaLink: { color: C.brandText, fontSize: FS.sm },
  ctaGhost: { color: C.text3, fontSize: FS.sm },
});
