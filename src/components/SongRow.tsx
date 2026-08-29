import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import type { SongItem } from '../services/server';

// Figma Song Row: 350x46, art 46x46 r=6, title 13 w500 / sub 10, duration right, more icon 20
// extra: 右侧操作位（下载按钮等）；不传则显示 more 图标
export function SongRow({ song, onPress, playing, extra }: { song: SongItem; onPress?: () => void; playing?: boolean; extra?: React.ReactNode }) {
  return (
    <TouchableOpacity activeOpacity={0.7} style={st.row} onPress={onPress} disabled={!onPress}>
      <View style={st.artWrap}>
        {song.img ? <Image source={{ uri: song.img }} style={st.art} /> : <View style={[st.art, st.fallback]} />}
      </View>
      <View style={st.meta}>
        <Text style={[st.title, playing && { color: 'C.brand' }]} numberOfLines={1}>{song.name}</Text>
        <Text style={st.sub} numberOfLines={1}>
          {song.singer}{song.albumName ? ` · ${song.albumName}` : ''}{song._types?.flac ? ' · 无损' : ''}
        </Text>
      </View>
      <Text style={st.dur}>{playing ? '正在播放' : song.interval}</Text>
      <View style={st.more}>
        {extra != null ? extra : <Icon name="more" size={20} color={C.text2} />}
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  row: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 10 },
  artWrap: { width: 46, height: 46, borderRadius: 6, overflow: 'hidden' },
  art: { width: 46, height: 46 },
  fallback: { backgroundColor: '#2A2A2A' },
  meta: { flex: 1, gap: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 10, lineHeight: 15 },
  dur: { color: C.text2, fontSize: 10, lineHeight: 15 },
  more: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 0 },
});
