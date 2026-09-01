import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { createMMKV } from 'react-native-mmkv';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';

// Figma NM-SERVER-001: server address card + connect button + capabilities + back
const recentKv = createMMKV({ id: 'nextmusic-server-history' });

export function ServerScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { navigate: (s: string) => void; goBack: () => void; reset: (o: unknown) => void };
  const { connectServer } = useApp();
  const [addr, setAddr] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    try { setHistory(JSON.parse(recentKv.getString('list') || '[]')); } catch { /* ignore */ }
    setAddr(recentKv.getString('last') || '');
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connect = async () => {
    if (!addr.trim()) { setErr('请输入服务器地址'); return; }
    setBusy(true); setErr(null);
    try {
      const norm = addr.trim();
      await connectServer(norm);
      // 记录连接历史
      try {
        const list: string[] = JSON.parse(recentKv.getString('list') || '[]');
        const next = [norm, ...list.filter(x => x !== norm)].slice(0, 5);
        recentKv.set('list', JSON.stringify(next));
        recentKv.set('last', norm);
      } catch { /* ignore */ }
      nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
    } catch (e) {
      setErr('连接失败，请检查地址与网络后重试');
    } finally { setBusy(false); }
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top + 22 }]}>
      <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 22 }]} showsVerticalScrollIndicator={false}>
        <View style={st.brandRow}>
          <View style={st.brandDot} />
          <Text style={st.brandName}>NextMusic</Text>
        </View>

        <View style={st.header}>
          <Text style={st.title}>连接你的音乐服务器</Text>
          <Text style={st.subtitle}>连接服务器是可选增强能力；本地音乐、已导入音源和歌单无需服务器也可使用。</Text>
        </View>

        <View style={st.card}>
          <Text style={st.fieldLabel}>服务器地址</Text>
          <View style={st.input}>
            <TextInput
              style={st.inputText}
              placeholder="https://music.example.com"
              placeholderTextColor={C.text2}
              value={addr}
              onChangeText={setAddr}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <Text style={st.fieldHint}>支持 http(s)://IP:端口 或域名；连接时检查 /api/music/config</Text>
          {history.length ? history.slice(0, 3).map(h => (
            <TouchableOpacity key={h} style={st.quickAction} onPress={() => setAddr(h)}>
              <Text style={st.quickText}>最近 · {h}  ›</Text>
            </TouchableOpacity>
          )) : null}
        </View>

        <TouchableOpacity style={st.btnPrimary} onPress={connect} disabled={busy}>
          {busy ? <ActivityIndicator color={C.onBrand} /> : <Text style={st.btnPrimaryText}>连接服务器</Text>}
        </TouchableOpacity>
        {err ? <Text style={st.err}>{err}</Text> : null}

        <View style={st.capCard}>
          <Text style={st.capTitle}>连接后可用</Text>
          <Text style={st.capBody}>多源搜索 · 在线歌单 · 本地/缓存音乐 · 账号同步 · 自定义源</Text>
        </View>

        <TouchableOpacity style={st.backLink} onPress={() => nav.goBack()}>
          <Text style={st.backText}>← 返回选择使用方式</Text>
        </TouchableOpacity>
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
  card: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 12 },
  fieldLabel: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  input: { height: 46, borderRadius: 12, backgroundColor: C.surface2, paddingHorizontal: 14, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  fieldHint: { color: C.text2, fontSize: 10, lineHeight: 12 },
  quickAction: { height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  quickText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  btnPrimary: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  err: { color: '#FF6B6B', fontSize: 12, lineHeight: 15, textAlign: 'center' },
  capCard: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 6 },
  capTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500' },
  capBody: { color: C.text2, fontSize: 10, lineHeight: 12 },
  backLink: { height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
});
