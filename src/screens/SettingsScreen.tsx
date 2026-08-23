import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, type IconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';

// Figma 12·设置: 11 rows with icons/titles/subtitles + chevron
const GROUPS: { icon: IconName; title: string; sub: string; to?: string; badge?: string }[] = [
  { icon: 'settings', title: '播放设置', sub: '音质、模式、自动切源', to: 'PlayerSettings' },
  { icon: 'music', title: '音源管理', sub: '3 个已启用', to: 'Sources' },
  { icon: 'user', title: '使用方式与账号', sub: '本地/服务器/登录与同步', to: 'Account' },
  { icon: 'check', title: '主题外观', sub: '深色 · 绿色', to: 'Theme' },
  { icon: 'download', title: '下载设置', sub: '仅 Wi-Fi', to: 'DownloadsSettings' },
  { icon: 'volume', title: '云备份', sub: 'WebDAV', to: 'BackupSettings' },
  { icon: 'sliders', title: '音效设置', sub: '均衡器与空间音频', to: 'Fx' },
  { icon: 'status', title: '可视化设置', sub: '波形 · 频谱', to: 'VizSettings' },
  { icon: 'repeat', title: '代理设置', sub: '自动检测', to: 'ProxySettings' },
  { icon: 'settings', title: '基本设置', sub: '启动、语言、缓存与底栏', to: 'BasicSettings' },
  { icon: 'headphones', title: '关于与帮助', sub: '版本 3.0.0', to: 'About' },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void };
  const { connected, base, username } = useApp();

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>设置</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={st.brandCard}>
          <View style={st.brandDot} />
          <View style={{ flex: 1 }}>
            <Text style={st.brandTitle}>无广告 · 无追踪</Text>
            <Text style={st.brandSub}>数据仅保存在你的设备</Text>
          </View>
          <Icon name="check" size={22} active />
        </View>

        <View style={st.group}>
          {GROUPS.map((g, i) => (
            <TouchableOpacity
              key={g.title}
              style={[st.row, i > 0 && st.rowDivide]}
              activeOpacity={0.7}
              onPress={() => g.to && nav.navigate(g.to)}
            >
              <View style={st.rowIconWrap}><Icon name={g.icon} size={20} color={C.text} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.rowTitle}>{g.title}</Text>
                <Text style={st.rowSub} numberOfLines={1}>{g.sub}</Text>
              </View>
              <Icon name="chevronright" size={20} color={C.text3} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  brandCard: {
    height: 64, borderRadius: 14, backgroundColor: '#1A1A1A',
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
  },
  brandDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.brand },
  brandTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  brandSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  group: { borderRadius: 14, backgroundColor: '#1A1A1A', marginTop: 14, paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0F' },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
});
