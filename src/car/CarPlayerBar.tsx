// CarPlayerBar.tsx —— [车机播放条 1105] 96 高无进度行(时间并入副行),封面 60 r12
import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { CAR } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer, usePlayerProgress } from '../state/PlayerProvider';
import { fixCoverUrl } from '../utils/cover';

function fmtSec(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CarPlayerBar() {
  const { current, playing, toggle, skipNext, skipPrev } = usePlayer();
  const { duration } = usePlayerProgress();
  const img = current ? fixCoverUrl(current.img) : undefined;
  return (
    <View style={st.bar}>
      {current ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            {img ? <Image source={{ uri: img }} style={st.art} /> : <View style={[st.art, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={18} color={C.text3} /></View>}
            <View style={{ minWidth: 0, gap: 3 }}>
              <Text style={st.title} numberOfLines={1}>{current.name}</Text>
              <Text style={st.sub} numberOfLines={1}>
                {duration > 0 ? `${fmtSec(duration)} · ` : ''}{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
            <TouchableOpacity onPress={skipPrev} style={st.btn}><Icon name="previous" size={26} color={C.text} /></TouchableOpacity>
            <TouchableOpacity onPress={toggle} style={st.main}><Icon name={playing ? 'pause' : 'play'} size={30} active color={C.onBrand} /></TouchableOpacity>
            <TouchableOpacity onPress={skipNext} style={st.btn}><Icon name="next" size={26} color={C.text} /></TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={st.sub}>未在播放 · 从「为我推荐」选一首开始</Text>
        </View>
      )}
    </View>
  );
}

const st = {
  bar: { height: CAR.playbar.h, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: CAR.gutter, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  art: { width: CAR.playbar.art, height: CAR.playbar.art, borderRadius: CAR.playbar.r },
  title: { color: C.text, fontSize: 18, fontWeight: '700' as const },
  sub: { color: C.text3, fontSize: 14 },
  btn: { width: 46, height: 46, alignItems: 'center' as const, justifyContent: 'center' as const },
  main: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
};
