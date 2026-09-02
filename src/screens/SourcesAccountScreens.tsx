import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { SubPage } from '../components/SubPage';
import { PageHeader } from '../components/PageChrome';
import { loadSources, addSourceByUrl, addSourceFromFile, removeSource, toggleSource, activeSources, sourceHealthCheck, checkSourceUpdates, applySourceUpdate, applyUpdateFromAlert, type CustomSource } from '../services/customSource';
import { onSourceUpdateAlert } from '../lx-engine/engine';
import { dialog, toast } from '../components/Dialog';
import SafX from 'react-native-saf-x';

// 自定义音源:音源脚本本地沙箱运行,免登录即可播放
// vc90 重设计:对齐项目设计语言(SubPage + Section 行式卡片 + ghost 按钮组),去掉目录订阅区(更新以预埋协议为准)
export function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [busy, setBusy] = useState(false);
  // 音源健康检查:id -> testing | ok | fail(含错误详情)
  type Health = { st: 'testing'; msg?: string } | { st: 'ok' | 'fail'; msg: string };
  const [health, setHealth] = useState<Record<string, Health>>({});

  const refresh = () => setSources(loadSources());
  useEffect(refresh, []);

  // vc85/88:音源更新——①LX 预埋协议(脚本自带 version 端点自检,init 时 send updateAlert,引擎转发)
  // ②直连 @version 比对(MusicFree 类)
  useEffect(() => {
    let dead = false;
    const off = onSourceUpdateAlert((srcId, info) => {
      if (dead) return;
      const s = loadSources().find(x => x.id === srcId);
      const name = s?.name ?? '音源';
      if (!info.updateUrl) { toast(`${name}:${info.log || '发现新版本'}`); return; }
      dialog.alert(
        '音源有新版本',
        `「${name}」\n${info.log || '发现新版本'}\n\n一键更新覆盖?`,
        [
          { text: '稍后', style: 'cancel' },
          {
            text: '一键更新',
            onPress: () => {
              applyUpdateFromAlert(srcId, info.updateUrl!)
                .then(v => { toast(`已更新到 v${v}`); refresh(); })
                .catch(e => dialog.alert('更新失败', (e as Error).message));
            },
          },
        ],
      );
    });
    (async () => {
      try {
        const ups = await checkSourceUpdates();
        if (dead || !ups.length) return;
        dialog.alert('音源有新版本', ups.map(u => `「${u.src.name}」v${u.src.version} → v${u.version}`).join('\n'), [
          { text: '稍后', style: 'cancel' },
          { text: '一键全部更新', onPress: () => { ups.forEach(applySourceUpdate); refresh(); toast(`已更新 ${ups.length} 个音源`); } },
        ]);
      } catch { /* ignore */ }
    })();
    return () => { dead = true; off(); };
  }, []);

  const addByUrl = () => {
    dialog.prompt('添加音源', {
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

  // vc88:手动导入音源文件(SAF 选 .js)
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
      <PageHeader title="音源管理" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
      <Section title="自定义音源">
        <Text style={st.hint}>音源脚本在本机沙箱运行,添加后无需登录即可播放。支持 LX Music 音源协议与 MusicFree 插件;更新由音源内置检查自动提醒。</Text>
        {sources.length ? sources.map(s => {
          const h = hOf(s);
          return (
            <View key={s.id} style={st.srcRow}>
              <TouchableOpacity style={st.srcIcon} onPress={() => testSource(s)} activeOpacity={0.7}>
                <Icon name="wave" size={18} color={s.enabled ? C.brand : C.text3} />
              </TouchableOpacity>
              <TouchableOpacity style={st.srcMeta} activeOpacity={0.7} onPress={() => testSource(s)}>
                <Text style={st.srcName} numberOfLines={1}>
                  {s.name} <Text style={st.srcVer}>v{s.version}</Text>
                  {s.kind === 'musicfree' ? <Text style={st.srcTag}> MF</Text> : null}
                </Text>
                <Text style={st.srcSub} numberOfLines={1}>
                  {h?.st === 'testing' ? '检测中…'
                    : h?.st === 'ok' ? `可用 · ${h.msg ?? ''}`
                    : h?.st === 'fail' ? `检测失败 · ${h.msg}`
                    : `${Object.keys(s.sources).join(' / ') || ''} · 点击图标检测`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={8} onPress={() => del(s)} style={st.srcDel}>
                <Icon name="trash" size={16} color={C.text3} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={6} onPress={() => { toggleSource(s.id, !s.enabled); refresh(); }} style={st.switchWrap}>
                <View style={[st.switch, s.enabled && st.switchOn]}>
                  <View style={[st.knob, s.enabled && st.knobOn]} />
                </View>
              </TouchableOpacity>
            </View>
          );
        }) : (
          <Text style={st.empty}>暂无自定义音源。播放音乐需要添加音源或登录服务器。</Text>
        )}
        <View style={st.btnRow}>
          <TouchableOpacity style={st.ghostBtn} onPress={addByUrl} disabled={busy}>
            <Icon name="add" size={15} color={C.brand} />
            <Text style={st.ghostText}>添加音源(URL)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.ghostBtn} onPress={importFile} disabled={busy}>
            <Icon name="download" size={15} color={C.brand} />
            <Text style={st.ghostText}>导入音源文件</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="播放权限">
        <View style={st.permRow}>
          <Text style={st.permLabel}>自定义音源</Text>
          <Text style={[st.badge, canPlay && st.badgeOn]}>{canPlay ? '已启用 · 可播放' : '未添加'}</Text>
        </View>
        <Text style={st.hint}>登录服务器或启用任意自定义音源后即可播放;浏览和搜索始终免费。</Text>
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
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void; reset: (o: unknown) => void };
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
                      nav.reset({ index: 0, routes: [{ name: 'Main' }] });
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
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
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
