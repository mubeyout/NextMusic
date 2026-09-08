// HD 探索页 —— 桌面版 DiscoverScreen 结构:五源 pill + 搜索框 + 序号结果行
import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import { FocusBridge } from './HDMain';
import { View, Text, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, shadowStyleOf } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDSongRow } from './HDSongRow';
import { usePlayer } from '../state/PlayerProvider';
import { lxapi } from '../services/lxapi';
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { api } from '../services/server';
import { hdNav } from './hdnav';

const SOURCES: { id: SearchSrc; label: string }[] = [
  { id: 'kw', label: '酷我' },
  { id: 'kg', label: '酷狗' },
  { id: 'wy', label: '网易' },
  { id: 'tx', label: 'QQ音乐' },
  { id: 'mg', label: '咪咕' },
];
type SearchSrc = 'kw' | 'kg' | 'wy' | 'tx' | 'mg';

// lx134:探索页空闲态内容
const HOT_ARTISTS = [
  { n: '周杰伦', c: '#7C4DFF' }, { n: '林俊杰', c: '#3F8CFF' }, { n: '邓紫棋', c: '#FF5A76' },
  { n: '陈奕迅', c: '#0FA3A3' }, { n: '薛之谦', c: '#FF8A3D' }, { n: 'Taylor Swift', c: '#8E44AD' },
  { n: '王菲', c: '#E91E8C' }, { n: '陶喆', c: '#1ED760' },
];
const GENRES = ['华语流行', '粤语经典', '摇滚', '民谣', '电子', '古风', '爵士', '嘻哈', '轻音乐', '影视原声', 'K-POP', '乡村'];
const artistImgKv = createMMKV({ id: 'nextmusic-hd-artist-img' });

const HOT_WORDS = ['晴天', '后来', '海阔天空', '孤勇者', '起风了', '稻香', '红日', '月半小夜曲', '泡沫', '岁月神偷'];

export function HDSearch() {
  // lx139:热门歌手真照片头像——搜每位歌手取首曲封面缓存 MMKV
  const [artistImgs, setArtistImgs] = useState<Record<string, string>>(() => {
    try { return JSON.parse(artistImgKv.getString('m') || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    let dead = false;
    (async () => {
      const m = { ...artistImgs };
      for (const a of HOT_ARTISTS) {
        if (m[a.n]) continue;
        try {
          const r = await lxapi.search(a.n, 'kw', 1, 1);
          if (r[0]?.img) m[a.n] = r[0].img;
        } catch { /* 单个失败跳过 */ }
      }
      if (dead) return;
      setArtistImgs(m);
      try { artistImgKv.set('m', JSON.stringify(m)); } catch { /* ignore */ }
    })();
    return () => { dead = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const insets = useSafeAreaInsets();
  const { playSong, current } = usePlayer();
  const [kw, setKw] = useState('');
  const [mode, setMode] = useState<'song' | 'singer' | 'album'>('song'); // lx163:搜索类型
  const [singers, setSingers] = useState<{ id: string; name: string; img?: string; source?: string }[] | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; singer?: string; img?: string; source?: string }[] | null>(null);
  const [results, setResults] = useState<SongItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async (q: string, m = mode) => {
    const query = q.trim();
    if (!query) return;
    setBusy(true); setErr(null);
    try {
      if (m === 'singer') { setSingers(await api.searchSingers(query, 'kw')); return; } // lx163:服务器 extendSearch
      if (m === 'album') { setAlbums(await api.searchAlbums(query, 'kw')); return; }
      // lx163e:五源并行聚合,交错去重(与手机端同策略)
      const lists = await Promise.all(SOURCES.map(s => lxapi.search(query, s.id).catch(() => [] as SongItem[])));
      const seen = new Set<string>(); const merged: SongItem[] = [];
      for (let i = 0; i < 4; i++) for (const list of lists) {
        const s = list[i]; if (!s) continue;
        const k = `${s.name}|${s.singer}`;
        if (seen.has(k)) continue; seen.add(k); merged.push(s);
      }
      setResults(merged);
    } catch {
      setErr('搜索失败:无法连接音源');
      setResults([]);
    } finally { setBusy(false); }
  };

  // debounce 自动搜索
  useEffect(() => {
    const t = setTimeout(() => { if (kw.trim().length >= 2) search(kw); }, 600);
    return () => clearTimeout(t);
  }, [kw]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={st.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 22, paddingBottom: 26, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* lx163:类型 pill 歌曲/歌手/专辑 */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['song', '歌曲'], ['singer', '歌手'], ['album', '专辑']] as const).map(([m, label]) => (
            <HDTouch
              key={m}
              style={[st.pill, mode === m && st.pillOn]}
              focusStyle={mode === m ? { borderWidth: 2, borderColor: C.brandSoft } : st.pillFocus}
              onPress={() => { setMode(m); setSingers(null); setAlbums(null); if (kw.trim().length >= 2) search(kw, m); }}
            >
              <Text style={[st.pillLabel, mode === m && st.pillLabelOn]}>{label}</Text>
            </HDTouch>
          ))}
        </View>
        {/* 搜索框 */}
        <View style={st.searchRow}>
          <Icon name="search" size={15} color={C.text3} />
          <TextInput
            style={st.input}
            placeholder="搜索歌曲 / 歌手 / 专辑 / 歌单 / 播客…"
            placeholderTextColor={C.text3}
            value={kw}
            onChangeText={setKw}
            returnKeyType="search"
            onSubmitEditing={() => search(kw)}
          />
          {kw ? (
            <HDTouch style={st.clearBtn} focusStyle={false} onPress={() => { setKw(''); setResults(null); setSingers(null); setAlbums(null); }}>
              <Icon name="close" size={13} color={C.text2} />
            </HDTouch>
          ) : null}
        </View>

        {/* lx134:空闲态内容(老板:探索页太空)——热门歌手卡 + 风格分类 + 热搜词 */}
        {results == null && !kw.trim() ? (
          <View style={{ gap: 18, marginTop: 6 }}>
            <View style={{ gap: 9 }}>
              <Text style={st.secTitle}>热门歌手</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -24, marginRight: -14 }} contentContainerStyle={{ gap: 12, paddingLeft: 28, paddingRight: 12, paddingTop: 6, paddingBottom: 16 }}>
                {HOT_ARTISTS.map(a => (
                  <HDTouch key={a.n} style={[st.artistCard, shadowStyleOf(a.n)]} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }} onPress={() => { setKw(a.n); search(a.n); }}>
                    {artistImgs[a.n]
                      ? <Image source={{ uri: artistImgs[a.n] }} style={st.artistAvatar} />
                      : <View style={[st.artistAvatar, { backgroundColor: a.c }]}><Text style={st.artistGlyph}>{a.n[0]}</Text></View>}
                    <Text style={st.artistName} numberOfLines={1}>{a.n}</Text>
                  </HDTouch>
                ))}
              </ScrollView>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={st.secTitle}>分类发现</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GENRES.map(g => (
                  <HDTouch key={g} style={st.genrePill} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }} onPress={() => { setKw(g); search(g); }}>
                    <Text style={st.genreText}>{g}</Text>
                  </HDTouch>
                ))}
              </View>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={st.secTitle}>大家都在搜</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HOT_WORDS.map((w, i) => (
                  <HDTouch key={w} style={st.hotPill} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} onPress={() => { setKw(w); search(w); }}>
                    <Text style={[st.hotIdx, i < 3 && { color: C.brand }]}>{i + 1}</Text>
                    <Text style={st.hotText} numberOfLines={1}>{w}</Text>
                  </HDTouch>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* lx163:歌手结果 */}
        {mode === 'singer' && singers != null ? (
          <View style={{ gap: 2 }}>
            <Text style={st.secTitle}>{`「${kw}」的歌手`}</Text>
            {(singers || []).map(a => (
              <HDTouch key={a.id} style={st.resRow} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}
                onPress={() => hdNav()?.navigate('ArtistDetail', { artist: { id: a.id, name: a.name, img: a.img, source: a.source || 'wy' } })}>
                {a.img ? <Image source={{ uri: a.img }} style={st.resRound} /> : <View style={[st.resRound, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: C.text2, fontSize: 14, fontWeight: '700' }}>{a.name[0]}</Text></View>}
                <Text style={st.resName} numberOfLines={1}>{a.name}</Text>
                <Text style={st.srcTag}>{(a.source || 'wy').toUpperCase()}</Text>
              </HDTouch>
            ))}
            {!singers.length && !busy ? <Text style={st.empty}>没有找到相关歌手</Text> : null}
          </View>
        ) : null}
        {/* lx163:专辑结果 */}
        {mode === 'album' && albums != null ? (
          <View style={{ gap: 2 }}>
            <Text style={st.secTitle}>{`「${kw}」的专辑`}</Text>
            {(albums || []).map(al => (
              <HDTouch key={al.id} style={st.resRow} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}
                onPress={() => hdNav()?.navigate('AlbumDetail', { album: { id: al.id, name: al.name, singer: al.singer, img: al.img, source: al.source || 'wy' } })}>
                {al.img ? <Image source={{ uri: al.img }} style={st.resSquare} /> : <View style={[st.resSquare, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.resName} numberOfLines={1}>{al.name}</Text>
                  {al.singer ? <Text style={st.sub} numberOfLines={1}>{al.singer}</Text> : null}
                </View>
              </HDTouch>
            ))}
            {!albums.length && !busy ? <Text style={st.empty}>没有找到相关专辑</Text> : null}
          </View>
        ) : null}
        {/* 结果 */}
        {mode === 'song' && results != null ? (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 6 }}>
              <Text style={st.secTitle}>{err ? '搜索失败' : `「${kw}」的结果`}</Text>
              <Text style={st.secHint}>{err ? '' : `${results.length} 条 · 五源聚合`}</Text>
            </View>
            {err ? <Text style={st.empty}>{err}</Text> : null}
            {(results || []).map((s, i) => (
              <HDSongRow key={`${s.source}_${s.songmid}_${i}`} song={s} index={i + 1}
                playing={current?.songmid === s.songmid && current?.source === s.source}
                onPress={() => playSong(s, results || [s])} />
            ))}
            {!busy && !results.length && !err ? <Text style={st.empty}>{`没有找到「${kw}」相关内容`}</Text> : null}
          </View>
        ) : (
          <View style={st.tip}>
            <Icon name="search" size={28} color={C.text3} />
            <Text style={st.tipText}>输入关键词开始搜索(五源免登录直连)</Text>
          </View>
        )}
                         <FocusBridge active />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pill: { borderRadius: H.radius.pill, paddingHorizontal: 11, height: 26, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
  pillFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.pill },
  pillLabel: { color: C.text2, fontSize: H.font.sm },
  pillLabelOn: { color: C.onBrand, fontWeight: '600' },
  searchRow: {
    height: 40, borderRadius: 10, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9,
  },
  input: { flex: 1, color: C.text, fontSize: H.font.md, padding: 0 },
  clearBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secTitle: { color: C.text, fontSize: H.font.xl, fontWeight: '700' },
  secHint: { color: C.text3, fontSize: H.font.xs },
  idx: { width: 18, textAlign: 'right', color: C.text3, fontSize: H.font.sm, fontVariant: ['tabular-nums'] },
  art: { width: 34, height: 34, borderRadius: 5 },
  title: { color: C.text, fontSize: H.font.md, fontWeight: '500' },
  hiRes: { color: C.brand, fontSize: 8, borderWidth: 1, borderColor: 'rgba(30,215,96,.4)', borderRadius: 3, paddingHorizontal: 3 },
  sub: { color: C.text2, fontSize: H.font.sm },
  srcTag: { color: C.text3, fontSize: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: 3, paddingHorizontal: 4 },
  dur: { color: C.text3, fontSize: H.font.sm, width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  empty: { color: C.text3, fontSize: H.font.md, paddingVertical: 24, textAlign: 'center' },
  tip: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  tipText: { color: C.text3, fontSize: H.font.md },
  artistCard: { width: 90, height: 114, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 8 }, // lx143:恢复圆角底卡——无背景时 elevation 轮廓异常+投影乱
  artistAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, // lx139:真照片(Image 圆形)
  artistGlyph: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  artistName: { color: C.text, fontSize: 11, fontWeight: '600' },
  genrePill: { paddingHorizontal: 16, height: 32, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  genreText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  hotPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 34, borderRadius: 12, backgroundColor: C.surface },
  hotIdx: { color: C.text3, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hotText: { color: C.text, fontSize: 12, fontWeight: '500' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 54, paddingHorizontal: 8, borderRadius: 10 },
  resRound: { width: 42, height: 42, borderRadius: 21 },
  resSquare: { width: 42, height: 42, borderRadius: 7 },
  resName: { flex: 1, color: C.text, fontSize: H.font.md, fontWeight: '600' },
});
