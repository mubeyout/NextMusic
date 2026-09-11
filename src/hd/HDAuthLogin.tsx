// HD 登录页(横版):表单结构与 ProviderEdit(媒体库添加)同构 —— desc + Tab 容器 + 输入卡(label/值/hint) + 测试连接/主按钮双钮
// 逻辑与 phone AuthLoginScreen 一致:第一步连接服务器(地址),第二步登录该服务器账号
import React, { useEffect, useState } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { navRef } from '../navRef';
import { createMMKV } from 'react-native-mmkv';
import { Icon } from '../theme/Icon';
import { C, SH } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useApp } from '../state/AppState';
import { api, normalizeBase } from '../services/server';
import { IS_HD } from '../services/appversion';
import { Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { toast } from '../components/Dialog';

const recentKv = createMMKV({ id: 'nextmusic-server-history' });

export function HDAuthLoginScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; reset: (o: unknown) => void };
  const { base, connectServer, setAuth, setMode } = useApp();
  // web 服务端部署形态:默认地址=本站(原版 v2 同款 location.origin),免手填;原生端保持历史/手填
  const defaultAddr = Platform.OS === 'web'
    ? (base || recentKv.getString('last') || (typeof location !== 'undefined' ? location.origin : ''))
    : (base || recentKv.getString('last') || '');
  const [addr, setAddr] = useState(defaultAddr);
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

  const effAddr = () => addr.trim() || (Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : '');
  const ensureConn = async () => {
    if (!connectedHere) await connectServer(effAddr());
  };

  // 测试连接(对齐 ProviderEdit testConn:只验证地址可达,不登录)
  const testConn = async () => {
    if (!addr.trim()) { setErr('请先输入服务器地址'); return; }
    setBusy('test'); setErr(null);
    try {
      await connectServer(effAddr());
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
        navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('账号或密码错误');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|用户名|密码/.test(msg) ? '账号或密码错误' : `连接服务器失败(${msg.slice(0, 80)})`);
    } finally { setBusy(''); }
  };

  const goLocal = () => { setMode('local'); navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] }); };

  const register = async () => {
    if (!addr.trim() && Platform.OS !== 'web') { setErr('请先输入服务器地址'); return; }
    if (!regUser.trim() || !regPwd || !regCode) { setErr('请完整填写管理员密码与账号信息'); return; }
    if (regPwd !== regPwd2) { setErr('两次输入的密码不一致'); return; }
    setBusy('register'); setErr(null);
    try {
      await ensureConn();
      await api.createUser(regUser.trim(), regPwd, regCode);
      const r = await api.login(regUser.trim(), regPwd);
      if (r.success) {
        setAuth(r.token, r.username);
        navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else setErr('创建成功但登录失败,请切回登录重试');
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/HTTP 4|管理员|密码/.test(msg) ? '创建失败:管理员密码错误或用户名已存在' : `连接服务器失败(${msg.slice(0, 80)})`);
    } finally { setBusy(''); }
  };

  // dialog.alert 引入会带 phone 组件树,这里用局部包装避免样式耦合
  function dialog_alert(title: string, msg: string) { toast(title + ':' + msg.split('\n')[0]); }

  // TV/车机:输入卡整体 HDTouch 聚焦导航,OK 才进输入态并弹 IME
  // 坑:showSoftInputOnFocus=false 会连手动 focus() 的键盘一起拦(老板实测无法弹出)——OK 时动态放开
  const inputCard = (label: string, value: string, set: (v: string) => void, ph: string, opts?: { secure?: boolean; hint?: string; right?: React.ReactNode; kbd?: 'url' | 'default'; onSubmit?: () => void }) => {
    const ref = React.useRef<React.ComponentRef<typeof TextInput>>(null);
    const [ime, setIme] = React.useState(false);
    React.useEffect(() => { if (ime) ref.current?.focus(); }, [ime]);
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
          focusable={!IS_HD || ime}
          showSoftInputOnFocus={!IS_HD ? undefined : ime}
          onBlur={() => setIme(false)}
        />
        {opts?.hint ? <Text style={st.inputHint}>{opts.hint}</Text> : null}
      </View>
    );
    if (!IS_HD) return card;
    return (
      <HDTouch style={{ borderRadius: 16 }} onPress={() => setIme(true)} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 16 }}>
        {card}
      </HDTouch>
    );
  };

  return (
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 20) + 6 }]}>
      {/* 头部:返回 + 标题(左对齐,与其他 HD 子页一致) */}
      <View style={st.header}>
        <HDTouch style={st.backBtn} onPress={nav.goBack} focusStyle={st.focus}>
          <Icon name="back" size={17} color={C.text2} />
        </HDTouch>
        <Text style={st.title}>连接服务器</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 34, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        {/* 桌面双栏:左品牌说明 + 右表单卡(HD 密度,对齐桌面登录页形态) */}
        <View style={st.cols}>

          {/* 左栏:品牌/特性(窄屏隐藏) */}
          {!IS_WEB ? null : (
            <View style={st.heroPane}>
              <Image source={require('../assets/brand/mark.png')} style={st.heroMark} />
              <Text style={st.heroTitle}>同步你的音乐世界</Text>
              <Text style={st.heroSub}>登录服务器账号后:</Text>
              {[
                '歌单与收藏多端实时同步',
                '服务器端音源直接播放',
                '播放进度与音效配置云同步',
                '快照备份与数据管理',
              ].map(f => (
                <View key={f} style={st.featRow}>
                  <Icon name="check" size={12} color={C.brand} />
                  <Text style={st.featText}>{f}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 右栏:表单卡 */}
          <View style={st.formPane}>
            {/* Tab */}
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
              hint: '支持 IP / 域名,自动补全协议',
              right: connectedHere || tested ? <Text style={st.okTag}>已连接</Text> : null,
            })}

            {tab === 'login' ? (
              <>
                {inputCard('用户名', username, setUsername, 'music_user', {})}
                {inputCard('密码', password, setPassword, '········', { secure: true, hint: '凭证安全存储;输入完成按确认直接登录', onSubmit: login })}
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
              <View style={st.infoRow}>
                <Icon name="check" size={13} color={C.brand} />
                <Text style={st.infoText}>连接测试通过,继续填写账号即可登录</Text>
              </View>
            ) : null}

            {err ? <Text style={st.err}>{err}</Text> : null}

            <View style={st.btnRow}>
              <HDTouch style={st.btnGhost} focusStyle={st.btnFocusGhost} hoverBg={IS_WEB ? C.hover : false} onPress={testConn} disabled={!!busy}>
                {busy === 'test' ? <ActivityIndicator color={C.text} size="small" /> : <Text style={st.btnGhostText}>测试连接</Text>}
              </HDTouch>
              <HDTouch style={st.btnPrimary} focusStyle={st.btnFocusPrimary} hoverBg={false} onPress={tab === 'login' ? login : register} disabled={!!busy}>
                {busy === 'login' || busy === 'register'
                  ? <ActivityIndicator color={C.onBrand} size="small" />
                  : <Text style={st.btnPrimaryText}>{tab === 'login' ? '登 录' : '创建并登录'}</Text>}
              </HDTouch>
            </View>
          </View>
        </View>

        {/* 历史 */}
        {history.length ? (
          <View style={st.histWrap}>
            <Text style={st.histTitle}>最近连接</Text>
            {history.slice(0, 4).map(h => (
              <HDTouch key={h} style={st.histRow} focusStyle={st.btnFocusGhost} hoverBg={IS_WEB ? C.hover : false}
                onPress={() => { setAddr(h); setTested(false); }}>
                <Icon name="server" size={13} color={C.text3} />
                <Text style={st.histText} numberOfLines={1}>{h.replace(/^https?:\/\//, '')}</Text>
              </HDTouch>
            ))}
          </View>
        ) : null}

        {!IS_WEB ? (
          <HDTouch style={st.localBtn} onPress={goLocal} focusStyle={st.btnFocusGhost} hoverBg={IS_WEB ? C.hover : false}>
            <Text style={st.localText}>先本地使用(之后可再连接)</Text>
          </HDTouch>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, paddingBottom: 10, gap: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  // 双栏(HD 密度): 左 240 品牌面板 + 右 400 表单;窄屏(web<720 简化为仅表单由 hero 隐藏逻辑处理)
  cols: { flexDirection: 'row', gap: 40, alignItems: 'stretch', justifyContent: 'center', width: '100%', maxWidth: 760, flexWrap: 'wrap' },
  heroPane: { width: 240, paddingTop: 18, gap: 10 },
  heroMark: { width: 44, height: 48 },
  heroTitle: { color: C.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  heroSub: { color: C.text2, fontSize: 12, marginTop: 6 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featText: { color: C.text2, fontSize: 12, lineHeight: 20 },
  formPane: { width: 400, maxWidth: '100%', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, gap: 12 },
  tabsWrap: { flexDirection: 'row', backgroundColor: C.elev, borderRadius: 10, padding: 4, gap: 4 },
  tab: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.bg },
  tabFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 8 },
  tabText: { color: C.text3, fontSize: 12.5, fontWeight: '500' },
  tabTextOn: { color: C.text, fontWeight: '700' },
  inputCard: { backgroundColor: C.elev, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { color: C.text2, fontSize: 11.5, flex: 1 },
  okTag: { color: C.brand, fontSize: 11.5, fontWeight: '600' },
  inputValue: { color: C.text, fontSize: 14, paddingVertical: 4 },
  inputHint: { color: C.text3, fontSize: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoText: { color: C.brand, fontSize: 12 },
  err: { color: C.danger, fontSize: 12, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnGhost: { flex: 1, height: 42, borderRadius: 11, backgroundColor: C.elev, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { flex: 1.4, height: 42, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnFocusGhost: { borderWidth: 2, borderColor: C.brand, borderRadius: 11 },
  btnFocusPrimary: { borderWidth: 2, borderColor: C.text, borderRadius: 11 },
  btnGhostText: { color: C.text, fontSize: 13, fontWeight: '600' },
  btnPrimaryText: { color: C.onBrand, fontSize: 13, fontWeight: '700' },
  histWrap: { width: 400, maxWidth: '100%', marginTop: 14, gap: 6 },
  histTitle: { color: C.text3, fontSize: 11, marginBottom: 2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 38, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 13 },
  histText: { color: C.text2, fontSize: 12.5, flex: 1 },
  localBtn: { marginTop: 16, height: 40, borderRadius: 11, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  localText: { color: C.text2, fontSize: 12.5, fontWeight: '500' },
});

