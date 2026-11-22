// HD 首页 —— 桌面版 HomeScreen 结构:问候 + 双大卡(每日推荐/私人雷达)
// + 最近播放横滚 + 我的歌单网格;全部真数据真播放
import React, { useEffect, useRef, useState } from 'react';
import { FocusBridge } from './HDMain';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H, SH, shadowStyleOf, webCardShadow } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDGrid } from './HDGrid';
import { Platform } from 'react-native';
import { usePlayer } from '../state/PlayerProvider';
const IS_WEB = Platform.OS === 'web';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { getRecents } from '../state/recent';
import { sync, lxToApp, type UserListsSnapshot } from '../services/sync';
import { lxapi } from '../services/lxapi';
import type { SongListMeta } from '../services/server';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';
import { cacheStale, cacheSet } from './hdcache';
import type { SongItem } from '../services/server';
import { FS, FW, SP } from '../theme/tokens';

export function HDHome({ onGotoSearch }: { onGotoSearch?: () => void }) {
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayer();
  const { connected, token } = useApp();
  const [localPls, setLocalPls] = useState<LocalPlaylist[]>([]);
  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [dailyBusy, setDailyBusy] = useState(false);
  // 推荐歌单(五源聚合)——lx91:缓存秒开 + 后台刷新(五源聚合上游慢,是首页加载慢主源)
  const [recPls, setRecPls] = useState<SongListMeta[]>(() => cacheStale<SongListMeta[]>('home.recPls') || []);
  const [recSource, setRecSource] = useState(() => cacheStale<string>('home.recSource') || '');

  const [recFail, setRecFail] = useState(false);
  const [homeTab, setHomeTab] = useState<'全部' | '音乐' | '播客'>('全部'); // [HTML01 1120] 首页内容类型筛选(home-cards.js)
  const loadRec = () => {
    setRecFail(false);
    lxapi.songListAuto('', '5', 1, 18).then(r => {
      setRecPls(r.list); setRecSource(r.source);
      cacheSet('home.recPls', r.list); cacheSet('home.recSource', r.source);
    }).catch(() => setRecFail(true)); // 失败不再永远转圈:显示重试入口
  };
  useEffect(() => { loadRec(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    setLocalPls(library.all());
    setRecents(getRecents().slice(0, 20));
    if (token) sync.fetchLists().then(setSnap).catch(() => {}); // lx164:绑定态——离线 fetchLists 回缓存
  };
  // 挂载拉本地 + connected 就绪(probe 完成)后拉服务器歌单——冷启动 probe 晚于挂载,只拉一次会漏(老板实测我的歌单空)
  useEffect(refresh, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncPls = snap?.userList || [];
  const playlists = [
    ...localPls.filter(p => p.name !== '我喜欢的').map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img, songs: p.songs as SongItem[] })),
    ...syncPls.filter(u => !new Set(localPls.map((p: { name: string }) => p.name)).has(u.name)).map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, localId: undefined as string | undefined, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];

  const openPl = (pl: typeof playlists[number]) => {
    hdNav()?.navigate('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单`, plKey: pl.key });
  };

  // 每日推荐 = kg TOP500 前 30 首即播(真数据,动态找榜)
  const playDaily = async () => {
    if (dailyBusy) return;
    setDailyBusy(true);
    try {
      const bs = await lxapi.leaderboardBoards('kg');
      const top = bs.find(b => /500/i.test(b.name)) || bs[0];
      const list = top ? await lxapi.leaderboardList(top.bangid, 'kg').catch(() => [] as SongItem[]) : [];
      if (list.length) { playSong(list[0], list.slice(0, 30)); toast(`每日精选 · ${Math.min(30, list.length)} 首`); }
      else toast('榜单获取失败,稍后重试');
    } finally { setDailyBusy(false); }
  };

  // 私人雷达 = 最近播放随机 30 首
  const playRadar = () => {
    if (!recents.length) { toast('还没有播放记录,先去探索几首吧'); onGotoSearch?.(); return; }
    const shuffled = [...recents].sort(() => Math.random() - 0.5).slice(0, 30);
    playSong(shuffled[0], shuffled);
    toast(`私人雷达 · ${shuffled.length} 首`);
  };

  // 批3:氛围快捷卡(夜深人静/华语经典)=关键词搜索即播 30 首
  const playMood = async (kw: string, label: string) => {
    if (dailyBusy) return;
    setDailyBusy(true);
    try {
      const list = (await lxapi.search(kw, 'kw', 1, 30).catch(() => [] as SongItem[])).slice(0, 30);
      if (list.length) { playSong(list[0], list); toast(`${label} · ${list.length} 首`); }
      else toast('内容获取失败,稍后重试');
    } finally { setDailyBusy(false); }
  };

  const openRecPl = async (pl: SongListMeta) => {
    try {
      const r = await lxapi.songListDetail(pl.id, 1, pl.source || 'wy');
      const songs = r.list || [];
      if (!songs.length) { toast('歌单内容获取失败'); return; }
      hdNav()?.navigate('PlaylistDetail', { title: pl.name, songs, meta: `${pl.total || songs.length} 首 · ${pl.author || '推荐歌单'}` });
    } catch { toast('歌单内容获取失败'); }
  };

  const localFavCount = localPls.find(p => p.name === '我喜欢的')?.songs.length ?? 0;
  const favCount = snap && snap.loveList ? snap.loveList.length : localFavCount;
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 26, paddingBottom: 28, gap: SP.section }}
      showsVerticalScrollIndicator={false}
    >
      {/* [HTML01 1120] dense-intro:问候 h1 26/600/-.8 + 全部/音乐/播客 pills(h36 r999 on=brand/#111214 off=surface/text2)——组合层 home-cards.js */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ color: C.text, fontSize: IS_WEB ? 26 : 20, fontWeight: '600', letterSpacing: -0.8 }}>{greet}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['全部', '音乐', '播客'] as const).map(t => (
            <HDTouch key={t} style={{ paddingHorizontal: 18, height: IS_WEB ? 36 : 30, borderRadius: 999, backgroundColor: homeTab === t ? C.brand : C.surface, alignItems: 'center', justifyContent: 'center' }}
              focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 999 }}
              onPress={() => { if (t === '播客') { hdNav()?.navigate('Tabs' as never) || hdNav()?.navigate('PodcastTab' as never); return; } setHomeTab(t); }}>
              <Text style={{ color: homeTab === t ? '#111214' : C.text2, fontSize: IS_WEB ? 14 : 11.5, fontWeight: homeTab === t ? '600' : '500' }}>{t}</Text>
            </HDTouch>
          ))}
        </View>
      </View>

            {/* [HTML01 1120] home-highlights:1.5fr daily-feature(200h r18 bg#142A26/kicker 11/题36-600/副14/左下白丸播放钮) + 1fr listening-picks 2×2 */}
      {homeTab === '全部' ? (
      <View style={{ flexDirection: 'row', gap: IS_WEB ? 16 : 12 }}>
        <HDTouch activeOpacity={0.92} onPress={playDaily} zoom={1.01}
          focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 18 }}
          style={{ flex: 1.5, height: IS_WEB ? 200 : 152, borderRadius: 18, overflow: 'hidden', backgroundColor: '#142A26', borderWidth: 1, borderColor: 'rgba(255,255,255,.05)' }}>
          {recPls[0]?.img ? <Image source={{ uri: recPls[0].img }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" /> : null}
          <LinearGradient colors={['rgba(16,37,30,0.94)', 'rgba(24,40,32,0.46)', 'rgba(24,40,32,0.03)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingTop: IS_WEB ? 25 : 19, paddingLeft: IS_WEB ? 28 : 21, paddingBottom: IS_WEB ? 62 : 48 }}>
            <Text style={{ color: '#D8E7DE', fontSize: IS_WEB ? 11 : 9, letterSpacing: 1.1 }}>{dailyBusy ? '正在准备今天的音乐…' : '每天更新 · 30 首精选'}</Text>
            <Text style={{ color: '#FFFFFF', fontSize: IS_WEB ? 36 : 27, fontWeight: '600', letterSpacing: -2, marginTop: IS_WEB ? 10 : 8 }}>每日精选</Text>
            <Text style={{ color: '#E2E9E3', fontSize: IS_WEB ? 14 : 11, marginTop: 8 }}>让好音乐，成为今天的好心情。</Text>
          </View>
          <View style={{ position: 'absolute', left: IS_WEB ? 28 : 21, bottom: IS_WEB ? 24 : 18, flexDirection: 'row', alignItems: 'center', gap: 8, height: IS_WEB ? 34 : 27, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#F1F5ED' }}>
            {dailyBusy ? <ActivityIndicator size="small" color="#172B20" /> : <Icon name="play" size={IS_WEB ? 15 : 12} active color="#172B20" />}
            <Text style={{ color: '#172B20', fontSize: IS_WEB ? 12 : 10, fontWeight: '600' }}>播放精选</Text>
          </View>
        </HDTouch>
        <View style={{ flex: 1, gap: IS_WEB ? 14 : 11 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: IS_WEB ? 14 : 11 }}>
            <ListeningPick img={recPls[2]?.img} title="私人雷达" sub="发现新的喜欢" onPress={playRadar} />
            <ListeningPick img={recPls[1]?.img} title="我的收藏" sub={favCount + ' 首心动'} onPress={() => hdNav()?.navigate('MyFavorites')} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: IS_WEB ? 14 : 11 }}>
            <ListeningPick img={recPls[4]?.img} title="华语经典" sub="熟悉的好声音" onPress={() => playMood('华语经典 金曲', '华语经典')} />
            <ListeningPick img={recPls[5]?.img} title="最近播放" sub={recents.length + ' 首收听记录'} onPress={() => recents.length ? hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: recents.length + ' 首' }) : toast('还没有播放记录,先去探索几首吧')} />
          </View>
        </View>
      </View>
      ) : null}


      {/* [HTML01 1120] 为你推荐:density-wall(min145 auto-fit gap12;卡=r15壳/封面aspect1.12 r8/nm14-600/ar10)——home-cards.js recommendations();音乐 tab=每日精选 4 卡 */}
      <Section title={homeTab === '音乐' ? '每日精选' : '为你推荐'} hint={homeTab === '音乐' ? '熟悉的旋律，每天更新' : (recSource ? '五源聚合 · ' + recSource : '五源聚合')} more="更多" onMore={() => onGotoSearch?.()}>
        {recPls.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 12 : 9 }}>
            {recPls.slice(0, homeTab === '音乐' ? 4 : 6).map(pl => (
              <View key={pl.source + '_' + pl.id} style={{ flexBasis: '16%', minWidth: IS_WEB ? 145 : 112, flexGrow: 1 }}>
                <RecommendCard pl={pl} onOpen={() => openRecPl(pl)} onPlay={() => openRecPl(pl)} />
              </View>
            ))}
          </View>
        ) : (
          <View style={st.empty}>
            <Text style={st.emptyText}>{recFail ? '推荐歌单加载失败 · 音源无响应' : '推荐歌单加载中…'}</Text>
            {recFail ? <HDTouch style={st.retryBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 999 }} onPress={loadRec}><Text style={st.retryText}>重试</Text></HDTouch> : null}
          </View>
        )}
      </Section>





      {/* [HTML01 1120] home-panels:4fr 我的歌单(mini-library:我喜欢的+心形瓦+歌单×3) + 3fr 最近播放(recent-song-grid×3/空态)——personalPanels() */}
      <View style={{ flexDirection: 'row', gap: IS_WEB ? 28 : 20, marginTop: IS_WEB ? 21 : 16 }}>
        <View style={{ flex: 4, gap: SP.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
            <Text style={st.secTitle}>我的歌单</Text>
            <View style={{ flex: 1 }} />
            <HDTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 8 }} onPress={() => hdNav()?.navigate('MyLibrary' as never)}><Text style={st.secMore}>查看全部 ›</Text></HDTouch>
          </View>
          <View style={{ flexDirection: 'row', gap: IS_WEB ? 12 : 9 }}>
            <MiniPlaylist heart name="我喜欢的" count={favCount} img={localPls.find(p => p.name === '我喜欢的')?.songs[0]?.img} onPress={() => hdNav()?.navigate('MyFavorites')} />
            {playlists.slice(0, 3).map(pl => <MiniPlaylist key={pl.key} name={pl.name} count={pl.count} img={pl.img} onPress={() => openPl(pl)} />)}
          </View>
        </View>
        <View style={{ flex: 3, gap: SP.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
            <Text style={st.secTitle}>最近播放</Text>
            <View style={{ flex: 1 }} />
            <HDTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 8 }} onPress={() => recents.length && hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: recents.length + ' 首' })}><Text style={st.secMore}>全部记录 ›</Text></HDTouch>
          </View>
          {recents.length ? (
            <View style={{ gap: 4 }}>
              {recents.slice(0, 3).map((s, i) => <RecentRow key={s.source + '_' + s.songmid + '_' + i} s={s} onPress={() => playSong(s, recents)} />)}
            </View>
          ) : (
            <View style={{ minHeight: IS_WEB ? 110 : 88, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 }}>
              <Icon name="music" size={20} color={C.text3} />
              <Text style={{ color: C.text, fontSize: IS_WEB ? 15 : 12, fontWeight: '600' }}>从一首喜欢的歌开始</Text>
              <Text style={{ color: C.text3, fontSize: IS_WEB ? 12 : 10 }}>听过的音乐，会在这里等你</Text>
            </View>
          )}
        </View>
      </View>

                       <FocusBridge active />
      </ScrollView>
  );
}

// 桌面 BigCard:渐变 + 左徽标 + 标题/副标题 + 右圆钮
// v6(老板反馈):选中环圆角要比卡片圆角大(卡片 R=11,环=13)——描边画在卡边界外 2px,圆角同步 +2 才贴着弯过去
// v1.2.5 桌面:web 加高(104)+彩色弥散投影+hover 上浮(主题/投影跟色系);TV 分支尺寸不变
/** [HTML01 1120] ListeningPick:listening-pick 竖卡——pad 17/82/17/18 图 58 右侧居中 r10 题 15/600 副 12 text3(home-highlights 右列) */
function ListeningPick({ img, title, sub, onPress }: { img?: string; title: string; sub: string; onPress: () => void }) {
  return (
    <HDTouch activeOpacity={0.92} onPress={onPress} zoom={1.01}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: IS_WEB ? 18 : 14, paddingRight: IS_WEB ? 82 : 64, paddingVertical: IS_WEB ? 17 : 13, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)' }}>
      <View style={{ flex: 1, minWidth: 0, gap: IS_WEB ? 8 : 6 }}>
        <Text style={{ color: C.text, fontSize: IS_WEB ? 15 : 12, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: C.text3, fontSize: IS_WEB ? 12 : 10 }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ position: 'absolute', right: IS_WEB ? 13 : 10, top: 0, bottom: 0, justifyContent: 'center' }}>
        <View style={{ width: IS_WEB ? 58 : 46, height: IS_WEB ? 58 : 46, borderRadius: 10, overflow: 'hidden', backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }}>
          {img ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={18} color={C.text3} />}
        </View>
      </View>
    </HDTouch>
  );
}

/** [HTML01 1120] RecommendCard:density-wall 推荐卡——r15 卡壳/封面 aspect1.12 r8/nm14-600/ar10 text3/右下小绿播放钮(原生恒显,web hover 语义) */
function RecommendCard({ pl, onOpen, onPlay }: { pl: SongListMeta; onOpen: () => void; onPlay: () => void }) {
  return (
    <HDTouch activeOpacity={0.95} onPress={onOpen} zoom={1.02}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }}
      style={{ flex: 1, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)', padding: IS_WEB ? 8 : 6, paddingBottom: IS_WEB ? 10 : 8 }}>
      <View style={{ position: 'relative' }}>
        <View style={{ width: '100%', aspectRatio: 1.12, borderRadius: 8, overflow: 'hidden', backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }}>
          {pl.img ? <Image source={{ uri: pl.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={20} color={C.text3} />}
        </View>
        <HDTouch style={{ position: 'absolute', right: IS_WEB ? 6 : 5, bottom: IS_WEB ? 6 : 5, width: IS_WEB ? 28 : 22, height: IS_WEB ? 28 : 22, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}
          focusStyle={{ borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 14 }} onPress={onPlay}>
          <Icon name="play" size={IS_WEB ? 13 : 10} color={C.onBrand} />
        </HDTouch>
      </View>
      <Text style={{ color: C.text, fontSize: IS_WEB ? 14 : 11, fontWeight: '600', marginTop: IS_WEB ? 10 : 8 }} numberOfLines={1}>{pl.name}</Text>
      <Text style={{ color: C.text3, fontSize: IS_WEB ? 10 : 8.5, marginTop: 5 }} numberOfLines={1}>{pl.author || pl.source || '推荐歌单'}</Text>
    </HDTouch>
  );
}

/** [HTML01 1120] MiniPlaylist:mini-library 歌单瓦——cover h79 全宽(心形角标)+b14/550+small12「N 首歌曲」 */
function MiniPlaylist({ img, name, count, heart, onPress }: { img?: string; name: string; count: number; heart?: boolean; onPress: () => void }) {
  return (
    <HDTouch activeOpacity={0.95} onPress={onPress} zoom={1.02}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }}
      style={{ flex: 1, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
      <View style={{ position: 'relative', height: IS_WEB ? 79 : 62, backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }}>
        {img ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={20} color={C.text3} />}
        {heart ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.25)' }}><Icon name="heart" size={IS_WEB ? 22 : 17} color="#FFFFFF" active /></View> : null}
      </View>
      <View style={{ paddingLeft: IS_WEB ? 13 : 10, paddingRight: IS_WEB ? 13 : 10, paddingTop: IS_WEB ? 11 : 8, paddingBottom: IS_WEB ? 13 : 10, gap: 6 }}>
        <Text style={{ color: C.text, fontSize: IS_WEB ? 14 : 11, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: C.text2, fontSize: IS_WEB ? 12 : 10 }} numberOfLines={1}>{count} 首歌曲</Text>
      </View>
    </HDTouch>
  );
}

/** [HTML01 1120] RecentRow:recent-song 行——h40/img34 r5/b14-600/small12 text2(最近播放列) */
function RecentRow({ s, onPress }: { s: SongItem; onPress: () => void }) {
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: IS_WEB ? 40 : 34, padding: IS_WEB ? 7 : 5, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)' }}>
      <View style={{ width: IS_WEB ? 34 : 27, height: IS_WEB ? 34 : 27, borderRadius: 5, overflow: 'hidden', backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }}>
        {s.img ? <Image source={{ uri: s.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={12} color={C.text3} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: C.text, fontSize: IS_WEB ? 14 : 11, fontWeight: '600' }} numberOfLines={1}>{s.name}</Text>
        <Text style={{ color: C.text2, fontSize: IS_WEB ? 12 : 10 }} numberOfLines={1}>{s.singer}</Text>
      </View>
    </HDTouch>
  );
}




function BigCard({ colors, badge, title, sub, onPress, busy, wide }: { colors: [string, string]; badge: string; title: string; sub: string; onPress: () => void; busy?: boolean; wide?: boolean }) { // [产品包HD] wide=SELECT 全宽款(批2 起被 PhotoCard 替代调用)
  const [hov, setHov] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<React.ComponentRef<typeof View> | null>(null); // v3.28:ref 实例类型
  useEffect(() => {
    const el = elRef.current as unknown as HTMLElement | null;
    if (el && el.classList) el.classList.add('nm-card');
  }, []);
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`; };
  const webSh: Record<string, unknown> | null = null; // 1028 老板令(去投影):双大卡彩色 hover 影退役(与全站去投影令一致)
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress} zoom={1.04}
      ref={elRef as never}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.card + 2 }}
      style={{ flex: 1, height: IS_WEB ? 104 : 88, borderRadius: H.radius.card, ...(IS_WEB ? st.bigCardWeb : {}), ...(webSh || {}), ...(hov && IS_WEB ? { transform: [{ translateY: -3 }] } : {}) }}
      {...(IS_WEB ? { onHoverIn: () => { t.current && clearTimeout(t.current); t.current = setTimeout(() => setHov(true), 80); }, onHoverOut: () => { t.current && clearTimeout(t.current); setHov(false); } } as Record<string, unknown> : {})}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.bigBg} />
      <View style={st.big}>
        {/* 1028 老板令(彩色卡恒白·终局修):行内恒白叠加——无论样式层哪层被主题污染,最终恒白(DOM 实证定位) */}
        <Text style={[st.bigBadge, { color: '#ffffffcc' }]}>{badge}</Text>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
          <Text style={[st.bigTitle, { color: '#FFFFFF' }]} numberOfLines={1}>{title}</Text>
          <Text style={[st.bigSub, { color: '#ffffffa8' }]} numberOfLines={1}>{sub}</Text>
        </View>
        <View style={st.bigPlay}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="play" size={11} color="#fff" />}
        </View>
      </View>
    </HDTouch>
  );
}

function Section({ title, hint, more, onMore, children }: { title: string; hint?: string; more?: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ gap: SP.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
        <Text style={st.secTitle}>{title}</Text>
        {hint ? <Text style={st.secHint}>{hint}</Text> : null}
        <View style={{ flex: 1 }} />
        {more ? <HDTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 8 }} onPress={onMore}><Text style={st.secMore}>{more} ›</Text></HDTouch> : null}
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  retryBtn: { marginTop: 10, borderRadius: 999, paddingHorizontal: 20, height: 30, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: C.text2, fontSize: H.font.sm },
  screen: { flex: 1, backgroundColor: C.bg },
  // 批3:设计 h1 36/700/-1px
  greet: { color: C.text, fontSize: IS_WEB ? 36 : H.font.hero, fontWeight: FW.heavy, letterSpacing: -1 },
  bigBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: H.radius.card },
  // v1.2.6:web 圆角真修——react-native-linear-gradient 在 RNW 不吃 borderRadius(实测卡角方形),
  // 卡根 overflow hidden 直接裁(老板:每日推荐/私人雷达圆角没有了);TV 不动(原生正常)
  bigCardWeb: { overflow: 'hidden' as const, borderRadius: 12 },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: SP.xxl, borderRadius: H.radius.card },
  bigBadge: { color: '#ffffffcc', fontSize: FS.sm, fontWeight: FW.bold, opacity: 0.9 }, // [1012 回滚] 渐变卡=自含深色面,白字系为设计意图(audit 把透明渐变下的页面底误判成卡片底) // 数字退层级(原 18px 压过标题)
  bigTitle: { color: C.white, fontSize: H.font.xl, fontWeight: FW.heavy, letterSpacing: -.3 },
  bigSub: { color: '#ffffffa8', fontSize: H.font.sm, marginTop: 2 }, // [1012 回滚] 同上
  bigPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.35)' },
  // 批3:设计 22/650/-0.5
  secTitle: { color: C.text, fontSize: IS_WEB ? 22 : H.font.xl, fontWeight: FW.bold, letterSpacing: -0.5 },
  secHint: { color: C.text3, fontSize: H.font.xs },
  secMore: { color: C.brand, fontSize: H.font.sm },
  // v6(老板反馈):环必须贴附卡片几何——环宽=封面宽(去水平 padding),环圆角=封面圆角+2(描边外扩 2px,圆角同步外放才不显小)
  recCard: { width: 92, gap: SP.xs, paddingBottom: 4, borderRadius: 9, backgroundColor: C.surface }, // lx98:去 overflow(米电视丢重绘=内容消失);圆角由封面自带
  recArt: { width: '100%', aspectRatio: 1, borderRadius: 9 },
  recName: { color: C.text, fontSize: H.font.xs, fontWeight: FW.medium },
  recSub: { color: C.text3, fontSize: FS.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl },
  // 卡片内文字离边留气口(老板反馈:文字太贴边,左右和底部缺 padding)
  plCard: { width: '100%', gap: SP.sm, paddingBottom: 7, borderRadius: 12, backgroundColor: C.surface },
  plCardSm: { gap: SP.xs, paddingBottom: 4 },
  plMask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.38)', borderTopLeftRadius: 12, borderTopRightRadius: 12 }, // 跟随封面容器高度(原写死 126,响应式卡宽≠126 时遮罩短一截)
  plPlay: { position: 'absolute', right: 7, bottom: 7, width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }, // lx98:去 overflow;顶角由封面带
  plArt: { width: '100%', aspectRatio: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  plCount: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, height: 16, justifyContent: 'center' }, // 显式高度防 absolute 拉伸(zoom 下胶囊曾撑满封面高)
  plCountText: { color: C.white, fontSize: FS.xs },
  plCountWeb: { top: 6, right: 6, bottom: undefined, borderRadius: 999, paddingHorizontal: 6, backgroundColor: 'rgba(0,0,0,.58)', height: 18, justifyContent: 'center' },
  plName: { color: C.text, fontSize: H.font.sm, fontWeight: FW.semibold },
  plArtFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  plVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9 },
  plTextsOverlay: { position: 'absolute', left: 8, right: 8, bottom: 7 },
  plNameOnArt: { color: C.white, fontSize: H.font.sm, fontWeight: FW.bold },
  recSubOnArt: { color: '#FFFFFFCC', fontSize: FS.xs },
  plTexts: { alignSelf: 'stretch', paddingHorizontal: 8, gap: SP.xs },
  empty: { height: 64, borderRadius: H.radius.card, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: SP.md, flexDirection: 'row', paddingHorizontal: 14 },
  emptyText: { color: C.text3, fontSize: H.font.sm },
});


// v1.2.4 D1 A1b + v1.2.5 视觉保真(仅 web):歌单卡——彩色弥散投影(RNW 靠 shadow* 四件套,
// shadowStyleOf 的 elevation 在 web 不渲染)+hover 上浮/投影加深(.nm-card CSS 过渡)+封面遮罩+
// 右下 44px 绿圆播放钮(150ms ease-out 上浮);点钮=播放全部,点卡其余=进详情。TV 不渲染本组件
function PlCardWeb({ pl, width, compact, onOpen, onPlay }: { pl: { name: string; img?: string; count?: number; author?: string; play_count?: string }; width?: number; compact?: boolean; onOpen: () => void; onPlay: () => void }) {
  const [hov, setHov] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<React.ComponentRef<typeof View> | null>(null); // v3.28:ref 实例类型 // RNW View ref=DOM(坑131)——挂 .nm-card 过渡类
  const maskRef = useRef<React.ComponentRef<typeof View> | null>(null) // v3.28:ref 实例类型; // v1.2.11 动效规范:遮罩/播放钮 150ms ease(原为瞬变)
  const playRef = useRef<React.ComponentRef<typeof View> | null>(null) // v3.28:ref 实例类型;
  useEffect(() => {
    const el = elRef.current as unknown as HTMLElement | null;
    if (el && el.classList) el.classList.add('nm-card');
    for (const r of [maskRef, playRef]) {
      const c = r.current as unknown as HTMLElement | null;
      if (c && c.style) c.style.transition = 'opacity .15s ease, transform .15s ease';
    }
  }, []);
  const shadow = webCardShadow(pl.name || 'pl', hov);
  return (
    <HDTouch
      ref={elRef as never}
      style={[st.plCard, compact && st.plCardSm, width != null && { width }, shadow, hov && { transform: [{ translateY: -3 }, { scale: 1.02 }] }]}
      zoom={1.06} onPress={onOpen}
      {...({ onHoverIn: () => { t.current && clearTimeout(t.current); t.current = setTimeout(() => setHov(true), 80); }, onHoverOut: () => { t.current && clearTimeout(t.current); setHov(false); } } as Record<string, unknown>)}>
      <View style={{ position: 'relative' }}>
        {pl.img
          ? <Image source={{ uri: pl.img }} style={st.plArt} />
          : <View style={[st.plArt, { backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
        {pl.count != null ? <View style={[st.plCount, IS_WEB && st.plCountWeb]}><Text style={[st.plCountText, { color: '#FFFFFF' }]}>▶ {pl.count}</Text></View> : null}
        {/* A1b 遮罩+播放钮(compact 模式 32px,标准 44px) */}
        <View ref={maskRef} pointerEvents={hov ? 'auto' : 'none'} style={[st.plMask, { opacity: hov ? 1 : 0 }]} />
        <HDTouch ref={playRef} style={[st.plPlay, compact && { width: 32, height: 32, borderRadius: 16 }, { opacity: hov ? 1 : 0, transform: [{ translateY: hov ? 0 : 6 }] }]} onPress={onPlay}>
          <Icon name="play" size={compact ? 13 : 17} color={C.onBrand} />
        </HDTouch>
      </View>
      <View style={st.plTexts}>
        <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
        {pl.author || pl.play_count ? <Text style={st.recSub} numberOfLines={1}>{pl.author || (pl.play_count ? `▶ ${pl.play_count}` : '')}</Text> : null}
      </View>
    </HDTouch>
  );
}
