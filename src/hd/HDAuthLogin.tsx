// HD 登录页(横版):居中大表单卡(对齐桌面版连接服务器页),D-pad 可操作
// 逻辑与 phone AuthLoginScreen 一致:第一步连接服务器(地址),第二步登录该服务器账号
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { createMMKV } from 'react-native-mmkv';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useApp } from '../state/AppState';
import { api, normalizeBase } from '../services/server';

const recentKv = createMMKV({ id: 'nextmusic-server-history' });

export function HDAuthLoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; reset: (o: unknown) => void };
  const { base, connectServer, setAuth, setMode } = useApp();
  const [addr, setAddr] = useState(base || recentKv.getString('last') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [regCode, setRegCode] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPwd, setRegPwd] = useState('');
  const [regPwd2, setRegPwd2] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try { setHistory(JSON.parse(recentKv.getString('list') || '[]')); } catch { /* ignore */ }
  }, []);

  const connectedHere = !!base && normalizeBase(addr || base) === normalizeBase(base);

  const login = async () => {
    if (!addr.trim()) { setErr('第一步:请先输入服务器地址'); return; }
    if (!username.trim() || !password) { setErr('请输入用户名和密码'); return; }
    setBusy(true); setErr(null);
    try {
      if (!connectedHere) await connectServer(addr.trim());
      const r = await api.login(username.trim(), password);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('账号或密码错误');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|用户名|密码/.test(msg) ? '账号或密码错误' : '连接服务器失败,请检查地址与网络');
    } finally { setBusy(false); }
  };

  const goLocal = () => { setMode('local'); nav.reset({ index: 0, routes: [{ name: 'Main' }] }); };

  const register = async () => {
    if (!addr.trim()) { setErr('请先输入服务器地址'); return; }
    if (!regUser.trim() || !regPwd || !regCode) { setErr('请完整填写管理员密码与账号信息'); return; }
    if (regPwd !== regPwd2) { setErr('两次输入的密码不一致'); return; }
    setBusy(true); setErr(null);
    try {
      if (!connectedHere) await connectServer(addr.trim());
      await api.createUser(regUser.trim(), regPwd, regCode);
      const r = await api.login(regUser.trim(), regPwd);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('创建成功但登录失败,请切回登录重试');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|管理员|密码/.test(msg) ? '创建失败:管理员密码错误或用户名已存在' : '连接服务器失败,请检查地址与网络');
    } finally { setBusy(false); }
  };

  return (
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 20) + 10, paddingBottom: 16, alignItems: 'center', justifyContent: 'center' }]}>
      <View style={st.card}>
        {/* 顶行:返回 + 标题 */}
        <View style={st.topRow}>
          <HDTouch style={st.backBtn} onPress={nav.goBack} focusStyle={{ borderWidth: 2.5, borderColor: C.brand }}>
            <Icon name="back" size={24} color={C.text2} />
          </HDTouch>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.title}>连接服务器</Text>
            <Text style={st.subtitle}>账号保存在服务器上:先填服务器地址,再输入该服务器上的账号密码。</Text>
          </View>
        </View>

        {/* 登录 / 创建账号 tab(对齐桌面版 Pill) */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HDTouch style={[st.pill, tab === 'login' && st.pillOn]} onPress={() => setTab('login')} focusStyle={st.pillFocus} hasTVPreferredFocus>
            <Text style={[st.pillText, tab === 'login' && st.pillTextOn]}>登录</Text>
          </HDTouch>
          <HDTouch style={[st.pill, tab === 'register' && st.pillOn]} onPress={() => setTab('register')} focusStyle={st.pillFocus}>
            <Text style={[st.pillText, tab === 'register' && st.pillTextOn]}>创建账号</Text>
          </HDTouch>
        </View>

        <View style={st.stepRow}>
          <View style={st.stepBadge}><Text style={st.stepBadgeText}>1</Text></View>
          <Text style={st.fieldLabel}>服务器地址</Text>
          {connectedHere ? <Text style={st.okTag}>✓ 已连接</Text> : null}
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="http://IP:端口 或域名" placeholderTextColor={C.text3}
            value={addr} onChangeText={setAddr} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </View>

        <View style={[st.stepRow, { marginTop: 14 }]}>
          <View style={st.stepBadge}><Text style={st.stepBadgeText}>2</Text></View>
          <Text style={st.fieldLabel}>{tab === 'login' ? '该服务器的账号密码' : '创建新账号'}</Text>
        </View>
        {tab === 'login' ? (
          <>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="用户名" placeholderTextColor={C.text3}
                value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="密码" placeholderTextColor={C.text3}
                value={password} onChangeText={setPassword} secureTextEntry />
            </View>
          </>
        ) : (
          <>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="管理员密码(服务器控制台密码)" placeholderTextColor={C.text3}
                value={regCode} onChangeText={setRegCode} secureTextEntry />
            </View>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="新用户名(2 字符以上)" placeholderTextColor={C.text3}
                value={regUser} onChangeText={setRegUser} autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="设置密码(至少 6 位)" placeholderTextColor={C.text3}
                value={regPwd} onChangeText={setRegPwd} secureTextEntry />
            </View>
            <View style={st.input}>
              <TextInput style={st.inputText} placeholder="确认密码" placeholderTextColor={C.text3}
                value={regPwd2} onChangeText={setRegPwd2} secureTextEntry />
            </View>
          </>
        )}

        {err ? <Text style={st.err}>{err}</Text> : null}

        <HDTouch style={st.btnPrimary} onPress={tab === 'login' ? login : register} disabled={busy} focusStyle={st.btnPrimaryFocus}>
          {busy
            ? <ActivityIndicator color={C.onBrand} size="large" />
            : <Text style={st.btnPrimaryText}>{tab === 'login' ? (connectedHere ? '登 录' : '连接并登录') : '创建并登录'}</Text>}
        </HDTouch>

        <HDTouch style={st.btnGhost} onPress={goLocal} focusStyle={st.btnGhostFocus}>
          <Text style={st.btnGhostText}>先本地使用(之后可再连接)</Text>
        </HDTouch>

        {/* 最近连接(对齐桌面版) */}
        {history.length ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={st.fieldLabel}>最近连接</Text>
            {history.slice(0, 3).map(h => (
              <HDTouch key={h} style={st.histRow} onPress={() => setAddr(h)} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}>
                <Icon name="server" size={14} color={C.text3} />
                <Text style={st.histText} numberOfLines={1}>{h}</Text>
                <Icon name="chevronright" size={12} color={C.text3} />
              </HDTouch>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { width: 700, borderRadius: 20, backgroundColor: '#1A1A1A', padding: 24, gap: 12, boxShadow: '0 12px 36px rgba(0,0,0,.55)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 6 },
  backBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: C.text2, fontSize: 14, lineHeight: 19 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 34 },
  stepBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: C.brand, fontSize: 15, fontWeight: '800' },
  fieldLabel: { color: C.text, fontSize: 17, fontWeight: '700' },
  okTag: { color: C.brand, fontSize: 14, fontWeight: '600' },
  input: { height: 56, borderRadius: 12, backgroundColor: '#111111', borderWidth: 1, borderColor: '#2E2E2E', justifyContent: 'center', paddingHorizontal: 18 },
  inputText: { color: C.text, fontSize: 17, padding: 0 },
  err: { color: '#FF6B6B', fontSize: 15, lineHeight: 20 },
  btnPrimary: { height: 66, borderRadius: 16, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnPrimaryFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 16 },
  btnPrimaryText: { color: C.onBrand, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  btnGhost: { height: 60, borderRadius: 16, borderWidth: 1.5, borderColor: '#4A4A4A', alignItems: 'center', justifyContent: 'center' },
  btnGhostFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 16 },
  btnGhostText: { color: C.text, fontSize: 16, fontWeight: '600' },
  pill: { height: 40, borderRadius: 20, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#232323' },
  pillOn: { backgroundColor: C.brandDim, borderWidth: 1, borderColor: 'rgba(30,215,96,.4)' },
  pillFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 20 },
  pillText: { color: C.text3, fontSize: 15, fontWeight: '600' },
  pillTextOn: { color: C.brand },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 10, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2E2E2E', paddingHorizontal: 14 },
  histText: { color: C.text2, fontSize: 14, flex: 1 },
});
