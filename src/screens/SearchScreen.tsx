import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C, CARD, FS, FW, SP } from '../theme/tokens';
import { useHoverCard } from '../hd/hdweb'; // [LEO 1011 统一令] nm-card 彩色弥散影+hover
import { DiscCard } from './MyLibraryScreen'; // [老板 1011 15:49] 专辑卡统一件
import { PillTabs } from '../components/PillTabs';
import { SongRow } from '../components/SongRow';
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { toast } from '../components/Dialog';
import { enqueueDownload, downloads as dlStore } from '../services/downloads';
import { api } from '../services/server';
import { StateOverlayCard } from '../components/StateOverlayCard';
import { usePlayer } from '../state/PlayerProvider';
import { createMMKV } from 'react-native-mmkv';
const histKv = createMMKV({ id: 'nextmusic-search-history' });
// lx163b:热搜词(空闲态,与 HD 端同源精选)
const HOT_WORDS = ['周杰伦', '林俊杰', '邓紫棋', 'Taylor Swift', 'Beyond', '陈奕迅', '孙燕姿', '伍佰'];
import { lxapi } from '../services/lxapi';
import { providers, providerApi, PROVIDER_META, PROTOCOL } from '../services/providers'; // [老板 1011 11:49] 第三方媒体检索
import type { SongItem } from '../services/server';

// 独立搜索页：点击探索页搜索框进入（替代页内内联搜索）
// 聚焦输入 → 600ms debounce 自动搜索；源切换立即重搜；全失败覆盖卡
// 搜索源全平台直连（引擎侧 tx/mg 已打包）：kw 酷我 / kg 酷狗 / wy 网易 / tx QQ音乐 / mg 咪咕
const SOURCES: { id: SearchSrc; label: string }[] = [
  { id: 'kw', label: '酷我' },
  { id: 'kg', label: '酷狗' },
  { id: 'wy', label: '网易' },
  { id: 'tx', label: 'QQ音乐' },
  { id: 'mg', label: '咪咕' },
];
type SearchSrc = 'kw' | 'kg' | 'wy' | 'tx' | 'mg';

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { playSong, current } = usePlayer();
  const [kw, setKw] = useState('');
  const [results, setResults] = useState<SongItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allFailed, setAllFailed] = useState(false);
  const [singers, setSingers] = useState<{ id: string; name: string; img?: string; source?: string }[] | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; singer?: string; img?: string; source?: string }[] | null>(null);
  const [pvHits, setPvHits] = useState<{ name: string; label: string; songs: SongItem[] }[]>([]); // [老板 1011 11:49] 第三方媒体命中(按账号分区)
  const [history, setHistory] = useState<string[]>(() => { try { return JSON.parse(histKv.getString('h') || '[]'); } catch { return []; } });
  const [fadeA] = useState(new Animated.Value(1)); // lx168:结果区淡入
  useEffect(() => { if (busy) fadeA.setValue(0.35); else Animated.timing(fadeA, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [actSong, setActSong] = useState<SongItem | null>(null); // lx163:搜索行 ⋯ 菜单
  const [collect, setCollect] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const seqRef = useRef(0); // lxfix 0922:搜索代次守卫

  useEffect(() => {
    // 进入页面自动聚焦键盘
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const search = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    const my = ++seqRef.current; // lxfix 0922 老板「搜索结果与输入无关」:旧查询慢响应回来会盖掉新结果;代次守卫,非最新直接丢弃
    setBusy(true); setErr(null); setAllFailed(false); setShowAllSongs(false);
    try {
      // lx163e:聚合搜索——五源并行取歌曲,交错合并去重(同名同歌手取先到);歌手/专辑服务器智能选源
      // [老板 1011 11:49] 第三方媒体并行检索(听风/emby/jf 有源内搜索端点;失败静默不阻塞在线结果)
      const pvAccounts = providers.all().filter(p => p.type === 'tingfeng' || PROTOCOL[p.type] === 'emby' || PROTOCOL[p.type] === 'jellyfin');
      const [lists, ar, al, pvSettled] = await Promise.all([
        Promise.all(SOURCES.map(s => lxapi.search(query, s.id).catch(() => [] as SongItem[]))),
        api.searchSingers(query, 'kw').catch(() => [] as never),
        api.searchAlbums(query, 'kw').catch(() => [] as never),
        Promise.allSettled(pvAccounts.map(p => providerApi.search(p, query).then(songs => ({ name: p.name, label: PROVIDER_META[p.type].label, songs: songs.slice(0, 20) })))),
      ]);
      const pv = pvSettled.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ songs: SongItem[] }>).value.songs.length).map(r => (r as PromiseFulfilledResult<{ name: string; label: string; songs: SongItem[] }>).value);
      setPvHits(pv);
      if (my !== seqRef.current) return; // 过期响应:用户已改词,丢弃(否则旧结果盖新词→「搜的和输入的没关系」)
      // 搜索历史(去重置顶,留 10 条)——只在结果被采纳时写入,半截词不进历史
      const h = [query, ...history.filter(x => x !== query)].slice(0, 10);
      setHistory(h); histKv.set('h', JSON.stringify(h));
      const seen = new Set<string>(); const sg: SongItem[] = [];
      for (let i = 0; i < 4; i++) for (const list of lists) {
        const s = list[i]; if (!s) continue;
        const k = `${s.name}|${s.singer}`;
        if (seen.has(k)) continue; seen.add(k); sg.push(s);
      }
      setResults(sg); setSingers(ar); setAlbums(al);
      if (!sg.length && !ar.length && !al.length && !pv.length) setAllFailed(true);
    } catch {
      if (my !== seqRef.current) return;
      setErr('搜索失败：无法连接音源');
      setResults([]);
    } finally { if (my === seqRef.current) setBusy(false); } // 过期轮不清 busy,否则新搜索转圈被误关
  };

  // debounce 自动搜索（与原探索页一致）；清空输入回空闲态（三路结果一并清，综合流默认态也能回 chips）
  useEffect(() => {
    const t = setTimeout(() => {
      if (!kw.trim()) { setResults(null); setSingers(null); setAlbums(null); setPvHits([]); setAllFailed(false); return; }
      if (kw.trim().length >= 2) search(kw);
    }, 600);
    return () => clearTimeout(t);
  }, [kw]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx163c:锚点导航重构——去模式 tab:一次搜索全量分区,顶栏变锚点 chips(点击滚动),源选择内聚到歌曲区头部
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const secY = useRef({ song: 0, singer: 0, album: 0 });
  const [showAllSongs, setShowAllSongs] = useState(false);
  const anchor = (k: 'song' | 'singer' | 'album') => {
    scrollRef.current?.scrollTo({ y: Math.max(0, secY.current[k] - 46), animated: true });
  };
  const navTo = useNavigation() as { navigate: (s: string, p?: object) => void };

  // lx163b:空闲态（搜索历史 + 热搜词）——四态共用：未搜索过/输入已清空时展示
  const idlePane = (
    <View style={{ gap: SP.xxl, paddingTop: 8 }}>
      {history.length ? (
        <View style={{ gap: SP.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={st.allSecTitle}>搜索历史</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity hitSlop={6} onPress={() => { setHistory([]); histKv.set('h', '[]'); }}>
              <Icon name="close" size={14} color={C.text3} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
            {history.map(w => (
              <TouchableOpacity key={w} style={st.chip} onPress={() => { setKw(w); search(w); }}>
                <Text style={st.chipText} numberOfLines={1}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ gap: SP.md }}>
        <Text style={st.allSecTitle}>大家都在搜</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
          {HOT_WORDS.map((w, i) => (
            <TouchableOpacity key={w} style={st.chip} onPress={() => { setKw(w); search(w); }}>
              <Text style={[st.chipIdx, i < 3 && { color: C.brand }]}>{i + 1}</Text>
              <Text style={st.chipText} numberOfLines={1}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View style={st.screen}>
      <View style={[st.searchRow, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 24 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <View style={st.searchBox}>
          <Icon name="search" size={18} color={C.text2} />
          <TextInput
            ref={inputRef}
            style={st.searchInput}
            placeholder="搜索歌曲、歌手、专辑"
            placeholderTextColor={C.text2}
            value={kw}
            onChangeText={setKw}
            onSubmitEditing={() => search(kw)}
            returnKeyType="search"
            autoCorrect={false}
          />
          {kw ? (
            <TouchableOpacity hitSlop={8} onPress={() => setKw('')}>
              <Icon name="close" size={16} color={C.text3} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* lx163c:锚点导航(替代模式 tab)——带计数徽标,点击滚动到分区;一次搜索全量在本页 */}
      {results != null || singers != null || albums != null ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.anchorBar} contentContainerStyle={{ gap: SP.md, paddingHorizontal: 20 }}>
          {([
            ['song', `歌曲 ${results?.length ?? 0}`],
            ['singer', `歌手 ${(singers || []).length}`],
            ['album', `专辑 ${(albums || []).length}`],
          ] as const).map(([k, label]) => (
            (k !== 'singer' || (singers || []).length) && (k !== 'album' || (albums || []).length) ? (
              <TouchableOpacity key={k} style={st.anchorChip} onPress={() => anchor(k)}>
                <Text style={st.anchorText}>{label}</Text>
              </TouchableOpacity>
            ) : null
          ))}
        </ScrollView>
      ) : null}
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 140 }}>
        {/* lx168:结果首载淡入(硬切→180ms) */}
        <Animated.View style={{ opacity: fadeA, flex: 1 }}>
        {busy ? (
          <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>
        ) : err ? (
          <Text style={st.errText}>{err}</Text>
        ) : (
          /* lx163c:统一分区流——歌曲(源内聚头部)→歌手横滑→专辑横滑;tab 已被锚点条替代 */
          <View style={{ gap: SP.xs }}>
            {results && results.length ? (
              <View onLayout={e => { secY.current.song = e.nativeEvent.layout.y; }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
                  <Text style={st.allSecTitle}>歌曲 · {results.length} 首</Text>
                  <View style={st.aggBadge}><Text style={st.aggText}>五源聚合</Text></View>
                </View>
                {(showAllSongs ? results : results.slice(0, 6)).map((s, i) => (
                  <SongRow key={s.source + String(s.songmid) + i} song={s}
                    playing={current?.songmid === s.songmid}
                    onPress={() => playSong(s, results)}
                    onMore={() => setActSong(s)} />
                ))}
                {results.length > 6 ? (
                  <TouchableOpacity style={st.allMore} onPress={() => setShowAllSongs(v => !v)}>
                    <Text style={st.allMoreText}>{showAllSongs ? '收起' : `查看全部 ${results.length} 首`}</Text>
                    <Icon name="chevronright" size={14} color={C.text2} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {(singers || []).length ? (
              <View onLayout={e => { secY.current.singer = e.nativeEvent.layout.y; }}>
                <Text style={st.allSecTitle}>歌手 · {(singers || []).length}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.xxl, paddingVertical: 4 }}>
                  {(singers || []).map(a => (
                    <AllArtistCircle key={a.id} a={a}
                      onPress={() => navTo.navigate('ArtistDetail', { artist: { id: a.id, name: a.name, img: a.img, source: a.source || 'wy' } })} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {(albums || []).length ? (
              <View onLayout={e => { secY.current.album = e.nativeEvent.layout.y; }}>
                <Text style={st.allSecTitle}>专辑 · {(albums || []).length}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SP.xxl, paddingVertical: 4 }}>
                  {(albums || []).map(al => (
                    <AllAlbumCard key={al.id} al={al}
                      onPress={() => navTo.navigate('AlbumDetail', { album: { id: al.id, name: al.name, singer: al.singer, img: al.img, source: al.source || 'wy' } })} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {(pvHits || []).map(secPv => (
              <View key={secPv.name} style={{ marginTop: 6 }}>
                <Text style={st.allSecTitle}>第三方 · {secPv.name}（{secPv.label}）</Text>
                {secPv.songs.map((s, i) => (
                  <SongRow key={`pv-${secPv.name}-${s.songmid}-${i}`} song={s}
                    playing={current?.songmid === s.songmid}
                    onPress={() => playSong(s, secPv.songs)}
                    onMore={() => setActSong(s)} />
                ))}
              </View>
            ))}
            {results === null && singers === null && albums === null ? idlePane
              : !(results || []).length && !(singers || []).length && !(albums || []).length && !(pvHits || []).length ? (
                <Text style={st.errText}>没有找到相关内容，换个关键词试试</Text>
              ) : null}
          </View>
        )}
        </Animated.View>
      </ScrollView>

      {/* lx163:搜索行操作菜单(收藏到歌单/下载) */}
      <ActionSheet
        visible={!!actSong} onClose={() => setActSong(null)}
        title={actSong ? `${actSong.name} · ${actSong.singer}` : ''}
        items={actSong ? [
          dlStore.isDownloaded(actSong)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载', onPress: () => { enqueueDownload([actSong]); } },
          { label: '收藏到歌单', onPress: () => setCollect(true) },
        ] : []}
      />
      <CollectSheet song={actSong} visible={collect} onClose={() => { setCollect(false); setActSong(null); }} />


      {allFailed && (
        <View style={st.overlay} pointerEvents="box-none">
          <View style={st.overlayCard} pointerEvents="auto">
            <StateOverlayCard
              glyph="!"
              glyphSize={34}
              title="所有已启用音源均不可用"
              body="可以重试搜索，或前往音源管理检查连接与脚本状态。"
              primary="重新搜索"
              secondary="前往音源管理"
              onPrimary={() => search(kw)}
              onSecondary={() => nav.goBack()}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// [LEO 1011 统一令] 歌手圆卡:与公共库 ArtistCircle 同规格(76 圆/artTint2 兜底+brandText 首字母/nm-card 弥散影+hover)
function AllArtistCircle({ a, onPress }: { a: { id: string; name: string; img?: string; source?: string }; onPress: () => void }) {
  const { elRef, onHoverIn, onHoverOut, cardStyle } = useHoverCard(a.name);
  const w = 76;
  return (
    <TouchableOpacity ref={elRef as never}
      style={[{ width: w, backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' }, cardStyle as never]}
      activeOpacity={0.85} onPress={onPress}
      {...(Platform.OS === 'web' ? { onHoverIn, onHoverOut } : {}) as Record<string, unknown>}>
      <View style={{ padding: SP.sm }}>
        <View style={{ width: w - SP.sm * 2, aspectRatio: 1, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.artTint2 }}>
          {a.img
            ? <Image source={{ uri: a.img }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} resizeMode="cover" />
            : <Text style={st.allArtistInit}>{a.name.slice(0, 1)}</Text>}
        </View>
      </View>
      <View style={{ paddingHorizontal: SP.md, paddingBottom: SP.md, alignItems: 'center' }}>
        <Text style={st.allCardName} numberOfLines={1}>{a.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

// [老板 1011 15:49] 专辑卡统一件 DiscCard(全站专辑卡同构:黑胶窗口+计数徽标+渐变兜底)
function AllAlbumCard({ al, onPress }: { al: { id: string; name: string; singer?: string; img?: string; source?: string }; onPress: () => void }) {
  return (
    <DiscCard name={al.name} sub={al.singer} cover={al.img} unknown={!al.img} fixedWidth={CARD.rail.phone} onPress={onPress} />
  );
}

const st = StyleSheet.create({
  singerRow: { flexDirection: 'row', alignItems: 'center', gap: SP.xl, minHeight: 60 },
  anchorBar: { flexGrow: 0, paddingVertical: 8 },
  anchorChip: { backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 13, height: 30, justifyContent: 'center' },
  anchorText: { color: C.text, fontSize: FS.body, fontWeight: FW.semibold },
  aggBadge: { backgroundColor: C.surface2, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3 },
  aggText: { color: C.text2, fontSize: FS.xs, fontWeight: FW.bold },
  allSecTitle: { color: C.text, fontSize: FS.lg, fontWeight: FW.bold, marginTop: 8 },
  allArtistInit: { color: C.brandText, fontSize: FS.headline, fontWeight: FW.bold }, // 与公共库 ArtistCircle/PvCard round 首字母同档
  allCardName: { color: C.text, fontSize: FS.sm, fontWeight: FW.semibold, alignSelf: 'stretch', textAlign: 'center' },
  allCardSub: { color: C.text2, fontSize: FS.xs, alignSelf: 'stretch', textAlign: 'center' },
  allMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs, paddingVertical: 12 },
  allMoreText: { color: C.text2, fontSize: FS.body, fontWeight: FW.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 13, height: 30 },
  chipText: { color: C.text, fontSize: FS.body, fontWeight: FW.medium, maxWidth: 160 },
  chipIdx: { color: C.text3, fontSize: FS.sm, fontWeight: FW.heavy },
  round: { width: 44, height: 44, borderRadius: 22 },
  square: { width: 44, height: 44, borderRadius: 8 },
  singerName: { flex: 1, color: C.text, fontSize: FS.lg, fontWeight: FW.semibold },
  singerSrc: { color: C.text2, fontSize: FS.xs },
  screen: { flex: 1, backgroundColor: C.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, paddingHorizontal: 20, marginBottom: 12 },
  searchBox: {
    flex: 1, height: 44, borderRadius: 22, backgroundColor: C.elev,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: SP.md,
  },
  searchInput: { flex: 1, color: C.text, fontSize: FS.md, padding: 0 },
  pillWrap: { paddingHorizontal: 20, marginBottom: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginVertical: 10 },
  sectionTitle: { color: C.text, fontSize: FS.xl, lineHeight: 20, fontWeight: FW.semibold },
  sectionMeta: { color: C.text3, fontSize: FS.sm },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: SP.lg },
  hintText: { color: C.text3, fontSize: FS.body },
  errText: { color: C.text2, fontSize: FS.body, lineHeight: 17, textAlign: 'center', paddingVertical: 40 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim, justifyContent: 'center', alignItems: 'center', padding: 28 },
  overlayCard: { width: '100%', maxWidth: 420 },
});
