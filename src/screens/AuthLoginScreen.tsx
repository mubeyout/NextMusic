import React, { useState } from 'react';
import { Image, View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { api, normalizeBase } from '../services/server';

// Figma NM-AUTH-LOGIN-001: server(step1) + username/password card + login button
// 服务器地址与账号密码强关联：地址是登录第一步；改地址先重连再登录。

export function AuthLoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; reset: (o: unknown) => void };
  const { base, connectServer, setAuth } = useApp();
  const [addr, setAddr] = useState(base || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connectedHere = !!base && normalizeBase(addr || base) === normalizeBase(base);

  const login = async () => {
    if (!addr.trim()) { setErr('第一步：请先输入服务器地址'); return; }
    if (!username.trim() || !password) { setErr('请输入用户名和密码'); return; }
    setBusy(true); setErr(null);
    try {
      // 第一步：服务器不一致时先连接
      if (!connectedHere) await connectServer(addr.trim());
      // 第二步：登录该服务器账号
      const r = await api.login(username.trim(), password);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('账号或密码错误');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|用户名|密码/.test(msg) ? '账号或密码错误' : '连接服务器失败，请检查地址与网络');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ paddingTop: insets.top + 22, paddingBottom: 30, gap: 17 }} keyboardShouldPersistTaps="handled">
      <View style={st.brandRow}>
        <View style={st.brandDot} />
        <Image source={require('../assets/brand/mark.png')} style={{ width: 16, height: 17 }} />
          <Text style={st.brandName}>NextMusic</Text>
      </View>
      <View style={st.header}>
        <Text style={st.title}>登录账号</Text>
        <Text style={st.subtitle}>账号保存在服务器上：先填服务器地址，再输入该服务器上的账号密码。</Text>
      </View>

      <View style={st.card}>
        <View style={st.stepRow}>
          <View style={st.stepBadge}><Text style={st.stepBadgeText}>1</Text></View>
          <Text style={st.fieldLabel}>服务器地址</Text>
          {connectedHere ? <Text style={st.okTag}>✓ 已连接</Text> : null}
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="http://IP:端口 或域名" placeholderTextColor={C.text2}
            value={addr} onChangeText={setAddr} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </View>

        <View style={[st.stepRow, { marginTop: 10 }]}>
          <View style={st.stepBadge}><Text style={st.stepBadgeText}>2</Text></View>
          <Text style={st.fieldLabel}>该服务器的账号密码</Text>
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="用户名" placeholderTextColor={C.text2}
            value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="密码" placeholderTextColor={C.text2}
            value={password} onChangeText={setPassword} secureTextEntry />
        </View>
      </View>

      <TouchableOpacity style={st.btnPrimary} onPress={login} disabled={busy}>
        {busy ? <ActivityIndicator color={C.onBrand} /> : <Text style={st.btnPrimaryText}>{connectedHere ? '登录' : '连接并登录'}</Text>}
      </TouchableOpacity>
      {err ? <Text style={st.err}>{err}</Text> : null}
      <TouchableOpacity style={st.backLink} onPress={() => nav.goBack()}>
        <Text style={st.backText}>← 返回</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, alignSelf: 'center', width: '100%', maxWidth: 470 }, // lx167:列宽上限
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.brand },
  brandName: { color: C.text, fontSize: 15, lineHeight: 18, fontWeight: '700' },
  header: { gap: 5 },
  title: { color: C.text, fontSize: 21, lineHeight: 26, fontWeight: '700' }, // lx167:稍小精致
  subtitle: { color: C.text2, fontSize: 12, lineHeight: 14 },
  card: { borderRadius: 12, backgroundColor: C.surface, padding: 14, gap: 8 }, // lx167:紧凑
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: C.brandText, fontSize: 11, lineHeight: 13, fontWeight: '700' },
  fieldLabel: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500', flex: 1 },
  okTag: { color: C.brandText, fontSize: 11, lineHeight: 13, fontWeight: '600' },
  input: { height: 42, borderRadius: 11, backgroundColor: C.surface2, paddingHorizontal: 13, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  btnPrimary: { height: 42, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  err: { color: '#FF6B6B', fontSize: 12, lineHeight: 15, textAlign: 'center' },
  backLink: { height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
});
