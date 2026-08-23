import React from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../theme/tokens';

// 3px track at the bottom edge of MiniPlayer (Figma progress/track)
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={st.track} pointerEvents="none">
      <View style={[st.value, { flex: Math.max(pct, 0.001) }]} />
      <View style={{ flex: Math.max(1 - pct, 0.001) }} />
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: 3, flexDirection: 'row', backgroundColor: '#242424' },
  value: { backgroundColor: C.brand },
});
