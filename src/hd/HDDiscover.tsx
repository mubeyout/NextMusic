// HD 歌单广场 —— 桌面版风格:五源 pill + 热门标签 pill + 歌单卡网格,点击拉详情进 PlaylistDetail(复用)
// v2 web 版 /discover 功能对齐:标签筛选 + 广场浏览 + 加载更多
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
import { Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';
import { cacheStale, cacheSet } from './hdcache';

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

export function HDDiscover() {
  const insets = useSafeAreaInsets();
  const [src, setSrc] = useState('wy');
  const [tag, setTag] = useState<string>('');          // '' = 推荐位
  const [tags, setTags] = useState<Tag[]>([]);
  const [pls, setPls] = useState<PL[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false); // 翻页/切源级
  const [busyId, setBusyId] = useState<string | null>(null); // #015:per-card 拉详情中(蒙层反馈,静默失败 → 有反馈)
  const [cols, setCols] = useState(6); // #015:网格列数(末行 nextFocusDown 判定)
  const pbTarget = usePbFocusTarget();
  const deadRef = useRef(false);

  // 拉标签(wy 返回 tags 分组,mg/kg 返回 hotTag——统一摊平)
  useEffect(() => {
    deadRef.current = false;
    setTags([]); setTag(''); setPls(null); setPage(1); setMore(true);
    const key = `dtags.${src}`;
    const stale = cacheStale<Tag[]>(key);
    if (stale) setTags(stale);
    lxapi.songListTags(src).then(t => {
      if (deadRef.current) return;
      const flat: Tag[] = [
        ...((t.hotTag || []) as Tag[]),
        ...((t.tags || []).flatMap((g: any) => (g.list || []).map((x: any) => ({ id: String(x.id), name: String(x.name) })))),
      ];
      // 去重(同名标签)
      const seen = new Set<string>();
      const uniq = flat.filter(x => { const k = x.name; if (seen.has(k)) return false; seen.add(k); return true; });
      setTags(uniq.slice(0, 24)); cacheSet(key, uniq.slice(0, 24));
    }).catch(() => {});
    return () => { deadRef.current = true; };
  }, [src]);

  // 拉歌单列表(SWR 缓存回填)
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
    if (busyId) return; // #015:per-card 互斥(替代全局 busy 吞点击)
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
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 26, paddingBottom: 28, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={st.title}>歌单广场</Text>
        <View style={{ flex: 1 }} />
        {busy ? <ActivityIndicator color={C.brand} size="small" /> : null}
        {pls ? <Text style={st.count}>{pls.length} 个歌单</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SOURCES.map(s => (
          <HDTouch key={s.key} style={[st.pill, src === s.key && st.pillOn]}
            focusStyle={src === s.key ? { borderWidth: 2, borderColor: C.brandSoft } : st.pillFocus}
            onPress={() => setSrc(s.key)}>
            <Text style={[st.pillLabel, src === s.key && st.pillLabelOn]}>{s.label}</Text>
          </HDTouch>
        ))}
      </View>

      {/* 标签横滚(推荐 + 热门标签),滚轮/拖拽滑动,无滚动条 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 26 }}>
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
        <HDGrid min={128 * (H.font.sm / 10)} onCols={setCols}>
          {pls.map((pl, i) => (
            <PLCard key={`${pl.id}_${i}`} pl={pl} i={i} src={src} onOpen={() => open(pl)}
              busy={busyId === pl.id}
              lastRow={i >= pls.length - (((pls.length - 1) % cols) + 1)} // #015:末行卡显式 nextFocusDown→播放条(焦点逃逸焊死)
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
      {/* #015:per-card busy 蒙层(拉详情中)——原先静默失败:卡看着能点,点了没反应 */}
      {busy ? (
        <View style={st.cardBusy} pointerEvents="none">
          <ActivityIndicator color="#FFFFFFE6" size="small" />
        </View>
      ) : null}
      <View style={st.cardChipWrapper}>
        <View style={st.cardChip}><Text style={st.cardChipText}>{SOURCES.find(s => s.key === src)?.label ?? src}</Text></View>
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
  title: { color: C.text, fontSize: H.font.hero, fontWeight: '800' },
  count: { color: C.text3, fontSize: H.font.sm },
  pill: { borderRadius: H.radius.pill, paddingHorizontal: 11, height: 26, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill },
  pillLabel: { color: C.text2, fontSize: H.font.sm },
  pillLabelOn: { color: C.onBrand, fontWeight: '600' },
  card: { borderRadius: 12, backgroundColor: C.surface, paddingBottom: 8 },
  cardCover: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  cardBusy: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.45)' },
  cardChipWrapper: { position: 'absolute', right: 8, bottom: 80 },
  cardChip: { backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  cardChipText: { color: '#fff', fontSize: 9 },
  cardBody: { padding: 10, paddingTop: 8, gap: 3, alignSelf: 'center', width: '94%' },
  cardName: { color: C.text, fontSize: H.font.md, fontWeight: '700', lineHeight: 16 },
  cardSub: { color: C.text3, fontSize: 9 },
  tip: { alignItems: 'center', gap: 10, paddingVertical: 54 },
  tipText: { color: C.text2, fontSize: H.font.md, textAlign: 'center', paddingVertical: 30 },
  moreBtn: { alignSelf: 'center', marginTop: 6, borderRadius: H.radius.pill, paddingHorizontal: 22, height: 32, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: C.text2, fontSize: H.font.sm },
});
