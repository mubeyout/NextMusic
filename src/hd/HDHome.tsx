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

  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 26, paddingBottom: 28, gap: SP.section }}
      showsVerticalScrollIndicator={false}
    >
      {/* [产品包HD 批3 1:1] hero:问候36/700/-1 + 副句14 + 右上 MADE FOR YOU 11px/ls2(设计 home-topline 实测) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Text style={st.greet}>{greet}{connected && snap ? ', Mubey' : ''}</Text>
          <Text style={{ color: C.text2, fontSize: IS_WEB ? 14 : H.font.md, marginTop: 6 }}>从熟悉的旋律，开始今天</Text>
        </View>
        <Text style={{ color: C.text3, fontSize: IS_WEB ? 11 : FS.xs, letterSpacing: 2, marginTop: IS_WEB ? 34 : 14 }}>MADE FOR YOU</Text>
      </View>
      {/* [产品包HD 批3] pills 42h/r24:on=#F5F5F5 白底黑字 600,off=#232323/#B3B3B3(设计 home-filters 实测) */}
      <View style={{ flexDirection: 'row', gap: SP.md, marginTop: -6 }}>
        {([['全部', true], ['音乐', false], ['播客', false]] as [string, boolean][]).map(([label, on]) => (
          <HDTouch key={label} style={{ paddingHorizontal: 21, height: IS_WEB ? 42 : 44, borderRadius: 24, backgroundColor: on ? '#F5F5F5' : '#232323', alignItems: 'center', justifyContent: 'center' }}
            focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 24 }}
            onPress={() => { if (label === '播客') hdNav()?.navigate('Tabs' as never) || hdNav()?.navigate('PodcastTab' as never); }}>
            <Text style={{ color: on ? C.bg : C.text2, fontSize: IS_WEB ? 16 : H.font.md, fontWeight: on ? '600' : '500' }}>{label}</Text>
          </HDTouch>
        ))}
      </View>

      {/* [产品包HD 批3 1:1] quick-grid:3列×2行 六快捷行卡(设计 quick-card 92h/图92贴角/题20/副12/透明底) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 12 : SP.md }}>
        <QuickCard img={recPls[0]?.img} title="每日精选" sub="今天的好音乐" busy={dailyBusy} onPress={playDaily} />
        <QuickCard img={recPls[1]?.img} title="我的收藏" sub="每一首都很喜欢" heart onPress={() => hdNav()?.navigate('MyFavorites')} />
        <QuickCard img={recPls[2]?.img} title="私人雷达" sub="发现新的心动" onPress={playRadar} />
        <QuickCard img={recPls[3]?.img} title="夜深人静" sub="放慢一点节奏" onPress={() => playMood('夜深人静 轻音乐', '夜深人静')} />
        <QuickCard img={recPls[4]?.img} title="华语经典" sub="熟悉的好声音" onPress={() => playMood('华语经典 金曲', '华语经典')} />
        <QuickCard img={recPls[5]?.img} title="最近播放" sub="接着上次的旋律" onPress={() => recents.length ? hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` }) : toast('还没有播放记录,先去探索几首吧')} />
      </View>

      {/* [产品包HD 批3 1:1] 为你打造:mix 双大照片卡 244h/kicker/题29/副14/右下52绿钮(设计 mix-card 实测) */}
      <Section title="为你打造" hint="每天都有新的好音乐">
        <View style={{ flexDirection: 'row', gap: IS_WEB ? 18 : SP.big }}>
          <PhotoCard img={recPls[2]?.img || recPls[0]?.img} badge="NEXTMUSIC SELECT" title="私人雷达" sub="根据你的收听偏好推荐" busy={dailyBusy} onPress={playRadar} />
          <PhotoCard img={recPls[3]?.img || recPls[1]?.img} badge="NEXTMUSIC SELECT" title="夜深人静" sub="放慢节奏，听见好音乐" onPress={() => playMood('夜深人静 轻音乐', '夜深人静')} />
        </View>
      </Section>

      {/* [产品包HD] 段序对齐:为你打造→最近播放→推荐歌单→我的歌单 */}
      {recents.length ? (
        <Section title="最近播放" hint="接着上次的旋律 · 为你打造" more="查看全部" onMore={() => hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` })}>
          {/* [产品包HD 批3 1:1] recent-track 行卡 3 列:74h/图52方r7/题16/副13(设计 recent-rail 实测,替换批2 横图网格) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 12 : SP.md }}>
            {recents.slice(0, 6).map((s, i) => (
              <HDTouch key={`${s.source}_${s.songmid}_${i}`} style={{ width: '31.5%', minHeight: IS_WEB ? 74 : 64, flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 13 : SP.md, padding: IS_WEB ? 10 : 8, borderRadius: 10, backgroundColor: C.surface }}
                focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} onPress={() => playSong(s, recents)}>
                <View style={{ width: IS_WEB ? 52 : 44, height: IS_WEB ? 52 : 44, borderRadius: 7, overflow: 'hidden', backgroundColor: C.inset }}>
                  {s.img ? <Image source={{ uri: s.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="music" size={16} color={C.text3} /></View>}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontSize: IS_WEB ? 16 : H.font.lg, fontWeight: FW.semibold }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: '#999999', fontSize: IS_WEB ? 13 : H.font.sm, marginTop: 3 }} numberOfLines={1}>{s.singer}</Text>
                </View>
              </HDTouch>
            ))}
          </View>
        </Section>
        ) : null}
      <Section title="推荐歌单" hint={recSource ? `五源聚合 · ${recSource}` : '五源聚合'} more="更多" onMore={() => onGotoSearch?.()}>
        {recPls.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: SP.xl, paddingLeft: 26, paddingRight: 12, paddingTop: IS_WEB ? 10 : 6, paddingBottom: IS_WEB ? 26 : 16 }}>
            {recPls.slice(0, 10).map(pl => (
              IS_WEB ? (
                <PlCardWeb key={`${pl.source}_${pl.id}`} width={148} pl={pl} onOpen={() => openRecPl(pl)} onPlay={() => openRecPl(pl)} />
              ) : (
              <HDTouch key={`${pl.source}_${pl.id}`} style={[st.plCard, { width: 148 }, shadowStyleOf(pl.name)]} zoom={1.06} onPress={() => openRecPl(pl)}>
                {pl.img
                  ? <Image source={{ uri: pl.img }} style={st.plArt} />
                  : <View style={[st.plArt, { backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
                <View style={st.plTexts}>
                  <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
                  <Text style={st.recSub} numberOfLines={1}>{pl.author || (pl.play_count ? `▶ ${pl.play_count}` : '')}</Text>
                </View>
              </HDTouch>
              )
            ))}
          </ScrollView>
        ) : (
          <View style={st.empty}>
            <Text style={st.emptyText}>{recFail ? '推荐歌单加载失败 · 音源无响应' : '推荐歌单加载中…'}</Text>
            {recFail ? <HDTouch style={st.retryBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 999 }} onPress={loadRec}>
              <Text style={st.retryText}>重试</Text>
            </HDTouch> : null}
          </View>
        )}
      </Section>

      {/* 我的歌单(批3:wall 5列@1920/3列@1280——min 251 实测对设计 product-wall 断点) */}
      <Section title="我的歌单" hint={`${playlists.length} 个`} more="更多" onMore={() => hdNav()?.navigate('ImportPlaylist')}>
        {playlists.length ? (
          <HDGrid min={251}>
            {playlists.slice(0, 10).map(pl => (
              IS_WEB ? (
                <PlCardWeb key={pl.key} pl={pl} onOpen={() => openPl(pl)} onPlay={() => { if (pl.songs?.length) playSong(pl.songs[0], pl.songs); }} />
              ) : (
              <HDTouch key={pl.key} style={[st.plCard, shadowStyleOf(pl.name)]} zoom={1.06} onPress={() => openPl(pl)}>
                <View style={{ position: 'relative' }}>
                  {pl.img
                    ? <Image source={{ uri: pl.img }} style={st.plArt} />
                    : <View style={[st.plArt, { backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
                  <View style={st.plCount}><Text style={[st.plCountText, { color: '#FFFFFF' }]}>▶ {pl.count}</Text></View>
                </View>
                <View style={st.plTexts}>
                  <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
                </View>
              </HDTouch>
              )
            ))}
          </HDGrid>
        ) : (
          <HDTouch style={st.empty} onPress={() => onGotoSearch?.()}>
            <Icon name="search" size={16} color={C.text3} />
            <Text style={st.emptyText}>还没有歌单 —— 去「探索」搜索,或连接服务器同步</Text>
          </HDTouch>
        )}
      </Section>
                       <FocusBridge active />
      </ScrollView>
  );
}

// 桌面 BigCard:渐变 + 左徽标 + 标题/副标题 + 右圆钮
// v6(老板反馈):选中环圆角要比卡片圆角大(卡片 R=11,环=13)——描边画在卡边界外 2px,圆角同步 +2 才贴着弯过去
// v1.2.5 桌面:web 加高(104)+彩色弥散投影+hover 上浮(主题/投影跟色系);TV 分支尺寸不变
/** [产品包HD 批3 1:1] PhotoCard=mix 大照片卡:244h/r14/kicker 11px 底部/题29-700/副14/右下52绿钮 right23 bottom25(设计 mix-card 实测) */
function PhotoCard({ img, badge, title, sub, onPress, busy, wide }: { img?: string; badge: string; title: string; sub: string; onPress: () => void; busy?: boolean; wide?: boolean }) {
  const fallback = ['#3B2F6F', '#24483F'] as [string, string];
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress} zoom={1.02}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }}
      style={[{ height: IS_WEB ? 244 : 170, borderRadius: 14, overflow: 'hidden' }, wide ? { width: '100%' as const } : { flex: 1 }]}>
      {img ? (
        <Image source={{ uri: img }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
      ) : (
        <LinearGradient colors={fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.22)' }} />
      <LinearGradient colors={['rgba(0,0,0,0.03)', 'rgba(0,0,0,0.13)', 'rgba(0,0,0,0.79)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', bottom: 25, left: 25, right: 90, gap: 7 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 11, letterSpacing: 1, fontWeight: '600' }}>{badge}</Text>
        <Text style={{ color: '#FFFFFF', fontSize: IS_WEB ? 29 : 22, fontWeight: FW.heavy, lineHeight: IS_WEB ? 38 : 30 }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: IS_WEB ? 14 : H.font.sm }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ position: 'absolute', right: 23, bottom: 25, width: 52, height: 52, borderRadius: 26, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="play" size={22} active color={C.onBrand} />}
      </View>
    </HDTouch>
  );
}

/** [产品包HD 批3 1:1] QuickCard:快捷行卡——92h/图92贴左角r8/题20-600/副12/透明底(设计 quick-card 实测);
 *  heart=「我的收藏」卡心形角标(#FF5A76) */
function QuickCard({ img, title, sub, onPress, busy, heart }: { img?: string; title: string; sub: string; onPress: () => void; busy?: boolean; heart?: boolean }) {
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress} zoom={1.01}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}
      style={{ width: '31.5%', minHeight: IS_WEB ? 92 : 72, flexDirection: 'row', alignItems: 'center', borderRadius: 10, overflow: 'hidden' }}>
      <View style={{ width: IS_WEB ? 92 : 72, height: IS_WEB ? 92 : 72, backgroundColor: C.surface2, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
        {img ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={22} color={C.text3} />}
        {/* 批3补:quick-heart 角标覆盖图上(设计 absolute left 24 top 24 → 图区,#FF5A76) */}
        {heart ? <View style={{ position: 'absolute', top: IS_WEB ? 32 : 24, left: IS_WEB ? 32 : 24 }}><Icon name="heart" size={16} color="#FF5A76" active /></View> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: IS_WEB ? 16 : 12, gap: 4 }}>
        <Text style={{ color: C.text, fontSize: IS_WEB ? 20 : H.font.xl, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: C.text2, fontSize: IS_WEB ? 12 : FS.xs }} numberOfLines={1}>{sub}</Text>
      </View>
      {/* 批3补:quick-arrow 尾箭头(设计 #666 18px) */}
      <View style={{ marginRight: IS_WEB ? 12 : 8, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevronright" size={IS_WEB ? 18 : 14} color="#666666" />
      </View>
      {busy ? <ActivityIndicator size="small" color={C.brand} style={{ marginRight: 14 }} /> : null}
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
        {more ? <HDTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} focusStyle={{ borderWidth: 1.5, borderColor: C.brand, borderRadius: 6 }} onPress={onMore}><Text style={st.secMore}>{more} ›</Text></HDTouch> : null}
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
