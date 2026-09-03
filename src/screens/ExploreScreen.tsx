import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, T, softGrad } from '../theme/tokens';
import { PillTabs } from '../components/PillTabs';
import { SongRow } from '../components/SongRow';
import { useApp } from '../state/AppState';
import { usePlayer } from '../state/PlayerProvider';
import { getRecents } from '../state/recent';
import { activeSources } from '../services/customSource';
import { api, type SongItem, type SongListMeta } from '../services/server';
import { lxapi } from '../services/lxapi';
import { dialog, toast } from '../components/Dialog';

import night from '../assets/art/night.jpg';
import beach from '../assets/art/beach.jpg';
import portrait from '../assets/art/portrait.jpg';
import sky from '../assets/art/sky.jpg';
import city from '../assets/art/city.jpg';
import warm from '../assets/art/warm.jpg';

// 热门主题（推荐 tab，大图卡）：真实歌单封面，点击加载对应分类歌单
const TOPICS = [
  { label: '华语流行', tag: '华语' }, { label: '摇滚', tag: '摇滚' },
  { label: '电子', tag: '电子' }, { label: '轻音乐', tag: '轻音乐' },
  { label: '古典', tag: '古典' }, { label: '运动', tag: '运动' },
];
// 按类型（分类 tab 渐变按钮）：Figma 2356:1222-1239
const GENRES = [
  { zh: '流行', en: 'POP', from: '#852e52', to: '#401438' },
  { zh: '摇滚', en: 'ROCK', from: '#85331a', to: '#33171f' },
  { zh: '电子', en: 'ELECTRONIC', from: '#146b85', to: '#142e52' },
  { zh: '嘻哈', en: 'HIP-HOP', from: '#733894', to: '#241f47' },
  { zh: '爵士', en: 'JAZZ', from: '#1f7a57', to: '#14382e' },
  { zh: '古典', en: 'CLASSICAL', from: '#7a591f', to: '#332414' },
];
// 按场景 / 按语言：Figma 2356:1241-1257
const SCENES = ['通勤', '学习', '运动', '派对', '睡眠', '旅行'];
const LANGS = ['华语', '欧美', '日韩', '拉丁'];
// 榜单子卡槽位（视觉固定，榜单名取真实数据）：Figma 2357:1270-1284
const CHART_SLOTS = [
  { match: /飙升/, caption: '24h 热度变化', tag: '↗ 18%', tagColor: C.brandText, accent: [C.brand, '#591F7A'] },
  { match: /新歌/, caption: '本周新发行', tag: 'NEW', tagColor: C.text2, accent: ['#1FB87A', '#731F66'] },
  { match: /欧美|Billboard|全球/, caption: '32 个地区', tag: 'GLOBAL', tagColor: C.text2, accent: ['#1F9994', '#8C1F52'] },
];

// 榜单卡渐变配色（循环取用）
const BOARD_ACCENTS: [string, string][] = [
  [C.brand, '#1F5E3A'], ['#1F87D6', '#1F3A6E'], ['#B01F87', '#5E1F4E'],
  ['#D67A1F', '#6E3A1F'], ['#871FD6', '#3A1F5E'], ['#1FD6C0', '#1F5E5A'],
];

interface PlaylistCardProps {
  pl: SongListMeta;
  onPress: () => void;
}
// 3 列自适应歌单卡：宽度随屏幕自适应填满
function PlaylistCard({ pl, onPress }: PlaylistCardProps) {
  return (
    <TouchableOpacity style={p.card} activeOpacity={0.8} onPress={onPress}>
      {pl.img ? (
        <Image source={{ uri: pl.img }} style={p.art} />
      ) : (
        <View style={[p.art, p.artFallback]}><Text style={p.glyph}>♫</Text></View>
      )}
      <Text style={p.name} numberOfLines={2}>{pl.name}</Text>
      <Text style={p.meta} numberOfLines={1}>{pl.author || ''}{pl.total ? ` · ${pl.total}首` : ''}</Text>
    </TouchableOpacity>
  );
}
const p = StyleSheet.create({
  card: { width: '31%', gap: 4 },
  art: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  artFallback: { backgroundColor: C.artTint, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: C.text, fontSize: 24, fontWeight: '700' },
  name: { color: C.text, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  meta: { color: C.text2, fontSize: 9, lineHeight: 12 },
});

// Top50 歌曲行：Figma 2357:1287-1311（rank 13 w700 / cover 30 r6 / title 11 w500 / singer 9 / 右侧趋势标签）
// 趋势标识：API 无排名变动数据，按 Figma 1287-1291 前五行样式渲染（↑绿 ↓红 NEW绿 —灰）
const TRENDS = ['↑2', '—', '↑4', '↓1', 'NEW'];
function trendOf(rank: number) {
  const s = TRENDS[rank - 1] || '—';
  return { s, up: s.startsWith('↑') || s === 'NEW', down: s.startsWith('↓') };
}
function TopRow({ rank, song, onPress }: { rank: number; song: SongItem; onPress: () => void }) {
  const hot = rank <= 3;
  const tr = trendOf(rank);
  return (
    <TouchableOpacity style={t.row} activeOpacity={0.75} onPress={onPress}>
      <Text style={[t.rank, hot ? t.rankHot : null]}>{rank}</Text>
      <View style={t.coverWrap}>
        {song.img ? <Image source={{ uri: song.img }} style={t.cover} /> : <View style={[t.cover, t.coverFallback]} />}
      </View>
      <View style={t.meta}>
        <Text style={t.title} numberOfLines={1}>{song.name}</Text>
        <Text style={t.singer} numberOfLines={1}>{song.singer}</Text>
      </View>
      <Text style={[t.trend, hot ? t.trendHot : null, tr.up && t.trendUp, tr.down && t.trendDown]}>{tr.s}</Text>
    </TouchableOpacity>
  );
}
const t = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42 },
  rank: { color: C.text2, fontSize: 13, lineHeight: 16, fontWeight: '700', width: 10, textAlign: 'center' },
  rankHot: { color: C.brandSoft },
  coverWrap: { width: 30, height: 30, borderRadius: 6, overflow: 'hidden' },
  cover: { width: 30, height: 30 },
  coverFallback: { backgroundColor: C.surface2 },
  meta: { flex: 1, gap: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  singer: { color: C.text2, fontSize: 9, lineHeight: 11 },
  trend: { color: C.text2, fontSize: 9, lineHeight: 11, fontWeight: '500' },
  trendHot: { color: C.brandSoft, fontSize: 9, lineHeight: 11, fontWeight: '500' },
  trendUp: { color: C.brandSoft },
  trendDown: { color: '#FF6B81' },
});

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);
  const { playSong, current } = usePlayer();
  const navigation = useNavigation() as { navigate: (s: string, p?: object) => void };

  // 分类 tab：选中的标签（类型/场景/语言）+ 对应歌单
  const [activeTag, setActiveTag] = useState<string>('');
  const [playlists, setPlaylists] = useState<SongListMeta[] | null>(null);
  const [plBusy, setPlBusy] = useState(false);

  // 榜单数据：kg 全部榜单 + TOP50 主榜（Top50 hero/列表），wy 三张子卡
  const [boards, setBoards] = useState<{ id: string; name: string; bangid: string }[]>([]);
  const [wyBoards, setWyBoards] = useState<{ id: string; name: string; bangid: string }[]>([]);
  const [top50, setTop50] = useState<SongItem[]>([]);
  const [boardBusy, setBoardBusy] = useState(false);

  // 推荐 tab：本周精选 = TOP500 前 8；hero 元数据用最近播放数；热门主题真实封面
  const [weekly, setWeekly] = useState<SongItem[]>([]);
  const [recentCount, setRecentCount] = useState(0);
  const [topicCovers, setTopicCovers] = useState<Record<string, SongListMeta[]>>({});
  useEffect(() => { setRecentCount(getRecents().length); }, []);
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const t of TOPICS) {
        try {
          const r = await lxapi.songListAuto(t.tag, '5', 1, 6);
          if (!dead) setTopicCovers(p => ({ ...p, [t.label]: r.list }));
        } catch {}
      }
    })();
    return () => { dead = true; };
  }, []); // 只加载一次（无 deps 会每渲染重跑→请求风暴触发网易 406）

  const openBoard = useCallback(async (b: { name: string; bangid: string }, source = '') => {
    setBoardBusy(true);
    const list = await lxapi.leaderboardList(b.bangid, source).catch(() => [] as SongItem[]);
    setBoardBusy(false);
    if (list.length) navigation.navigate('PlaylistDetail', { title: b.name, songs: list, meta: `${list.length} 首 · 榜单` });
    else toast('榜单加载失败，稍后重试');
  }, [navigation]);

  // 榜单 tab 数据（kg 全量 + wy 子卡 + TOP500）
  useEffect(() => {
    if (tab === 2) {
      if (!boards.length) lxapi.leaderboardBoards().then(setBoards);
      if (!wyBoards.length) lxapi.leaderboardBoards('wy').then(setWyBoards);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // TOP500（默认源第一个）→ 榜单页 Top50 列表 + 推荐 tab 本周精选
  useEffect(() => {
    if (top50.length) return;
    lxapi.leaderboardBoards().then(bs => {
      const top = bs.find(b => /TOP/i.test(b.name)) || bs[0];
      if (!top) return;
      lxapi.leaderboardList(top.bangid).then(list => { setTop50(list); setWeekly(list.slice(0, 8)); });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPlaylists = useCallback(async (tagId: string) => {
    setPlBusy(true); setPlaylists(null);
    try {
      const r = await lxapi.songListAuto(tagId, '5', 1, 30);
      setPlaylists(r.list);
    } catch { setPlaylists([]); }
    finally { setPlBusy(false); }
  }, []);

  const selectTag = (tag: string) => {
    const next = activeTag === tag ? '' : tag;
    setActiveTag(next);
    if (next) loadPlaylists(next === '华语流行' ? '华语' : next);
    else setPlaylists(null);
  };

  const openPlaylist = (pl: SongListMeta) => {
    navigation.navigate('PlaylistDetail', {
      remoteId: pl.id,
      remoteSource: pl.source || 'wy',
      title: pl.name,
      cover: pl.img,
      meta: `${pl.total ?? ''} 首 · ${pl.author || '歌单'}`,
    });
  };

  // 页面顶部渐变随 tab 变化（Figma：推荐跟主题/分类紫/榜单橙）
  // 顶部渐变 tint:深色主题原色直出;浅色主题提亮为明显 pastel(0.62)——
  // 0.91(softGrad 卡片档)太淡看不见(老板实测),原色又吞标题,专用档位折中
  const tintMix = (hex: string): string => {
    if (!T.light) return hex;
    const A = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const B = [255, 255, 255];
    return '#' + A.map((v, i) => Math.round(v * 0.38 + B[i] * 0.62).toString(16).padStart(2, '0')).join('');
  };
  const tints = [C.bgGradientTop, tintMix('#1F1433'), tintMix('#381F0D')];
  const searchHints = ['搜索歌曲、歌手、专辑', '搜索风格、心情或场景', '搜索歌曲、歌手、专辑'];

  // 榜单子卡：从 wy 源找匹配的真实榜单（优先短名，避免卡片文本溢出），找不到则依次回退
  const chartCards = CHART_SLOTS.map((slot, i) => ({
    ...slot,
    board: wyBoards.find(b => slot.match.test(b.name) && b.name.length <= 5) || wyBoards.find(b => slot.match.test(b.name)) || wyBoards[i] || boards[i],
  }));

  return (
    <LinearGradient colors={[tints[tab], C.bg, C.bg]} locations={[0, 0.55, 1]} style={st.screen}>
      <ScrollView
        contentContainerStyle={[st.content, { paddingTop: insets.top + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={st.headerRow}>
          <Text style={[st.title, tab !== 0 && st.titleBig]}>探索</Text>
        </View>

        <PillTabs tabs={['推荐', '分类', '榜单']} active={tab} onChange={setTab} />

        {/* 设计稿：榜单页无搜索栏；分类页搜索框 #2B2B2B、推荐页 #171717 */}
        {/* 搜索入口：点击进入独立搜索页（全键盘体验 + 独立返回） */}
        {tab !== 2 && (
          <TouchableOpacity
            style={[st.searchBox, tab === 1 && st.searchBoxGray]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Search' as never)}
          >
            <Icon name="search" size={20} color={C.text2} />
            <Text style={st.searchPlaceholder}>{searchHints[tab]}</Text>
            <View style={{ flex: 1 }} />
            <Icon name="chevronright" size={18} color={C.text3} />
          </TouchableOpacity>
        )}

        {tab === 0 && (
          <View style={st.body}>
            {/* 为你发现 hero：Figma 2355:1187 */}
            <LinearGradient colors={softGrad('#1A6B54', '#1F387A', '#66297A')} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
              <Text style={st.heroKicker}>为你发现</Text>
              <Text style={st.heroTitle}>夜色电台</Text>
              <Text style={st.heroMeta}>
                {recentCount ? `根据最近收听生成 · ${Math.max(recentCount, 12)} 首` : '根据热门榜单生成 · 50 首'}
              </Text>
              <TouchableOpacity
                style={st.heroPlay}
                onPress={() => { if (top50.length) playSong(top50[0], top50); }}
              >
                <Icon name="play" size={20} color={C.onBrand} />
              </TouchableOpacity>
            </LinearGradient>

            <Text style={st.sectionTitle}>热门主题</Text>
            <View style={st.catGrid}>
              {TOPICS.map(c => {
                const pls = topicCovers[c.label] || [];
                const first = pls[0];
                return (
                  <TouchableOpacity
                    key={c.label}
                    style={st.catCard}
                    activeOpacity={0.85}
                    onPress={() => { setTab(1); setActiveTag(c.label); loadPlaylists(c.tag); }}
                  >
                    {first?.img
                      ? <Image source={{ uri: first.img }} style={st.catArt} />
                      : <View style={[st.catArt, st.catFallback]}><Text style={st.catGlyph}>♫</Text></View>}
                    <View style={st.catShade} />
                    <Text style={st.catLabel}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={st.sectionRow}>
              <Text style={st.sectionTitle}>本周精选</Text>
              <Text style={st.sectionMeta}>{weekly.length ? `共 ${weekly.length} 项` : ''}</Text>
            </View>
            {weekly.length ? (
              weekly.map((s, i) => (
                <SongRow key={s.source + s.songmid + i} song={s}
                  playing={current?.songmid === s.songmid}
                  onPress={() => playSong(s, weekly)} />
              ))
            ) : (
              <Text style={st.errText}>正在加载精选…</Text>
            )}
          </View>
        )}

        {tab === 1 && (
          <View style={st.body}>
            {/* 按类型：渐变卡 3列×2行，宽度自适应（百分比，不写死 px——真机 320dp 下写死 350 会挤成一行一个）
                选中环放在 TouchableOpacity（普通 View）上，不动 LinearGradient 的 style——
                坑：Android 上给 LinearGradient 动态加/去 borderWidth，原生 drawable 不重绘→渐变消失 */}
            <Text style={st.groupTitle}>按类型</Text>
            <View style={st.genreGrid}>
              {GENRES.map(g => (
                <TouchableOpacity
                  key={g.zh}
                  style={[st.genreCell, activeTag === g.zh && st.genreRingOn]}
                  activeOpacity={0.85}
                  onPress={() => selectTag(g.zh)}
                >
                  <LinearGradient
                    colors={softGrad(g.from, g.to)}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={st.genreCard}
                  >
                    <Text style={st.genreZh}>{g.zh}</Text>
                    <Text style={st.genreEn}>{g.en}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>

            {/* 按场景：胶囊 3列×2行，flex 自适应；选中=主色 */}
            <Text style={st.groupTitle}>按场景</Text>
            <View style={st.sceneGrid}>
              {SCENES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[st.scenePill, activeTag === s && st.sceneOn]}
                  activeOpacity={0.85}
                  onPress={() => selectTag(s)}
                >
                  <Text style={[st.sceneLabel, activeTag === s && st.sceneLabelOn]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 按语言：4 个等宽文字标签，选中=主色 */}
            <Text style={st.groupTitle}>按语言</Text>
            <View style={st.langRow}>
              {LANGS.map(l => (
                <TouchableOpacity key={l} style={st.langBtn} activeOpacity={0.85} onPress={() => selectTag(l)}>
                  <Text style={[st.langLabel, activeTag === l && st.langLabelOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 选中标签后的歌单结果 */}
            {activeTag ? (
              <>
                <View style={st.sectionRow}>
                  <Text style={st.sectionTitle}>{activeTag}歌单</Text>
                  <TouchableOpacity onPress={() => { setActiveTag(''); setPlaylists(null); }}>
                    <Text style={st.sectionMeta}>清除筛选</Text>
                  </TouchableOpacity>
                </View>
                {plBusy ? (
                  <View style={st.center}><ActivityIndicator color={C.brand} /></View>
                ) : playlists && playlists.length ? (
                  <View style={st.plGrid}>
                    {playlists.slice(0, 30).map(pl => (
                      <PlaylistCard key={pl.id} pl={pl} onPress={() => openPlaylist(pl)} />
                    ))}
                  </View>
                ) : (
                  <Text style={st.errText}>该分类暂无歌单</Text>
                )}
              </>
            ) : null}
          </View>
        )}

        {tab === 2 && (
          <View style={st.body}>
            {/* TOP50 hero：Figma 2357:1263 */}
            <TouchableOpacity activeOpacity={0.9} onPress={() => {
              const top = boards.find(b => /TOP/i.test(b.name)) || boards[0];
              if (top) openBoard(top);
            }}>
              <LinearGradient colors={softGrad('#AD4714', '#611A2E', '#242E6B')} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.chartHero}>
                <Text style={st.chartHeroKicker}>NEXTMUSIC</Text>
                <Text style={st.chartHeroTitle}>TOP 50</Text>
                <Text style={st.chartHeroMeta}>每日 12:00 更新 · 全站热度</Text>
                <View style={st.rankBadge}><Text style={st.rankBadgeText}>#1</Text></View>
              </LinearGradient>
            </TouchableOpacity>

            {/* 热门榜单 3 子卡：110x92 r12 + 8px 渐变 accent */}
            <Text style={st.groupTitle}>热门榜单</Text>
            <View style={st.chartRow}>
              {chartCards.map((c, i) => c.board ? (
                <TouchableOpacity key={i} style={st.chartCard} activeOpacity={0.85} onPress={() => openBoard(c.board, 'wy')}>
                  <LinearGradient colors={c.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.chartAccent} />
                  <Text style={st.chartName} numberOfLines={1}>{c.board.name}</Text>
                  <Text style={st.chartCaption} numberOfLines={1}>{c.caption}</Text>
                  <Text style={[st.chartTag, { color: c.tagColor }]}>{c.tag}</Text>
                </TouchableOpacity>
              ) : (
                <View key={i} style={st.chartCard} />
              ))}
            </View>

            {/* Top 50 前 5 + 入口：点击进入完整榜 */}
            <View style={st.sectionRow}>
              <Text style={st.sectionTitle}>Top 50</Text>
              <TouchableOpacity onPress={() => {
                const top = boards.find(b => /TOP/i.test(b.name)) || boards[0];
                if (top) openBoard(top);
              }}>
                <Text style={st.sectionMeta}>完整榜 ›</Text>
              </TouchableOpacity>
            </View>
            {top50.length ? (
              top50.slice(0, 5).map((s, i) => (
                <TopRow key={s.source + s.songmid + i} rank={i + 1} song={s}
                  onPress={() => playSong(s, top50)} />
              ))
            ) : (
              <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            )}

            {/* 全部榜单：页内 2列×3行 网格卡 + 查看全部入口（独立榜单广场页） */}
            <View style={st.sectionRow}>
              <Text style={st.sectionTitle}>全部榜单</Text>
              <TouchableOpacity onPress={() => navigation.navigate('BoardsSquare')}>
                <Text style={st.sectionMeta}>查看全部 ›</Text>
              </TouchableOpacity>
            </View>
            <View style={st.boardGrid}>
              {boards.slice(0, 6).map((b, i) => (
                <TouchableOpacity key={b.id} style={st.boardCell} activeOpacity={0.85} onPress={() => openBoard(b)}>
                  <LinearGradient
                    colors={[BOARD_ACCENTS[i % BOARD_ACCENTS.length][0], BOARD_ACCENTS[i % BOARD_ACCENTS.length][1]]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={st.boardCard}
                  >
                    <Text style={st.boardCardName} numberOfLines={2}>{b.name}</Text>
                    <Text style={st.boardCardSub}>酷狗榜</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
            {boardBusy ? (
              <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            ) : null}
          </View>
        )}

      </ScrollView>

    </LinearGradient>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' },
  titleBig: { fontSize: 28, lineHeight: 34 },
  searchBox: {
    height: 44, borderRadius: 22, backgroundColor: C.searchPill,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9,
  },
  searchBoxGray: { backgroundColor: C.surface2 },
  searchPlaceholder: { flex: 1, color: C.text2, fontSize: 12 },
  body: { gap: 10, paddingTop: 10 },
  hero: {
    height: 126, borderRadius: 16, overflow: 'hidden',
    justifyContent: 'center', paddingHorizontal: 18, gap: 4,
  },
  heroKicker: { color: C.text2, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  heroTitle: { color: C.text, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  heroMeta: { color: C.text2, fontSize: 11, lineHeight: 13 },
  heroPlay: {
    position: 'absolute', right: 18, bottom: 18, width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
  },
  groupTitle: { color: C.text, fontSize: 18, lineHeight: 22, fontWeight: '700', marginTop: 6 },
  // 自适应三列：百分比宽度，真机 320dp 内容区也能放下 3 列
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 选中环常驻 borderWidth（未选=透明色），只有 borderColor 变化——杜绝任何 layout 抖动；
  // 渐变卡的 style 恒定不变，规避 LinearGradient 原生重绘 bug
  genreCell: { width: '31%', flexGrow: 1, borderWidth: 2, borderRadius: 14, borderColor: 'transparent' },
  genreRingOn: { borderColor: C.brand },
  genreCard: {
    height: 56, borderRadius: 12, overflow: 'hidden',
    paddingHorizontal: 12, justifyContent: 'center', gap: 5,
  },
  genreZh: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '700' },
  genreEn: { color: C.text2, fontSize: 8, lineHeight: 10, fontWeight: '500', letterSpacing: 0.5 },
  sceneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenePill: {
    width: '31%', flexGrow: 1, height: 36, borderRadius: 18, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  sceneOn: { backgroundColor: C.brand },
  sceneLabel: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  sceneLabelOn: { color: C.onBrand, fontWeight: '700' },
  langRow: { flexDirection: 'row', gap: 0 },
  langBtn: { flex: 1, height: 28, justifyContent: 'center' },
  langLabel: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  langLabelOn: { color: C.brandText, fontWeight: '700' },
  chartHero: {
    height: 126, borderRadius: 16, overflow: 'hidden',
    paddingHorizontal: 18, paddingVertical: 16, justifyContent: 'center', gap: 2,
  },
  chartHeroKicker: { color: C.text2, fontSize: 10, lineHeight: 12, fontWeight: '700' },
  chartHeroTitle: { color: C.text, fontSize: 32, lineHeight: 38, fontWeight: '700' },
  chartHeroMeta: { color: C.text2, fontSize: 11, lineHeight: 13, marginTop: 6 },
  rankBadge: {
    position: 'absolute', right: 18, top: 18, width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
  },
  rankBadgeText: { color: C.text, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  chartRow: { flexDirection: 'row', gap: 8 },
  chartCard: {
    flex: 1, height: 92, borderRadius: 12, backgroundColor: C.surface2, overflow: 'hidden',
    paddingHorizontal: 12, paddingTop: 20,
  },
  chartAccent: { position: 'absolute', left: 0, top: 0, right: 0, height: 8 },
  chartName: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '700' },
  chartCaption: { color: C.text2, fontSize: 9, lineHeight: 11, marginTop: 11 },
  chartTag: { fontSize: 9, lineHeight: 11, fontWeight: '500', marginTop: 2 },
  sectionRow: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700' },
  sectionMeta: { color: C.text2, fontSize: 11, lineHeight: 16 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    width: '48%', height: 92, borderRadius: 12, overflow: 'hidden',
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: 14,
  },
  catArt: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  catFallback: { backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  catGlyph: { color: C.white, fontSize: 26, fontWeight: '700' },
  catShade: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#00000066' },
  catLabel: { color: C.white, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  plGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // 全部榜单网格：2 列自适应
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boardCell: { width: '48.5%' },
  boardCard: { height: 64, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 12, justifyContent: 'center', gap: 3 },
  boardCardName: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  boardCardSub: { color: C.text2, fontSize: 9, lineHeight: 11 },
  center: { paddingVertical: 32, alignItems: 'center' },
  errText: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 24 },
  overlay: { position: 'absolute', top: 146, left: 20, right: 20, alignItems: 'center' },
  overlayCard: { width: 350, maxWidth: '100%' },
});
