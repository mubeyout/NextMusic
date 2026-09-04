import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { usePlayer } from '../state/PlayerProvider';
import { ProgressBar } from './ProgressBar';
import { CollectSheet } from './CollectSheet';
import { isFav } from '../state/favorites';

// Figma Player/Mini: 350x72 r=8, art 52x52 r=6, meta center-left, right icons
export function MiniPlayer() {
  const { current, playing, position, duration, toggle, cast } = usePlayer();
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [collect, setCollect] = useState(false);
  if (!current) return null;
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  const faved = isFav(current);
  return (
    <View style={st.wrap}>
      <TouchableOpacity activeOpacity={0.9} style={st.card} onPress={() => nav.navigate('Player')}>
        <View style={st.row}>
          <View style={st.artWrap}>
            {current.img ? <Image source={{ uri: current.img }} style={st.art} /> : <View style={[st.art, st.artFallback]} />}
          </View>
          <View style={st.meta}>
            <Text style={st.title} numberOfLines={1}>{current.name}</Text>
            <Text style={st.sub} numberOfLines={1}>{current.singer}{current._types?.flac ? ' · 无损' : ''}</Text>
          </View>
          <TouchableOpacity style={st.iconBtn} hitSlop={6} onPress={() => nav.navigate('Route')}>
            <Icon name="devices" size={20} color={cast ? C.brand : C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} hitSlop={6} onPress={() => setCollect(true)}>
            <Icon name="heart" size={20} active={faved} color={faved ? '#FF5A76' : C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={st.playBtn} hitSlop={4} onPress={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={24} color={C.onBrand} />
          </TouchableOpacity>
        </View>
        <ProgressBar pct={pct} />
      </TouchableOpacity>
      <CollectSheet song={current} visible={collect} onClose={() => setCollect(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 0 }, // vc78：老板要求沾满整行，左右不留间隙
  card: { height: 76, borderRadius: 0, backgroundColor: C.elev, overflow: 'hidden' },
  row: { height: 73, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 0 }, // 固定高度:进度条恒在底边(v1.1.5 修错位)
  artWrap: { width: 52, height: 52, borderRadius: 6, overflow: 'hidden' },
  art: { width: 52, height: 52 },
  artFallback: { backgroundColor: C.surface2 },
  meta: { flex: 1, marginLeft: 12, gap: 2, minWidth: 0 },
  title: { color: C.text, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 11, lineHeight: 13 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.inset,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  playBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
});
