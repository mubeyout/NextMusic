// CarPages.tsx —— [车机 P2/P3/P4 1105] 探索(源pills+标签+封面网格)/榜单(4列渐变卡210)——LEO 播客频道数据源待补,先占位接现有
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { CAR } from './cartokens';
import { CarSongRow } from './cards';
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

/** P2 播客: 搜索聚合运营位(LEO 映射 1105——无播客 API,频道绑搜索词调 lxapi.search 零新增) */
const CHANNELS: { name: string; q: string; accent: string }[] = [
  { name: '夜驾', q: '深夜电台 助眠', accent: '#3B2F6F' },
  { name: '新闻', q: '新闻资讯', accent: '#1E5F56' },
  { name: '故事', q: '有声小说 评书', accent: '#6E4A2F' },
  { name: '相声', q: '相声 德云社', accent: '#52486B' },
  { name: '儿童', q: '儿歌 睡前故事', accent: '#2F6B6B' },
  { name: '音乐台', q: '热歌 歌单', accent: '#1ED760' },
  { name: '情感', q: '情感电台', accent: '#6B3A4A' },
  { name: '财经', q: '财经早报', accent: '#3A4A5C' },
];

export function CarPodcast() {
  const player = usePlayer();
  const [active, setActive] = useState(0);
  const [songs, setSongs] = useState<SongItem[]>([]);
  useEffect(() => {
    setSongs([]);
    lxapi.search(CHANNELS[active].q, 'kw', 1, 20).then(setSongs).catch(() => {});
  }, [active]);
  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR.hero, fontWeight: '800' }}>播客</Text>
      <Text style={{ color: C.text3, fontSize: 15, marginTop: 4, marginBottom: 18 }}>8 大主题频道 · 搜索聚合 · 自动连播</Text>
      <View style={st.chGrid}>
        {CHANNELS.map((c, i) => (
          <TouchableOpacity key={c.name} activeOpacity={0.85} onPress={() => setActive(i)}
            style={[st.chCard, { backgroundColor: c.accent }, active === i && { borderWidth: 3, borderColor: '#FFFFFF66' }]}>
            <Text style={st.chName}>{c.name}</Text>
            <Text style={st.chSub}>聚合频道</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ marginTop: 24 }}>
        <SecHead title={`${CHANNELS[active].name} · 热门节目`} hint="搜索聚合 top4" />
        {songs.slice(0, 4).map((s, i) => (
          <CarSongRow key={`${i}${s.songmid}`} song={s} onPress={() => void player.playSong(s, songs)} />
        ))}
      </View>
    </ScrollView>
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
  chGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: CAR.gap },
  chCard: { width: '23%', height: CAR.chCard.h, borderRadius: CAR.chCard.r, padding: 16, justifyContent: 'flex-end' as const, gap: 3 },
  chName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' as const },
  chSub: { color: '#FFFFFFB3', fontSize: 13 },
};
