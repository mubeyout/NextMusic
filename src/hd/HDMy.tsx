// HD 我的:账号卡 + 歌单网格 + 媒体库/下载/本地/设置入口(子页复用 phone Stack)
import React, { useEffect, useState } from 'react';
import { toast } from '../components/Dialog';
import { hdActions } from './HDActions';
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDGrid } from './HDGrid';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { sync, lxToApp, type UserListsSnapshot , subscribeSync } from '../services/sync';
import { providers } from '../services/providers';
import { hdNav } from './hdnav';
import type { SongItem } from '../services/server';

const K = H.font.sm / 10; // 界面缩放系数(设置 uiScale 联动网格列宽)
const GRADS: [string, string][] = [
  ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'], ['#5c297a', '#1f3861'],
  ['#146b85', '#1f2e47'], ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'],
];

export function HDMy() {
  const insets = useSafeAreaInsets();
  const { username, connected, token } = useApp();
  const [localPls, setLocalPls] = useState<LocalPlaylist[]>([]);
  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => subscribeSync(() => setSyncTick(t => t + 1)), []);
  const [syncing, setSyncing] = useState(false);
  const providerCount = providers.all().length;

  const refresh = () => {
    setLocalPls(library.all());
    setSyncing(true);
    if (connected && token) {
      sync.fetchLists().then(setSnap).catch(() => {}).finally(() => setSyncing(false));
    } else setSyncing(false);
  };
  useEffect(refresh, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncPls = snap?.userList || [];
  const localClean = localPls.filter(p => p.name !== '我喜欢的');
  const localNames = new Set(localClean.map(p => p.name)); // lx123:本地同名优先(平台导入 copy-on-write 副本不被服务器版顶掉)
  const playlists = [
    ...localClean.map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img, songs: p.songs as SongItem[] })),
    ...syncPls.filter(u => !localNames.has(u.name)).map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, localId: undefined as string | undefined, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];

  // lx101:歌单长按管理——本机 library / 同步服务器 userList
  const managePl = (pl: typeof playlists[number]) => {
    hdActions.menu(`管理「${pl.name}」`, [
      { label: '重命名歌单', icon: 'edit', onPress: () => {
        hdActions.prompt('重命名歌单', {
          defaultValue: pl.name,
          onSubmit: async (v) => {
            if (!v || v === pl.name) return;
            if (pl.localId) { library.update(pl.localId, { name: v }); toast('已重命名'); }
            else if (connected && token) toast((await sync.renameUserList(pl.key, v)) ? '已重命名' : '服务器操作失败');
          },
        });
      } },
      { label: '删除歌单', icon: 'trash', danger: true, onPress: async () => {
        if (pl.localId) { library.remove(pl.localId); toast('已删除'); }
        else if (connected && token) toast((await sync.removeUserList(pl.key)) ? '已删除' : '服务器操作失败');
      } },
    ]);
  };

  const openPl = (pl: typeof playlists[number]) => {
    hdNav()?.navigate('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单`, plKey: pl.key });
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
          <HDTouch style={st.acctBtn} onPress={() => hdNav()?.navigate(connected ? 'Account' : 'AuthLogin')}>
            <Text style={st.acctBtnText}>{connected ? '账号' : '连接'}</Text>
          </HDTouch>
        </LinearGradient>
      </View>

      {/* 功能入口 */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 34, gap: 16 }}>
        {[
          { icon: 'music' as const, label: '媒体库', sub: `${providerCount} 个连接`, to: 'MediaLibs' },
          { icon: 'download' as const, label: '下载管理', sub: '离线歌曲', to: 'Downloads' },
          { icon: 'headphones' as const, label: '本地音乐', sub: '设备扫描', to: 'DeviceMusic' },
          { icon: 'settings' as const, label: '设置', sub: '音源/音效/主题', to: 'Settings' },
        ].map(q => (
          <HDTouch key={q.label} style={st.fnCard} onPress={() => hdNav()?.navigate(q.to)}>
            <Icon name={q.icon} size={30} color={C.brand} />
            <Text style={st.fnLabel}>{q.label}</Text>
            <Text style={st.fnSub}>{q.sub}</Text>
          </HDTouch>
        ))}
      </View>

      {/* 歌单网格 */}
      <View style={{ paddingHorizontal: 34, gap: 14 }}>
        <Text style={st.secTitle}>{`歌单 · ${playlists.length}`}</Text>
        <HDGrid min={168 * K} gap={18} minCols={3}>
          {playlists.map((pl, i) => (
            <HDTouch key={pl.key} style={st.plCard} zoom={1.06} onPress={() => openPl(pl)} onLongPress={() => managePl(pl)}>
              {pl.img ? <Image source={{ uri: pl.img }} style={st.plArt} />
                : <LinearGradient colors={GRADS[i % GRADS.length]} style={st.plArt}><Icon name="music" size={28} color="#FFFFFFAA" /></LinearGradient>}
              <View style={st.plTexts}>
                <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
                <Text style={st.plMeta}>{pl.count} 首</Text>
              </View>
            </HDTouch>
          ))}
          <HDTouch style={st.plNew} onPress={() => hdNav()?.navigate('ImportPlaylist')}>
            <Icon name="add" size={34} color={C.text2} />
            <Text style={st.plMeta}>新建歌单</Text>
          </HDTouch>
        </HDGrid>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  acct: { height: 122, borderRadius: 18, flexDirection: 'row', alignItems: 'center', padding: 22, gap: 18 },
  acctAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#00000044', alignItems: 'center', justifyContent: 'center' },
  acctName: { color: C.text, fontSize: 24, fontWeight: '800' },
  acctSub: { color: '#FFFFFF99', fontSize: 14, marginTop: 3 },
  acctBtn: { height: 52, borderRadius: 26, backgroundColor: '#00000042', paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  acctBtnText: { color: C.text, fontSize: 17, fontWeight: '700' },
  fnCard: { flex: 1, height: 116, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  fnLabel: { color: C.text, fontSize: 17, fontWeight: '700' },
  fnSub: { color: C.text3, fontSize: 12 },
  secTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  plCard: { gap: 5, paddingBottom: 7, borderRadius: 12, backgroundColor: C.surface }, // lx98:去 overflow(坑133)
  plTexts: { alignSelf: 'stretch', paddingHorizontal: 8, gap: 3 },
  plArt: { width: '100%', aspectRatio: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plNew: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: 8 },
  plName: { color: C.text, fontSize: 16, fontWeight: '600' },
  plMeta: { color: C.text2, fontSize: 13 },
});
