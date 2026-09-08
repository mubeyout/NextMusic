import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon, BrandIcon } from '../theme/Icon';
import { C, softGrad } from '../theme/tokens';
import { PillTabs } from '../components/PillTabs';
import { EmptyState } from '../components/PageChrome';
import { ActionSheet } from '../components/ActionSheet';
import { dialog, toast } from '../components/Dialog';
import { IS_HD } from '../services/appversion';
import { hdActions } from '../hd/HDActions';
import { SongRow } from '../components/SongRow';
import { isArtistFav, toggleArtistFav, refreshArtistFavs, useArtistFavTick, type ArtistFav } from '../state/artistFavs'; // lx161:歌手收藏
import { isAlbumFav, toggleAlbumFav, refreshAlbumFavs, useAlbumFavTick } from '../state/albumFavs'; // lx163:专辑收藏
import { playlistSync } from '../state/playlistSync'; // lx163:歌单 CRUD 双向同步
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { getRecents } from '../state/recent';
import { sync, lxToApp, type UserListsSnapshot } from '../services/sync';
import { downloads as dlStore, subscribeDownloads, fmtBytes } from '../services/downloads';
import { deviceTrackCount } from '../services/devicelibrary';
import { providers, PROVIDER_META, type ProviderAcct } from '../services/providers';
import type { SongItem } from '../services/server';

// Figma 2154-702 我的·歌单: title 28 + settings btn(#2b2b2b round) + pills +
// Library Summary banner(#145938→#1f2e52 r14 h72, 我的收藏 + counts + ＋新建 C.brand r18) +
// Quick row 3 cards (#2b2b2b r12 110x66: 最近播放/我喜欢的/本地音乐) +
// 自建歌单 2-col grid (169x104 gradient covers + ♫ + 13px w700 + 9px meta)
const COVER_GRADS: [string, string][] = [
  ['#1f6b5c', '#142647'],
  ['#80381f', '#381a2e'],
  ['#5c297a', '#1f3861'],
  ['#146b85', '#1f2e47'],
  ['#1f6b5c', '#142647'],
  ['#80381f', '#381a2e'],
];

export function MyScreen({ visible = true }: { visible?: boolean }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);
  const { username, connected, token } = useApp();
  const { playSong, current } = usePlayer();
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  const currentDl = (s: SongItem) => current?.songmid === s.songmid && current?.source === s.source;

  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [artists, setArtists] = useState<{ name: string; id: string; source?: string; img?: string; count?: number }[] | null>(null);
  const [albums, setAlbums] = useState<{ name: string; singer?: string; id: string; img?: string }[] | null>(null);
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [dlList, setDlList] = useState(dlStore.all());
  const [dlTick, setDlTick] = useState(0);
  useEffect(() => subscribeDownloads(() => { setDlList(dlStore.all()); setDlTick(t => t + 1); }), []);
  const [localCount, setLocalCount] = useState(deviceTrackCount());
  useEffect(() => { if (visible) setLocalCount(deviceTrackCount()); }, [visible]);
  // 长按歌单卡管理菜单（ActionSheet，与媒体库一致）
  const [actPl, setActPl] = useState<LocalPlaylist | null>(null);
  const [actSyncPl, setActSyncPl] = useState<{ id: string; name: string; count: number } | null>(null); // lx101:同步歌单管理

  const loggedIn = connected && !!token;
  // 订阅本地歌单变更：导入/新建/删除后实时刷新（否则需冷启动才能看到）
  const [, setLibTick] = useState(0);
  useEffect(() => library.subscribe(() => setLibTick(t => t + 1)), []);
  const localPlaylists = library.all();

  const lastFetch = useRef(0); // lx163h:30s 内不重复全量拉(每次切 tab 都打服务器的根修)
  const refresh = useCallback(async (force = false) => {
    setRecents(getRecents());
    if (!loggedIn) { setSnap(null); return; }
    if (!force && snap && Date.now() - lastFetch.current < 30000) return;
    lastFetch.current = Date.now();
    setSyncing(true);
    const s = await sync.fetchLists({ force });
    setSnap(s);
    setSyncing(false);
  }, [loggedIn]);

  useEffect(() => { if (visible) refresh(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const artistTick = useArtistFavTick(); // lx161:收藏变更联动(取消后列表即时刷新)
  const albumTick = useAlbumFavTick(); // lx163:专辑收藏联动
  useEffect(() => {
    if (tab === 1 && loggedIn) refreshArtistFavs().then(setArtists); // lx163:空列表也是终态,不再守卫(守卫导致首载空时永远转圈)
    if (tab === 2 && loggedIn) refreshAlbumFavs().then(setAlbums); // lx163:同上(空列表终态)
  }, [tab, artistTick, albumTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSongs = (title: string, songs: SongItem[], cover?: string, opts?: { love?: boolean; plKey?: string; artist?: ArtistFav }) => {
    if (!songs.length) return;
    nav.navigate('PlaylistDetail', { title, songs, cover, meta: `${songs.length} 首`, ...opts });
  };

  const openArtist = (a: { name: string; id: string; source?: string; img?: string }) => {
    nav.navigate('ArtistDetail', { artist: a }); // lx163:歌手内页(热门+专辑+收藏)
  };
  const openAlbum = (a: { name: string; id: string; singer?: string; img?: string }) => {
    nav.navigate('AlbumDetail', { album: a }); // lx163:专辑内页
  };

  const loveSongs = snap ? snap.loveList.map(lxToApp) : [];
  const defaultSongs = snap ? snap.defaultList.map(lxToApp) : [];
  const syncPls = snap?.userList || [];
  const localSongs = localPlaylists.flatMap(p => p.songs);
  const totalPlaylists = syncPls.length + localPlaylists.length;
  const totalSongs = (snap?.defaultList.length || 0) + (snap?.loveList.length || 0)
    + syncPls.reduce((n, u) => n + (u.list?.length || 0), 0)
    + localPlaylists.reduce((n, p) => n + p.songs.length, 0);

  // 自建歌单 grid items: local playlists first, then synced remote lists
  // lx123:本地同名优先(平台导入副本/本地独有不被服务器同名顶成双显)
  const localGridNames = new Set(localPlaylists.map(p => p.name));
  const gridItems: { key: string; localId?: string; name: string; count: number; img?: string; songs: SongItem[] }[] = [
    ...localPlaylists.filter(p => p.name !== '我喜欢的').map(p => ({ // lx124:我喜欢的走专用入口(空壳不再显示)
      key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img,
      songs: p.songs,
    })),
    ...syncPls.filter(u => !localGridNames.has(u.name)).map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];

  return (
    <>
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={[st.content, { paddingTop: insets.top + 24, paddingBottom: 24 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => refresh(true)} tintColor={C.brand} />}
    >
      <View style={st.headerRow}>
        <Text style={st.title}>我的音乐</Text>
        <TouchableOpacity style={st.settingsBtn} hitSlop={4} onPress={() => nav.navigate('Settings')}>
          <Icon name="settings" size={20} />
        </TouchableOpacity>
      </View>

      <PillTabs tabs={['歌单', '歌手', '专辑', '已下载']} active={tab} onChange={setTab} />

      {tab === 0 && (
        <View style={st.body}>
          {/* Library Summary banner */}
          <LinearGradient colors={softGrad('#145938', '#1F2E52')} style={st.banner}>
            <View style={{ flex: 1 }}>
              <Text style={st.bannerTitle}>我的收藏</Text>
              <Text style={st.bannerMeta}>{totalPlaylists} 个歌单 · {totalSongs} 首歌曲</Text>
            </View>
            <TouchableOpacity style={st.newBtn} onPress={() => (IS_HD ? hdActions : dialog).menu('新建歌单', [
              { label: '空白歌单', icon: 'add', onPress: () => { // lx159:补齐 icon(与 HDMain 同款菜单一致)
                (IS_HD ? hdActions : dialog).prompt('新建歌单', { defaultValue: '', onSubmit: (v) => { const n = (v || '').trim(); if (n) { playlistSync.create(n).then(() => toast('已创建')); } } }); // lx163:同步服务器
              } },
              { label: '导入平台歌单', icon: 'download', onPress: () => nav.navigate('ImportPlaylist') },
            ])}>
              <Text style={st.newBtnText}>＋ 新建</Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Quick row: 3 text cards */}
          <View style={st.quickRow}>
            <TouchableOpacity style={st.quickCard} activeOpacity={0.85} onPress={() => openSongs('最近播放', recents)}>
              <Text style={st.quickTitle}>最近播放</Text>
              <Text style={st.quickMeta}>{recents.length} 首</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.quickCard} activeOpacity={0.85} onPress={() => openSongs('我喜欢的', loveSongs, undefined, { love: true })}>
              <Text style={st.quickTitle}>我喜欢的</Text>
              <Text style={st.quickMeta}>{loveSongs.length} 首</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.quickCard} activeOpacity={0.85} onPress={() => nav.navigate('DeviceMusic')}>
              <Text style={st.quickTitle}>本地音乐</Text>
              <Text style={st.quickMeta}>{localCount ? `${localCount} 首` : '点此扫描'}</Text>
            </TouchableOpacity>
          </View>

          {/* 媒体库：已连服务器直接进曲库（amcfy 式入口前置，不再只藏在设置里） */}
          <View style={st.sectionRow}>
            <Text style={st.sectionTitle}>媒体库</Text>
            <TouchableOpacity onPress={() => nav.navigate('MediaLibs')} hitSlop={4}>
              <Text style={st.sectionMeta}>{providers.all().length ? '管理 ›' : '接入 ›'}</Text>
            </TouchableOpacity>
          </View>
          {(() => {
            const pv = providers.all();
            if (!pv.length) return (
              <TouchableOpacity style={st.pvAddRow} activeOpacity={0.7} onPress={() => nav.navigate('MediaLibs')}>
                <Icon name="add" size={16} color={C.brandText} />
                <Text style={st.pvAddText}>接入 Emby / Jellyfin / Navidrome / 道理鱼 / WebDAV</Text>
              </TouchableOpacity>
            );
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                {pv.map((a: ProviderAcct) => {
                  const brand = ['emby', 'jellyfin', 'navidrome', 'subsonic', 'webdav'].includes(a.type);
                  return (
                    <TouchableOpacity
                      key={a.id} style={st.pvCard} activeOpacity={0.85}
                      onPress={() => nav.navigate('ProviderBrowse', { acctId: a.id })}
                      onLongPress={() => nav.navigate('ProviderEdit', { acctId: a.id })}
                    >
                      {brand ? <BrandIcon name={a.type as never} size={18} /> : <Icon name="music" size={18} color={C.text} />}
                      <Text style={st.pvName} numberOfLines={1}>{a.name || PROVIDER_META[a.type].label}</Text>
                      <Text style={st.pvMeta} numberOfLines={1}>{PROVIDER_META[a.type].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            );
          })()}

          {/* 自建歌单 grid */}
          <View style={st.sectionRow}>
            <Text style={st.sectionTitle}>自建歌单</Text>
            <TouchableOpacity onPress={() => nav.navigate('ImportPlaylist')} hitSlop={4}>
              <Text style={st.sectionMeta}>＋ 导入</Text>
            </TouchableOpacity>
          </View>
          {gridItems.length ? (
            <View style={st.plGrid}>
              {gridItems.slice(0, 12).map((g, i) => (
                <TouchableOpacity
                  key={g.key}
                  style={st.plCell}
                  activeOpacity={0.85}
                  onPress={() => g.localId
                    ? nav.navigate('PlaylistDetail', { localId: g.localId, title: g.name, songs: g.songs, cover: g.img })
                    : openSongs(g.name, g.songs, g.img, g.localId ? undefined : { plKey: g.key })}
                  onLongPress={() => {
                    if (g.localId) {
                      const pl = library.get(g.localId!);
                      if (pl) setActPl(pl);
                    } else {
                      // lx101:同步歌单也可管理(服务器 userList 重命名/删除)
                      setActSyncPl({ id: g.key, name: g.name, count: g.count });
                    }
                  }}
                >                  {/* lx163(老板):真实封面优先(首曲专辑图),无图兑底渐变抽象封面 */}
                  {g.img ? (
                    <Image source={{ uri: g.img }} style={st.plCover} />
                  ) : (
                    <LinearGradient colors={COVER_GRADS[i % COVER_GRADS.length]} style={st.plCover}>
                      <Text style={st.plGlyph}>♫</Text>
                    </LinearGradient>
                  )}
                  <Text style={st.plName} numberOfLines={1}>{g.name}</Text>
                  <Text style={st.plMeta} numberOfLines={1}>{g.count} 首</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={st.empty}>{loggedIn ? '还没有歌单，点右上导入' : '登录后同步服务器歌单'}</Text>
          )}
        </View>
      )}

      {tab === 1 && (
        <View style={st.body}>
          <View style={st.sectionRow}><Text style={st.sectionTitle}>收藏歌手</Text><Text style={st.sectionMeta}>{loggedIn ? `${artists?.length ?? 0} 位` : '登录后同步'}</Text></View>
          {!loggedIn ? <Text style={st.empty}>登录后从服务器同步收藏的歌手</Text>
            : artists == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            : artists.length ? artists.map(a => (
              <TouchableOpacity key={a.id} style={st.row} activeOpacity={0.8} onPress={() => openArtist(a)}>
                {a.img ? <Image source={{ uri: a.img }} style={st.roundArt} /> : <View style={[st.roundArt, st.artFallback]}><Text style={st.rowGlyph}>{a.name.slice(0, 1)}</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.rowName} numberOfLines={1}>{a.name}</Text>
                  <Text style={st.rowMeta}>{a.count != null ? `${a.count} 首歌曲` : '点击查看歌曲'}</Text>
                </View>
                {/* lx161:取消收藏(服务器同步) */}
                <TouchableOpacity hitSlop={8} onPress={() => toggleArtistFav(a).then(on => toast(on ? `已收藏 ${a.name}` : `已取消收藏 ${a.name}`)).catch(() => toast('服务器写入失败'))}>
                  <Icon name="heart" size={20} active={isArtistFav(a)} color={isArtistFav(a) ? '#FF5A76' : C.text2} />
                </TouchableOpacity>
                <Icon name="next" size={18} color={C.text2} />
              </TouchableOpacity>
            )) : <Text style={st.empty}>暂无收藏歌手
去「搜索」选「歌手」标签搜喜欢的歌手，点进内页即可收藏</Text>}
        </View>
      )}

      {tab === 2 && (
        <View style={st.body}>
          <View style={st.sectionRow}><Text style={st.sectionTitle}>收藏专辑</Text><Text style={st.sectionMeta}>{loggedIn ? `${albums?.length ?? 0} 张` : '登录后同步'}</Text></View>
          {!loggedIn ? <Text style={st.empty}>登录后从服务器同步收藏的专辑</Text>
            : albums == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            : albums.length ? albums.map(a => (
              <TouchableOpacity key={a.id} style={st.row} activeOpacity={0.8} onPress={() => openAlbum(a)}>
                {a.img ? <Image source={{ uri: a.img }} style={st.art} /> : <View style={[st.art, st.artFallback]}><Text style={st.rowGlyph}>♫</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.rowName} numberOfLines={1}>{a.name}</Text>
                  <Text style={st.rowMeta} numberOfLines={1}>{a.singer || ''}</Text>
                </View>
                {/* lx163:取消收藏专辑(服务器同步) */}
                <TouchableOpacity hitSlop={8} onPress={() => toggleAlbumFav(a).then(on => toast(on ? `已收藏《${a.name}》` : `已取消收藏《${a.name}》`)).catch(() => toast('服务器写入失败'))}>
                  <Icon name="heart" size={20} active={isAlbumFav(a)} color={isAlbumFav(a) ? '#FF5A76' : C.text2} />
                </TouchableOpacity>
                <Icon name="next" size={18} color={C.text2} />
              </TouchableOpacity>
            )) : <Text style={st.empty}>暂无收藏专辑
去「搜索」选「专辑」标签搜专辑，点进内页即可收藏</Text>}
        </View>
      )}

      {tab === 3 && (
        <View style={st.body}>
          <View style={st.sectionRow}>
            <Text style={st.sectionTitle}>已下载</Text>
            <TouchableOpacity onPress={() => nav.navigate('Downloads')}>
              <Text style={st.sectionMeta}>{dlList.length ? `${dlList.length} 首 · ${fmtBytes(dlStore.totalBytes())} · 管理 ›` : '0 首'}</Text>
            </TouchableOpacity>
          </View>
          {dlList.length ? (
            <View style={{ gap: 4 }} key={dlTick}>
              {dlList.slice(0, 100).map(r => (
                <SongRow
                  key={r.key}
                  song={r.song}
                  playing={currentDl(r.song)}
                  onPress={() => playSong(r.song, dlList.map(x => x.song))}
                  extra={(
                    <TouchableOpacity hitSlop={8} onPress={() => dlStore.remove(r.song)}>
                      <Icon name="trash" size={18} color={C.text3} />
                    </TouchableOpacity>
                  )}
                />
              ))}
            </View>
          ) : (
            <EmptyState icon="download" title="还没有下载" sub="在歌单页点「下载全部」，或在歌曲菜单里下载" />
          )}
        </View>
      )}
    </ScrollView>
    <ActionSheet
      visible={!!actPl} onClose={() => setActPl(null)}
      title={actPl?.name || '歌单'}
      items={actPl ? [
        { label: '重命名歌单', onPress: () => {
          (IS_HD ? hdActions : dialog).prompt('重命名歌单', {
            defaultValue: actPl.name,
            onSubmit: (v) => {
              if (!v || v === actPl.name) return;
              playlistSync.rename(actPl.id, v).then(() => toast('已重命名')); // lx163:同步服务器
            },
          });
        } },
        { label: '删除歌单', danger: true, onPress: () => {
          (IS_HD ? hdActions : dialog).confirm('删除歌单', `确定删除「${actPl.name}」？${actPl.songs.length} 首歌曲将从此歌单移除`, () => {
            playlistSync.remove(actPl.id).then(() => toast('歌单已删除')); // lx163:同步服务器
          }, '删除', '取消');
        } },
      ] : []}
    />

      {/* lx101:同步歌单管理(服务器 userList) */}
      <ActionSheet
        visible={!!actSyncPl} onClose={() => setActSyncPl(null)}
        title={actSyncPl?.name || '歌单'}
        items={[
          { label: '重命名歌单', onPress: () => {
            const t = actSyncPl!;
            (IS_HD ? hdActions : dialog).prompt('重命名歌单', {
              defaultValue: t.name,
              onSubmit: async (v) => {
                if (!v || v === t.name) return;
                toast((await sync.renameUserList(t.id, v)) ? '已重命名' : '服务器操作失败');
                refresh();
              },
            });
          } },
          { label: '删除歌单', danger: true, onPress: () => {
            const t = actSyncPl!;
            (IS_HD ? hdActions : dialog).confirm('删除歌单', `确定删除「${t.name}」？${t.count} 首将从此歌单移除`, async () => {
              toast((await sync.removeUserList(t.id)) ? '已删除' : '服务器操作失败');
              refresh();
            });
          } },
        ]}
      />
    </>
  );
}

// api import placed at bottom to avoid circular-import cycle at module init
import { api } from '../services/server';

const COL = (Dimensions.get('window').width - 40 - 24) / 3; // 3 列自适应填满屏幕

const st = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  headerRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: C.text, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  settingsBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 8, paddingTop: 14 },
  banner: {
    height: 72, borderRadius: 14, marginTop: 12, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 16, gap: 12,
  },
  bannerTitle: { color: C.text, fontSize: 15, lineHeight: 18, fontWeight: '700' },
  bannerMeta: { color: C.text2, fontSize: 11, lineHeight: 13, marginTop: 6 },
  newBtn: { height: 36, borderRadius: 18, backgroundColor: C.brand, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  newBtnText: { color: C.white, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  quickCard: { flex: 1, height: 66, borderRadius: 12, backgroundColor: C.surface2, padding: 12, justifyContent: 'center', gap: 6 },
  pvCard: { width: 138, minHeight: 64, borderRadius: 12, backgroundColor: C.surface2, padding: 12, justifyContent: 'center', gap: 5 },
  pvName: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  pvMeta: { color: C.text2, fontSize: 9, lineHeight: 12 },
  pvAddRow: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pvAddText: { color: C.text2, fontSize: 11, lineHeight: 15 },
  quickTitle: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  quickMeta: { color: C.text2, fontSize: 10, lineHeight: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', height: 26, marginTop: 12 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  sectionMeta: { color: C.brandSoft, fontSize: 10, lineHeight: 12 },
  plGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  plCell: { width: '31%', gap: 4 },
  plCover: { width: '100%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  plGlyph: { color: C.white, fontSize: 26, fontWeight: '700' },
  plName: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  plMeta: { color: C.text2, fontSize: 9, lineHeight: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  art: { width: 50, height: 50, borderRadius: 8, backgroundColor: C.surface2 },
  roundArt: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.surface2 },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  rowGlyph: { color: C.text2, fontSize: 20, fontWeight: '700' },
  rowName: { color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  rowMeta: { color: C.text2, fontSize: 11, lineHeight: 15 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingTop: 18, paddingBottom: 6 },
  center: { paddingVertical: 24 },
});
