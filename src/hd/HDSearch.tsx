// HD 搜索页:大输入框 + 五源 pill + 大行结果(车机触屏/遥控双友好)
import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { usePlayer } from '../state/PlayerProvider';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';

const SOURCES: { id: SearchSrc; label: string }[] = [
  { id: 'kw', label: '酷我' },
  { id: 'kg', label: '酷狗' },
  { id: 'wy', label: '网易' },
  { id: 'tx', label: 'QQ音乐' },
  { id: 'mg', label: '咪咕' },
];
type SearchSrc = 'kw' | 'kg' | 'wy' | 'tx' | 'mg';

export function HDSearch() {
  const insets = useSafeAreaInsets();
  const { playSong, current } = usePlayer();
  const [kw, setKw] = useState('');
  const [source, setSource] = useState<SearchSrc>('kw');
  const [results, setResults] = useState<SongItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const search = async (q: string, src = source) => {
    const query = q.trim();
    if (!query) return;
    setBusy(true); setErr(null);
    try {
      setResults(await lxapi.search(query, src));
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
      <View style={{ paddingTop: Math.max(insets.top, 22), paddingHorizontal: 34, gap: 16 }}>
        {/* 大搜索框 */}
        <View style={st.searchRow}>
          <Icon name="search" size={24} color={C.text2} />
          <TextInput
            ref={inputRef}
            style={st.input}
            placeholder="搜索歌曲 / 歌手 / 专辑…"
            placeholderTextColor={C.text3}
            value={kw}
            onChangeText={setKw}
            returnKeyType="search"
            onSubmitEditing={() => search(kw)}
          />
          {kw ? (
            <TouchableOpacity style={st.clearBtn} activeOpacity={0.8} onPress={() => { setKw(''); setResults(null); }}>
              <Icon name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 源 pill */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {SOURCES.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[st.pill, source === s.id && st.pillOn]}
              activeOpacity={0.85}
              onPress={() => { setSource(s.id); if (kw.trim().length >= 2) search(kw, s.id); }}
            >
              <Text style={[st.pillLabel, source === s.id && st.pillLabelOn]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {busy ? <ActivityIndicator color={C.brand} style={{ marginRight: 8 }} /> : null}
        </View>
      </View>

      {/* 结果 */}
      <ScrollView style={{ flex: 1, marginTop: 8 }} contentContainerStyle={{ paddingHorizontal: 34, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {err ? <Text style={st.err}>{err}</Text> : null}
        {results == null && !err ? (
          <View style={st.tip}>
            <Icon name="search" size={44} color={C.text3} />
            <Text style={st.tipText}>输入关键词开始搜索(五源免登录直连)</Text>
          </View>
        ) : null}
        {(results || []).map((s, i) => (
          <HDSongRow key={`${s.source}_${s.songmid}_${i}`} song={s} playing={current?.songmid === s.songmid && current?.source === s.source} onPress={() => playSong(s, results || [s])} />
        ))}
        {results != null && !results.length && !err ? <Text style={st.err}>没有找到相关内容</Text> : null}
      </ScrollView>
    </View>
  );
}

// HD 歌曲行:72 高、48 封面、17/13 字号(车机触控友好)
export function HDSongRow({ song, onPress, playing, extra }: { song: SongItem; onPress?: () => void; playing?: boolean; extra?: React.ReactNode }) {
  return (
    <TouchableOpacity activeOpacity={0.75} style={st.row} onPress={onPress} disabled={!onPress}>
      {song.img
        ? <Image source={{ uri: song.img }} style={st.art} />
        : <View style={[st.art, { backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text2} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[st.title, playing && { color: C.brand }]} numberOfLines={1}>{song.name}</Text>
        <Text style={st.sub} numberOfLines={1}>
          {song.singer}{song.albumName ? ` · ${song.albumName}` : ''}{song._types?.flac ? ' · 无损' : ''}
        </Text>
      </View>
      <Text style={st.dur}>{playing ? '正在播放' : song.interval}</Text>
      {extra != null ? extra : <View style={{ width: 24 }} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  searchRow: {
    height: 64, borderRadius: 14, backgroundColor: '#1E1E1E', flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 20, gap: 14,
  },
  input: { flex: 1, color: C.text, fontSize: 18, padding: 0 },
  clearBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  pill: { height: 44, borderRadius: 22, paddingHorizontal: 22, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand },
  pillLabel: { color: C.text2, fontSize: 15, fontWeight: '600' },
  pillLabelOn: { color: C.onBrand, fontWeight: '700' },
  row: { height: H.row, flexDirection: 'row', alignItems: 'center', gap: 16 },
  art: { width: 48, height: 48, borderRadius: 8 },
  title: { color: C.text, fontSize: 17, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 13 },
  dur: { color: C.text2, fontSize: 13, width: 76, textAlign: 'right' },
  err: { color: C.text2, fontSize: 15, paddingVertical: 40, textAlign: 'center' },
  tip: { alignItems: 'center', gap: 14, paddingVertical: 70 },
  tipText: { color: C.text3, fontSize: 15 },
});
