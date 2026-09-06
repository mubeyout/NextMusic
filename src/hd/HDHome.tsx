// HD 首页 —— 桌面版 HomeScreen 结构:问候 + 双大卡(每日推荐/私人雷达)
// + 最近播放横滚 + 我的歌单网格;全部真数据真播放
import React, { useEffect, useState } from 'react';
import { FocusBridge } from './HDMain';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H, SH, shadowStyleOf } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDGrid } from './HDGrid';
import { usePlayer } from '../state/PlayerProvider';
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

  useEffect(() => {
    lxapi.songListAuto('', '5', 1, 18).then(r => {
      setRecPls(r.list); setRecSource(r.source);
      cacheSet('home.recPls', r.list); cacheSet('home.recSource', r.source);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <BigCard colors={['#7C4DFF', '#3F8CFF']} badge="30" title="每日推荐" sub="根据你的口味生成 · 每天 6:00 更新" busy={dailyBusy} onPress={playDaily} />
        <BigCard colors={['#0FA3A3', '#1ED760']} badge="雷达" title="私人雷达" sub="你循环过的歌,都在这里重逢" onPress={playRadar} />
      </View>

      {recents.length ? (
        <Section title="最近播放" more="查看全部" onMore={() => hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` })}>
          {/* 最近播放(lx88:横向 ScrollView 会裁切 zoom 溢出——小卡去 zoom 只留环;lx92:左右 padding 4 留出环的 2px 外溢,首尾卡选中不裁) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: 10, paddingLeft: 26, paddingRight: 12, paddingTop: 6, paddingBottom: 16 }}>
            {recents.slice(0, 8).map((s, i) => (
              <HDTouch key={`${s.source}_${s.songmid}_${i}`} style={[st.recCard, shadowStyleOf(s.name)]} onPress={() => playSong(s, recents)}
                focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 11 }}>
                {s.img ? <Image source={{ uri: s.img }} style={st.recArt} />
                  : <View style={[st.recArt, { backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={14} color={C.text3} /></View>}
                <View style={st.plTexts}>
                  <Text style={st.recName} numberOfLines={1}>{s.name}</Text>
                  <Text style={st.recSub} numberOfLines={1}>{s.singer}</Text>
                </View>
              </HDTouch>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* 推荐歌单(五源聚合,单行横滑 lx131) */}
      <Section title="推荐歌单" hint={recSource ? `五源聚合 · ${recSource}` : '五源聚合'} more="更多" onMore={() => onGotoSearch?.()}>
        {recPls.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: 12, paddingLeft: 26, paddingRight: 12, paddingTop: 6, paddingBottom: 16 }}>
            {recPls.slice(0, 10).map(pl => (
              <HDTouch key={`${pl.source}_${pl.id}`} style={[st.plCard, { width: 148 }, shadowStyleOf(pl.name)]} zoom={1.06} onPress={() => openRecPl(pl)}>
                {pl.img
                  ? <Image source={{ uri: pl.img }} style={st.plArt} />
                  : <View style={[st.plArt, { backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
                <View style={st.plTexts}>
                  <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
                  <Text style={st.recSub} numberOfLines={1}>{pl.author || (pl.play_count ? `▶ ${pl.play_count}` : '')}</Text>
                </View>
              </HDTouch>
            ))}
          </ScrollView>
        ) : (
          <View style={st.empty}>
            <Text style={st.emptyText}>推荐歌单加载中…</Text>
          </View>
        )}
      </Section>

      {/* 我的歌单 */}
      <Section title="我的歌单" hint={`${playlists.length} 个`} more="更多" onMore={() => hdNav()?.navigate('ImportPlaylist')}>
        {playlists.length ? (
          <HDGrid min={126 * (H.font.sm / 10)}>
            {playlists.slice(0, 10).map(pl => (
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
function BigCard({ colors, badge, title, sub, onPress, busy }: { colors: [string, string]; badge: string; title: string; sub: string; onPress: () => void; busy?: boolean }) {
  // lx73:BigCard 尺寸三层一致——渐变 absolute 铺底(fill 外框),内容行叠加其上;
  // 之前渐变做流式子项,width 100% 与 Pressable 互相依赖在 Android 解析为内容宽→环/渐变/外框三层各不相同
  return (
    <HDTouch activeOpacity={0.9} onPress={onPress} zoom={1.04} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.card + 2 }} style={{ flex: 1, height: 88, borderRadius: H.radius.card }}>
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
  screen: { flex: 1, backgroundColor: C.bg },
  greet: { color: C.text, fontSize: H.font.hero, fontWeight: '800' },
  bigBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: H.radius.card },
  big: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 13, borderRadius: H.radius.card },
  bigBadge: { color: '#fff', fontSize: 18, fontWeight: '800', opacity: 0.92 },
  bigTitle: { color: '#fff', fontSize: H.font.xl, fontWeight: '700' },
  bigSub: { color: '#FFFFFFD0', fontSize: H.font.sm, marginTop: 2 },
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
  plCard: { width: '100%', gap: 5, paddingBottom: 7, borderRadius: 12, backgroundColor: C.surface }, // lx98:去 overflow;顶角由封面带
  plArt: { width: '100%', aspectRatio: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  plCount: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  plCountText: { color: '#fff', fontSize: 8 },
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
