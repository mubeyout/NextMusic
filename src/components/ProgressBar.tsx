import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { C } from '../theme/tokens';

// 3px track at the bottom edge of MiniPlayer (Figma progress/track)
// lx168(动效评审):进度平滑化——pct 每秒跳变改为 400ms ease-out 补间,条不再一格一格顿
export function ProgressBar({ pct }: { pct: number }) {
  const w = useRef(new Animated.Value(Math.max(pct, 0.001))).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.max(pct, 0.001),
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [pct, w]);
  return (
    <View style={st.track} pointerEvents="none">
      <Animated.View style={[st.value, { flex: w }]} />
      <View style={{ flex: Math.max(1 - pct, 0.001) }} />
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: 3, flexDirection: 'row', backgroundColor: C.inset },
  value: { backgroundColor: C.brand },
});
