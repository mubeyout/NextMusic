// HD 榜单页 —— 桌面版风格:五源 pill + 榜单卡片网格,点击拉榜进 PlaylistDetail(复用)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';

type Board = { id: string; name: string; bangid: string; image?: string };
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
    // SWR:切源时保留旧榜单直到新数据到达 —— 避免加载空窗期 D-pad 焦点搜索落空漂回侧栏
    lxapi.leaderboardBoards(src)
      .then(bs => { if (!dead) setBoards(bs); })
      .catch(() => { if (!dead) setBoards(prev => prev || []); });
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
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 22, paddingBottom: 26, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={st.title}>榜单广场</Text>
        <View style={{ flex: 1 }} />
        {busy ? <ActivityIndicator color={C.brand} size="small" /> : null}
        {boards ? <Text style={st.count}>{boards.length} 个榜单</Text> : null}
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

      {boards == null ? (
        <View style={st.tip}><ActivityIndicator color={C.brand} size="large" /><Text style={st.tipText}>榜单加载中…</Text></View>
      ) : (
        <View style={st.grid}>
          {boards.map((b, i) => (
            <HDTouch key={b.id} onPress={() => openBoard(b)} activeOpacity={0.85}
              focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 11 }}>
              {b.image ? (
                <Image source={{ uri: b.image }} style={st.card} />
              ) : (
                <LinearGradient colors={ACCENTS[i % ACCENTS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.card}>
                  <View style={st.cardRank}><Icon name="ranking" size={16} color="#FFFFFF88" /></View>
                  <Text style={st.cardName} numberOfLines={2}>{b.name}</Text>
                  <Text style={st.cardSub}>查看完整榜单 ›</Text>
                </LinearGradient>
              )}
            </HDTouch>
          ))}
        </View>
      )}
      {boards != null && !boards.length ? <Text style={st.tipText}>榜单加载失败,切源重试</Text> : null}
    </ScrollView>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: 138, height: 84, borderRadius: 11, padding: 11, justifyContent: 'flex-end', gap: 2, overflow: 'hidden' },
  cardRank: { position: 'absolute', top: 10, right: 10 },
  cardName: { color: '#fff', fontSize: H.font.md, fontWeight: '800' },
  cardSub: { color: '#FFFFFF77', fontSize: 8 },
  tip: { alignItems: 'center', gap: 10, paddingVertical: 54 },
  tipText: { color: C.text2, fontSize: H.font.md, textAlign: 'center', paddingVertical: 30 },
});
