// cards.tsx —— [车机专属卡 1105] BigCard/RecCard/SongRow 车机参数版(LEO 规格 §1/§4)
import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { CAR } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import type { SongItem } from '../services/server';

/** 双大卡(每日精选/私人雷达): 横条 156 高 r17 + badge/title/sub/play */
export function CarBigCard({ badge, title, sub, accent, onPress, playing }: {
  badge: string; title: string; sub: string; accent: string; onPress: () => void; playing?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[st.bigCard, { backgroundColor: accent }]}>
      {/* [LEO 定谳 1105] 去渐变令延伸车机族——纯色深底(取原渐变主色),层级靠明度差+白字;例外:播放页黑胶放射渐变(拟物)+侧栏 tint */}
      <View style={st.bigTexts}>
        <Text style={st.bigBadge}>{badge}</Text>
        <Text style={st.bigTitle}>{title}</Text>
        <Text style={st.bigSub}>{sub}</Text>
      </View>
      <View style={st.bigPlay}>
        <Icon name={playing ? 'pause' : 'play'} size={22} active color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

/** 歌单竖卡(rail 内): 138 宽真实封面 + 右下播放钮 + 名/副行 */
export function CarRecCard({ img, name, sub, fallback, onPress }: {
  img?: string; name: string; sub?: string; fallback?: any; onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={st.recCard}>
      {img ? <Image source={{ uri: img }} style={st.recArt} /> : fallback ? <Image source={fallback} style={st.recArt} /> : <View style={[st.recArt, { backgroundColor: C.surface2 }]} />}
      <View style={st.recPlay}><Icon name="play" size={18} active color="#FFFFFF" /></View>
      <Text style={st.recName} numberOfLines={1}>{name}</Text>
      {sub ? <Text style={st.recSub} numberOfLines={1}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

/** 车机歌曲行: 88 高/封面 72 r12/名 16/副 13/时长 15 */
export function CarSongRow({ song, onPress }: { song: SongItem; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={st.songRow}>
      {song.img
        ? <Image source={{ uri: song.img }} style={st.songArt} />
        : <View style={[st.songArt, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={20} color={C.text3} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={st.songName} numberOfLines={1}>{song.name}</Text>
        <Text style={st.songSub} numberOfLines={1}>{song.singer}{song.albumName ? ` · ${song.albumName}` : ''}</Text>
      </View>
      {song.interval ? <Text style={st.songTime}>{song.interval}</Text> : null}
    </TouchableOpacity>
  );
}

const st = {
  bigCard: { height: CAR.bigCard.h, borderRadius: CAR.bigCard.r, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 24, gap: 16, flex: 1 },
  bigTexts: { flex: 1, gap: 5 },
  bigBadge: { color: '#FFFFFFCC', fontSize: 15, fontWeight: '600' as const },
  bigTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' as const },
  bigSub: { color: '#FFFFFFA8', fontSize: 15 },
  bigPlay: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF38', alignItems: 'center' as const, justifyContent: 'center' as const },
  recCard: { width: CAR.recCard.w, gap: 7 },
  recArt: { width: CAR.recCard.w, height: CAR.recCard.w, borderRadius: CAR.recCard.r },
  recPlay: { position: 'absolute' as const, right: 4, top: CAR.recCard.w - 46, width: 38, height: 38, borderRadius: 19, backgroundColor: '#00000066', alignItems: 'center' as const, justifyContent: 'center' as const },
  recName: { color: C.text, fontSize: 13, fontWeight: '500' as const },
  recSub: { color: C.text3, fontSize: 13 },
  songRow: { height: CAR.songRow.h, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18, borderBottomWidth: 1, borderBottomColor: '#FFFFFF0F' },
  songArt: { width: CAR.songRow.art, height: CAR.songRow.art, borderRadius: CAR.songRow.r },
  songName: { color: C.text, fontSize: CAR.body, fontWeight: '600' as const },
  songSub: { color: C.text3, fontSize: 13 },
  songTime: { color: C.text3, fontSize: 15 },
};
