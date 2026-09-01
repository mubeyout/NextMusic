import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';

// Figma NM-AUTH-001: server-ready card + 3 actions + binding note
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { navigate: (s: string) => void; reset: (o: unknown) => void };
  const { base } = useApp();
  const host = (base || 'music.example.com').replace(/^https?:\/\//, '');

  const enter = () => nav.reset({ index: 0, routes: [{ name: 'Main' }] });

  return (
    <View style={[st.screen, { paddingTop: insets.top + 22 }]}>
      <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 22 }]} showsVerticalScrollIndicator={false}>
        <View style={st.brandRow}>
          <View style={st.brandDot} />
          <Text style={st.brandName}>NextMusic</Text>
        </View>

        <View style={st.header}>
          <Text style={st.title}>选择使用方式</Text>
          <Text style={st.subtitle}>服务器已连接。登录账号可同步收藏和歌单，也可以按服务器权限以访客方式进入。</Text>
        </View>

        <View style={st.readyCard}>
          <Text style={st.readyTitle}>✓ 已连接到 {host}</Text>
          <Text style={st.readySub}>支持：网易云 / QQ / 酷狗 / 酷我 / 咪咕歌单</Text>
        </View>

        <TouchableOpacity style={st.btnPrimary} onPress={() => nav.navigate('AuthLogin')}>
          <Text style={st.btnPrimaryText}>登录已有账号</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnGhost} onPress={() => nav.navigate('AuthSignup')}>
          <Text style={st.btnGhostText}>创建服务器用户</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnGhost} onPress={enter}>
          <Text style={st.btnGhostText}>暂不登录，继续使用</Text>
        </TouchableOpacity>

        <View style={st.note}>
          <Text style={st.noteTitle}>账号与服务器绑定</Text>
          <Text style={st.noteBody}>切换服务器后，需要重新选择或登录该服务器上的账号。</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  content: { gap: 17 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.brand },
  brandName: { color: C.text, fontSize: 15, lineHeight: 18, fontWeight: '700' },
  header: { gap: 5 },
  title: { color: C.text, fontSize: 26, lineHeight: 31, fontWeight: '700' },
  subtitle: { color: C.text2, fontSize: 12, lineHeight: 14 },
  readyCard: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 8 },
  readyTitle: { color: C.brand, fontSize: 13, lineHeight: 16, fontWeight: '500' },
  readySub: { color: C.text2, fontSize: 10, lineHeight: 12 },
  btnPrimary: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  btnGhost: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  note: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 6 },
  noteTitle: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  noteBody: { color: C.text2, fontSize: 10, lineHeight: 12 },
});
