// HD 我的:账号卡 + 歌单网格 + 媒体库/下载/本地/设置入口(子页复用 phone Stack)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { sync, lxToApp, type UserListsSnapshot } from '../services/sync';
import { providers } from '../services/providers';
import { hdNav } from './hdnav';
import type { SongItem } from '../services/server';

const GRADS: [string, string][] = [
  ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'], ['#5c297a', '#1f3861'],
  ['#146b85', '#1f2e47'], ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'],
];

export function HDMy() {
  const insets = useSafeAreaInsets();
  const { username, connected, token } = useApp();
  const [localPls, setLocalPls] = useState<LocalPlaylist[]>([]);
  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const providerCount = providers.all().length;

  const refresh = () => {
    setLocalPls(library.all());
    setSyncing(true);
    if (connected && token) {
      sync.fetchLists().then(setSnap).catch(() => {}).finally(() => setSyncing(false));
    } else setSyncing(false);
  };
  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncPls = snap?.userList || [];
  const playlists = [
    ...localPls.map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img, songs: p.songs as SongItem[] })),
    ...syncPls.map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, localId: undefined as string | undefined, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];

  const openPl = (pl: typeof playlists[number]) => {
    hdNav()?.navigate('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单` });
  };

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(insets.top, 22), paddingBottom: 30, gap: 22 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={C.brand} />}
    >
      {/* 账号卡 */}
      <View style={{ paddingHorizontal: 34 }}>
        <LinearGradient colors={['#145938', '#1F2E52']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.acct}>
          <View style={st.acctAvatar}><Icon name="my" size={28} color={C.text} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.acctName} numberOfLines={1}>{connected ? username : '未连接服务器'}</Text>
            <Text style={st.acctSub}>{connected ? `${playlists.length} 个歌单 · ${providerCount} 个媒体库 · 已同步` : '连接后同步歌单/收藏/音效'}</Text>
          </View>
          <TouchableOpacity style={st.acctBtn} activeOpacity={0.85} onPress={() => hdNav()?.navigate(connected ? 'Account' : 'Server')}>
            <Text style={st.acctBtnText}>{connected ? '账号' : '连接'}</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* 功能入口 */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 34, gap: 16 }}>
        {[
          { icon: 'server' as const, label: '媒体库', sub: `${providerCount} 个连接`, to: 'MediaLibs' },
          { icon: 'download' as const, label: '下载管理', sub: '离线歌曲', to: 'Downloads' },
          { icon: 'headphones' as const, label: '本地音乐', sub: '设备扫描', to: 'DeviceMusic' },
          { icon: 'settings' as const, label: '设置', sub: '音源/音效/主题', to: 'Settings' },
        ].map(q => (
          <TouchableOpacity key={q.label} activeOpacity={0.85} style={st.fnCard} onPress={() => hdNav()?.navigate(q.to)}>
            <Icon name={q.icon} size={26} color={C.brand} />
            <Text style={st.fnLabel}>{q.label}</Text>
            <Text style={st.fnSub}>{q.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 歌单网格 */}
      <View style={{ paddingHorizontal: 34, gap: 14 }}>
        <Text style={st.secTitle}>{`歌单 · ${playlists.length}`}</Text>
        <View style={st.grid}>
          {playlists.map((pl, i) => (
            <TouchableOpacity key={pl.key} activeOpacity={0.85} style={st.plCard} onPress={() => openPl(pl)}>
              {pl.img ? <Image source={{ uri: pl.img }} style={st.plArt} />
                : <LinearGradient colors={GRADS[i % GRADS.length]} style={st.plArt}><Icon name="music" size={26} color="#FFFFFFAA" /></LinearGradient>}
              <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
              <Text style={st.plMeta}>{pl.count} 首</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity activeOpacity={0.85} style={st.plNew} onPress={() => hdNav()?.navigate('ImportPlaylist')}>
            <Icon name="add" size={30} color={C.text2} />
            <Text style={st.plMeta}>新建歌单</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  acct: { height: 110, borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  acctAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#00000044', alignItems: 'center', justifyContent: 'center' },
  acctName: { color: C.text, fontSize: 21, fontWeight: '800' },
  acctSub: { color: '#FFFFFF99', fontSize: 13, marginTop: 3 },
  acctBtn: { height: 46, borderRadius: 23, backgroundColor: '#00000042', paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
  acctBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  fnCard: { flex: 1, height: 104, borderRadius: 14, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fnLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  fnSub: { color: C.text3, fontSize: 11 },
  secTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  plCard: { width: 150, gap: 8 },
  plArt: { width: 150, height: 150, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plNew: { width: 150, height: 150, borderRadius: 14, backgroundColor: '#1A1A1A', borderWidth: 1, borderStyle: 'dashed', borderColor: '#333', alignItems: 'center', justifyContent: 'center', gap: 8 },
  plName: { color: C.text, fontSize: 15, fontWeight: '600' },
  plMeta: { color: C.text2, fontSize: 12 },
});
