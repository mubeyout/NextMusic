import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { useApp } from '../state/AppState';
import { SubPage } from '../components/SubPage';
import { PageHeader } from '../components/PageChrome';
import { api, store } from '../services/server';
import { loadSources, addSourceByUrl, addSourceFromFile, removeSource, toggleSource, activeSources, sourceHealthCheck, checkSourceUpdates, applySourceUpdate, applyUpdateFromAlert, type CustomSource } from '../services/customSource';
import { onSourceUpdateAlert } from '../lx-engine/engine';
import { dialog, toast } from '../components/Dialog';
import { hdActions } from '../hd/HDActions';
import SafX from 'react-native-saf-x';

// 自定义音源:音源脚本本地沙箱运行,免登录即可播放
// vc90 重设计:对齐项目设计语言(SubPage + Section 行式卡片 + ghost 按钮组),去掉目录订阅区(更新以预埋协议为准)
// 触点抽象:HD(车机/TV)用 HDTouch(D-pad 焦点环自动贴附圆角),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
  const { style, onPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} disabled={disabled} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} {...(rest as object)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} disabled={disabled} activeOpacity={0.7} {...(rest as object)}>
      {children}
    </TouchableOpacity>
  );
}

export function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; popToTop: () => void; reset: (o: unknown) => void; navigate: (s: string) => void; };
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [busy, setBusy] = useState(false);
  // 音源健康检查:id -> testing | ok | fail(含错误详情)
  type Health = { st: 'testing'; msg?: string } | { st: 'ok' | 'fail'; msg: string };
  const [health, setHealth] = useState<Record<string, Health>>({});

  const refresh = () => { setSources(loadSources()); loadServerSources(); };
  useEffect(refresh, []);
  // ===== 服务器端音源(原版三态鉴权 + 共享/私有, /api/custom-source/*) =====
  const [serverSources, setServerSources] = useState<{ id: string; name: string; version: string; enabled: boolean; channels: string[] }[]>([]);
  // 用户本地音源开关(默认全开;localStorage 记忆,不影响服务器全局状态)
  const [csLocal, setCsLocal] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('nm-cs-local') || '{}'); } catch { return {}; }
  });
  const csLocalOn = (id: string) => csLocal[id] !== false; // 默认开
  const toggleCsLocal = (id: string) => {
    setCsLocal(prev => {
      const next = { ...prev, [id]: !(prev[id] !== false) };
      try { localStorage.setItem('nm-cs-local', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const loadServerSources = () => { api.csList().then(l => setServerSources(l.filter(x => x.enabled !== false))).catch(() => setServerSources([])); };
  // 服务器音源: 播放器/客户端端只读+启停;管理(上传/删除)走后台 /admin/
  // vc88:手动导入音源文件(SAF 选 .js)
  // 本地引擎音源 URL 添加(15:54 整理时误删函数体,调用点残留致 ReferenceError——找回)
  const addByUrl = () => {
    (IS_HD ? hdActions : dialog).prompt('添加音源', {
      placeholder: '音源脚本 URL(https://…/xxx.js)',
      onSubmit: async v => {
        const u = v.trim();
        if (!u) return;
        try {
          const s = await addSourceByUrl(u);
          toast(`已添加 ${s.name} v${s.version}`);
          refresh();
        } catch (e) {
          dialog.alert('添加失败', (e as Error).message);
        }
      },
    });
  };

  const importFile = async () => {
    try {
      const docs = await SafX.openDocument({ multiple: false });
      if (!docs?.length) return;
      const text = await SafX.readFile(docs[0].uri);
      setBusy(true);
      const s = await addSourceFromFile(text);
      toast(`已导入 ${s.name} v${s.version}`);
      refresh();
    } catch (e) {
      dialog.alert('导入失败', (e as Error).message);
    } finally { setBusy(false); }
  };

  const testSource = async (s: CustomSource) => {
    setHealth(h => ({ ...h, [s.id]: { st: 'testing' } }));
    const r = await sourceHealthCheck(s.id);
    setHealth(h => ({ ...h, [s.id]: { st: r.ok ? 'ok' : 'fail', msg: r.detail } }));
  };

  const del = (s: CustomSource) => {
    dialog.alert('删除音源', `确定删除「${s.name}」?`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { removeSource(s.id).then(refresh); } },
    ]);
  };

  const { connected } = useApp();
  const canPlay = activeSources().length > 0 || connected;
  const hOf = (s: CustomSource): Health | undefined => health[s.id];

  return (
    <View style={[st.screen, { paddingTop: Math.max(Math.min(insets.top, 16), 12) }]}>
      {IS_HD ? (
        /* HD:自绘头部(HDTouch 返回,遥控可达) + 限宽居中 */
        <View style={hd.head}>
          <HDTouch style={hd.backBtn} onPress={() => nav.goBack()} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={hd.title}>音源管理</Text>
          <View style={{ width: 34 }} />
        </View>
      ) : (
        <PageHeader title="音源管理" onBack={() => nav.goBack()} />
      )}
      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }, IS_HD && { maxWidth: 860, alignSelf: 'flex-start', width: '100%' }]}
        showsVerticalScrollIndicator={false}
      >
      {/* 服务器音源区: 有可用音源才渲染(空/未配置/全部禁用/未连接 → 整块不显示,省得占位) */}
      {serverSources.length ? (
      <Section title="服务器音源">
        <Text style={[st.hint, IS_HD && hd.hint]}>服务器端启用的共享音源 · 点击图标选择本机是否使用 · 管理(添加/删除)在服务器后台</Text>
        {serverSources.map(cs => {
          const on = csLocalOn(cs.id);
          return (
          <View key={cs.id} style={[st.srcRow, IS_HD && hd.srcRow]}>
            <T style={[st.srcIcon, IS_HD && hd.srcIcon]} onPress={() => toggleCsLocal(cs.id)}>
              <Icon name="wave" size={IS_HD ? 22 : 18} color={on ? C.brand : C.text3} />
            </T>
            <View style={st.srcMeta}>
              <Text style={[st.srcName, IS_HD && hd.srcName]} numberOfLines={1}>{cs.name} <Text style={st.srcVer}>v{cs.version}</Text></Text>
              <Text style={[st.srcSub, IS_HD && hd.srcSub]} numberOfLines={1}>{(cs.channels || []).join(' / ') || '服务器音源'} · {on ? '使用中' : '已停用(本机)'}</Text>
            </View>
          </View>
          );
        })}
      </Section>
      ) : null}

      <Section title="自定义音源">
        <Text style={[st.hint, IS_HD && hd.hint]}>音源脚本在本机沙箱运行,添加后无需登录即可播放。支持 LX Music 音源协议与 MusicFree 插件;更新由音源内置检查自动提醒。</Text>
        {sources.length ? sources.map(s => {
          const h = hOf(s);
          return (
            <View key={s.id} style={[st.srcRow, IS_HD && hd.srcRow]}>
              <T style={[st.srcIcon, IS_HD && hd.srcIcon]} onPress={() => testSource(s)}>
                <Icon name="wave" size={IS_HD ? 22 : 18} color={s.enabled ? C.brand : C.text3} />
              </T>
              <T style={st.srcMeta} onPress={() => testSource(s)}>
                <Text style={[st.srcName, IS_HD && hd.srcName]} numberOfLines={1}>
                  {s.name} <Text style={st.srcVer}>v{s.version}</Text>
                  {s.kind === 'musicfree' ? <Text style={st.srcTag}> MF</Text> : null}
                </Text>
                <Text style={[st.srcSub, IS_HD && hd.srcSub]} numberOfLines={1}>
                  {h?.st === 'testing' ? '检测中…'
                    : h?.st === 'ok' ? `可用 · ${h.msg ?? ''}`
                    : h?.st === 'fail' ? `检测失败 · ${h.msg}`
                    : `${Object.keys(s.sources).join(' / ') || ''} · 点击图标检测`}
                </Text>
              </T>
              <T style={st.srcDel} onPress={() => del(s)}>
                <Icon name="trash" size={IS_HD ? 20 : 16} color={C.text3} />
              </T>
              <T style={st.switchWrap} onPress={() => { toggleSource(s.id, !s.enabled); refresh(); }}>
                <View style={[st.switch, IS_HD && hd.switch, s.enabled && st.switchOn]}>
                  <View style={[st.knob, IS_HD && hd.knob, s.enabled && st.knobOn]} />
                </View>
              </T>
            </View>
          );
        }) : (
          <Text style={[st.empty, IS_HD && hd.srcSub]}>暂无自定义音源。播放音乐需要添加音源或登录服务器。</Text>
        )}
        <View style={st.btnRow}>
          <T style={[st.ghostBtn, IS_HD && hd.ghostBtn]} onPress={addByUrl} disabled={busy}>
            <Icon name="add" size={IS_HD ? 18 : 15} color={C.brand} />
            <Text style={[st.ghostText, IS_HD && hd.ghostText]}>添加音源(URL)</Text>
          </T>
          <T style={[st.ghostBtn, IS_HD && hd.ghostBtn]} onPress={importFile} disabled={busy}>
            <Icon name="download" size={IS_HD ? 18 : 15} color={C.brand} />
            <Text style={[st.ghostText, IS_HD && hd.ghostText]}>导入音源文件</Text>
          </T>
        </View>
      </Section>

      <Section title="播放权限">
        <View style={st.permRow}>
          <Text style={[st.permLabel, IS_HD && hd.srcName]}>自定义音源</Text>
          <Text style={[st.badge, canPlay && st.badgeOn]}>{canPlay ? '已启用 · 可播放' : '未添加'}</Text>
        </View>
        <Text style={[st.hint, IS_HD && hd.hint]}>登录服务器或启用任意自定义音源后即可播放;浏览和搜索始终免费。</Text>
      </Section>
      </ScrollView>
    </View>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.secTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ---------- 账号页(原实现) ----------
export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void; reset: (o: unknown) => void; popToTop: () => void; };
  const { connected, base, username, token, setAuth, disconnectServer } = useApp();
  const host = (base || '').replace(/^https?:\/\//, '');

  const logout = () => {
    setAuth(null, null);
    nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>使用方式与账号</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={st.section}>
          <Text style={st.secTitle}>当前方式</Text>
          <View style={st.row}>
            <Icon name="server" size={20} />
            <Text style={st.rowLabel}>{connected ? '服务器模式' : '本地模式（浏览直连平台）'}</Text>
            <Text style={st.rowMeta}>{connected ? host : '无需服务器'}</Text>
          </View>
          <View style={[st.row, st.rowDivide]}>
            <Icon name="user" size={20} />
            <Text style={st.rowLabel}>{token && username ? `已登录：${username}` : '访客（未登录）'}</Text>
            <Text style={st.rowMeta}>{token && username ? '同步开启' : '数据在本机'}</Text>
          </View>
        </View>

        <TouchableOpacity style={st.linkBtn} onPress={() => nav.reset({ index: 0, routes: [{ name: 'Auth' }] })}>
          <Text style={st.linkText}>{token && username ? '切换账号' : '登录服务器账号'}</Text>
        </TouchableOpacity>

        {/* 更换服务器地址：无需断开重走 Boot 流程，直达连接页（也修复 Server 页入口单一） */}
        <TouchableOpacity style={st.linkBtn} onPress={() => nav.navigate('Server')}>
          <Text style={st.linkText}>更换服务器地址</Text>
        </TouchableOpacity>

        {username ? (
          <TouchableOpacity style={[st.linkBtn, st.danger]} onPress={logout}>
            <Text style={st.dangerText}>退出登录（同步后清除本机凭据）</Text>
          </TouchableOpacity>
        ) : null}

        {(connected || base) ? (
          <TouchableOpacity
            style={[st.linkBtn, st.danger]}
            onPress={() => {
              dialog.alert(
                '断开服务器',
                '断开后进入本地模式：浏览与播放走在线音源，服务器歌单/账号同步不可用，需重新连接后恢复。',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '断开', style: 'destructive',
                    onPress: () => {
                      disconnectServer();
                      toast('已断开服务器，回到本地模式');
                      nav.popToTop(); // lx163i:reset 重建栈会白闪一帧,popToTop 弹回根不重建
                    },
                  },
                ],
              );
            }}
          >
            <Text style={st.dangerText}>断开服务器，回到本地模式</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  section: { borderRadius: 14, backgroundColor: C.surface, padding: 16, marginBottom: 14 },
  secTitle: { color: C.text3, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  hint: { color: C.text3, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  empty: { color: C.text3, fontSize: 13, paddingVertical: 10 },
  // 源行(对齐设置页行式语言)
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  srcIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  srcMeta: { flex: 1, minWidth: 0, gap: 2 },
  srcName: { color: C.text, fontSize: 14, fontWeight: '600' },
  srcVer: { color: C.text3, fontSize: 11, fontWeight: '400' },
  srcTag: { color: C.brandText, fontSize: 10, fontWeight: '700' },
  srcSub: { color: C.text3, fontSize: 11 },
  srcDel: { padding: 6 },
  switchWrap: { padding: 2 },
  switch: { width: 40, height: 24, borderRadius: 12, backgroundColor: C.inset2, padding: 2 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.knob },
  knobOn: { backgroundColor: C.knobOn },
  // 按钮组(ghost 双钮并排)
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghostBtn: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ghostText: { color: C.text, fontSize: 13, fontWeight: '500' },
  // 播放权限
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  permLabel: { color: C.text, fontSize: 14 },
  badge: { color: C.text3, fontSize: 11, borderWidth: 1, borderColor: C.strokeStrong, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeOn: { color: C.brandText, borderColor: C.brandDim, backgroundColor: C.selTint },
  ghostBtnText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' }, // lx166 居左
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint, marginTop: 8, paddingTop: 8 },
  rowLabel: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rowMeta: { color: C.text2, fontSize: 11, lineHeight: 15 },
  rowUrl: { color: C.text2, fontSize: 10, lineHeight: 13, marginTop: 2 },
  testBtn: { color: C.brandText, fontSize: 12, fontWeight: '500', paddingHorizontal: 4 },
  healthText: { fontSize: 10, lineHeight: 14, marginTop: 3, color: C.text2 },
  healthOk: { color: C.brandText },
  healthFail: { color: '#FF6B6B' },
  ver: { color: C.text2, fontSize: 11, fontWeight: '400' },
  del: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  addAction: {
    height: 42, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10,
  },
  addActionText: { color: C.text, fontSize: 13, fontWeight: '500' },
  linkBtn: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: C.text, fontSize: 14, fontWeight: '500' },
  danger: { borderColor: '#FF6B6B33' },
  dangerText: { color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  modalMask: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { width: '100%', borderRadius: 16, backgroundColor: C.surface, padding: 18, gap: 12 },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  input: { height: 44, borderRadius: 10, backgroundColor: C.inset, paddingHorizontal: 12, color: C.text, fontSize: 13 },
  modalHint: { color: C.text2, fontSize: 11, lineHeight: 15 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 2 },
  modalBtnGhost: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  modalBtnMain: { flex: 1, height: 42, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  modalGhostText: { color: C.text, fontSize: 13, fontWeight: '500' },
  modalMainText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
});

// HD(车机/TV)覆盖样式:限宽居中 + 大字号/大触点(老板:音源管理需遥控光标+大屏排版)
const hd = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontSize: 20, fontWeight: '800' }, // lx166 居左
  hint: { fontSize: 13, lineHeight: 19 },
  srcRow: { paddingVertical: 14, gap: 14 },
  srcIcon: { width: 46, height: 46, borderRadius: 13 },
  srcName: { fontSize: 16 },
  srcSub: { fontSize: 13 },
  switch: { width: 48, height: 28 },
  knob: { width: 24, height: 24 },
  ghostBtn: { height: 54, borderRadius: 14 },
  ghostText: { fontSize: 15 },
});
