// CarPlaylist.tsx —— [车机 P5 歌单详情 1105] LEO 规格§1: 封面 280 r22 + 标题 38 + 按钮行(播放全部/随机/下载) + SongRow 全量
import { CarTouch } from './CarTouch';
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView } from 'react-native';
import { CAR } from './cartokens';
import { CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer } from '../state/PlayerProvider';
import { fixCoverUrl } from '../utils/cover';
import { lxapi } from '../services/lxapi';
import type { SongItem } from '../services/server';

export type CarPlRef = { kind: 'pl' | 'board'; id: string; name: string; img?: string; songs?: SongItem[] };

export function CarPlaylist({ pl, onBack }: { pl: CarPlRef; onBack: () => void }) {
  const player = usePlayer();
  const [songs, setSongs] = useState<SongItem[]>(pl.songs || []);
  const img = pl.img ? fixCoverUrl(pl.img) : undefined;
  useEffect(() => {
    if (pl.songs?.length) return;
    if (pl.kind === 'board') lxapi.leaderboardList(pl.id).then(setSongs).catch(() => {});
    else lxapi.songListDetail(pl.id).then(d => setSongs(d?.list || [])).catch(() => {});
  }, [pl.id]);
  return (
    <View style={{ flex: 1 }}>
      <CarTouch style={st.back} onPress={onBack}>
        <Icon name="back" size={18} color={C.text2} />
        <Text style={st.backLabel}>返回</Text>
      </CarTouch>
      <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
        <View style={st.head}>
          {img ? <Image source={{ uri: img }} style={st.cover} /> : <View style={[st.cover, { backgroundColor: C.surface2 }]} />}
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={st.title} numberOfLines={2}>{pl.name}</Text>
            <Text style={st.meta}>{`共 ${songs.length} 首`}</Text>
            <View style={st.btnRow}>
              <CarTouch style={st.playAll} onPress={() => songs[0] && void player.playSong(songs[0], songs)}>
                <Icon name="play" size={18} active color={C.onBrand} />
                <Text style={st.playAllText}>播放全部</Text>
              </CarTouch>
              <CarTouch style={st.subBtn} onPress={() => { const s = songs[Math.floor(Math.random() * songs.length)]; if (s) void player.playSong(s, songs); }}>
                <Text style={st.subText}>随机</Text>
              </CarTouch>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 18 }}>
          {songs.map((s, i) => (
            <CarSongRow key={`${i}${s.songmid}`} song={s} onPress={() => void player.playSong(s, songs)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = {
  back: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: CAR.gutter, paddingTop: 20, paddingBottom: 6 },
  backLabel: { color: C.text2, fontSize: 15 },
  head: { flexDirection: 'row' as const, gap: 26, alignItems: 'center' as const },
  cover: { width: 280, height: 280, borderRadius: 22 },
  title: { color: C.text, fontSize: 38, fontWeight: '800' as const },
  meta: { color: C.text2, fontSize: 16 },
  btnRow: { flexDirection: 'row' as const, gap: 14, marginTop: 8 },
  playAll: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, height: 56, paddingHorizontal: 28, borderRadius: 999, backgroundColor: C.brand },
  playAllText: { color: C.onBrand, fontSize: 16, fontWeight: '700' as const },
  subBtn: { height: 56, paddingHorizontal: 28, borderRadius: 999, borderWidth: 1.5, borderColor: '#FFFFFF30', alignItems: 'center' as const, justifyContent: 'center' as const },
  subText: { color: C.text, fontSize: 16 },
};
