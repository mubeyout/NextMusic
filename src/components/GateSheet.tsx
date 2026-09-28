// GateSheet.tsx —— D2 升级弹层四变体（LEO 契约 §一：eq_custom/lyrics_deep/webdav_backup/library_brand）
// 纪律：文案全部走 benefits 字段（组件内零硬编码句）；零 emoji（锁标=View 绘制 LockGlyph）；
// 四端：HD/TV 弹窗居中(焦点钮 HDTouch)；phone 底部抽屉；web/desktop 居中模态。
// 频控：挂载即 markShown（当日键+7 天静默键）；家庭行随宿主继承不单独记。
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { SH } from '../hd/hdtokens';
import { gating } from '../services/gating';
import { isBrandGateType, type GateType, type BrandGateType } from '../services/licenseCore';
import { CTA, FAMILY, GATE_COPY, BRAND_LABELS, BRAND_BADGE, BRAND_ECO_SUFFIX, brandAltLines } from '../services/benefits';

export interface GateSheetProps {
  gate: GateType;
  brandType?: 'emby' | 'plex' | 'synology' | 'feiniu' | 'daoliyu' | BrandGateType; // 仅 library_brand 必传（synology=audiostation 正名映射）
  onUpgrade: () => void;   // 金钮 → 升级流程（激活码/面包多跳转）
  onTrial: () => void;     // 试用链 → trial 7 天启动
  onDismiss: () => void;   // ghost → 关闭（频控已在挂载时记次）
  scenario?: 'device_cap' | 'share_intent'; // 场景加权（传入时家庭行升金色同级）
}

/** View 绘制锁形标（零 emoji；#595959 灰系） */
export function LockGlyph({ size = 14, color = '#595959' }: { size?: number; color?: string }) {
  const w = size, shackleW = Math.round(size * 0.62), shackleH = Math.round(size * 0.5);
  return (
    <View style={{ width: w, height: w, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{
        width: shackleW, height: shackleH, borderWidth: Math.max(1.5, size * 0.12),
        borderTopLeftRadius: shackleW / 2, borderTopRightRadius: shackleW / 2,
        borderBottomWidth: 0, borderColor: color, marginBottom: -1,
      }} />
      <View style={{
        width: w, height: Math.round(size * 0.62), borderRadius: size * 0.18,
        backgroundColor: color,
      }} />
    </View>
  );
}

// d2 契约写 synology；客户端/发码器正名 audiostation——入口处映射
function normBrand(t?: string): BrandGateType | undefined {
  if (!t) return undefined;
  if (t === 'synology') return 'audiostation';
  return isBrandGateType(t) ? t : undefined;
}

function CheckRow({ text }: { text: string }) {
  const fs = IS_HD ? 15 : 13.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: IS_HD ? 5 : 3 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.badgeOn, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 8, height: 5, borderLeftWidth: 1.8, borderBottomWidth: 1.8, borderColor: C.brandSoft, transform: [{ rotate: '-45deg' }, { translateY: -1 }] }} />
      </View>
      <Text style={{ color: C.text2, fontSize: fs, lineHeight: fs * 1.45, flex: 1 }}>{text}</Text>
    </View>
  );
}

export function GateSheet({ gate, brandType, onUpgrade, onTrial, onDismiss, scenario }: GateSheetProps) {
  const insets = useSafeAreaInsets();
  useEffect(() => { gating.markShown(gate); }, [gate]); // 弹出即记次（gate_seen:{gate}:{day} + gate_quiet:{gate}）

  const copy = GATE_COPY[gate];
  const brand = gate === 'library_brand' ? normBrand(brandType) : undefined;
  const centered = IS_HD || Platform.OS === 'web'; // HD/TV/桌面：弹窗居中；phone：底部抽屉
  const altLines = brand ? brandAltLines(brand) : null;

  const familyLine = scenario === 'device_cap' ? FAMILY.deviceCap
    : scenario === 'share_intent' ? FAMILY.shareIntent
    : FAMILY.silentLine;
  const familyGold = scenario != null; // 场景加权：家庭位升金色同级；默认静默灰

  const titleFs = IS_HD ? 20 : 17;

  const body = (
    <View style={[st.card, centered && st.cardCenter, !centered && { paddingBottom: insets.bottom + 16 }]}>
      {/* 1. 标题行 */}
      <Text style={[st.title, { fontSize: titleFs }]}>{copy.title}</Text>

      {/* 2. 说明句 / 品牌门类型卡 */}
      {brand && altLines ? (
        <View style={st.brandCard}>
          <View style={st.brandCardHead}>
            <LockGlyph size={16} color={C.text2} />
            <Text style={st.brandCardTitle}>{BRAND_LABELS[brand]} · {BRAND_ECO_SUFFIX}</Text>
            <View style={st.proChip}><Text style={st.proChipText}>{BRAND_BADGE}</Text></View>
          </View>
          {/* 等价物三行：先免费路径后升级（语序锁死，禁倒置） */}
          <Text style={st.brandCardLine}>{altLines[0]}</Text>
          <Text style={st.brandCardLine}>{altLines[1]}</Text>
          <Text style={st.brandCardLine}>{altLines[2]}</Text>
        </View>
      ) : (
        <Text style={st.desc}>{copy.desc}</Text>
      )}

      {/* 3. 速览 3 条（品牌门正文即等价物行，不重复速览） */}
      {!brand ? <View style={{ marginTop: 10 }}>{copy.bullets.map(b => <CheckRow key={b} text={b} />)}</View> : null}

      {/* 4. 金钮（唯一金色；场景加权时家庭行同级金色） */}
      {IS_HD ? (
        <HDTouch style={st.goldBtn} focusStyle={st.goldBtnFocus} glow={SH.brand} onPress={onUpgrade}>
          <Text style={st.goldBtnText}>{CTA.main}</Text>
        </HDTouch>
      ) : (
        <TouchableOpacity style={st.goldBtn} activeOpacity={0.75} onPress={onUpgrade}>
          <Text style={st.goldBtnText}>{CTA.main}</Text>
        </TouchableOpacity>
      )}

      {/* 5. 家庭静默行 / 场景加权行 */}
      <View style={[st.familyRow, familyGold && st.familyRowGold]}>
        <Text style={[st.familyText, familyGold && st.familyTextGold]}>{familyLine}</Text>
      </View>

      {/* 6. 文字链：先免费试用 7 天 */}
      <TouchableOpacity onPress={onTrial} hitSlop={8} style={{ paddingVertical: 8 }}>
        <Text style={st.trialLink}>{CTA.trial}</Text>
      </TouchableOpacity>

      {/* 7. ghost：稍后再说 */}
      {IS_HD ? (
        <HDTouch style={st.ghostBtn} focusStyle={st.ghostFocus} focusBg={C.surface2} onPress={onDismiss}>
          <Text style={st.ghostText}>{CTA.dismiss}</Text>
        </HDTouch>
      ) : (
        <TouchableOpacity style={st.ghostBtn} activeOpacity={0.75} onPress={onDismiss}>
          <Text style={st.ghostText}>{CTA.dismiss}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal animationType={centered ? 'fade' : 'slide'} transparent visible onRequestClose={onDismiss}>
      <TouchableOpacity style={st.scrim} activeOpacity={1} onPress={onDismiss}>
        <View onStartShouldSetResponder={() => true} style={centered ? st.centerWrap : st.drawerWrap}>
          {centered ? (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ maxWidth: 560, width: '92%' }} showsVerticalScrollIndicator={false}>
              {body}
            </ScrollView>
          ) : body}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim },
  drawerWrap: { flex: 1, justifyContent: 'flex-end' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: C.elev, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 18,
  },
  cardCenter: { borderRadius: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  title: { color: C.text, fontWeight: '700', lineHeight: 26 },
  desc: { color: C.text2, fontSize: 13, lineHeight: 19, marginTop: 8 },
  brandCard: { backgroundColor: C.surface2, borderRadius: 14, padding: 14, marginTop: 12, gap: 3 },
  brandCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  brandCardTitle: { color: C.text, fontSize: 14, fontWeight: '600', flex: 1 },
  proChip: {
    borderWidth: 1.2, borderColor: C.brand, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 1, backgroundColor: C.brandDim,
  },
  proChipText: { color: C.brandText, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 },
  brandCardLine: { color: C.text2, fontSize: 13.5, lineHeight: 20 },
  goldBtn: {
    height: 48, borderRadius: 13, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  goldBtnFocus: { borderWidth: 2.5, borderColor: C.text, borderRadius: 13 },
  goldBtnText: { color: C.onBrand, fontSize: 15, fontWeight: '700' },
  familyRow: {
    borderRadius: 12, backgroundColor: C.surface2, paddingVertical: 10, paddingHorizontal: 12,
    marginTop: 10, borderWidth: 1, borderColor: 'transparent',
  },
  familyRowGold: { backgroundColor: C.brandDim, borderColor: C.brand },
  familyText: { color: C.text2, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  familyTextGold: { color: C.brandText, fontWeight: '600' },
  trialLink: { color: C.text2, fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
  ghostBtn: {
    height: 44, borderRadius: 13, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  ghostFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 13 },
  ghostText: { color: C.text, fontSize: 14, fontWeight: '500' },
});
