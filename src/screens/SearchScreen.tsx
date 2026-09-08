import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PillTabs } from '../components/PillTabs';
import { SongRow } from '../components/SongRow';
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { toast } from '../components/Dialog';
import { enqueueDownload, downloads as dlStore } from '../services/downloads';
import { api } from '../services/server';
import { StateOverlayCard } from '../components/StateOverlayCard';
import { usePlayer } from '../state/PlayerProvider';
import { lxapi } from '../services/lxapi';
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
  const [source, setSource] = useState<SearchSrc>('kw');
  const [results, setResults] = useState<SongItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allFailed, setAllFailed] = useState(false);
  const [mode, setMode] = useState<'song' | 'singer' | 'album'>('song'); // lx163:搜索类型
  const [singers, setSingers] = useState<{ id: string; name: string; img?: string; source?: string }[] | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; singer?: string; img?: string; source?: string }[] | null>(null);
  const [actSong, setActSong] = useState<SongItem | null>(null); // lx163:搜索行 ⋯ 菜单
  const [collect, setCollect] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    // 进入页面自动聚焦键盘
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const search = async (q: string, src = source, m = mode) => {
    const query = q.trim();
    if (!query) return;
    setBusy(true); setErr(null); setAllFailed(false);
    try {
      // lx163:歌手/专辑走服务器 extendSearch;歌曲仍内置引擎直连(免费免登录)
      if (m === 'singer') {
        const r = await api.searchSingers(query, src);
        setSingers(r);
        if (!r.length) setAllFailed(true);
        return;
      }
      if (m === 'album') {
        const r = await api.searchAlbums(query, src);
        setAlbums(r);
        if (!r.length) setAllFailed(true);
        return;
      }
      // 搜索走内置引擎直连平台公开 API，永远免费免登录（只有播放取链才需要音源/登录）
      const r = await lxapi.search(query, src);
      if (r.length === 0) {
        const others = SOURCES.map(s => s.id).filter(s => s !== src);
        let anyOk = false;
        for (const s of others) { // eslint-disable-line no-await-in-loop
          try {
            const alt = await lxapi.search(query, s);
            if (alt.length > 0) { anyOk = true; break; }
          } catch { /* ignore */ }
        }
        if (!anyOk) setAllFailed(true);
      }
      setResults(r);
    } catch {
      setErr('搜索失败：无法连接音源');
      setResults([]);
    } finally { setBusy(false); }
  };

  // debounce 自动搜索（与原探索页一致）
  useEffect(() => {
    const t = setTimeout(() => { if (kw.trim().length >= 2) search(kw); }, 600);
    return () => clearTimeout(t);
  }, [kw]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchSource = (s: SearchSrc) => {
    setSource(s);
    if (kw.trim().length >= 2) search(kw, s);
  };
  const navTo = useNavigation() as { navigate: (s: string, p?: object) => void };

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
            <TouchableOpacity hitSlop={8} onPress={() => { setKw(''); setResults(null); }}>
              <Icon name="close" size={16} color={C.text3} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={st.pillWrap}>
        {/* lx163:搜索类型——歌曲/歌手/专辑 */}
        <PillTabs tabs={['歌曲', '歌手', '专辑']} active={mode === 'song' ? 0 : mode === 'singer' ? 1 : 2}
          onChange={i => { const m = (['song', 'singer', 'album'] as const)[i]; setMode(m); if (kw.trim()) search(kw.trim(), source, m); }} />
        <View style={{ height: 6 }} />
        <PillTabs tabs={SOURCES.map(s => s.label)} active={SOURCES.findIndex(s => s.id === source)}
          onChange={i => switchSource(SOURCES[i].id)} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 140 }}>
        {busy ? (
          <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>
        ) : err ? (
          <Text style={st.errText}>{err}</Text>
        ) : mode === 'singer' ? (
          /* lx163:歌手结果 */
          singers && singers.length ? singers.map(a => (
            <TouchableOpacity key={a.id} style={st.singerRow} activeOpacity={0.8} onPress={() => navTo.navigate('ArtistDetail', { artist: { id: a.id, name: a.name, img: a.img, source: a.source || source } })}>
              {a.img ? <Image source={{ uri: a.img }} style={st.round} /> : <View style={[st.round, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: C.text2, fontSize: 16, fontWeight: '700' }}>{a.name.slice(0, 1)}</Text></View>}
              <Text style={st.singerName} numberOfLines={1}>{a.name}</Text>
              <Text style={st.singerSrc}>{(a.source || source).toUpperCase()}</Text>
              <Icon name="next" size={18} color={C.text2} />
            </TouchableOpacity>
          )) : <Text style={st.errText}>没有找到相关歌手</Text>
        ) : mode === 'album' ? (
          /* lx163:专辑结果 */
          albums && albums.length ? albums.map(al => (
            <TouchableOpacity key={al.id} style={st.singerRow} activeOpacity={0.8} onPress={() => navTo.navigate('AlbumDetail', { album: { id: al.id, name: al.name, singer: al.singer, img: al.img, source: al.source || source } })}>
              {al.img ? <Image source={{ uri: al.img }} style={st.square} /> : <View style={[st.square, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={22} color={C.text3} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.singerName} numberOfLines={1}>{al.name}</Text>
                {al.singer ? <Text style={st.singerSrc} numberOfLines={1}>{al.singer}</Text> : null}
              </View>
              <Icon name="next" size={18} color={C.text2} />
            </TouchableOpacity>
          )) : <Text style={st.errText}>没有找到相关专辑</Text>
        ) : results && results.length > 0 ? (
          <>
            <View style={st.sectionRow}>
              <Text style={st.sectionTitle}>搜索结果</Text>
              <Text style={st.sectionMeta}>共 {results.length} 项</Text>
            </View>
            {results.map((s, i) => (
              <SongRow key={s.source + String(s.songmid) + i} song={s}
                playing={current?.songmid === s.songmid}
                onPress={() => playSong(s, results)}
                onMore={() => setActSong(s)} />
            ))}
          </>
        ) : results && results.length === 0 && !allFailed ? (
          <Text style={st.errText}>没有找到相关内容，换个关键词试试</Text>
        ) : !results ? (
          <View style={st.center}>
            <Icon name="search" size={40} color={C.text3} />
            <Text style={st.hintText}>输入关键词开始搜索</Text>
          </View>
        ) : null}
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

const st = StyleSheet.create({
  singerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  round: { width: 44, height: 44, borderRadius: 22 },
  square: { width: 44, height: 44, borderRadius: 8 },
  singerName: { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  singerSrc: { color: C.text2, fontSize: 10 },
  screen: { flex: 1, backgroundColor: C.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  searchBox: {
    flex: 1, height: 44, borderRadius: 22, backgroundColor: C.elev,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 13, padding: 0 },
  pillWrap: { paddingHorizontal: 20, marginBottom: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginVertical: 10 },
  sectionTitle: { color: C.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  sectionMeta: { color: C.text3, fontSize: 11 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
  hintText: { color: C.text3, fontSize: 12 },
  errText: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingVertical: 40 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim, justifyContent: 'center', alignItems: 'center', padding: 28 },
  overlayCard: { width: '100%', maxWidth: 420 },
});
