// CarPages.tsx —— [车机 P2/P3/P4 1105] 探索(源pills+标签+封面网格)/榜单(4列渐变卡210)——LEO 播客频道数据源待补,先占位接现有
import { CarTouch } from './CarTouch';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { CAR, carScale, CAR_FS, CAR_ACCENTS, carGrid } from './cartokens';
import { CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { lxapi } from '../services/lxapi';
import { usePlayer } from '../state/PlayerProvider';
import type { SongItem, SongListMeta } from '../services/server';

function SecHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
      <Text style={{ color: C.text, fontSize: CAR_FS.sec, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: C.text3, fontSize: 13, paddingBottom: 2 }}>{hint}</Text> : null}
    </View>
  );
}

const SRC_TABS = ['推荐', '网易', '酷狗', 'QQ', '咪咕'];

/** P3 探索: 源 pills + 推荐歌单封面网格(6 列方形卡) */
export function CarExplore({ onOpenPlaylist }: { onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const { width: winW } = useWindowDimensions();
  const G = carGrid(winW); // [老板令1121#2] 统一栅格: 4列定宽+横滚,右边不留空
  const [tab, setTab] = useState(0);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);
  useEffect(() => { lxapi.songListAuto('', String(tab + 1), 1, 18, false).then(d => setMixes(d?.list || [])).catch(() => {}); }, [tab]);
  return (
    <ScrollView focusable={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR.hero, fontWeight: '800', marginBottom: 16 }}>探索</Text>
      <ScrollView focusable={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 14, marginBottom: 20 }}>
        {SRC_TABS.map((t, i) => (
          <CarTouch key={t} onPress={() => setTab(i)}
            style={[st.pill, tab === i && { backgroundColor: C.brand }]}>
            <Text style={[st.pillText, tab === i && { color: C.onBrand, fontWeight: '700' }]}>{t}</Text>
          </CarTouch>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: G.gap }}>
        {mixes.map(pl => (
          <CarTouch key={pl.id} onPress={() => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img })} style={[st.exCard, { width: G.cardW }]}>
            {pl.img ? <Image source={{ uri: pl.img }} style={st.exArt} /> : <View style={[st.exArt, { backgroundColor: C.surface2 }]} />}
            <Text style={st.exName} numberOfLines={2}>{pl.name}</Text>
          </CarTouch>
        ))}
      </View>
    </ScrollView>
  );
}

// [LEO 1107] 8 色降彩度一档 + accent token 化
const BOARD_ACCENTS = [CAR_ACCENTS.b3, CAR_ACCENTS.b7, CAR_ACCENTS.b8, CAR_ACCENTS.b2, CAR_ACCENTS.b4, CAR_ACCENTS.b1, CAR_ACCENTS.b3, CAR_ACCENTS.b5];

/** P4 榜单: 4 列卡 210 高(左上源chip+名+副行) */
export function CarBoards({ onOpenPlaylist }: { onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const { height, width: winW } = useWindowDimensions();
  const dense = carScale(height) < 0.9; // [720 紧凑档 1106]
  const G = carGrid(winW); // [老板令1121#2] 统一栅格: 4列满排无右侧空档
  const [boards, setBoards] = useState<{ id: string; name: string; bangid: string; image?: string }[]>([]);
  useEffect(() => { lxapi.leaderboardBoards().then(d => setBoards((d || []).slice(0, 8))).catch(() => {}); }, []);
  return (
    <ScrollView focusable={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <SecHead title="榜单" hint="每日 12:00 更新" />
      <View style={[st.bGrid, { gap: G.gap }]}>
        {boards.map((b, i) => (
          <CarTouch key={b.id} onPress={() => onOpenPlaylist({ kind: 'board', id: b.bangid, name: b.name, img: b.image })}
            style={[st.bCard, dense && st.bCardDense, { width: G.cardW, height: dense ? 168 : 196, backgroundColor: BOARD_ACCENTS[i % BOARD_ACCENTS.length], borderWidth: 1, borderColor: '#FFFFFF22' }]}>
            <Text style={st.bChip}>榜单</Text>
            <Text style={st.bName} numberOfLines={1}>{b.name}</Text>
            <Text style={st.bSub}>酷狗榜</Text>
          </CarTouch>
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
  const { height, width: winW } = useWindowDimensions();
  const dense = carScale(height) < 0.9; // [720 紧凑档 1106]
  const G = carGrid(winW); // [老板令1121#2] 统一栅格
  const [active, setActive] = useState(0);
  const [songs, setSongs] = useState<SongItem[]>([]);
  useEffect(() => {
    setSongs([]);
    lxapi.search(CHANNELS[active].q, 'kw', 1, 20).then(setSongs).catch(() => {});
  }, [active]);
  return (
    <ScrollView focusable={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800' }}>播客</Text>
      <Text style={{ color: C.text3, fontSize: CAR_FS.sub, marginTop: 4, marginBottom: 18 }}>8 大主题频道 · 搜索聚合 · 自动连播</Text>
      <View style={[st.chGrid, { gap: G.gap }]}>
        {CHANNELS.map((c, i) => (
          <CarTouch key={c.name} onPress={() => setActive(i)}
            style={[st.chCard, dense && st.chCardDense, { width: G.cardW, backgroundColor: c.accent, borderWidth: 1, borderColor: '#FFFFFF26' }, active === i && { borderWidth: 2, borderColor: '#FFFFFFAA' }]}>
            <Text style={st.chName}>{c.name}</Text>
            <Text style={st.chSub}>聚合频道</Text>
          </CarTouch>
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
  pill: { height: 44, borderRadius: 999, paddingHorizontal: 24, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  pillText: { color: C.text2, fontSize: CAR_FS.sub },
  exGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: CAR.gap },
  exCard: { padding: 8, gap: 8, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }, // [老板令1121#2] 卡底背景+描边,宽由 carGrid 动态传
  exCard6: { width: '18.6%', gap: 6 }, // [v7.9 1110] 6列变体也归 5 列主律
  exArt: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  exName: { color: C.text, fontSize: CAR_FS.mini, fontWeight: '600' as const },
  bGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  bCard: { borderRadius: CAR.bCard.r, padding: 18, justifyContent: 'flex-end' as const, gap: 4 },
  bChip: { position: 'absolute' as const, top: 14, left: 14, color: '#FFFFFF', fontSize: 12, backgroundColor: '#00000055', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bName: { color: '#FFFFFF', fontSize: CAR_FS.title, fontWeight: '700' as const },
  bSub: { color: '#FFFFFFB3', fontSize: CAR_FS.mini },
  chGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  chCard: { height: CAR.chCard.h, borderRadius: CAR.chCard.r, padding: 16, justifyContent: 'flex-end' as const, gap: 3 },
  chName: { color: '#FFFFFF', fontSize: CAR_FS.title, fontWeight: '700' as const },
  chSub: { color: '#FFFFFFB3', fontSize: CAR_FS.mini },
  chCardDense: { height: 108, padding: 13 },
  bCardDense: { height: 168, padding: 14 },
};
