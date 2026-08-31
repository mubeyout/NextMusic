// HD 榜单页:五源 pill + 榜单网格(横版 4-5 列),点击拉榜进 PlaylistDetail(复用)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';

type Board = { id: string; name: string; bangid: string };
const SOURCES: { key: string; label: string }[] = [
  { key: 'kg', label: '酷狗' },
  { key: 'kw', label: '酷我' },
  { key: 'wy', label: '网易' },
  { key: 'tx', label: 'QQ音乐' },
  { key: 'mg', label: '咪咕' },
];

const ACCENTS: [string, string][] = [
  ['#1F5E3A', '#0F2E1F'], ['#1F87D6', '#1F3A6E'], ['#B01F87', '#5E1F4E'],
  ['#D67A1F', '#6E3A1F'], ['#871FD6', '#3A1F5E'], ['#1FD6C0', '#1F5E5A'],
];

export function HDBoards() {
  const insets = useSafeAreaInsets();
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

  const openBoard = async (b: Board) => {
    if (busy) return;
    setBusy(true);
    const list = await lxapi.leaderboardList(b.bangid, src).catch(() => [] as SongItem[]);
    setBusy(false);
    if (list.length) hdNav()?.navigate('PlaylistDetail', { title: b.name, songs: list, meta: `${list.length} 首 · 榜单` });
    else toast('榜单加载失败,稍后重试');
  };

  return (
    <View style={st.screen}>
      <View style={{ paddingTop: Math.max(insets.top, 22), paddingHorizontal: 34, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Text style={st.title}>榜单广场</Text>
          <View style={{ flex: 1 }} />
          {busy ? <ActivityIndicator color={C.brand} /> : null}
          {boards ? <Text style={st.count}>{boards.length} 个榜单</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {SOURCES.map(s => (
            <TouchableOpacity key={s.key} style={[st.pill, src === s.key && st.pillOn]} activeOpacity={0.85} onPress={() => setSrc(s.key)}>
              <Text style={[st.pillLabel, src === s.key && st.pillLabelOn]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 34, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {boards == null ? (
          <View style={st.tip}><ActivityIndicator color={C.brand} size="large" /><Text style={st.tipText}>榜单加载中…</Text></View>
        ) : (
          <View style={st.grid}>
            {boards.map((b, i) => (
              <TouchableOpacity key={b.id} activeOpacity={0.85} onPress={() => openBoard(b)}>
                <LinearGradient colors={ACCENTS[i % ACCENTS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.card}>
                  <View style={st.cardRank}><Icon name="explore" size={22} color="#FFFFFF88" /></View>
                  <Text style={st.cardName} numberOfLines={2}>{b.name}</Text>
                  <Text style={st.cardSub}>查看完整榜单 ›</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {boards != null && !boards.length ? <Text style={st.tipText}>榜单加载失败,切源重试</Text> : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 24, fontWeight: '800' },
  count: { color: C.text3, fontSize: 13 },
  pill: { height: 44, borderRadius: 22, paddingHorizontal: 22, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: C.brand },
  pillLabel: { color: C.text2, fontSize: 15, fontWeight: '600' },
  pillLabelOn: { color: C.onBrand, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { width: 210, height: 120, borderRadius: 14, padding: 16, justifyContent: 'flex-end', gap: 3 },
  cardRank: { position: 'absolute', top: 14, right: 14 },
  cardName: { color: C.text, fontSize: 17, fontWeight: '800' },
  cardSub: { color: '#FFFFFF77', fontSize: 11 },
  tip: { alignItems: 'center', gap: 14, paddingVertical: 70 },
  tipText: { color: C.text2, fontSize: 15, textAlign: 'center', paddingVertical: 40 },
});
