import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';

// Figma NM-BOOT-001: brand row, title 28, two mode cards (r=18, 162h), hint card
export function BootScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { navigate: (s: string) => void; reset: (o: unknown) => void };
  const { setMode } = useApp();

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={st.brandRow}>
          <View style={st.brandDot} />
          <Text style={st.brandName}>NextMusic</Text>
        </View>

        <View style={st.header}>
          <Text style={st.title}>选择你的使用方式</Text>
          <Text style={st.subtitle}>搜索、榜单、歌单直接连接音乐平台，无需服务器。播放需添加自定义音源或登录服务器；收藏与歌单同步需登录。</Text>
        </View>

        <View style={st.card}>
          <View style={st.cardTop}>
            <View style={st.cardDot} />
            <Text style={st.cardTitle}>接入私有音乐库</Text>
          </View>
          <Text style={st.cardDesc}>Emby / Jellyfin / Navidrome / 道理鱼 / WebDAV：把 NAS 上的音乐库接入 App 浏览播放。进入后在 设置 → 媒体库 添加。</Text>
          <TouchableOpacity
            style={st.btnGhost}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            onPress={() => nav.navigate('MediaLibs' as never)}
          >
            <Text style={st.btnGhostText}>去添加媒体库</Text>
          </TouchableOpacity>
        </View>

        <View style={st.card}>
          <View style={st.cardTop}>
            <View style={st.cardDot} />
            <Text style={st.cardTitle}>本地使用</Text>
          </View>
          <Text style={st.cardDesc}>浏览、搜索、榜单直连平台。添加自定义音源后即可播放；收藏、歌单和配置保存在本机。</Text>
          <TouchableOpacity
            style={st.btnPrimary}
            onPress={() => { setMode('local'); nav.reset({ index: 0, routes: [{ name: 'Main' }] }); }}
          >
            <Text style={st.btnPrimaryText}>直接本地使用</Text>
          </TouchableOpacity>
        </View>

        <View style={st.card}>
          <View style={st.cardTop}>
            <View style={st.cardDot} />
            <Text style={st.cardTitle}>连接服务器</Text>
          </View>
          <Text style={st.cardDesc}>登录服务器账号可同步收藏与歌单，并使用服务器端音源播放。</Text>
          <TouchableOpacity style={st.btnGhost} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} onPress={() => nav.navigate('Server')}>
            <Text style={st.btnGhostText}>连接服务器</Text>
          </TouchableOpacity>
        </View>

        <View style={st.hint}>
          <Text style={st.hintTitle}>之后可随时切换</Text>
          <Text style={st.hintBody}>设置 → 使用方式与账号，可连接服务器、登录同步或回到本地模式；设置 → 媒体库，可接入或管理私有音乐库。</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  content: { gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 24 },
  brandDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.brand },
  brandName: { color: C.text, fontSize: 16, lineHeight: 19, fontWeight: '700' },
  header: { gap: 6 },
  title: { color: C.text, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subtitle: { color: C.text2, fontSize: 13, lineHeight: 16 },
  card: { borderRadius: 18, backgroundColor: '#1A1A1A', padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 28 },
  cardDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.brand },
  cardTitle: { color: C.text, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  cardDesc: { color: C.text2, fontSize: 13, lineHeight: 16 },
  btnPrimary: { height: 46, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  btnGhost: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#595959', alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  hint: { borderRadius: 14, backgroundColor: '#1A1A1A', padding: 14, gap: 4 },
  hintTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500' },
  hintBody: { color: C.text2, fontSize: 11, lineHeight: 13 },
});
