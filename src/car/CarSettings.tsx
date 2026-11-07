// CarSettings.tsx —— [设置页 car 化·LEO v78 1107 深夜·老板令] 车机模式 Hero 置顶 → 音源管理 → 音质下载 → 主题 8 色 accent 圆点快选 → 账号 → 关于 → 更多设置›(现有 HDSettings)
// 驾驶约束:行高 58、无输入框、无长列表、全 token(LEO spec)
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, NativeModules } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { CAR, CAR_FS, CAR_ACCENTS } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useNavigation } from '@react-navigation/native';
import { settings } from '../services/settings';
import { toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';

const Restart = NativeModules.AppRestart as { restart: () => void } | undefined;
const HotReloadMod = NativeModules.AppReload as { reload: () => void } | undefined;
// 主题类变更热重载(=HDSettings hdRestart):断点续播标记 + bundle reload,音乐不断
const carRestart = (resume: boolean) => {
  try { createMMKV({ id: 'nextmusic-playback' }).set('rr', resume ? '1' : ''); } catch { /* ignore */ }
  setTimeout(() => { if (HotReloadMod?.reload) HotReloadMod.reload(); else Restart?.restart(); }, 350);
};
const Q_ORDER = ['flac', '320k', '128k'] as const;
const Q_LABEL: Record<string, string> = { flac: '无损', '320k': '320k', '128k': '128k' };

export function CarSettings({ onBack }: { onBack: () => void }) {
  const nav = useNavigation() as { navigate: (s: string) => void };
  const playing = !!usePlayer().playing;
  const carOn = settings.get().carModeUi === true;
  const qual = settings.get().playQuality || 'flac';

  const Row = ({ icon, title, desc, right, onPress }: { icon: string; title: string; desc?: string; right?: React.ReactNode; onPress?: () => void }) => (
    <TouchableOpacity style={st.row} activeOpacity={0.85} onPress={onPress} disabled={!onPress}>
      <Icon name={icon as never} size={24} color={C.text2} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={st.rowTitle} numberOfLines={1}>{title}</Text>
        {desc ? <Text style={st.rowDesc} numberOfLines={1}>{desc}</Text> : null}
      </View>
      {right}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <TouchableOpacity style={st.backBtn} onPress={onBack}><Icon name="back" size={20} color={C.text2} /></TouchableOpacity>
        <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800' }}>设置</Text>
      </View>

      {/* Hero: 车机模式大开关(LEO:它控制整个形态,置顶) */}
      <TouchableOpacity style={st.hero} activeOpacity={0.85} onPress={() => { settings.set('carModeUi', false); }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={st.heroTitle}>车机模式</Text>
          <Text style={st.heroDesc}>当前为车机专属界面 · 点击关闭恢复手机竖版</Text>
        </View>
        <View style={[st.heroPill, carOn && { backgroundColor: C.brand }]}>
          <Text style={[st.heroPillText, carOn && { color: C.onBrand }]}>已开启</Text>
        </View>
      </TouchableOpacity>

      <View style={st.card}>
        <Row icon="server" title="音源管理" desc="LX 音源 · 自定义脚本" onPress={() => nav.navigate('Sources')} />
        <Row icon="download" title="音质与下载" desc={'在线播放音质 ' + Q_LABEL[qual] + ' · 点击切换'} onPress={() => { const next = Q_ORDER[(Q_ORDER.indexOf(qual as typeof Q_ORDER[number]) + 1) % Q_ORDER.length]; settings.set('playQuality', next); toast('音质：' + Q_LABEL[next]); }} />
        <Row icon="cloud" title="下载设置" desc="下载音质/仅 Wi-Fi/失败重试" onPress={() => nav.navigate('DownloadsSettings')} />
      </View>

      {/* 主题 accent 8 色圆点快选(车机独有捷径,34px 触点即点即换) */}
      <Text style={st.secLabel}>主题 · 强调色</Text>
      <View style={st.card}>
        <View style={st.accentRow}>
          {Object.values(CAR_ACCENTS).map(hex => {
            const on = settings.get().accent === hex;
            return (
              <TouchableOpacity key={hex} style={[st.dot, on && { borderWidth: 3, borderColor: C.text }]} onPress={() => { settings.set('accent', hex); toast('强调色已换 · 重启后全量生效'); carRestart(playing); }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: hex }} />
              </TouchableOpacity>
            );
          })}
        </View>
        <Row icon="palette" title="深浅主题 · 纯黑背景" desc="深浅切换/纯黑/OLED · 进更多设置调整" onPress={() => nav.navigate('Settings')} />
      </View>

      <View style={st.card}>
        <Row icon="user" title="账号与服务器" desc="登录 · 同步 · 云备份" onPress={() => nav.navigate('Account')} />
        <Row icon="info" title="关于 NextMusic" desc="版本 · 更新日志 · 开源致谢" onPress={() => nav.navigate('About')} />
      </View>

      {/* 双层设置:更多进现有 HDSettings(零改动) */}
      <TouchableOpacity style={st.moreBtn} activeOpacity={0.85} onPress={() => nav.navigate('Settings')}>
        <Text style={st.moreText}>更多设置 ›</Text>
        <Text style={st.moreDesc}>播放 · 外观 · 备份 · 帮助（全功能）</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = {
  backBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 20, backgroundColor: C.surface, borderRadius: 17, borderWidth: 1, borderColor: C.brand, padding: 26, marginBottom: CAR.gap },
  heroTitle: { color: C.text, fontSize: CAR_FS.sec, fontWeight: '800' as const },
  heroDesc: { color: C.text3, fontSize: CAR_FS.mini },
  heroPill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  heroPillText: { color: C.text2, fontSize: CAR_FS.sub, fontWeight: '700' as const },
  card: { borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: CAR.gap },
  row: { minHeight: 58, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  rowTitle: { color: C.text, fontSize: CAR_FS.body, fontWeight: '600' as const },
  rowDesc: { color: C.text3, fontSize: CAR_FS.mini },
  secLabel: { color: C.text3, fontSize: CAR_FS.mini, letterSpacing: 2, marginBottom: 12 },
  accentRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  dot: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center' as const, justifyContent: 'center' as const },
  moreBtn: { borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: C.border, padding: 20, gap: 6, alignItems: 'center' as const },
  moreText: { color: C.text2, fontSize: CAR_FS.body, fontWeight: '700' as const },
  moreDesc: { color: C.text3, fontSize: CAR_FS.mini },
};
