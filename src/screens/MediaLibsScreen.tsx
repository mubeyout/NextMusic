// 第三方媒体库：Emby / Jellyfin / Subsonic(Navidrome·道理鱼) / WebDAV
// 添加账号 → 浏览专辑/WebDAV 目录 → 播放 / 导入为歌单 / 下载
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { ActionSheet } from '../components/ActionSheet';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload } from '../services/downloads';
import {
  providers, providerApi, PROVIDER_META,
  type ProviderAcct, type ProviderType,
} from '../services/providers';
import type { SongItem } from '../services/server';
import { dialog, toast } from '../components/Dialog';

// 有品牌 logo 的类型用 BrandIcon，其余回退语义图标
const BRAND_ICON_TYPES: Set<ProviderType> = new Set(['emby', 'jellyfin', 'navidrome', 'subsonic', 'webdav']);
const TYPE_ICON: Record<ProviderType, string> = { subsonic: 'music', navidrome: 'music', daoliyu: 'music', emby: 'tv', jellyfin: 'tv', webdav: 'cloud' };

export function MediaLibsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const [accts, setAccts] = useState<ProviderAcct[]>([]);
  const [editing, setEditing] = useState<ProviderAcct | null>(null);

  const refresh = useCallback(() => setAccts(providers.all()), []);
  useEffect(refresh, []);

  const addMenu = () => {
    setEditing({
      id: `pv-${Date.now()}`, type: 'subsonic', name: '',
      base: '', user: '', pass: '',
    });
  };

  return (
    <View style={st.screen}>
      <PageHeader
        title="媒体库"
        right={(
          <TouchableOpacity onPress={addMenu} hitSlop={6}>
            <Icon name="add" size={22} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <Text style={st.intro}>接入 Emby、Jellyfin、Navidrome、道理鱼（Subsonic 兼容）或 WebDAV，把私有音乐库变成歌单。</Text>
        {accts.length === 0 ? (
          <EmptyState icon="server" title="还没有添加媒体库" sub="点右上角 ＋ 接入 Emby / Jellyfin / Navidrome / WebDAV" />
        ) : (
          <View style={st.group}>
            {accts.map((a, i) => (
              <TouchableOpacity
                key={a.id}
                style={[st.row, i > 0 && st.rowDivide]}
                activeOpacity={0.7}
                onPress={() => nav.navigate('ProviderBrowse', { acctId: a.id })}
                onLongPress={() => dialog.alert('删除媒体库', `确定删除「${a.name || PROVIDER_META[a.type].label}」？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '删除', style: 'destructive', onPress: () => { providers.remove(a.id); refresh(); } },
                ])}
              >
                <View style={st.rowIconWrap}>{BRAND_ICON_TYPES.has(a.type) ? <BrandIcon name={a.type as any} size={20} /> : <Icon name={TYPE_ICON[a.type] as never} size={20} color={C.text} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowTitle} numberOfLines={1}>{a.name || PROVIDER_META[a.type].label}</Text>
                  <Text style={st.rowSub} numberOfLines={1}>{a.base}</Text>
                </View>
                <Icon name="chevronright" size={20} color={C.text3} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={st.tip}>长按可删除媒体库；飞牛 fnOS 可通过 WebDAV 共享接入</Text>
      </ScrollView>

      {editing ? <EditSheet acct={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </View>
  );
}

// ---------- 添加 / 编辑 ----------
function EditSheet({ acct, onClose, onSaved }: { acct: ProviderAcct; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [a, setA] = useState<ProviderAcct>(acct);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ProviderAcct>) => setA(prev => ({ ...prev, ...p }));
  const [typePick, setTypePick] = useState(false);

  const connect = async () => {
    if (!a.base.trim()) { toast('请填写服务器地址'); return; }
    setBusy(true);
    try {
      const connected = await providerApi.connect({ ...a, base: a.base.trim(), name: a.name.trim() || PROVIDER_META[a.type].label.split(' / ')[0] });
      providers.save(connected);
      onSaved();
    } catch (e) {
      dialog.alert('连接失败', (e as Error).message + '\n\n请检查地址、账号密码，以及服务器是否已在同一网络');
    } finally { setBusy(false); }
  };

  return (
    <>
    <ActionSheet
      visible onClose={onClose} title={providers.get(acct.id) ? '编辑媒体库' : '添加媒体库'}
      items={[]}
      extra={(
        <View style={{ gap: 6 }}>
          <TouchableOpacity style={es.typeBtn} onPress={() => setTypePick(true)}>
            <Text style={es.typeLabel}>类型</Text>
            <Text style={es.typeValue}>{PROVIDER_META[a.type].label}</Text>
          </TouchableOpacity>
          <Text style={es.hint}>{PROVIDER_META[a.type].hint}</Text>
          {(['name', 'base', 'user', 'pass'] as const).map(f => (
            <View key={f} style={es.inputRow}>
              <Text style={es.inputLabel}>
                {f === 'name' ? '备注名' : f === 'base' ? '服务器地址' : f === 'user' ? '账号' : '密码'}
              </Text>
              <TextInput
                style={es.input}
                value={a[f]}
                placeholder={f === 'base' ? PROVIDER_META[a.type].placeholder : ''}
                placeholderTextColor={C.text3}
                secureTextEntry={f === 'pass'}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={v => set({ [f]: v } as Partial<ProviderAcct>)}
              />
            </View>
          ))}
          <TouchableOpacity style={[es.connectBtn, busy && { opacity: 0.6 }]} onPress={connect} disabled={busy}>
            {busy ? <ActivityIndicator color={C.onBrand} size="small" /> : <Text style={es.connectText}>连接并保存</Text>}
          </TouchableOpacity>
        </View>
      )}
    />
    <ActionSheet
      visible={typePick} onClose={() => setTypePick(false)} title="服务器类型"
      items={(Object.keys(PROVIDER_META) as ProviderType[]).map(t => ({
        label: PROVIDER_META[t].label,
        sub: PROVIDER_META[t].hint,
        selected: a.type === t,
        onPress: () => set({ type: t }),
      }))}
    />
    </>
  );
}

// ---------- 浏览（专辑列表 / WebDAV 目录） ----------
export function ProviderBrowseScreen({ route }: { route: { params: { acctId: string } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const acct = providers.get(route.params.acctId);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; artist?: string; songCount?: number; cover?: string }[]>([]);
  // webdav 状态
  const [davDir, setDavDir] = useState('/');
  const [davDirs, setDavDirs] = useState<{ name: string; path: string }[]>([]);
  const [davSongs, setDavSongs] = useState<SongItem[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!acct) return;
    setLoading(true); setErr(null);
    try {
      if (acct.type === 'webdav') {
        const r = await providerApi.webdavList(acct, davDir);
        setDavDirs(r.dirs); setDavSongs(r.songs); setSel(new Set());
      } else {
        setAlbums(await providerApi.albums(acct));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [acct?.id, davDir]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (!acct) return <View style={st.screen}><Text style={st.empty}>账号不存在</Text></View>;

  const importAll = (name: string, songs: SongItem[]) => {
    if (!songs.length) { toast('没有可导入的歌曲'); return; }
    library.create(name, songs, { desc: `来自 ${acct.name}` });
    toast(`已导入「${name}」· ${songs.length} 首`);
  };

  const openAlbum = async (al: { id: string; name: string }) => {
    setLoading(true);
    try {
      const songs = await providerApi.albumSongs(acct, al.id);
      setLoading(false);
      if (!songs.length) { dialog.alert('空专辑', '该专辑没有可播放曲目'); return; }
      dialog.alert(al.name, `${songs.length} 首 · 播放还是导入歌单？`, [
        { text: '取消', style: 'cancel' },
        { text: '导入歌单', onPress: () => importAll(al.name, songs) },
        { text: '立即播放', onPress: () => playSong(songs[0], songs) },
        { text: '下载', onPress: () => { const n = enqueueDownload(songs); toast(`${n} 首加入下载队列`); } },
      ]);
    } catch (e) {
      setLoading(false);
      dialog.alert('加载失败', (e as Error).message);
    }
  };

  const toggleSel = (u: string) => {
    const n = new Set(sel);
    if (n.has(u)) n.delete(u); else n.add(u);
    setSel(n);
  };
  const selSongs = davSongs.filter(s => sel.has(s.songmid));

  return (
    <View style={st.screen}>
      <PageHeader title={acct.name} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>
        ) : err ? (
          <View style={st.center}>
            <Text style={st.empty}>{err}</Text>
            <TouchableOpacity style={st.retryBtn} onPress={load}>
              <Icon name="refresh" size={16} color={C.onBrand} />
              <Text style={st.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : acct.type === 'webdav' ? (
          <>
            <Text style={st.crumb}>WebDAV · {davDir}</Text>
            {davDir !== '/' ? (
              <TouchableOpacity style={st.dirRow} onPress={() => setDavDir(davDir.replace(/[^/]*\/$/, '') || '/')}>
                <Icon name="back" size={18} color={C.text2} />
                <Text style={st.dirText}>上一级</Text>
              </TouchableOpacity>
            ) : null}
            {davDirs.map(d => (
              <TouchableOpacity key={d.path} style={st.dirRow} onPress={() => setDavDir(d.path)}>
                <Icon name="folder" size={18} color={C.brand} />
                <Text style={st.dirText}>{d.name}</Text>
                <Icon name="chevronright" size={16} color={C.text3} />
              </TouchableOpacity>
            ))}
            {davSongs.map(s => {
              const on = sel.has(s.songmid);
              return (
                <TouchableOpacity key={s.songmid} style={[st.davSong, on && st.davSongOn]} onPress={() => toggleSel(s.songmid)} onLongPress={() => playSong(s, davSongs)}>
                  <View style={[st.checkBox, on && st.checkBoxOn]}>
                    {on ? <Icon name="check" size={14} color={C.onBrand} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.davTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={st.davSub} numberOfLines={1}>{s.singer}</Text>
                  </View>
                  <TouchableOpacity hitSlop={8} onPress={() => playSong(s, davSongs)}>
                    <Icon name="play" size={18} color={C.text2} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
            {!davDirs.length && !davSongs.length ? <Text style={st.empty}>此目录为空</Text> : null}
            {davSongs.length ? (
              <View style={st.davActions}>
                <TouchableOpacity style={st.davBtn} onPress={() => setSel(new Set(davSongs.map(s => s.songmid)))}>
                  <Text style={st.davBtnText}>全选</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.davBtn, st.davBtnMain]}
                  disabled={!selSongs.length}
                  onPress={() => {
                    const name = `WebDAV ${davDir === '/' ? '根目录' : davDir.split('/').filter(Boolean).pop() || ''}`;
                    importAll(name, selSongs);
                  }}
                >
                  <Text style={[st.davBtnText, { color: C.onBrand }]}>加入歌单{selSongs.length ? ` (${selSongs.length})` : ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.davBtn, st.davBtnMain]}
                  disabled={!selSongs.length}
                  onPress={() => { const n = enqueueDownload(selSongs); toast(`${n} 首加入下载队列`); }}
                >
                  <Text style={[st.davBtnText, { color: C.onBrand }]}>下载</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={st.tip}>点击选择 · 长按直接播放</Text>
          </>
        ) : (
          <>
            {albums.length === 0 ? <EmptyState icon="music" title="服务器上没有专辑" sub="先在媒体服务器里添加音乐库" /> : null}
            <View style={st.albumGrid}>
              {albums.map(al => (
                <TouchableOpacity key={al.id} style={st.albumCell} activeOpacity={0.85} onPress={() => openAlbum(al)}>
                  {al.cover ? (
                    <Image source={{ uri: al.cover }} style={st.albumCover} />
                  ) : (
                    <View style={[st.albumCover, st.albumFallback]}><Text style={st.albumGlyph}>♫</Text></View>
                  )}
                  <Text style={st.albumName} numberOfLines={1}>{al.name}</Text>
                  <Text style={st.albumMeta} numberOfLines={1}>{al.artist || ''}{al.songCount ? ` · ${al.songCount}首` : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  intro: { color: C.text2, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 },
  retryText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
  group: { borderRadius: 14, backgroundColor: '#1A1A1A', paddingHorizontal: 16 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0F' },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  tip: { color: C.text3, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  crumb: { color: C.text2, fontSize: 11, lineHeight: 15, marginBottom: 10 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0A' },
  dirText: { flex: 1, color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  davSong: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0A' },
  davSongOn: { backgroundColor: '#14251C', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#4A4A4A', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { borderColor: C.brand, backgroundColor: C.brand },
  davTitle: { color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  davSub: { color: C.text2, fontSize: 10, lineHeight: 14 },
  davActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  davBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  davBtnMain: { backgroundColor: C.brand },
  davBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  albumCell: { width: '31%', gap: 4 },
  albumCover: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#232323' },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumGlyph: { color: C.text2, fontSize: 24, fontWeight: '700' },
  albumName: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  albumMeta: { color: C.text2, fontSize: 9, lineHeight: 12 },
});

const es = StyleSheet.create({
  typeBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0F', paddingTop: 8, marginTop: 8 },
  typeLabel: { flex: 1, color: C.text, fontSize: 14 },
  typeValue: { color: C.brandSoft, fontSize: 13 },
  hint: { color: C.text3, fontSize: 11, lineHeight: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  inputLabel: { width: 76, color: C.text, fontSize: 13 },
  input: { flex: 1, color: C.text, fontSize: 13, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#232323' },
  connectBtn: { height: 44, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  connectText: { color: C.onBrand, fontSize: 14, fontWeight: '600' },
});

// navigation 注册用包装（native-stack 组件类型兼容）
export function ProviderBrowseRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { acctId: string } } }).route;
  return <ProviderBrowseScreen route={route} />;
}
