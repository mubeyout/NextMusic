// MyLibraryScreen —— 我的曲库(P1 0924,spec NextMusic-design/library-v1)
// 四 tab(专辑墙/歌手/最近添加/随机30)三形态;详情=专辑/歌手独立路由;LibCard=媒体库页入口卡
// 视觉:唱片卡(sleeve+黑胶圆+N首徽标)按 spec 从零建;数据=myLibrary.ts;上传=P1b 入口B+sheet
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { HDTouch } from '../hd/HDTouch';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { dialog, toast } from '../components/Dialog';
import { store as httpStore } from '../services/server';
import type { SongItem } from '../services/server';
import { myLib, toSongItem, coverUrl, type LibArtist, type LibAlbum, type LibSong, type LibStats } from '../services/myLibrary';
import { usePlayer } from '../state/PlayerProvider';
import { useUploadSheet } from './UploadSheet';
import { IS_HD as APP_IS_HD } from '../services/appversion';
import { PageHeader } from '../components/PageChrome';

const IS_HD = APP_IS_HD;
const IS_WEB = Platform.OS === 'web';
type Tab = 'albums' | 'artists' | 'recent' | 'shuffle';
const TABS: { key: Tab; label: string; icon: 'music' | 'user' | 'wave' | 'refresh' }[] = [
  { key: 'albums', label: '专辑', icon: 'music' },
  { key: 'artists', label: '歌手', icon: 'user' },
  { key: 'recent', label: '最近添加', icon: 'wave' },
  { key: 'shuffle', label: '随机 30', icon: 'refresh' },
];

// ── 封面渐变(与全 App coverGrad 同源族) ──
const COVER_GRADS: [string, string][] = [
  ['#3f8766', '#265141'], ['#5d7ba3', '#3a506e'], ['#a3765d', '#6e4d3a'],
  ['#6b5da3', '#463c6e'], ['#87663f', '#514126'], ['#3d4c5a', '#28333f'], ['#4c5a3d', '#333f28'],
];
function gradOf(name?: string) {
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (name || '').charCodeAt(i) + ((h << 5) - h);
  return COVER_GRADS[Math.abs(h) % COVER_GRADS.length];
}

/** 唱片卡(sleeve+黑胶圆+N首徽标;封面缺失=渐变+图标;未知=灰阶) */
function DiscCard({ name, sub, cover, count, round, focusable, onPress, unknown, size = 1 }: {
  name: string; sub?: string; cover?: string | null; count?: number; round?: boolean;
  focusable?: boolean; onPress?: () => void; unknown?: boolean; size?: number;
}) {
  const [g1, g2] = gradOf(name);
  const dim = unknown ? { opacity: 0.75 } : undefined;
  const sleeve = (
    <View style={[d.sleeve, round && d.sleeveRound, { aspectRatio: 1 } as never, unknown && d.sleeveUnknown]}>
      {cover ? (
        <Image source={{ uri: cover }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as never} resizeMode="cover" />
      ) : (
        <View style={[d.gradFill, { backgroundColor: unknown ? '#2a2a2e' : g1 }]} />
      )}
      {!cover && !unknown && <View style={[d.gradFill2, { backgroundColor: g2 }]} />}
      {!cover && <Icon name="music" size={26 * size} color={unknown ? '#ffffffaa' : '#fff'} />}
      <View style={[d.vin, round && { borderRadius: 999 }]} />
      {count !== undefined && <View style={d.cntWrap}><Text style={d.cnt}>{count} 首</Text></View>}
    </View>
  );
  const label = (
    <View style={{ width: '100%' } as never}>
      <Text style={d.discName} numberOfLines={1}>{name}</Text>
      {sub ? <Text style={d.discSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
  if (IS_HD || focusable) {
    return (
      <HDTouch style={d.disc as never} onPress={onPress} focusStyle={d.discFocus} focusBg={undefined}>
        {sleeve}{label}
      </HDTouch>
    );
  }
  return <TouchableOpacity style={d.disc as never} onPress={onPress} activeOpacity={0.75}>{sleeve}{label}</TouchableOpacity>;
}

/** 歌曲行(最近添加/随机30/详情列表) */
function SongRow({ song, idx, onPress }: { song: LibSong; idx?: number; onPress?: () => void }) {
  const [g1] = gradOf(song.album || song.singer);
  const sub = `${song.singer || '未知歌手'} · ${song.album || (song.subPath ? '文件夹分组' : '未知专辑')}${song.quality && song.quality !== '128k' ? ' · ' + song.quality.toUpperCase() : ''}`;
  return (
    <TouchableOpacity style={d.sg} onPress={onPress} activeOpacity={0.7}>
      {idx !== undefined && <Text style={d.sgIdx}>{idx + 1}</Text>}
      <View style={[d.cvs, { backgroundColor: song.hasCover ? undefined : g1 }]}>
        {song.hasCover ? <Image source={{ uri: coverUrl(song.filename) }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as never} resizeMode="cover" /> : <Icon name="music" size={15} color="#fff" />}
      </View>
      <View style={d.sgMid}>
        <Text style={d.sgA} numberOfLines={1}>{song.name}</Text>
        <Text style={d.sgB} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={d.dur}>{song.interval || song.ext.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

function timeGroup(ts: number): string {
  const d0 = Date.now() - ts;
  if (d0 < 864e5) return '今天';
  if (d0 < 7 * 864e5) return '本周';
  if (d0 < 30 * 864e5) return '本月';
  return '更早';
}

// ── 入口卡(媒体库页顶部) ──
export function LibCard({ stats, onEnter }: { stats: LibStats | null; onEnter: () => void }) {
  const gb = stats ? (stats.totalBytes / 1024 / 1024 / 1024).toFixed(1) : '--';
  return (
    <TouchableOpacity style={d.libCard} onPress={onEnter} activeOpacity={0.85}>
      <View style={d.vinBig} />
      <View style={d.libRow}>
        <Icon name="wave" size={22} color={C.brand} />
        <Text style={d.libTitle}>我的曲库</Text>
      </View>
      <Text style={d.libStat}>
        {stats ? <><Text style={d.libStatB}>{stats.songs.toLocaleString()}</Text> 首歌 · <Text style={d.libStatB}>{stats.albums}</Text> 专辑 · <Text style={d.libStatB}>{stats.artists}</Text> 歌手 · <Text style={d.libStatB}>{gb}</Text> GB</> : '服务器上的自有曲库 · 点击进入'}
      </Text>
      <View style={d.libGoRow}>
        <Text style={d.libGo}>进入曲库</Text>
        <Icon name="chevronright" size={12} color={C.brand} />
      </View>
    </TouchableOpacity>
  );
}

// ── 主屏 ──
export function MyLibraryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const { width } = useWindowDimensions();
  const davWide = IS_WEB && width >= 900 && !IS_HD;
  const [tab, setTab] = useState<Tab>('albums');
  const [stats, setStats] = useState<LibStats | null>(null);
  const [albums, setAlbums] = useState<LibAlbum[] | null>(null);
  const [artists, setArtists] = useState<LibArtist[] | null>(null);
  const [recent, setRecent] = useState<LibSong[] | null>(null);
  const [shuffle, setShuffle] = useState<LibSong[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [seed, setSeed] = useState(0);
  const UploadSheet = useUploadSheet();
  const logged = !!httpStore.token;

  const loadAll = useCallback(async (soft = false) => {
    if (!httpStore.token) { setErr('NEED_LOGIN'); return; }
    if (!soft) { setAlbums(null); setArtists(null); setRecent(null); }
    setErr(null);
    try {
      const [st, al, ar, rc] = await Promise.all([myLib.stats(), myLib.albums('newest', 120), myLib.artists(), myLib.songs('recent', 60)]);
      setStats(st); setAlbums(al.albums); setArtists(ar.artists); setRecent(rc.songs);
    } catch (e) {
      setErr((e as Error).message || '加载失败');
    }
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);
  // 随机30 按需+换种子
  useEffect(() => {
    if (tab === 'shuffle' && httpStore.token) {
      myLib.songs('random', 30).then(r => setShuffle(r.songs)).catch(() => setShuffle([]));
    }
  }, [tab, seed]);

  const doSync = () => {
    if (syncing) return;
    setSyncing(true);
    myLib.sync().then(() => loadAll(true)).then(() => toast('曲库扫描完成'))
      .catch(e => toast('扫描失败：' + (e as Error).message))
      .finally(() => setSyncing(false));
  };

  const playAllLib = async () => {
    if (!recent?.length) return;
    const items = recent.map(toSongItem);
    await playSong(items[0], items);
  };
  const playShuffle = async () => {
    if (!shuffle?.length) return;
    const items = shuffle.map(toSongItem);
    await playSong(items[0], items);
  };

  const enterAlbum = (a: LibAlbum) => nav.navigate('MyLibAlbum', { id: a.id, name: a.name, cover: a.coverFile });
  const enterArtist = (a: LibArtist) => nav.navigate('MyLibArtist', { id: a.id, name: a.name });

  const TabBtn = ({ t }: { t: typeof TABS[number] }) => (
    IS_HD ? (
      <HDTouch style={[d.tab, tab === t.key && d.tabOn]} focusStyle={d.tabFocus} onPress={() => setTab(t.key)}>
        <Text style={[d.tabText, tab === t.key && d.tabTextOn]}>{t.label}</Text>
      </HDTouch>
    ) : (
      <TouchableOpacity style={[d.tab, tab === t.key && d.tabOn]} onPress={() => setTab(t.key)} activeOpacity={0.75}>
        <Text style={[d.tabText, tab === t.key && d.tabTextOn]}>{t.label}</Text>
      </TouchableOpacity>
    )
  );

  const body = () => {
    if (err === 'NEED_LOGIN') {
      return (
        <View style={d.emptyWrap}>
          <Icon name="cloud" size={30} color={C.text3} />
          <Text style={d.emptyT1}>登录后使用我的曲库</Text>
          <Text style={d.emptyT2}>你的音乐在服务器上自动整理成图书馆——歌手、专辑、封面一步到位</Text>
        </View>
      );
    }
    if (err) {
      return (
        <View style={d.emptyWrap}>
          <Icon name="cloud" size={30} color="#E8618C" />
          <Text style={d.emptyT1}>曲库加载失败</Text>
          <Text style={d.emptyT2}>{err}</Text>
          <TouchableOpacity style={d.retryBtn} onPress={() => loadAll()}><Text style={d.retryText}>重试</Text></TouchableOpacity>
        </View>
      );
    }
    const isEmpty = stats && stats.songs === 0;
    if (isEmpty) {
      return (
        <View style={d.emptyWrap}>
          <Icon name="cloud" size={30} color={C.text3} />
          <Text style={d.emptyT1}>曲库还是空的</Text>
          <Text style={d.emptyT2}>把音乐文件夹上传到服务器，它会自动整理成图书馆——歌手、专辑、封面一步到位</Text>
          <UploadSheet.EmptyAction />
          <Text style={d.emptyHint}>支持 FLAC / MP3 / AAC / OGG</Text>
        </View>
      );
    }
    if (tab === 'albums') {
      if (!albums) return <SkelGrid />;
      return (
        <ScrollView>
          <View style={[d.wall, IS_HD && d.wallHD]}>
            {albums.map(a => (
              <DiscCard key={a.id} name={a.name} count={a.songCount}
                sub={`${a.artist}${a.byDir ? ' · 文件夹分组' : ''}`}
                cover={a.coverFile ? coverUrl(a.coverFile) : null}
                unknown={!a.coverFile}
                onPress={() => enterAlbum(a)} />
            ))}
          </View>
        </ScrollView>
      );
    }
    if (tab === 'artists') {
      if (!artists) return <SkelGrid round />;
      return (
        <ScrollView>
          <View style={[d.wall4, IS_HD && d.wall4HD]}>
            {artists.map(a => (
              <DiscCard key={a.id} name={a.name} round count={a.albumCount}
                sub={`${a.songCount} 首`}
                cover={a.coverFile ? coverUrl(a.coverFile) : null}
                unknown={a.name === '未知歌手'}
                onPress={() => enterArtist(a)} />
            ))}
          </View>
        </ScrollView>
      );
    }
    if (tab === 'recent') {
      if (!recent) return <View style={{ padding: 20 }}><ActivityIndicator color={C.brand} /></View>;
      let lastG = '';
      return (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
          {recent.map((s, i) => {
            const g = timeGroup(s.mtime);
            const head = g !== lastG ? (lastG = g, <Text style={d.grp}>{g}</Text>) : null;
            return <React.Fragment key={s.id}>{head}
              <SongRow song={s} onPress={async () => { const items = recent.map(toSongItem); await playSong(items[i], items); }} />
            </React.Fragment>;
          })}
        </ScrollView>
      );
    }
    // shuffle
    if (!shuffle) return <View style={{ padding: 20 }}><ActivityIndicator color={C.brand} /></View>;
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <TouchableOpacity style={d.shuffleBtn} onPress={() => setSeed(s => s + 1)} activeOpacity={0.8}>
          <Icon name="refresh" size={16} color="#04120a" />
          <Text style={d.shuffleBtnT}>再来一组</Text>
          <Text style={d.shuffleBtnSub}>{shuffle.length} 首 · 每次刷新</Text>
        </TouchableOpacity>
        {shuffle.map((s, i) => (
          <SongRow key={s.id} song={s} idx={i} onPress={playShuffle} />
        ))}
      </ScrollView>
    );
  };

  // 形态:桌面≥900=左竖 tab+右内容;其余=顶部胶囊
  const tabBarTop = (
    <View style={[d.tabs, IS_HD && d.tabsHD]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: IS_HD ? 30 : 16, paddingVertical: 4 }}>
        {TABS.map(t => <TabBtn key={t.key} t={t} />)}
      </ScrollView>
    </View>
  );
  const statsLine = stats ? `${stats.songs.toLocaleString()} 首 · ${stats.albums} 专辑 · ${stats.artists} 歌手` : '';

  return (
    <View style={[d.screen, { paddingTop: insets.top }]}>
      {IS_HD ? (
        <View style={d.hdHead}>
          <HDTouch style={d.hdBack} onPress={() => nav.goBack()} focusStyle={d.focusRing} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={d.hdTitle}>我的曲库</Text>
          <HDTouch style={d.hdBack} onPress={doSync} focusStyle={d.focusRing}>
            {syncing ? <ActivityIndicator size="small" color={C.brand} /> : <Icon name="refresh" size={16} color={C.text2} />}
          </HDTouch>
        </View>
      ) : (
        <View style={d.head}>
          <TouchableOpacity style={d.headBtn} onPress={() => nav.goBack()}><Icon name="back" size={16} color={C.text2} /></TouchableOpacity>
          <Text style={d.headTitle}>我的曲库</Text>
          <Text style={d.headStats} numberOfLines={1}>{statsLine}</Text>
          <TouchableOpacity style={d.headBtn} onPress={doSync}>
            {syncing ? <ActivityIndicator size="small" color={C.brand} /> : <Icon name="refresh" size={15} color={C.text2} />}
          </TouchableOpacity>
        </View>
      )}
      {davWide ? (
        <View style={d.wideCols}>
          <View style={d.wideSide}>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} style={[d.wtab, tab === t.key && d.wtabOn]} onPress={() => setTab(t.key)}>
                <Icon name={t.icon} size={15} color={tab === t.key ? C.text : C.text2} />
                <Text style={[d.wtabT, tab === t.key && d.wtabTOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: 'auto' as never }}>
              <Text style={d.wsideStats}>{statsLine}{stats ? `\n${(stats.totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}</Text>
            </View>
          </View>
          <View style={d.wideMain}>{body()}</View>
        </View>
      ) : (
        <>{tabBarTop}<View style={d.bodyWrap}>{body()}</View></>
      )}
      {/* 播放全部/播放这组30(绿实心主动作,手机贴底;TV 侧已是头部动作) */}
      {!davWide && (tab === 'albums' || tab === 'shuffle') && (tab !== 'albums' || stats?.songs) ? (
        tab === 'shuffle'
          ? (shuffle?.length ? <TouchableOpacity style={d.playAll} onPress={playShuffle}><Icon name="play" size={13} color="#04120a" /><Text style={d.playAllT}>播放这组 {shuffle.length} 首</Text></TouchableOpacity> : null)
          : <TouchableOpacity style={d.playAll} onPress={playAllLib}><Icon name="play" size={13} color="#04120a" /><Text style={d.playAllT}>随机播放全部 · {stats?.songs ?? '--'} 首</Text></TouchableOpacity>
      ) : null}
      <UploadSheet.View />
    </View>
  );
}

function SkelGrid({ round }: { round?: boolean }) {
  return (
    <ScrollView>
      <View style={[d.wall, round && { gap: 14 }]}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={{ width: '31%' } as never}>
            <View style={[d.skel, round && { borderRadius: 999 }]} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── 专辑详情 ──
export function MyLibAlbumRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { id: string; name: string; cover?: string | null } } }).route;
  const { id, name, cover } = route.params;
  const { playSong } = usePlayer();
  const [album, setAlbum] = useState<LibAlbum | null>(null);
  const [songs, setSongs] = useState<LibSong[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    myLib.album(id).then(r => { setAlbum(r.album); setSongs(r.songs); }).catch(e => setErr((e as Error).message));
  }, [id]);
  const play = async (i: number) => {
    if (!songs) return;
    const items = songs.map(toSongItem);
    await playSong(items[i], items);
  };
  const UploadSheet = useUploadSheet();
  return (
    <View style={d.screen}>
      <PageHeader title={name || '专辑'} />
      {err ? <Text style={d.errText}>加载失败：{err}</Text> : !songs ? (
        <View style={{ padding: 24 }}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={d.albHead}>
            <DiscCard name={name} count={undefined} cover={cover ? coverUrl(cover) : null} unknown={!cover} onPress={undefined} />
            <View style={{ flex: 1 } as never}>
              <Text style={d.albName} numberOfLines={2}>{name}</Text>
              <Text style={d.albSub}>{album?.artist}{album?.byDir ? ' · 文件夹分组' : ''} · {songs.length} 首</Text>
              {songs.length ? <TouchableOpacity style={d.playAll} onPress={() => play(0)}><Icon name="play" size={12} color="#04120a" /><Text style={d.playAllT}>播放全部</Text></TouchableOpacity> : null}
            </View>
          </View>
          {songs.map((s, i) => <SongRow key={s.id} song={s} idx={i + 1} onPress={() => play(i)} />)}
        </ScrollView>
      )}
      <UploadSheet.View />
    </View>
  );
}

// ── 歌手详情 ──
export function MyLibArtistRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { id: string; name: string } } }).route;
  const { id, name } = route.params;
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const [data, setData] = useState<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    myLib.artist(id).then(setData).catch(e => setErr((e as Error).message));
  }, [id]);
  const play = async (i: number) => {
    if (!data) return;
    const items = data.songs.map(toSongItem);
    await playSong(items[i], items);
  };
  const UploadSheet = useUploadSheet();
  return (
    <View style={d.screen}>
      <PageHeader title={name || '歌手'} />
      {err ? <Text style={d.errText}>加载失败：{err}</Text> : !data ? (
        <View style={{ padding: 24 }}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={d.albHead}>
            <DiscCard name={name} round cover={data.artist.coverFile ? coverUrl(data.artist.coverFile) : null} unknown={!data.artist.coverFile} onPress={undefined} />
            <View style={{ flex: 1 } as never}>
              <Text style={d.albName} numberOfLines={2}>{name}</Text>
              <Text style={d.albSub}>{data.songs.length} 首 · {data.albums.length} 专辑</Text>
              {data.songs.length ? <TouchableOpacity style={d.playAll} onPress={() => play(0)}><Icon name="play" size={12} color="#04120a" /><Text style={d.playAllT}>播放全部</Text></TouchableOpacity> : null}
            </View>
          </View>
          {data.albums.length > 1 && (
            <>
              <Text style={d.grp}>专辑</Text>
              <View style={d.wall}>
                {data.albums.map(a => (
                  <DiscCard key={a.id} name={a.name} count={a.songCount} cover={a.coverFile ? coverUrl(a.coverFile) : null} unknown={!a.coverFile}
                    sub={a.byDir ? '文件夹分组' : a.artist}
                    onPress={() => nav.navigate('MyLibAlbum', { id: a.id, name: a.name, cover: a.coverFile })} />
                ))}
              </View>
            </>
          )}
          <Text style={d.grp}>歌曲</Text>
          {data.songs.map((s, i) => <SongRow key={s.id} song={s} idx={i + 1} onPress={() => play(i)} />)}
        </ScrollView>
      )}
      <UploadSheet.View />
    </View>
  );
}

// ── 样式(spec v1 token) ──
const d = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  headBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  headStats: { flex: 1, color: C.text3, fontSize: 10.5, textAlign: 'right', marginRight: 2 },
  hdHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  hdBack: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  hdTitle: { flex: 1, color: C.text, fontSize: 20, fontWeight: '800' },
  focusRing: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 12 },
  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  tabsHD: {},
  tab: { borderRadius: 999, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'transparent' },
  tabOn: { backgroundColor: C.brand, borderColor: C.brand },
  tabText: { color: C.text2, fontSize: 12 },
  tabTextOn: { color: '#04120a', fontWeight: '700' },
  tabFocus: { borderColor: C.brand, borderWidth: 2 },
  bodyWrap: { flex: 1 },
  // 桌面双区
  wideCols: { flex: 1, flexDirection: 'row' },
  wideSide: { width: 198, borderRightWidth: 1, borderRightColor: C.strokeFaint, padding: 16, gap: 2 },
  wtab: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  wtabOn: { backgroundColor: 'rgba(30,215,96,.11)' },
  wtabT: { color: C.text2, fontSize: 13 },
  wtabTOn: { color: C.text, fontWeight: '700' },
  wsideStats: { color: C.text3, fontSize: 10.5, lineHeight: 16 },
  wideMain: { flex: 1, padding: 20 },
  // 专辑墙
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, paddingBottom: 130 },
  wallHD: { gap: 18, padding: 30, paddingBottom: 150 },
  wall4: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 16, paddingBottom: 130 },
  wall4HD: { gap: 20, padding: 30, paddingBottom: 150 },
  disc: { width: '31%' as never, gap: 7 },
  discFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 14, transform: [{ scale: 1.05 }] },
  sleeve: { borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sleeveRound: { borderRadius: 999 },
  sleeveUnknown: { opacity: 0.75 },
  gradFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.55 },
  gradFill2: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.35 },
  vin: { position: 'absolute', right: '-22%', bottom: '-22%', width: '70%', aspectRatio: 1, borderRadius: 999, backgroundColor: '#111', borderWidth: 2, borderColor: '#000', opacity: 0.85 },
  cntWrap: { position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(0,0,0,.66)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cnt: { color: '#ffffffcc', fontSize: 9.5 },
  discName: { color: C.text, fontSize: 11.5, fontWeight: '600' },
  discSub: { color: C.text3, fontSize: 10, marginTop: 1 },
  // 歌曲行
  sg: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, paddingHorizontal: 16 },
  sgIdx: { width: 22, textAlign: 'center', color: C.text3, fontSize: 11.5 },
  cvs: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sgMid: { flex: 1, minWidth: 0 },
  sgA: { color: C.text, fontSize: 13 },
  sgB: { color: C.text3, fontSize: 10.5, marginTop: 2 },
  dur: { color: C.text3, fontSize: 10.5 },
  grp: { color: C.text3, fontSize: 11, letterSpacing: 1, marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
  // 空态/错态/骨架
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingVertical: 60 },
  emptyT1: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptyT2: { color: C.text3, fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 230 },
  emptyHint: { color: C.text3, fontSize: 10, marginTop: 8 },
  retryBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7, marginTop: 8 },
  retryText: { color: C.text2, fontSize: 12.5, fontWeight: '700' },
  skel: { aspectRatio: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.055)' },
  // 主动作
  playAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.brand, borderRadius: 999, paddingVertical: 12, marginHorizontal: 16, marginTop: 8, alignSelf: 'stretch' as never },
  playAllT: { color: '#04120a', fontSize: 13, fontWeight: '700' },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, marginHorizontal: 16, marginTop: 6 },
  shuffleBtnT: { color: '#04120a', fontSize: 13.5, fontWeight: '800' },
  shuffleBtnSub: { flex: 1, color: '#04120a', fontSize: 11, fontWeight: '600', opacity: 0.75, textAlign: 'right' },
  // 入口卡
  libCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(30,215,96,.15)', backgroundColor: '#0c1612', paddingVertical: 18, paddingHorizontal: 20, marginBottom: 14, overflow: 'hidden' },
  vinBig: { position: 'absolute', right: -36, bottom: -70, width: 140, height: 140, borderRadius: 999, backgroundColor: '#111', borderWidth: 2, borderColor: '#000', opacity: 0.75 },
  libRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  libTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  libStat: { color: C.text2, fontSize: 12, marginTop: 8 },
  libStatB: { color: C.text, fontWeight: '700' },
  libGoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  libGo: { color: C.brand, fontSize: 13, fontWeight: '700' },
  // 详情
  albHead: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  albName: { color: C.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  albSub: { color: C.text3, fontSize: 11.5, marginTop: 4 },
  errText: { color: '#E8618C', fontSize: 12.5, padding: 20, textAlign: 'center' },
});
