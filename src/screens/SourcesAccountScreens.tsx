import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { SubPage } from '../components/SubPage';
import { loadSources, addSourceByUrl, removeSource, toggleSource, activeSources, sourceHealthCheck, checkSourceUpdates, applySourceUpdate, syncFromCatalog, type CustomSource } from '../services/customSource';
import { dialog, toast } from '../components/Dialog';
import { settings } from '../services/settings';

// 自定义音源：LX 脚本本地沙箱运行，免登录即可播放
export function SourcesScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  // vc87：音源目录订阅
  const [catalogUrl, setCatalogUrl] = useState(() => settings.get().sourceCatalogUrl);
  const [catBusy, setCatBusy] = useState(false);
  // 音源健康检查：id -> testing | ok | fail（含错误详情）
  type Health = { st: 'testing'; msg?: string } | { st: 'ok' | 'fail'; msg: string };
  const [health, setHealth] = useState<Record<string, Health>>({});

  const refresh = () => setSources(loadSources());
  useEffect(refresh, []);
  // vc85/87：打开时静默检查音源更新（直连 + 目录页）→ 有新版弹窗一键覆盖
  useEffect(() => {
    let dead = false;
    (async () => {
      const lines: string[] = [];
      let catCount = 0;
      let directApply: () => void = () => {};
      try {
        const ups = await checkSourceUpdates();
        if (ups.length) {
          lines.push(...ups.map(u => `「${u.src.name}」v${u.src.version} → v${u.version}`));
          directApply = () => ups.forEach(applySourceUpdate);
        }
      } catch { /* ignore */ }
      const cat = settings.get().sourceCatalogUrl;
      if (cat) {
        try {
          const r = await syncFromCatalog(cat); // 已持久化+引擎重载（目录链路内部完成）
          catCount = r.updated;
          if (r.updated) lines.push(...r.names.map(n => `「${n.replace(' → ', '」')}」`.replace('」」', '」')));
        } catch { /* 目录不可达静默 */ }
      }
      if (dead || !lines.length) return;
      dialog.alert('音源有新版本', lines.join('\n'), [
        { text: '稍后', style: 'cancel' },
        {
          text: '一键全部更新',
          onPress: () => {
            directApply();
            if (catCount) toast(`已从目录更新 ${catCount} 个音源`);
            refresh();
          },
        },
      ]);
    })();
    return () => { dead = true; };
  }, []);

  const add = async () => {
    if (!url.trim()) { setAdding(false); return; }
    setBusy(true);
    try {
      const s = await addSourceByUrl(url.trim());
      toast(`已添加 ${s.name} v${s.version}`);
      setUrl(''); setAdding(false); refresh();
    } catch (e) {
      dialog.alert('添加失败', (e as Error).message);
    } finally { setBusy(false); }
  };

  const del = (s: CustomSource) => {
    dialog.alert('删除音源', `确定删除「${s.name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { removeSource(s.id).then(refresh); } },
    ]);
  };

  const toggle = (s: CustomSource) => {
    toggleSource(s.id, !s.enabled).then(refresh);
  };

  const canPlay = activeSources().length > 0;

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>音源管理</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={st.section}>
          <Text style={st.secTitle}>自定义音源（LX 脚本）</Text>
          <Text style={st.hint}>
            音源脚本在本机沙箱运行，添加后无需登录即可播放。支持 LX Music 音源协议。
          </Text>
          {sources.length === 0 ? (
            <Text style={st.empty}>暂无自定义音源。播放音乐需要添加音源或登录服务器。</Text>
          ) : sources.map((s, i) => (
            <View key={s.id} style={[st.row, i > 0 && st.rowDivide]}>
              <View style={{ flex: 1 }}>
                <Text style={st.rowLabel}>{s.name} <Text style={st.ver}>v{s.version}</Text></Text>
                <Text style={st.rowMeta} numberOfLines={1}>{Object.keys(s.sources).join(' · ')}</Text>
                <Text style={st.rowUrl} numberOfLines={1}>{s.url}</Text>
                {health[s.id] ? (
                  <Text style={[st.healthText, health[s.id].st === 'ok' && st.healthOk, health[s.id].st === 'fail' && st.healthFail]} numberOfLines={2}>
                    {health[s.id].st === 'testing' ? '⏳ 测试中…' : health[s.id].st === 'ok' ? `✓ ${health[s.id].msg}` : `✗ ${health[s.id].msg}`}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                hitSlop={6}
                disabled={health[s.id]?.st === 'testing'}
                onPress={async () => {
                  setHealth(h => ({ ...h, [s.id]: { st: 'testing' } }));
                  const r = await sourceHealthCheck(s.id);
                  setHealth(h => ({ ...h, [s.id]: { st: r.ok ? 'ok' : 'fail', msg: r.detail } }));
                  toast(r.ok ? `✓ ${s.name} 可用` : `✗ ${s.name}：${r.detail}`);
                }}
              >
                <Text style={st.testBtn}>{health[s.id]?.st === 'testing' ? '…' : '测试'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggle(s)} hitSlop={6}>
                <View style={[st.switch, s.enabled && st.switchOn]}>
                  <View style={[st.knob, s.enabled && st.knobOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => del(s)} hitSlop={6} style={st.del}>
                <Icon name="close" size={16} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={st.addAction} onPress={() => setAdding(true)}>
            <Icon name="add" size={18} />
            <Text style={st.addActionText}>添加音源（URL）</Text>
          </TouchableOpacity>
        </View>

        <View style={st.section}>
          <Text style={st.secTitle}>播放权限</Text>
          <View style={st.row}>
            <Text style={st.rowLabel}>自定义音源</Text>
            <Text style={[st.badge, canPlay && st.badgeOn]}>{canPlay ? '已启用 · 可播放' : '未添加'}</Text>
          </View>
        </View>

        {/* vc87：音源目录订阅（打开页面时对照目录一键更新覆盖） */}
        <View style={st.card}>
          <Text style={st.secTitle}>音源目录（自动更新源）</Text>
          <TextInput
            style={st.input}
            placeholder="目录页 URL（如 https://lx.guoyue2010.top/…/优质音源/）"
            placeholderTextColor={C.text2}
            value={catalogUrl}
            onChangeText={setCatalogUrl}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={st.ghostBtn} onPress={() => { settings.set('sourceCatalogUrl', catalogUrl.trim()); toast(catalogUrl.trim() ? '已保存，打开本页时自动检查更新' : '已清除'); }}>
              <Text style={st.ghostBtnText}>保存</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.ghostBtn, { flex: 1 }]} disabled={!catalogUrl.trim() || catBusy} onPress={async () => {
              settings.set('sourceCatalogUrl', catalogUrl.trim());
              setCatBusy(true);
              try {
                const r = await syncFromCatalog(catalogUrl.trim());
                refresh();
                dialog.alert('目录同步完成', r.updated ? `已更新覆盖 ${r.updated} 个音源：\n${r.names.join('\n')}` : '已安装的音源都是最新版本');
              } catch (e) {
                dialog.alert('目录同步失败', (e as Error).message);
              } finally { setCatBusy(false); }
            }}>
              <Text style={st.ghostBtnText}>{catBusy ? '同步中…' : '立即从目录同步更新'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
          <View style={st.modalMask}>
            <View style={st.modalCard}>
              <Text style={st.modalTitle}>添加自定义音源</Text>
              <TextInput
                style={st.input}
                placeholder="音源脚本 URL（https://…/lx?key=…）"
                placeholderTextColor={C.text2}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={st.modalHint}>将下载脚本并在本机沙箱中运行。请只添加可信来源的音源。</Text>
              <View style={st.modalBtns}>
                <TouchableOpacity style={st.modalBtnGhost} onPress={() => setAdding(false)} disabled={busy}>
                  <Text style={st.modalGhostText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.modalBtnMain} onPress={add} disabled={busy}>
                  <Text style={st.modalMainText}>{busy ? '添加中…' : '添加'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

// Figma 42·服务器与账号 + 退出登录确认
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
  ghostBtn: { paddingHorizontal: 14, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  section: { borderRadius: 14, backgroundColor: C.surface, padding: 16, marginBottom: 14 },
  secTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500', marginBottom: 8 },
  hint: { color: C.text2, fontSize: 11, lineHeight: 15, marginBottom: 6 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 17, paddingVertical: 10 },
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
  badge: { color: C.text2, fontSize: 11, backgroundColor: C.inset, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeOn: { color: C.brandText, backgroundColor: C.badgeOn },
  del: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  addAction: {
    height: 42, borderRadius: 12, borderWidth: 1, borderColor: C.strokeStrong,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10,
  },
  addActionText: { color: C.text, fontSize: 13, fontWeight: '500' },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.inset2, padding: 2 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#8E8E8E' },
  knobOn: { backgroundColor: C.knobOn, alignSelf: 'flex-end' },
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
