import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';
import { Icon } from '../theme/Icon';
import { C, FW } from '../theme/tokens';
import { RADIUS, SPACE, TYPE } from '../theme/design-system';
import type { SongItem } from '../services/server';

/** A personal entry point based on actual playback history. */
export function ListeningHero({ song, onContinue, onBrowse }: { song?: SongItem; onContinue: () => void; onBrowse: () => void }) {
  const [width, setWidth] = useState(600);
  const action = <><Icon name={song ? 'play' : 'library'} size={20} color={C.onBrand} /><Text style={st.actionLabel}>{song ? '继续收听' : '浏览媒体库'}</Text></>;
  return <View accessibilityLabel="收听入口" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[st.hero, width < 460 && st.narrow]}>
    <View style={st.content}>
      {song?.img ? <Image source={{ uri: song.img }} style={st.art} /> : <View style={[st.art, st.placeholder]}><Icon name="music" size={28} color={C.text2} /></View>}
      <View style={st.copy}>
        <Text style={st.eyebrow}>{song ? '继续上次收听' : '你的音乐空间'}</Text>
        <Text style={st.title} numberOfLines={2}>{song?.name || '从你的音乐开始'}</Text>
        <Text style={st.subtitle} numberOfLines={2}>{song ? (song.singer || '最近播放') : '在媒体库找到熟悉的音乐，或从今日推荐发现新内容。'}</Text>
      </View>
    </View>
    {IS_HD ? <HDTouch accessibilityLabel={song ? '继续收听' : '浏览媒体库'} style={st.action} onPress={song ? onContinue : onBrowse} focusStyle={{ borderWidth: 2, borderColor: C.text, borderRadius: RADIUS.control }}>{action}</HDTouch> : <TouchableOpacity accessibilityRole="button" style={st.action} onPress={song ? onContinue : onBrowse}>{action}</TouchableOpacity>}
  </View>;
}
const st = StyleSheet.create({
  hero: { backgroundColor: C.surface, borderRadius: RADIUS.card, padding: SPACE.xl, gap: SPACE.xl, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.stroke },
  narrow: { flexDirection: 'column', alignItems: 'stretch', padding: SPACE.lg, gap: SPACE.lg },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, minWidth: 0 },
  art: { width: 64, height: 64, borderRadius: RADIUS.control },
  placeholder: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: SPACE.xs },
  eyebrow: { color: C.text2, fontSize: TYPE.caption, lineHeight: 18 },
  title: { color: C.text, fontSize: TYPE.subtitle, lineHeight: 26, fontWeight: FW.bold },
  subtitle: { color: C.text2, fontSize: TYPE.body, lineHeight: 20 },
  action: { minHeight: 48, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, borderRadius: RADIUS.control, backgroundColor: C.brand, flexShrink: 0 },
  actionLabel: { color: C.onBrand, fontSize: TYPE.label, fontWeight: FW.bold },
});
