// HD 登录页(横版):表单结构与 ProviderEdit(媒体库添加)同构 —— desc + Tab 容器 + 输入卡(label/值/hint) + 测试连接/主按钮双钮
// 逻辑与 phone AuthLoginScreen 一致:第一步连接服务器(地址),第二步登录该服务器账号
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { createMMKV } from 'react-native-mmkv';
import { Icon } from '../theme/Icon';
import { C, SH } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useApp } from '../state/AppState';
import { api, normalizeBase } from '../services/server';
import { IS_HD } from '../services/appversion';
import { toast } from '../components/Dialog';

const recentKv = createMMKV({ id: 'nextmusic-server-history' });

export function HDAuthLoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; reset: (o: unknown) => void };
  const { base, connectServer, setAuth, setMode } = useApp();
  const [addr, setAddr] = useState(base || recentKv.getString('last') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'login' | 'register'>('');
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [regCode, setRegCode] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPwd, setRegPwd] = useState('');
  const [regPwd2, setRegPwd2] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    try { setHistory(JSON.parse(recentKv.getString('list') || '[]')); } catch { /* ignore */ }
  }, []);

  // TV 常用服务器候选(无历史时显示;与 phone auto-probe 同源:内网网关+默认端口)
  const QUICK = ['10.0.0.1:9527'];

  const connectedHere = !!base && normalizeBase(addr || base) === normalizeBase(base);

  const ensureConn = async () => {
    if (!connectedHere) await connectServer(addr.trim());
  };

  // 测试连接(对齐 ProviderEdit testConn:只验证地址可达,不登录)
  const testConn = async () => {
    if (!addr.trim()) { setErr('请先输入服务器地址'); return; }
    setBusy('test'); setErr(null);
    try {
      await connectServer(addr.trim());
      setTested(true);
      toast('连接测试通过');
    } catch (e) {
      setTested(false);
      dialog_alert('连接失败', (e as Error).message + '\n\n请检查地址与网络,以及服务器是否已在同一网络');
    } finally { setBusy(''); }
  };

  const login = async () => {
    if (!addr.trim()) { setErr('第一步:请先输入服务器地址'); return; }
    if (!username.trim() || !password) { setErr('请输入用户名和密码'); return; }
    setBusy('login'); setErr(null);
    try {
      await ensureConn();
      const r = await api.login(username.trim(), password);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('账号或密码错误');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|用户名|密码/.test(msg) ? '账号或密码错误' : `连接服务器失败(${msg.slice(0, 80)})`);
    } finally { setBusy(''); }
  };

  const goLocal = () => { setMode('local'); nav.reset({ index: 0, routes: [{ name: 'Main' }] }); };

  const register = async () => {
    if (!addr.trim()) { setErr('请先输入服务器地址'); return; }
    if (!regUser.trim() || !regPwd || !regCode) { setErr('请完整填写管理员密码与账号信息'); return; }
    if (regPwd !== regPwd2) { setErr('两次输入的密码不一致'); return; }
    setBusy('register'); setErr(null);
    try {
      await ensureConn();
      await api.createUser(regUser.trim(), regPwd, regCode);
      const r = await api.login(regUser.trim(), regPwd);
      if (r.success) {
        setAuth(r.token, r.username);
        nav.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('创建成功但登录失败,请切回登录重试');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|管理员|密码/.test(msg) ? '创建失败:管理员密码错误或用户名已存在' : `连接服务器失败(${msg.slice(0, 80)})`);
    } finally { setBusy(''); }
  };

  // dialog.alert 引入会带 phone 组件树,这里用局部包装避免样式耦合
  function dialog_alert(title: string, msg: string) { toast(title + ':' + msg.split('\n')[0]); }

  // TV/车机:输入卡整体 HDTouch 聚焦导航,OK 才进输入态(focusable=false 防 D-pad 碰框即弹 IME 吃掉导航——实测病灶)
  const inputCard = (label: string, value: string, set: (v: string) => void, ph: string, opts?: { secure?: boolean; hint?: string; right?: React.ReactNode; kbd?: 'url' | 'default'; onSubmit?: () => void }) => {
    const ref = React.useRef<React.ComponentRef<typeof TextInput>>(null);
    const card = (
      <View style={st.inputCard}>
        <View style={st.labelRow}>
          <Text style={st.inputLabel}>{label}</Text>
          {opts?.right}
        </View>
        <TextInput
          ref={ref}
          style={st.inputValue}
          placeholder={ph}
          placeholderTextColor={C.text3}
          value={value}
          onChangeText={v => { set(v); setTested(false); }}
          autoCapitalize="none" autoCorrect={false}
          secureTextEntry={opts?.secure}
          keyboardType={opts?.kbd === 'url' ? 'url' : 'default'}
          returnKeyType={opts?.onSubmit ? 'done' : 'next'}
          onSubmitEditing={opts?.onSubmit}
          focusable={!IS_HD}
          showSoftInputOnFocus={!IS_HD ? undefined : false}
        />
        {opts?.hint ? <Text style={st.inputHint}>{opts.hint}</Text> : null}
      </View>
    );
    if (!IS_HD) return card;
    return (
      <HDTouch style={{ borderRadius: 16 }} onPress={() => { ref.current?.focus(); }} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 16 }}>
        {card}
      </HDTouch>
    );
  };

  return (
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 20) + 8 }]}>
      {/* 头部:返回 + 居中标题(ProviderEdit 同构) */}
      <View style={st.header}>
        <HDTouch style={st.backBtn} onPress={nav.goBack} focusStyle={st.focus}>
          <Icon name="back" size={20} color={C.text2} />
        </HDTouch>
        <Text style={st.title}>连接服务器</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ maxWidth: 860, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingBottom: 34, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={st.desc}>账号保存在服务器上:先填服务器地址(可先测试),再输入该服务器上的账号密码。</Text>

        {/* 登录 / 创建账号 Tab 容器(ProviderEdit tabsWrap 同构) */}
        <View style={st.tabsWrap}>
          <HDTouch style={[st.tab, tab === 'login' && st.tabOn]} onPress={() => setTab('login')} focusStyle={st.tabFocus} hasTVPreferredFocus>
            <Text style={[st.tabText, tab === 'login' && st.tabTextOn]}>登录</Text>
          </HDTouch>
          <HDTouch style={[st.tab, tab === 'register' && st.tabOn]} onPress={() => setTab('register')} focusStyle={st.tabFocus}>
            <Text style={[st.tabText, tab === 'register' && st.tabTextOn]}>创建账号</Text>
          </HDTouch>
        </View>

        {inputCard('服务器地址', addr, setAddr, 'http://IP:端口 或域名', {
          kbd: 'url',
          hint: '与媒体库添加一致:支持 IP / 域名,自动补全协议',
          right: connectedHere || tested ? <Text style={st.okTag}>✓ 已连接</Text> : null,
        })}

        {tab === 'login' ? (
          <>
            {inputCard('用户名', username, setUsername, 'music_user', {})}
            {inputCard('密码', password, setPassword, '••••••••', { secure: true, hint: '凭证保存到系统安全存储;输入完成按确认键直接登录', onSubmit: login })}
          </>
        ) : (
          <>
            {inputCard('管理员密码', regCode, setRegCode, '服务器控制台密码', { secure: true })}
            {inputCard('新用户名', regUser, setRegUser, '2 字符以上', {})}
            {inputCard('设置密码', regPwd, setRegPwd, '至少 6 位', { secure: true })}
            {inputCard('确认密码', regPwd2, setRegPwd2, '再输入一次', { secure: true, onSubmit: register })}
          </>
        )}

        {tested ? (
          <View style={st.infoCard}>
            <Text style={st.infoTitle}>连接测试通过</Text>
            <Text style={st.inputHint}>继续填写账号即可登录</Text>
          </View>
        ) : null}

        {err ? <Text style={st.err}>{err}</Text> : null}

        {/* 按钮行:测试连接 ghost + 主按钮(ProviderEdit btnRow 同构) */}
        <View style={st.btnRow}>
          <HDTouch style={st.btnGhost} focusStyle={st.btnGhostFocus} focusBg={C.hover} onPress={testConn} disabled={!!busy}>
            {busy === 'test' ? <ActivityIndicator color={C.text} size="large" /> : <Text style={st.btnGhostText}>测试连接</Text>}
          </HDTouch>
          <HDTouch style={st.btnPrimary} focusStyle={st.btnPrimaryFocus} onPress={tab === 'login' ? login : register} disabled={!!busy}>
            {busy === 'login' || busy === 'register'
              ? <ActivityIndicator color={C.onBrand} size="large" />
              : <Text style={st.btnPrimaryText}>{tab === 'login' ? (connectedHere || tested ? '登 录' : '连接并登录') : '创建并登录'}</Text>}
          </HDTouch>
        </View>

        <HDTouch style={st.btnGhostFull} onPress={goLocal} focusStyle={st.btnGhostFocus}>
          <Text style={st.btnGhostText}>先本地使用(之后可再连接)</Text>
        </HDTouch>

        {/* 常用服务器常显 + 最近连接(TV 无键盘,一键填入;历史里的坏地址可无视直接点常用行) */}
        <View style={{ gap: 8 }}>
          <Text style={st.inputLabel}>{history.length ? '最近连接' : '常用服务器'}</Text>
          {(history.length ? history.slice(0, 4) : QUICK).map(h => (
              <HDTouch key={h} style={st.histRow} onPress={() => setAddr(h)} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 16 }}>
                <Icon name="server" size={14} color={C.text3} />
                <Text style={st.histText} numberOfLines={1}>{h}</Text>
                <Icon name="chevronright" size={12} color={C.text3} />
              </HDTouch>
            ))}
          {history.length ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={st.inputLabel}>常用服务器</Text>
              {QUICK.filter(q => !history.slice(0, 4).includes(q)).map(q => (
                <HDTouch key={q} style={st.histRow} onPress={() => setAddr(q)} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 16 }}>
                  <Icon name="server" size={14} color={C.text3} />
                  <Text style={st.histText} numberOfLines={1}>{q}</Text>
                  <Icon name="chevronright" size={12} color={C.text3} />
                </HDTouch>
              ))}
            </View>
          ) : null}
          </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
  backBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 16 },
  title: { flex: 1, color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  desc: { color: C.text2, fontSize: 13, lineHeight: 18 },
  // Tab 容器(ProviderEdit tabsWrap 同构)
  tabsWrap: { flexDirection: 'row', backgroundColor: C.elev, borderRadius: 14, padding: 5, gap: 5, height: 54 },
  tab: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.surface },
  tabFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 10 },
  tabText: { color: C.text3, fontSize: 14, fontWeight: '500' },
  tabTextOn: { color: C.text, fontWeight: '700' },
  // 输入卡(ProviderEdit hdSt.inputCard 同构)
  inputCard: { backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { color: C.text2, fontSize: 13, flex: 1 },
  okTag: { color: C.brand, fontSize: 13, fontWeight: '600' },
  inputValue: { color: C.text, fontSize: 16, paddingVertical: 6 },
  inputHint: { color: C.text3, fontSize: 11 },
  infoCard: { backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, gap: 4 },
  infoTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  err: { color: C.danger, fontSize: 14, lineHeight: 19 },
  // 按钮(ProviderEdit btnRow 同构:ghost flex1 + primary flex1.4)
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btnGhost: { flex: 1, height: 58, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  btnGhostFull: { height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  btnGhostFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 14 },
  btnGhostText: { color: C.text, fontSize: 16, fontWeight: '600' },
  btnPrimary: { flex: 1.4, height: 58, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryFocus: { borderWidth: 2.5, borderColor: C.text, borderRadius: 14 },
  btnPrimaryText: { color: C.onBrand, fontSize: 16, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  histText: { color: C.text2, fontSize: 13, flex: 1 },
});
