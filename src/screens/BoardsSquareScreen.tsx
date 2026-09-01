// 榜单广场：全部榜单独立页（探索-榜单「查看全部」目的页）
// 5 源切换（与搜索页同源集：kw/kg/wy/tx/mg）+ 2 列渐变网格卡；点击进 PlaylistDetail 榜单详情
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';
import { toast } from '../components/Dialog';

type Board = { id: string; name: string; bangid: string };
const SOURCES: { key: string; label: string; sub: string }[] = [
  { key: 'kw', label: '酷我', sub: '酷我榜' },
  { key: 'kg', label: '酷狗', sub: '酷狗榜' },
  { key: 'wy', label: '网易', sub: '网易榜' },
  { key: 'tx', label: 'QQ音乐', sub: 'QQ榜' },
  { key: 'mg', label: '咪咕', sub: '咪咕榜' },
];

const ACCENTS: [string, string][] = [
  [C.brand, '#1F5E3A'], ['#1F87D6', '#1F3A6E'], ['#B01F87', '#5E1F4E'],
  ['#D67A1F', '#6E3A1F'], ['#871FD6', '#3A1F5E'], ['#1FD6C0', '#1F5E5A'],
];

export function BoardsSquareScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const [src, setSrc] = useState('kg');
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    setBoards(null);
    lxapi.leaderboardBoards(src)
      .then(bs => { if (!dead) setBoards(bs); })
      .catch(() => { if (!dead) setBoards([]); });
    return () => { dead = true; };
  }, [src]);

  const openBoard = useCallback(async (b: Board) => {
    setBusy(true);
    const list = await lxapi.leaderboardList(b.bangid, src).catch(() => [] as SongItem[]);
    setBusy(false);
    if (list.length) nav.navigate('PlaylistDetail', { title: b.name, songs: list, meta: `${list.length} 首 · 榜单` });
    else toast('榜单加载失败，稍后重试');
  }, [nav, src]);

  return (
    <View style={st.screen}>
      <PageHeader title="榜单广场" />
      <View style={st.srcRow}>
        {SOURCES.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[st.srcPill, src === s.key && st.srcPillOn]}
            activeOpacity={0.85}
            onPress={() => setSrc(s.key)}
          >
            <Text style={[st.srcLabel, src === s.key && st.srcLabelOn]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={st.count}>{boards?.length ? `${boards.length} 个榜单` : ''}</Text>
      </View>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {boards == null ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : boards.length ? (
          <View style={st.grid}>
            {boards.map((b, i) => (
              <TouchableOpacity key={b.id + b.bangid} style={st.cell} activeOpacity={0.85} onPress={() => openBoard(b)}>
                <LinearGradient
                  colors={[ACCENTS[i % ACCENTS.length][0], ACCENTS[i % ACCENTS.length][1]]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={st.card}
                >
                  <Text style={st.name} numberOfLines={2}>{b.name}</Text>
                  <Text style={st.sub}>{SOURCES.find(s => s.key === src)?.sub ?? '榜单'} ›</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={st.empty}>榜单加载失败，下拉返回重试</Text>
        )}
      </ScrollView>
      {busy ? (
        <View style={st.busyWrap}><ActivityIndicator color={C.brand} /></View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  srcPill: { height: 32, borderRadius: 16, paddingHorizontal: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  srcPillOn: { backgroundColor: C.brand },
  srcLabel: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '600' },
  srcLabelOn: { color: C.onBrand },
  count: { color: C.text2, fontSize: 11, lineHeight: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48.5%' },
  card: { height: 76, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 12, justifyContent: 'center', gap: 3 },
  cardArt: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  cardShade: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#00000088' },
  cardTextWrap: { gap: 3 },
  name: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  sub: { color: C.text2, fontSize: 9, lineHeight: 11 },
  center: { paddingVertical: 48, alignItems: 'center' },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  busyWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000055' },
});
