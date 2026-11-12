// HD 探索页 —— [产品包HD 批3 1:1] 对齐设计稿 pgExplore:
// page-head(探索29+副句+搜索钮) → 热门主题 genre-grid 6渐变卡(150h/3列/题25+英文12) →
// 按场景听 pillbar(52h/17px) → 本周精选(kg榜真数据3行+更多→榜单)
// 歌单广场(五源真实功能)保留为二级态:genre 卡点击进 tag 筛选广场
import React, { useEffect, useRef, useState } from 'react';
import { FocusBridge, usePbFocusTarget } from './HDMain';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H, shadowStyleOf, webCardShadow } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDGrid } from './HDGrid';
import { useHoverCard } from './hdweb';
import { HDSongRow } from './HDSongRow';
import { usePlayer } from '../state/PlayerProvider';
import { Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';
import { cacheStale, cacheSet } from './hdcache';
import { GRID, FS, FW, SP } from '../theme/tokens';

type PL = { id: string; name: string; author?: string; total?: number | string; img?: string; play_count?: string; source?: string };
type Tag = { id: string; name: string };

const SOURCES: { key: string; label: string }[] = [
  { key: 'wy', label: '网易' },
  { key: 'kg', label: '酷狗' },
  { key: 'kw', label: '酷我' },
  { key: 'tx', label: 'QQ音乐' },
  { key: 'mg', label: '咪咕' },
];

const ACCENTS: [string, string][] = [
  ['#1F5E3A', '#0F2E1F'], ['#1F87D6', '#1F3A6E'], ['#B01F87', '#5E1F4E'],
  ['#D67A1F', '#6E3A1F'], ['#871FD6', '#3A1F5E'], ['#1FD6C0', '#1F5E5A'],
];

// [产品包HD 批3] 热门主题 6 渐变卡(设计 genreSets 原色板)
const GENRES: [string, string, string, string][] = [
  ['流行', 'POP', '#693046', '#39222e'],
  ['摇滚', 'ROCK', '#733e2d', '#33221e'],
  ['电子', 'ELECTRONIC', '#245570', '#192e42'],
  ['嘻哈', 'HIP-HOP', '#523668', '#30233f'],
  ['爵士', 'JAZZ', '#305346', '#1d332d'],
  ['古典', 'CLASSICAL', '#66502b', '#352d21'],
];

const SCENES = ['通勤', '学习', '运动', '派对', '睡眠', '旅行'];

export function HDDiscover() {
  const [mode, setMode] = useState<'explore' | 'square'>('explore');
  const [squareTag, setSquareTag] = useState('');
  return mode === 'explore'
    ? <ExploreView onSquare={(tagName?: string) => { setSquareTag(tagName ?? ''); setMode('square'); }} />
    : <SquareView tagName={squareTag} onBack={() => setMode('explore')} />;
}

// [产品包HD 批3 1:1] 探索首页(设计稿 explore 布局)
function ExploreView({ onSquare }: { onSquare: (tagName?: string) => void }) {
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayer();
  const [weekly, setWeekly] = useState<SongItem[]>(() => cacheStale<SongItem[]>('explore.weekly') || []);
  const pbTarget = usePbFocusTarget();

  useEffect(() => { // 本周精选 = kg TOP500 前 3(真数据)
    lxapi.leaderboardBoards('kg').then(bs => {
      const top = bs.find(b => /500/i.test(b.name)) || bs[0];
      return top ? lxapi.leaderboardList(top.bangid, 'kg') : [];
    }).then((list: SongItem[]) => {
      const l = (list || []).slice(0, 3);
      if (l.length) { setWeekly(l); cacheSet('explore.weekly', l); }
    }).catch(() => {});
  }, []);

  const playScene = async (scene: string) => {
    const list = (await lxapi.search(`${scene} 音乐`, 'kw', 1, 30).catch(() => [] as SongItem[])).slice(0, 30);
    if (list.length) { playSong(list[0], list); toast(`${scene}歌单 · ${list.length} 首`); }
    else toast('内容获取失败,稍后重试');
  };

  const openGenre = (name: string) => onSquare(name); // genre→广场同名 tag 筛选

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 26, paddingBottom: 28, gap: SP.xl }} showsVerticalScrollIndicator={false}>
      {/* page-head(设计: h1 29 + p 副句 + 右搜索钮) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.lg }}>
        <View style={{ gap: 6 }}>
          <Text style={st.h1}>探索</Text>
          <Text style={st.sub}>找到此刻想听的音乐</Text>
        </View>
        <View style={{ flex: 1 }} />
        <HDTouch style={st.headBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill }} onPress={() => hdNav()?.navigate('Search')}>
          <Icon name="search" size={16} color={C.text} /><Text style={st.headBtnText}>搜索</Text>
        </HDTouch>
      </View>

      {/* 热门主题 genre-grid(设计: 3列 gap16 / 150h r14 pad24 / 题25-700 + 英文12-ls1) */}
      <View style={st.secHead}><Text style={st.secTitle}>热门主题</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 16 : SP.md }}>
        {GENRES.map(([cn, en, a, b]) => (
          <HDTouch key={cn} activeOpacity={0.9} zoom={1.02} onPress={() => openGenre(cn)}
            focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }}
            style={{ width: '31.5%', height: IS_WEB ? 150 : 118, borderRadius: 14, overflow: 'hidden' }}>
            <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: IS_WEB ? 24 : 18, justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: IS_WEB ? 25 : 20, fontWeight: '700' }}>{cn}</Text>
              <Text style={{ color: '#ffffffa0', fontSize: IS_WEB ? 12 : FS.xs, letterSpacing: 1, marginTop: 8 }}>{en}</Text>
            </View>
            <View style={{ position: 'absolute', right: IS_WEB ? 24 : 18, bottom: IS_WEB ? 24 : 18 }}><Icon name="music" size={22} color="#ffffff8c" /></View>
          </HDTouch>
        ))}
      </View>

      {/* 按场景听 pillbar(设计: 52h/r28/17px,off=surface2/text2) */}
      <View style={st.secHead}><Text style={st.secTitle}>按场景听</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 10 : SP.md }}>
        {SCENES.map(s => (
          <HDTouch key={s} style={{ paddingHorizontal: 21, height: IS_WEB ? 52 : 44, borderRadius: 28, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}
            focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 28 }} onPress={() => playScene(s)}>
            <Text style={{ color: C.text2, fontSize: IS_WEB ? 17 : H.font.lg }}>{s}</Text>
          </HDTouch>
        ))}
      </View>

      {/* 本周精选(设计: song-list 3 行 + 更多) —— 真数据 kg 榜 */}
      <View style={st.secHead}>
        <Text style={st.secTitle}>本周精选</Text>
        <View style={{ flex: 1 }} />
        <HDTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} focusStyle={{ borderWidth: 1.5, borderColor: C.brand, borderRadius: 6 }} onPress={() => hdNav()?.navigate('BoardsSquare')}>
          <Text style={st.secMore}>更多 ›</Text>
        </HDTouch>
      </View>
      {weekly.length ? weekly.map((s, i) => (
        <HDSongRow key={`${s.songmid}_${i}`} song={s} index={i} onPress={() => { playSong(s, weekly); }} />
      )) : <View style={st.tip}><ActivityIndicator color={C.brand} /><Text style={st.tipText}>精选加载中…</Text></View>}
      <FocusBridge active />
    </ScrollView>
  );
}

// 歌单广场(二级态:五源+tag 筛选——原 HDDiscover 主体,入口=探索页 genre 卡)
function SquareView({ tagName, onBack }: { tagName: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [src, setSrc] = useState('wy');
  const [tag, setTag] = useState<string>(tagName);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pls, setPls] = useState<PL[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cols, setCols] = useState(6);
  const pbTarget = usePbFocusTarget();
  const deadRef = useRef(false);

  useEffect(() => {
    deadRef.current = false;
    setTags([]); setTag(tagName); setPls(null); setPage(1); setMore(true);
    const key = `dtags.${src}`;
    const stale = cacheStale<Tag[]>(key);
    if (stale) setTags(stale);
    lxapi.songListTags(src).then(t => {
      if (deadRef.current) return;
      const flat: Tag[] = [
        ...((t.hotTag || []) as Tag[]),
        ...((t.tags || []).flatMap((g: any) => (g.list || []).map((x: any) => ({ id: String(x.id), name: String(x.name) })))),
      ];
      const seen = new Set<string>();
      const uniq = flat.filter(x => { const k = x.name; if (seen.has(k)) return false; seen.add(k); return true; });
      setTags(uniq.slice(0, 24)); cacheSet(key, uniq.slice(0, 24));
      // 批3:探索页 genre 卡传入中文名——匹配广场 tag id(名字≠id,直设名字会查空)
      if (tagName) {
        const hit = uniq.find(x => x.name === tagName || x.name.includes(tagName));
        if (hit) setTag(hit.id);
      }
    }).catch(() => {});
    return () => { deadRef.current = true; };
  }, [src]);

  const loadPage = (p: number, append: boolean) => {
    if (deadRef.current) return;
    setBusy(true);
    const key = `dpl.${src}.${tag}.${p}`;
    if (!append) {
      const stale = cacheStale<PL[]>(key);
      if (stale) setPls(stale);
    }
    lxapi.songListList(tag, '5', p, 20, src)
      .then(r => {
        if (deadRef.current) return;
        const list = ((r.list || []) as PL[]).map(pl => ({ ...pl, source: src }));
        setPls(prev => append ? [...(prev || []), ...list] : list);
        if (!append) cacheSet(key, list);
        setMore(list.length >= 15);
        setPage(p);
      })
      .catch(() => { if (!append && pls == null) setPls([]); })
      .finally(() => setBusy(false));
  };

  useEffect(() => { loadPage(1, false); return () => { deadRef.current = true; }; }, [src, tag]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (pl: PL) => {
    if (busyId) return;
    setBusyId(pl.id);
    try {
      const r = await lxapi.songListDetail(pl.id, 1, src);
      const songs = ((r.list || []) as SongItem[]).map(s => ({ ...s, source: s.source || src }));
      if (songs.length) hdNav()?.navigate('PlaylistDetail', { title: pl.name, songs, meta: `${pl.total || songs.length} 首 · ${pl.author || '歌单'}` });
      else toast('歌单内容为空或加载失败');
    } catch { toast('歌单加载失败'); }
    finally { setBusyId(null); }
  };

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 26, paddingBottom: 28, gap: SP.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
        <HDTouch style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' }} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 18 }} onPress={onBack}>
          <Icon name="back" size={17} color={C.text} />
        </HDTouch>
        <Text style={st.title}>歌单广场</Text>
        <View style={{ flex: 1 }} />
        {busy ? <ActivityIndicator color={C.brand} size="small" /> : null}
        {pls ? <Text style={st.count}>{pls.length} 个歌单</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: SP.md }}>
        {SOURCES.map(s => (
          <HDTouch key={s.key} style={[st.pill, src === s.key && st.pillOn]}
            focusStyle={src === s.key ? { borderWidth: 2, borderColor: C.brandSoft } : st.pillFocus}
            onPress={() => setSrc(s.key)}>
            <Text style={[st.pillLabel, src === s.key && st.pillLabelOn]}>{s.label}</Text>
          </HDTouch>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.md, paddingRight: 26 }}>
        <HDTouch style={[st.pill, tag === '' && st.pillOn]}
          focusStyle={tag === '' ? { borderWidth: 2, borderColor: C.brandSoft } : st.pillFocus}
          onPress={() => setTag('')}>
          <Text style={[st.pillLabel, tag === '' && st.pillLabelOn]}>推荐</Text>
        </HDTouch>
        {tags.map(t => (
          <HDTouch key={t.id} style={[st.pill, tag === t.id && st.pillOn]}
            focusStyle={tag === t.id ? { borderWidth: 2, borderColor: C.brandSoft } : st.pillFocus}
            onPress={() => setTag(t.id)}>
            <Text style={[st.pillLabel, tag === t.id && st.pillLabelOn]} numberOfLines={1}>{t.name}</Text>
          </HDTouch>
        ))}
      </ScrollView>

      {pls == null ? (
        <View style={st.tip}><ActivityIndicator color={C.brand} size="large" /><Text style={st.tipText}>歌单加载中…</Text></View>
      ) : (
        <HDGrid min={GRID.hdMin * (H.font.sm / 10)} onCols={setCols}>
          {pls.map((pl, i) => (
            <PLCard key={`${pl.id}_${i}`} pl={pl} i={i} src={src} onOpen={() => open(pl)}
              busy={busyId === pl.id}
              lastRow={i >= pls.length - (((pls.length - 1) % cols) + 1)}
              nextDown={pbTarget ?? undefined} />
          ))}
        </HDGrid>
      )}
      {pls != null && !pls.length ? <Text style={st.tipText}>该标签暂无歌单,换个标签或源试试</Text> : null}
      {pls != null && pls.length > 0 && more ? (
        <HDTouch style={st.moreBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill }}
          onPress={() => !busy && loadPage(page + 1, true)}
          nextFocusDown={pbTarget ?? undefined}>
          {busy ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={st.moreText}>加载更多</Text>}
        </HDTouch>
      ) : null}
      <FocusBridge active />
    </ScrollView>
  );
}

function PLCard({ pl, i, src, onOpen, busy, lastRow, nextDown }: { pl: PL; i: number; src: string; onOpen: () => void; busy?: boolean; lastRow?: boolean; nextDown?: number }) {
  const hc = useHoverCard(pl.name);
  return (
    <HDTouch onPress={onOpen} activeOpacity={0.85} zoom={1.06} disabled={busy}
      ref={IS_WEB ? (hc.elRef as never) : undefined}
      {...(IS_WEB ? { onHoverIn: hc.onHoverIn, onHoverOut: hc.onHoverOut } : {})}
      {...(lastRow && nextDown != null ? { nextFocusDown: nextDown } : {})}
      style={[st.card, shadowStyleOf(pl.name), IS_WEB && hc.cardStyle, IS_WEB && { overflow: 'hidden' as const }]}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }}
    >
      {pl.img ? (
        <Image source={{ uri: pl.img }} style={st.cardCover} />
      ) : (
        <LinearGradient colors={ACCENTS[i % ACCENTS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cardCover}>
          <Icon name="music" size={42} color="#FFFFFFB3" />
        </LinearGradient>
      )}
      {busy ? (
        <View style={st.cardBusy} pointerEvents="none">
          <ActivityIndicator color="#FFFFFFE6" size="small" />
        </View>
      ) : null}
      <View style={st.cardChipWrapper}>
        <View style={st.cardChip}><Text style={[st.cardChipText, { color: '#ffffffe6' }]}>{SOURCES.find(s => s.key === src)?.label ?? src}</Text></View>
      </View>
      <View style={st.cardBody}>
        <Text style={st.cardName} numberOfLines={2}>{pl.name}</Text>
        <Text style={st.cardSub} numberOfLines={1}>{pl.author || '歌单'}{pl.total ? ` · ${pl.total} 首` : ''}</Text>
      </View>
    </HDTouch>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: IS_WEB ? 29 : H.font.hero, fontWeight: FW.heavy },
  sub: { color: C.text2, fontSize: IS_WEB ? 14 : H.font.md },
  headBtn: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, height: IS_WEB ? 44 : 38, borderRadius: H.radius.pill, backgroundColor: C.elev, paddingHorizontal: 20 },
  headBtnText: { color: C.text, fontSize: IS_WEB ? 15 : H.font.lg },
  secHead: { flexDirection: 'row', alignItems: 'baseline', gap: SP.sm, marginTop: SP.sm },
  secTitle: { color: C.text, fontSize: IS_WEB ? 22 : H.font.xl, fontWeight: FW.bold },
  secMore: { color: C.brand, fontSize: IS_WEB ? 14 : H.font.sm },
  title: { color: C.text, fontSize: H.font.hero, fontWeight: FW.heavy },
  count: { color: C.text3, fontSize: H.font.sm },
  pill: { borderRadius: H.radius.pill, paddingHorizontal: 11, height: 26, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill },
  pillLabel: { color: C.text2, fontSize: H.font.sm },
  pillLabelOn: { color: C.onBrand, fontWeight: FW.semibold },
  card: { borderRadius: 12, backgroundColor: C.surface, paddingBottom: 8 },
  cardCover: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  cardBusy: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.45)' },
  cardChipWrapper: { position: 'absolute', right: 8, bottom: 80 },
  cardChip: { backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  cardChipText: { color: C.white, fontSize: FS.xs },
  cardBody: { padding: SP.md, gap: SP.xs },
  cardName: { color: C.text, fontSize: H.font.md, fontWeight: FW.bold, lineHeight: 16 },
  cardSub: { color: C.text3, fontSize: FS.xs },
  tip: { alignItems: 'center', gap: SP.lg, paddingVertical: 54 },
  tipText: { color: C.text2, fontSize: H.font.md, textAlign: 'center', paddingVertical: 30 },
  moreBtn: { alignSelf: 'center', marginTop: 6, borderRadius: H.radius.pill, paddingHorizontal: 22, height: 32, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: C.text2, fontSize: H.font.sm },
});
