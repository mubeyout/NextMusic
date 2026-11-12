// HD 我的音乐 —— [产品包HD 批3 1:1] 对齐设计稿 pgMyMusic:
// page-head(我的音乐29+副句16+右双钮媒体库/导入歌单) → tile-shortcuts(我喜欢的·N首 | 最近播放 行卡22pad/r15/题20副14)
// → my-nav tabs(歌单/歌手/专辑 40h pill) → 内容墙(歌单 PvCard+新建 | 歌手圆头像 | 专辑)
// 真数据:本地+同步歌单/歌手收藏/专辑收藏全保留;账号卡退役(侧栏底部已有账号入口,设计稿无此卡)
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { toast } from '../components/Dialog';
import { hdActions } from './HDActions';
import { Platform, View, Text, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDGrid } from './HDGrid';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { playlistSync } from '../state/playlistSync';
import { sync, lxToApp, type UserListsSnapshot, subscribeSync } from '../services/sync';
import { artistFavs, subscribeArtistFavs, type ArtistFav } from '../state/artistFavs';
import { albumFavs, subscribeAlbumFavs, type AlbumFav } from '../state/albumFavs';
import { getRecents } from '../state/recent';
import { hdNav } from './hdnav';
import type { SongItem } from '../services/server';
import { FS, FW, SP } from '../theme/tokens';
import { PvCard } from '../components/PvCard';

const IS_WEB = Platform.OS === 'web';
type MyTab = '歌单' | '歌手' | '专辑';

export function HDMy() {
  const insets = useSafeAreaInsets();
  const { connected, token } = useApp();
  const [localPls, setLocalPls] = useState<LocalPlaylist[]>([]);
  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const [tab, setTab] = useState<MyTab>('歌单');
  const [arFavs, setArFavs] = useState<ArtistFav[]>(() => artistFavs());
  const [alFavs, setAlFavs] = useState<AlbumFav[]>(() => albumFavs());
  const [recents, setRecents] = useState<SongItem[]>([]);
  useEffect(() => subscribeSync(() => setSyncTick(t => t + 1)), []);
  useEffect(() => subscribeArtistFavs(() => setArFavs(artistFavs())), []);
  useEffect(() => subscribeAlbumFavs(() => setAlFavs(albumFavs())), []);
  // lx162:本地歌单删/改名后不再赖屏——library 变更直接重读本机列表,免重启
  const [, libTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => library.subscribe(() => { setLocalPls(library.all()); libTick(); }), []);
  const [syncing, setSyncing] = useState(false);

  // lx163f(TV 卡顿):本地变更只重读本机列表;网络拉取仅在 connected/syncTick 变化时走
  const myTrig = useRef({ connected: null as boolean | null, syncTick: -1 });
  const refresh = () => {
    const serverDirty = myTrig.current.connected !== connected || myTrig.current.syncTick !== syncTick;
    myTrig.current = { connected, syncTick };
    setLocalPls(library.all());
    setRecents(getRecents().slice(0, 30));
    if (!serverDirty) return;
    setSyncing(true);
    if (token) {
      sync.fetchLists().then(setSnap).catch(() => {}).finally(() => setSyncing(false));
    } else setSyncing(false);
  };
  useEffect(refresh, [connected, syncTick, libTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncPls = snap?.userList || [];
  const localClean = localPls.filter(p => p.name !== '我喜欢的');
  const localNames = new Set(localClean.map(p => p.name));
  const playlists = [
    ...localClean.map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img, songs: p.songs as SongItem[] })),
    ...syncPls.filter(u => !localNames.has(u.name)).map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, localId: undefined as string | undefined, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];
  const favCount = localPls.find(p => p.name === '我喜欢的')?.songs.length ?? 0;

  // lx101:歌单长按管理——本机 library / 同步服务器 userList
  const managePl = (pl: typeof playlists[number]) => {
    hdActions.menu(`管理「${pl.name}」`, [
      { label: '重命名歌单', icon: 'edit', onPress: () => {
        hdActions.prompt('重命名歌单', {
          defaultValue: pl.name,
          onSubmit: async (v) => {
            if (!v || v === pl.name) return;
            if (pl.localId) { void playlistSync.rename(pl.localId, v).then(() => toast('已重命名')); }
            else if (token) toast((await sync.renameUserList(pl.key, v)) ? '已重命名' : '服务器操作失败');
          },
        });
      } },
      { label: '删除歌单', icon: 'trash', danger: true, onPress: async () => {
        if (pl.localId) { void playlistSync.remove(pl.localId).then(() => toast('已删除')); }
        else if (token) toast((await sync.removeUserList(pl.key)) ? '已删除' : '服务器操作失败');
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
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 34, paddingBottom: 30, gap: SP.xl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={C.brand} />}
    >
      {/* page-head(设计: h1 29 + 副 16 + 右双钮 46h/15px) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={st.h1}>我的音乐</Text>
          <Text style={st.sub}>喜欢的歌单、歌手与专辑</Text>
        </View>
        <View style={{ flex: 1 }} />
        <HDTouch style={st.headBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill }} onPress={() => hdNav()?.navigate('MediaLibs')}>
          <Text style={st.headBtnText}>媒体库</Text>
        </HDTouch>
        <HDTouch style={st.headBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill }} onPress={() => hdNav()?.navigate('ImportPlaylist')}>
          <Text style={st.headBtnText}>导入歌单</Text>
        </HDTouch>
      </View>

      {/* tile-shortcuts(设计: 2列 gap14 / 行卡 pad22 r15 / icon32 绿 / 题20 副14) */}
      <View style={{ flexDirection: 'row', gap: IS_WEB ? 14 : SP.md }}>
        <HDTouch style={st.tile} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }} onPress={() => hdNav()?.navigate('MyFavorites')}>
          <Icon name="heart" size={IS_WEB ? 32 : 26} color={C.brand} active />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.tileTitle}>我喜欢的</Text>
            <Text style={st.tileSub}>{favCount ? `${favCount} 首歌曲` : '还没有收藏'}</Text>
          </View>
        </HDTouch>
        <HDTouch style={st.tile} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }} onPress={() => recents.length ? hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` }) : toast('还没有播放记录')}>
          <Icon name="history" size={IS_WEB ? 32 : 26} color={C.brand} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.tileTitle}>最近播放</Text>
            <Text style={st.tileSub}>接着上次的音乐</Text>
          </View>
        </HDTouch>
      </View>

      {/* my-nav tabs(设计: 40h pill 15px,on=白底黑字) */}
      <View style={{ flexDirection: 'row', gap: IS_WEB ? 10 : SP.md }}>
        {(['歌单', '歌手', '专辑'] as MyTab[]).map(t => (
          <HDTouch key={t} style={{ paddingHorizontal: 18, height: IS_WEB ? 40 : 36, borderRadius: 20, backgroundColor: tab === t ? '#F5F5F5' : '#232323', alignItems: 'center', justifyContent: 'center' }}
            focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 20 }} onPress={() => setTab(t)}>
            <Text style={{ color: tab === t ? C.bg : C.text2, fontSize: IS_WEB ? 15 : H.font.md, fontWeight: tab === t ? '600' : '500' }}>{t}</Text>
          </HDTouch>
        ))}
      </View>

      {/* 内容墙:歌单/歌手/专辑(设计: 歌单卡题16副13 · 歌手圆头像居中卡) */}
      {tab === '歌单' ? (
        <HDGrid min={251} gap={IS_WEB ? 18 : 12}>
          {playlists.map(pl => (
            <PvCard fill key={pl.key} cover={pl.img} name={pl.name} meta={`${pl.count} 首`}
              onPress={() => openPl(pl)} onLongPress={() => managePl(pl)} />
          ))}
          <HDTouch style={st.plNew} onPress={() => hdNav()?.navigate('ImportPlaylist')}>
            <Icon name="add" size={34} color={C.text2} />
            <Text style={st.plMeta}>新建歌单</Text>
          </HDTouch>
        </HDGrid>
      ) : tab === '歌手' ? (
        arFavs.length ? (
          <HDGrid min={200} gap={IS_WEB ? 18 : 12}>
            {arFavs.map(a => (
              <HDTouch key={`${a.source || 'wy'}_${a.id}`} style={{ alignItems: 'center', padding: IS_WEB ? 10 : 8, borderRadius: 12 }} zoom={1.04}
                focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }}
                onPress={() => hdNav()?.navigate('ArtistDetail', { artist: { id: a.id, name: a.name, img: a.img, source: a.source || 'wy' } })}>
                <View style={{ width: '100%', aspectRatio: 1, borderRadius: 999, overflow: 'hidden', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  {a.img ? <Image source={{ uri: a.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ color: C.text2, fontSize: IS_WEB ? 30 : 20, fontWeight: FW.bold }}>{a.name[0]}</Text>}
                </View>
                <Text style={{ color: C.text, fontSize: IS_WEB ? 16 : H.font.lg, fontWeight: FW.semibold, marginTop: IS_WEB ? 14 : 8 }} numberOfLines={1}>{a.name}</Text>
                <Text style={{ color: '#979797', fontSize: IS_WEB ? 13 : H.font.sm, marginTop: 3 }}>歌手</Text>
              </HDTouch>
            ))}
          </HDGrid>
        ) : <Text style={st.empty}>还没有收藏的歌手 —— 歌手页点心即可收藏</Text>
      ) : (
        alFavs.length ? (
          <HDGrid min={251} gap={IS_WEB ? 18 : 12}>
            {alFavs.map(a => (
              <PvCard fill key={`${a.source || 'wy'}_${a.id}`} cover={a.img} name={a.name} meta={a.singer || '专辑'}
                onPress={() => hdNav()?.navigate('AlbumDetail', { album: { id: a.id, name: a.name, singer: a.singer, img: a.img, source: a.source || 'wy' } })} />
            ))}
          </HDGrid>
        ) : <Text style={st.empty}>还没有收藏的专辑 —— 专辑页点心即可收藏</Text>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: IS_WEB ? 29 : H.font.hero, fontWeight: FW.heavy },
  sub: { color: C.text2, fontSize: IS_WEB ? 16 : H.font.md },
  headBtn: { height: IS_WEB ? 46 : 40, borderRadius: H.radius.pill, backgroundColor: C.elev, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  headBtnText: { color: C.text, fontSize: IS_WEB ? 15 : H.font.lg },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 16 : SP.md, padding: IS_WEB ? 22 : 16, borderRadius: 15, backgroundColor: C.surface },
  tileTitle: { color: C.text, fontSize: IS_WEB ? 20 : H.font.xl, fontWeight: FW.semibold },
  tileSub: { color: C.text3, fontSize: IS_WEB ? 14 : H.font.sm, marginTop: 7 },
  plNew: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: SP.md },
  plMeta: { color: C.text2, fontSize: FS.md },
  empty: { color: C.text3, fontSize: H.font.md, textAlign: 'center', paddingVertical: 40 },
});
