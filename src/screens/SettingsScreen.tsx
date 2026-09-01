import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, type IconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { PageHeader } from '../components/PageChrome';
import { activeSources } from '../services/customSource';
import { providers } from '../services/providers';
import { downloads as dlStore } from '../services/downloads';
import { deviceTrackCount } from '../services/devicelibrary';
import { APP_VERSION } from '../services/appversion';

// 设置主页：图标语义修正（palette/cloud/globe/wave/info），全部入口可达
const GROUPS: { icon: IconName; title: string; sub: string; to?: string }[] = [
  { icon: 'sliders', title: '播放设置', sub: '默认音质', to: 'PlayerSettings' },
  { icon: 'music', title: '音源管理', sub: '', to: 'Sources' },
  { icon: 'devices', title: '媒体库', sub: 'Emby / Jellyfin / Navidrome / 道理鱼 / WebDAV', to: 'MediaLibs' },
  { icon: 'my', title: '使用方式与账号', sub: '本地/服务器/登录与同步', to: 'Account' },
  { icon: 'palette', title: '主题外观', sub: '强调色 · 纯黑背景', to: 'Theme' },
  { icon: 'download', title: '下载设置', sub: '', to: 'DownloadsSettings' },
  { icon: 'cloud', title: '云备份', sub: 'WebDAV 同步歌单与设置', to: 'BackupSettings' },
  { icon: 'headphones', title: '音效设置', sub: '均衡器与空间音频', to: 'Fx' },
  { icon: 'settings', title: '基本设置', sub: '启动、缓存与存储', to: 'BasicSettings' },
  { icon: 'info', title: '关于与帮助', sub: `版本 ${APP_VERSION}`, to: 'About' },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void };
  const { connected, base, username } = useApp();
  const nSources = activeSources().length;
  const nDl = dlStore.all().length;
  const nPv = providers.all().length;
  const nLocal = deviceTrackCount();

  const sub = (g: typeof GROUPS[number]): string => {
    if (g.title === '音源管理') return `${nSources} 个已启用`;
    if (g.title === '下载设置') return `${nDl} 首已下载`;
    if (g.title === '媒体库') return nPv ? `${nPv} 个已连接` : g.sub;
    return g.sub;
  };

  return (
    <View style={st.screen}>
      <PageHeader title="设置" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={st.brandCard}>
          <View style={st.brandDot} />
          <View style={{ flex: 1 }}>
            <Text style={st.brandTitle}>无广告 · 无追踪</Text>
            <Text style={st.brandSub}>
              {connected ? `已连接 ${username || '服务器'} · ${base}` : '本地模式 · 数据仅保存在设备'}
              {nLocal ? ` · 本地音乐 ${nLocal} 首` : ''}
            </Text>
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
                <Text style={st.rowSub} numberOfLines={1}>{sub(g)}</Text>
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
    height: 64, borderRadius: 14, backgroundColor: C.surface,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
  },
  brandDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.brand },
  brandTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  brandSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  group: { borderRadius: 14, backgroundColor: C.surface, marginTop: 14, paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0F' },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
});
