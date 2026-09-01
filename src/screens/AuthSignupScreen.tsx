import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { api, normalizeBase } from '../services/server';

// 创建服务器用户：服务器地址是第一步（与登录一致）。
// 服务器按管理授权码（frontend password）开放注册 → 创建成功后自动登录。

export function AuthSignupScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; reset: (o: unknown) => void };
  const { base, connectServer, setAuth } = useApp();
  const [addr, setAddr] = useState(base || '');
  const [authCode, setAuthCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connectedHere = !!base && normalizeBase(addr || base) === normalizeBase(base);

  const submit = async () => {
    if (!addr.trim()) { setErr('第一步：请先输入服务器地址'); return; }
    if (!authCode) { setErr('请输入服务器管理授权码（向服务器管理员索取）'); return; }
    if (!username.trim() || !password) { setErr('请输入用户名和密码'); return; }
    if (password !== password2) { setErr('两次输入的密码不一致'); return; }
    setBusy(true); setErr(null);
    try {
      // 第一步：连接服务器（地址变化时重连）
      if (!connectedHere) await connectServer(addr.trim());
      // 第二步：创建用户（409=已存在；401=授权码错误）
      await api.createUser(username.trim(), password, authCode);
      // 第三步：直接登录进入
      const r = await api.login(username.trim(), password);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('创建成功但自动登录失败，请返回登录');
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/HTTP 409/.test(msg)) setErr('该用户名已存在');
      else if (/HTTP 40[13]/.test(msg)) setErr('管理授权码错误');
      else if (/HTTP 400/.test(msg)) setErr('用户名或密码不能为空');
      else setErr('连接服务器失败，请检查地址与网络');
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
          <Text style={st.title}>创建服务器用户</Text>
          <Text style={st.subtitle}>账号保存在你填写的服务器上：先填服务器地址，再凭管理授权码创建账号。</Text>
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
            <Text style={st.fieldLabel}>服务器管理授权码</Text>
          </View>
          <View style={st.input}>
            <TextInput style={st.inputText} placeholder="向服务器管理员索取" placeholderTextColor={C.text2}
              value={authCode} onChangeText={setAuthCode} autoCapitalize="none" autoCorrect={false} secureTextEntry />
          </View>

          <View style={[st.stepRow, { marginTop: 10 }]}>
            <View style={st.stepBadge}><Text style={st.stepBadgeText}>3</Text></View>
            <Text style={st.fieldLabel}>设置账号密码</Text>
          </View>
          <View style={st.input}>
            <TextInput style={st.inputText} placeholder="用户名" placeholderTextColor={C.text2}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          </View>
          <View style={st.input}>
            <TextInput style={st.inputText} placeholder="密码" placeholderTextColor={C.text2}
              value={password} onChangeText={setPassword} secureTextEntry />
          </View>
          <View style={st.input}>
            <TextInput style={st.inputText} placeholder="确认密码" placeholderTextColor={C.text2}
              value={password2} onChangeText={setPassword2} secureTextEntry />
          </View>
        </View>

        <TouchableOpacity style={st.btnPrimary} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={C.onBrand} /> : <Text style={st.btnPrimaryText}>创建并登录</Text>}
        </TouchableOpacity>
        {err ? <Text style={st.err}>{err}</Text> : null}
        <TouchableOpacity style={st.backLink} onPress={() => nav.goBack()}>
          <Text style={st.backText}>← 返回</Text>
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
  card: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: C.brand, fontSize: 11, lineHeight: 13, fontWeight: '700' },
  fieldLabel: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500', flex: 1 },
  okTag: { color: C.brand, fontSize: 11, lineHeight: 13, fontWeight: '600' },
  input: { height: 46, borderRadius: 12, backgroundColor: C.surface2, paddingHorizontal: 14, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  btnPrimary: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  err: { color: '#FF6B6B', fontSize: 12, lineHeight: 15, textAlign: 'center' },
  backLink: { height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
});
