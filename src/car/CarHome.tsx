// CarHome.tsx —— [车机 P1 为我推荐 1105] LEO v7 规格 §1: 问候 hero + 双大卡 + 最近播放行 + 推荐歌单 rail
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { CAR, carScale } from './cartokens';
import { CarBigCard, CarRecCard, CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { lxapi } from '../services/lxapi';
import { getRecents } from '../state/recent';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import type { SongItem, SongListMeta } from '../services/server';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function SecHead({ title, hint, more, onMore }: { title: string; hint?: string; more?: boolean; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
      <Text style={{ color: C.text, fontSize: CAR.secTitle, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: C.text3, fontSize: 13, paddingBottom: 2 }}>{hint}</Text> : null}
      {more ? <TouchableOpacity onPress={onMore} style={{ marginLeft: 'auto' }}><Text style={{ color: C.brand, fontSize: 15 }}>更多 ›</Text></TouchableOpacity> : null}
    </View>
  );
}

export function CarHome({ goExplore, onOpenPlaylist }: { goExplore: () => void; onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const player = usePlayer();
  // [720 紧凑档 1106] 屏高 <800(车机横屏)→卡片压缩,首屏保密度
  const { height } = useWindowDimensions();
  const dense = carScale(height) < 0.9;
  const { username } = useApp();
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);

  useEffect(() => {
    setRecents(getRecents().slice(0, 3));
    lxapi.songListAuto('', '5', 1, 12, false).then(d => setMixes((d?.list || []).slice(0, 6))).catch(() => {});
  }, []);

  // 歌单卡点击→P5 详情页(下批实施;骨架期 noop)

  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR.hero, fontWeight: '800', marginBottom: 20 }}>
        {username ? `${greeting()}，${username}` : greeting()}
      </Text>

      {/* 双大卡: 每日精选 / 私人雷达 (v7 真版基准组件) */}
      <View style={{ flexDirection: 'row', gap: CAR.gap, marginBottom: CAR.sectionGap }}>
        <CarBigCard dense={dense} badge="每日精选" title="30 首热歌" sub="每天更新" accent="#3B2F6F"
          onPress={() => { if (recents.length) void player.playSong(recents[0], recents); }} />
        <CarBigCard dense={dense} badge="私人雷达" title="你最近循环的歌" sub="根据口味生成" accent="#1E5F56"
          onPress={() => { if (recents.length) void player.playSong(recents[0], recents); }} />
      </View>

      {recents.length > 0 && (
        <View style={{ marginBottom: CAR.sectionGap }}>
          <SecHead title="最近播放" />
          {recents.map((s, i) => (
            <CarSongRow key={`r${i}`} song={s} onPress={() => void player.playSong(s, recents)} />
          ))}
        </View>
      )}

      {mixes.length > 0 && (
        <View style={{ marginBottom: CAR.sectionGap }}>
          <SecHead title="推荐歌单" hint="五源聚合" more onMore={goExplore} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: CAR.gap }}>
            {mixes.map(pl => (
              <CarRecCard key={pl.id} img={pl.img} name={pl.name} sub={pl.total ? `共 ${pl.total} 首` : undefined}
                onPress={() => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img })} />
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}
