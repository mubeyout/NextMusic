import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SP, FS } from '../theme/tokens';
import { ProTag } from './ProTag';
import { req } from '../services/server';
import { IS_HD } from '../services/appversion'; // [1012] 弹框居中判定
import { license, getInstallId } from '../services/license'; // [D1 WP2] 服务端激活落地

// [D1 WP2 · 授权闭环] License 激活页——全端输码入口
// 服务端 POST /api/license/activate {key, installId, deviceName} → {ok, ent} (licenseCore.activate 已在)
// 设计:LEO spec §二 FeatureSheet 家族——居中模态(HD/web)/底部抽屉(phone)

interface LicenseActivateProps {
  visible: boolean;
  onClose: () => void;
  onActivated?: (tier: string) => void;
}

export function LicenseActivate({ visible, onClose, onActivated }: LicenseActivateProps) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

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
      }) as { ok?: boolean; reason?: string; ent?: { tier?: string } };
      if (data && data.ok) {
        const r = license.applyServerEnt(data.ent as never); // 入册+广播（gate 态即时翻绿）
        setOk(r.ok);
        setMsg(r.ok ? `激活成功！${r.tier === 'family' ? '家庭版' : 'Pro'} 权益已生效` : (r.reason || '激活码无效'));
        if (r.ok) onActivated?.(r.tier);
        else return;
        setTimeout(() => { onClose(); setCode(''); setMsg(null); setOk(false); }, 1800);
      } else {
        setMsg((data && data.reason) || '激活码无效');
      }
    } catch (e) {
      setMsg('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[st.overlay, { paddingTop: insets.top + 60 }]}>
      <TouchableOpacity style={st.scrim} activeOpacity={1} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.header}>
          <View style={st.titleRow}>
            <ProTag size="standard" />
            <Text style={st.title}>激活授权码</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Icon name="close" size={20} color={C.text3} />
          </TouchableOpacity>
        </View>

        <Text style={st.hint}>粘贴购买后收到的激活码（NM-XXXXX-XXXXX-XXXXX 格式）</Text>

        <TextInput
          style={st.input}
          value={code}
          onChangeText={t => setCode(t.toUpperCase())}
          placeholder="NM-XXXXX-XXXXX-XXXXX"
          placeholderTextColor={C.text3}
          autoCapitalize="characters"
          autoCorrect={false}
          multiline={false}
          onSubmitEditing={activate}
        />

        {msg ? (
          <Text style={[st.msg, ok ? st.msgOk : st.msgErr]}>{msg}</Text>
        ) : null}

        <TouchableOpacity
          style={[st.cta, (busy || code.trim().length < 10) && st.ctaOff]}
          onPress={activate}
          disabled={busy || code.trim().length < 10}
          activeOpacity={0.85}
        >
          <Icon name={ok ? 'check' : 'add'} size={16} color={ok ? C.brand : '#0B0F0D'} />
          <Text style={st.ctaText}>{busy ? '激活中…' : ok ? '已激活' : '激活'}</Text>
        </TouchableOpacity>

        <View style={st.shopRow}>
          <Text style={st.shopHint}>还没有激活码？</Text>
          <TouchableOpacity
            onPress={() => {
              if (typeof window !== 'undefined') window.open('https://ifdian.net/a/nextmusic', '_blank'); // [1014 渠道翻转]
            }}
          >
            <Text style={st.shopLink}>去店铺购买 Pro ¥19.9</Text>
          </TouchableOpacity>
        </View>

        <Text style={st.limit}>每码限 5 台设备 · 终身有效 · 支持家庭版(≤6 席位)</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, justifyContent: 'flex-end', alignItems: 'center' },
  overlayCenter: { justifyContent: 'center' }, // [1012] HD/web 居中模态(老板 ①)
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    width: '100%', maxWidth: 480, backgroundColor: C.card || '#1A1D1B',
    borderRadius: 20,
    padding: SP.xl, paddingBottom: SP.wider + 20,
    gap: SP.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  title: { color: C.text, fontSize: FS.lg, fontWeight: '700' },
  hint: { color: C.text2, fontSize: FS.sm, lineHeight: 18 },
  input: {
    backgroundColor: C.surface2 || '#222523', borderRadius: 12,
    paddingHorizontal: SP.md, paddingVertical: SP.md + 2,
    color: C.text, fontSize: FS.md, fontWeight: '600',
    letterSpacing: 1,
  },
  msg: { fontSize: FS.sm, lineHeight: 18 },
  msgOk: { color: C.brand },
  msgErr: { color: '#E8618C' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.sm,
    backgroundColor: C.brand, borderRadius: 999, paddingVertical: SP.md + 2,
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: '#0B0F0D', fontSize: FS.md, fontWeight: '700' },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, marginTop: SP.xs },
  shopHint: { color: C.text3, fontSize: FS.xs },
  shopLink: { color: C.proGold || '#F0C75E', fontSize: FS.xs, fontWeight: '600' },
  limit: { color: C.text3, fontSize: FS.xs, textAlign: 'center', marginTop: SP.xs },
});
