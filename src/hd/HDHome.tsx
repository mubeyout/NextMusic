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
    if (connected && token) sync.fetchLists().then(setSnap).catch(() => {});
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
      if (list.length) { playSong(list[0], list.slice(0, 30)); toast(`每日推荐 · ${Math.min(30, list.length)} 首`); }
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
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 26, paddingBottom: 28, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={st.greet}>Hi,{greet}{connected && snap ? ',Mubey' : ''}</Text>

      {/* 双大卡 */}
      <View style={{ flexDirection: 'row', gap: 22 }}> /* v3.30(LEO P1):双大卡间距 12→22(GUTTER) */
        <BigCard colors={['#7C4DFF', '#3F8CFF']} badge="30" title="每日推荐" sub="根据你的口味生成 · 每天 6:00 更新" busy={dailyBusy} onPress={playDaily} />
        <BigCard colors={['#0FA3A3', '#1ED760']} badge="雷达" title="私人雷达" sub="你循环过的歌,都在这里重逢" onPress={playRadar} />
      </View>

      {recents.length ? (
        <Section title="最近播放" more="查看全部" onMore={() => hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` })}>
          {/* 最近播放(lx88:横向 ScrollView 会裁切 zoom 溢出——小卡去 zoom 只留环;lx92:左右 padding 4 留出环的 2px 外溢,首尾卡选中不裁) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: 10, paddingLeft: 26, paddingRight: 12, paddingTop: IS_WEB ? 10 : 6, paddingBottom: IS_WEB ? 26 : 16 }}>
            {recents.slice(0, 8).map((s, i) => (
              IS_WEB ? (
                <PlCardWeb key={`${s.source}_${s.songmid}_${i}`} width={96} compact
                  pl={{ name: s.name, img: s.img, author: s.singer }}
                  onOpen={() => playSong(s, recents)} onPlay={() => playSong(s, recents)} />
              ) : (
              <HDTouch key={`${s.source}_${s.songmid}_${i}`} style={[st.recCard, shadowStyleOf(s.name)]} onPress={() => playSong(s, recents)}
                focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 11 }}>
                {s.img ? <Image source={{ uri: s.img }} style={st.recArt} />
                  : <View style={[st.recArt, { backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={14} color={C.text3} /></View>}
                <View style={st.plTexts}>
                  <Text style={st.recName} numberOfLines={1}>{s.name}</Text>
                  <Text style={st.recSub} numberOfLines={1}>{s.singer}</Text>
                </View>
              </HDTouch>
              )
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* 推荐歌单(五源聚合,单行横滑 lx131) */}
      <Section title="推荐歌单" hint={recSource ? `五源聚合 · ${recSource}` : '五源聚合'} more="更多" onMore={() => onGotoSearch?.()}>
        {recPls.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: 12, paddingLeft: 26, paddingRight: 12, paddingTop: IS_WEB ? 10 : 6, paddingBottom: IS_WEB ? 26 : 16 }}>
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

      {/* 我的歌单 */}
      <Section title="我的歌单" hint={`${playlists.length} 个`} more="更多" onMore={() => hdNav()?.navigate('ImportPlaylist')}>
        {playlists.length ? (
          <HDGrid min={126 * (H.font.sm / 10)}>
            {playlists.slice(0, 10).map(pl => (
              IS_WEB ? (
                <PlCardWeb key={pl.key} pl={pl} onOpen={() => openPl(pl)} onPlay={() => { if (pl.songs?.length) playSong(pl.songs[0], pl.songs); }} />
              ) : (
              <HDTouch key={pl.key} style={[st.plCard, shadowStyleOf(pl.name)]} zoom={1.06} onPress={() => openPl(pl)}>
                <View style={{ position: 'relative' }}>
                  {pl.img
                    ? <Image source={{ uri: pl.img }} style={st.plArt} />
                    : <View style={[st.plArt, { backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
                  <View style={st.plCount}><Text style={st.plCountText}>▶ {pl.count}</Text></View>
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
function BigCard({ colors, badge, title, sub, onPress, busy }: { colors: [string, string]; badge: string; title: string; sub: string; onPress: () => void; busy?: boolean }) {
  const [hov, setHov] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<React.ComponentRef<typeof View> | null>(null); // v3.28:ref 实例类型
  useEffect(() => {
    const el = elRef.current as unknown as HTMLElement | null;
    if (el && el.classList) el.classList.add('nm-card');
  }, []);
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`; };
  const webSh: Record<string, unknown> | null = IS_WEB ? {
    shadowColor: rgb(colors[1]), shadowOffset: { width: 0, height: hov ? 14 : 8 },
    shadowOpacity: hov ? 0.42 : 0.26, shadowRadius: hov ? 26 : 16,
  } : null;
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress} zoom={1.04}
      ref={elRef as never}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.card + 2 }}
      style={{ flex: 1, height: IS_WEB ? 104 : 88, borderRadius: H.radius.card, ...(IS_WEB ? st.bigCardWeb : {}), ...(webSh || {}), ...(hov && IS_WEB ? { transform: [{ translateY: -3 }] } : {}) }}
      {...(IS_WEB ? { onHoverIn: () => { t.current && clearTimeout(t.current); t.current = setTimeout(() => setHov(true), 80); }, onHoverOut: () => { t.current && clearTimeout(t.current); setHov(false); } } as Record<string, unknown> : {})}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.bigBg} />
      <View style={st.big}>
        <Text style={st.bigBadge}>{badge}</Text>
        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
          <Text style={st.bigTitle} numberOfLines={1}>{title}</Text>
          <Text style={st.bigSub} numberOfLines={1}>{sub}</Text>
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
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
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
  greet: { color: C.text, fontSize: H.font.hero, fontWeight: '800' },
  bigBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: H.radius.card },
  // v1.2.6:web 圆角真修——react-native-linear-gradient 在 RNW 不吃 borderRadius(实测卡角方形),
  // 卡根 overflow hidden 直接裁(老板:每日推荐/私人雷达圆角没有了);TV 不动(原生正常)
  bigCardWeb: { overflow: 'hidden' as const, borderRadius: 12 },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 13, borderRadius: H.radius.card },
  bigBadge: { color: '#ffffffcc', fontSize: 11, fontWeight: '700', opacity: 0.9 }, // 数字退层级(原 18px 压过标题)
  bigTitle: { color: '#fff', fontSize: H.font.xl, fontWeight: '800', letterSpacing: -.3 },
  bigSub: { color: '#ffffffa8', fontSize: H.font.sm, marginTop: 2 },
  bigPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.35)' },
  secTitle: { color: C.text, fontSize: H.font.xl, fontWeight: '700' },
  secHint: { color: C.text3, fontSize: H.font.xs },
  secMore: { color: C.brand, fontSize: H.font.sm },
  // v6(老板反馈):环必须贴附卡片几何——环宽=封面宽(去水平 padding),环圆角=封面圆角+2(描边外扩 2px,圆角同步外放才不显小)
  recCard: { width: 92, gap: 4, paddingBottom: 4, borderRadius: 9, backgroundColor: C.surface }, // lx98:去 overflow(米电视丢重绘=内容消失);圆角由封面自带
  recArt: { width: '100%', aspectRatio: 1, borderRadius: 9 },
  recName: { color: C.text, fontSize: H.font.xs, fontWeight: '500' },
  recSub: { color: C.text3, fontSize: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // 卡片内文字离边留气口(老板反馈:文字太贴边,左右和底部缺 padding)
  plCard: { width: '100%', gap: 5, paddingBottom: 7, borderRadius: 12, backgroundColor: C.surface },
  plCardSm: { gap: 3, paddingBottom: 4 },
  plMask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.38)', borderTopLeftRadius: 12, borderTopRightRadius: 12 }, // 跟随封面容器高度(原写死 126,响应式卡宽≠126 时遮罩短一截)
  plPlay: { position: 'absolute', right: 7, bottom: 7, width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }, // lx98:去 overflow;顶角由封面带
  plArt: { width: '100%', aspectRatio: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  plCount: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, height: 16, justifyContent: 'center' }, // 显式高度防 absolute 拉伸(zoom 下胶囊曾撑满封面高)
  plCountText: { color: '#fff', fontSize: 8 },
  plCountWeb: { top: 6, right: 6, bottom: undefined, borderRadius: 999, paddingHorizontal: 6, backgroundColor: 'rgba(0,0,0,.58)', height: 18, justifyContent: 'center' },
  plName: { color: C.text, fontSize: H.font.sm, fontWeight: '600' },
  plArtFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  plVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9 },
  plTextsOverlay: { position: 'absolute', left: 8, right: 8, bottom: 7 },
  plNameOnArt: { color: '#FFFFFF', fontSize: H.font.sm, fontWeight: '700' },
  recSubOnArt: { color: '#FFFFFFCC', fontSize: 8 },
  plTexts: { alignSelf: 'stretch', paddingHorizontal: 8, gap: 3 },
  empty: { height: 64, borderRadius: H.radius.card, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'row', paddingHorizontal: 14 },
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
        {pl.count != null ? <View style={[st.plCount, IS_WEB && st.plCountWeb]}><Text style={st.plCountText}>▶ {pl.count}</Text></View> : null}
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
