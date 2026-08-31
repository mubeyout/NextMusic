// HDSongRow:HD 全场景歌曲行(搜索/播客/歌单详情共用)
// v4 老板反馈:行占满整行、文字留 padding、焦点/选中态贴附不生硬、播放中品牌绿
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import type { SongItem } from '../services/server';

export function HDSongRow({ song, index, onPress, playing, showAlbum = true, first }: {
  song: SongItem;
  index?: number;
  onPress?: () => void;
  playing?: boolean;
  showAlbum?: boolean;
  first?: boolean;
}) {
  return (
    <HDTouch
      style={st.row}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.row }}
      focusBg={C.surface}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      hasTVPreferredFocus={first}
    >
      <Text style={[st.idx, playing && { color: C.brand }]}>{playing ? '▶' : index != null ? index : ''}</Text>
      {song.img
        ? <Image source={{ uri: song.img }} style={st.art} />
        : <View style={[st.art, { backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={12} color={C.text3} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={[st.title, playing && { color: C.brand }]} numberOfLines={1}>
          {song.name}
          {song._types?.flac ? <Text style={st.hiRes}> 无损</Text> : null}
        </Text>
        <Text style={st.sub} numberOfLines={1}>{song.singer}{showAlbum && song.albumName ? ` · ${song.albumName}` : ''}</Text>
      </View>
      <View style={st.srcTag}><Text style={st.srcTagText}>{song.source}</Text></View>
      <Text style={st.dur}>{playing ? '播放中' : song.interval}</Text>
    </HDTouch>
  );
}

const st = StyleSheet.create({
  // 整行占满(父容器全宽),左右留 16 padding —— 老板反馈「一行没有占满/文字太贴边」
  row: {
    minHeight: 52, borderRadius: H.radius.row, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  idx: { color: C.text3, fontSize: H.font.md, fontVariant: ['tabular-nums'], width: 24, textAlign: 'center' },
  art: { width: 36, height: 36, borderRadius: 6 },
  title: { color: C.text, fontSize: H.font.md, fontWeight: '600' },
  sub: { color: C.text3, fontSize: H.font.xs },
  hiRes: { color: C.brand, fontSize: 7, fontWeight: '700' },
  srcTag: { backgroundColor: C.elev, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  srcTagText: { color: C.text3, fontSize: 7, fontWeight: '600', letterSpacing: 0.5 },
  dur: { color: C.text3, fontSize: H.font.sm, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
});
