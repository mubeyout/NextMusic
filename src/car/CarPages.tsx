// CarPages.tsx —— [车机 P2/P3/P4 1105] 探索(源pills+标签+封面网格)/榜单(4列渐变卡210)——LEO 播客频道数据源待补,先占位接现有
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { CAR } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { lxapi } from '../services/lxapi';
import { usePlayer } from '../state/PlayerProvider';
import type { SongItem, SongListMeta } from '../services/server';

function SecHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
      <Text style={{ color: C.text, fontSize: CAR.secTitle, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: C.text3, fontSize: 13, paddingBottom: 2 }}>{hint}</Text> : null}
    </View>
  );
}

const SRC_TABS = ['推荐', '网易', '酷狗', 'QQ', '咪咕'];

/** P3 探索: 源 pills + 推荐歌单封面网格(6 列方形卡) */
export function CarExplore({ onOpenPlaylist }: { onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const [tab, setTab] = useState(0);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);
  useEffect(() => { lxapi.songListAuto('', String(tab + 1), 1, 18, false).then(d => setMixes(d?.list || [])).catch(() => {}); }, [tab]);
  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR.hero, fontWeight: '800', marginBottom: 18 }}>探索</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        {SRC_TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(i)} activeOpacity={0.85}
            style={[st.pill, tab === i && { backgroundColor: C.brand }]}>
            <Text style={[st.pillText, tab === i && { color: C.onBrand, fontWeight: '700' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.exGrid}>
        {mixes.map(pl => (
          <TouchableOpacity key={pl.id} activeOpacity={0.85} onPress={() => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img })} style={st.exCard}>
            {pl.img ? <Image source={{ uri: pl.img }} style={st.exArt} /> : <View style={[st.exArt, { backgroundColor: C.surface2 }]} />}
            <Text style={st.exName} numberOfLines={2}>{pl.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const BOARD_ACCENTS = ['#AD4714', '#611A2E', '#242E6B', '#1A6B54', '#1F387A', '#66297A', '#7A4D1A', '#145059'];

/** P4 榜单: 4 列卡 210 高(左上源chip+名+副行) */
export function CarBoards({ onOpenPlaylist }: { onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const [boards, setBoards] = useState<{ id: string; name: string; bangid: string; image?: string }[]>([]);
  useEffect(() => { lxapi.leaderboardBoards().then(d => setBoards((d || []).slice(0, 8))).catch(() => {}); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <SecHead title="榜单" hint="每日 12:00 更新" />
      <View style={st.bGrid}>
        {boards.map((b, i) => (
          <TouchableOpacity key={b.id} activeOpacity={0.85} onPress={() => onOpenPlaylist({ kind: 'board', id: b.bangid, name: b.name, img: b.image })}
            style={[st.bCard, { backgroundColor: BOARD_ACCENTS[i % BOARD_ACCENTS.length] }]}>
            <Text style={st.bChip}>榜单</Text>
            <Text style={st.bName} numberOfLines={2}>{b.name}</Text>
            <Text style={st.bSub}>酷狗榜</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

/** P2 播客: LEO 频道数据源待补——骨架接搜索占位(死线循环,补到即换) */
export function CarPodcast() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: CAR.gutter }}>
      <Icon name="podcast" size={48} color={C.text3} />
      <Text style={{ color: C.text2, fontSize: CAR.secTitle, fontWeight: '700', marginTop: 16 }}>播客</Text>
      <Text style={{ color: C.text3, fontSize: 15, marginTop: 8 }}>频道数据源 LEO 补齐中(死线循环)</Text>
    </View>
  );
}

const st = {
  pill: { height: 44, borderRadius: 999, paddingHorizontal: 24, backgroundColor: '#FFFFFF10', alignItems: 'center' as const, justifyContent: 'center' as const },
  pillText: { color: C.text2, fontSize: 15 },
  exGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: CAR.gap },
  exCard: { width: '15.2%', gap: 8 },
  exArt: { width: '100%', aspectRatio: 1, borderRadius: 14 },
  exName: { color: C.text, fontSize: 14, fontWeight: '600' as const },
  bGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: CAR.gap },
  bCard: { width: '23%', height: CAR.bCard.h, borderRadius: CAR.bCard.r, padding: 18, justifyContent: 'flex-end' as const, gap: 4 },
  bChip: { position: 'absolute' as const, top: 14, left: 14, color: '#FFFFFF', fontSize: 12, backgroundColor: '#00000055', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' as const },
  bSub: { color: '#FFFFFFB3', fontSize: 13 },
};
