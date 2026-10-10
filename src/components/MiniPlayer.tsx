import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { usePlayer } from '../state/PlayerProvider';
import { ProgressBar } from './ProgressBar';
import { CollectSheet } from './CollectSheet';
import { useFav } from '../state/useFav'; // lx157:收藏状态统一三源联动
import { isFav } from '../state/favorites';
import { toast } from './Dialog';
import LinearGradient from 'react-native-linear-gradient'; // [老板 1010] 小盘改几何绘制(盘图实测不达标)

// Figma Player/Mini: 350x72 r=8, art 52x52 r=6, meta center-left, right icons
// standalone=true:内页独立挂载(底部自补安全区 inset);主 tab 内由 TabBar 吃掉 inset 不传
export function MiniPlayer({ standalone }: { standalone?: boolean } = {}) {
  const { current, playing, position, duration, toggle, cast } = usePlayer();
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [collect, setCollect] = useState(false);
  const { faved, toggle: toggleFav } = useFav(current); // hooks 全在早退前(修复 hooks 顺序闪退)
  // lx168(动效评审):上滑进场——歌起播时 MiniPlayer 滑入而非硬切(最高频缺失动效)
  const enterY = useRef(new Animated.Value(80)).current;
  const enterA = useRef(new Animated.Value(0)).current;
  // lx168:♥ 弹跳(点击收藏反馈)
  const pop = useRef(new Animated.Value(1)).current;
  const popHeart = () => {
    pop.setValue(0.65);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 40, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterY, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(enterA, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // [老板 1010] 播放条黑胶=Amcfy 真盘(9s/圈,暂停即停);封面仍嵌盘心当 label(老板令:只换黑胶唱片,封面要留)
  const spinV = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (playing) {
      if (!spinLoop.current) spinLoop.current = Animated.loop(Animated.timing(spinV, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
      spinLoop.current.start();
    } else spinLoop.current?.stop();
  }, [playing, spinV]);
  const spinDeg = spinV.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  if (!current) {
    // 常驻占位(老板 2026-09-18:miniplayerbar 应常驻页面,不是只有播放时才显示)
    return (
      <View style={[st.wrap, standalone && { paddingBottom: insets.bottom }]}>
        <TouchableOpacity activeOpacity={0.9} style={st.card} onPress={() => nav.navigate('Main')}>
          <View style={st.row}>
            <View style={st.vinylWrap}>
              <LinearGradient colors={['#171717', '#0e0e0e', '#191919', '#060606']} style={st.vinylDisc} />
              <View style={[st.vinylLabel, st.vinylLabelFallback]} />
            </View>
            <View style={st.meta}>
              <Text style={st.title}>未在播放</Text>
              <Text style={st.sub}>去选一首歌吧</Text>
            </View>
            <View style={st.playBtn}><Icon name="play" size={24} color={C.onBrand} /></View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <Animated.View style={[st.wrap, standalone && { paddingBottom: insets.bottom }, { transform: [{ translateY: enterY }], opacity: enterA }]}>
      <TouchableOpacity activeOpacity={0.9} style={st.card} onPress={() => nav.navigate('Player')}>
        <View style={st.row}>
          <Animated.View style={[st.vinylWrap, { transform: [{ rotate: spinDeg }] }]}>
            <LinearGradient colors={['#171717', '#0e0e0e', '#191919', '#060606']} style={st.vinylDisc} />
            {current.img ? <Image source={{ uri: current.img }} style={st.vinylLabel} /> : <View style={[st.vinylLabel, st.vinylLabelFallback]} />}
          </Animated.View>
          <View style={st.meta}>
            <Text style={st.title} numberOfLines={1}>{current.name}</Text>
            <Text style={st.sub} numberOfLines={1}>{current.singer}{current._types?.flac ? ' · 无损' : ''}</Text>
          </View>
          <TouchableOpacity style={st.iconBtn} hitSlop={6} onPress={() => nav.navigate('Route')}>
            <Icon name="devices" size={20} color={cast ? C.brand : C.text} />
          </TouchableOpacity>
          {/* lx157:未收藏→面板;仅歌单收录→面板里移除;我喜欢的在→一键取消 */}
          <TouchableOpacity style={st.iconBtn} hitSlop={6} onPress={() => { popHeart(); if (faved && isFav(current)) { toggleFav(); toast('已取消收藏'); } else setCollect(true); }}>
            <Animated.Text style={{ transform: [{ scale: pop }] }}>
              <Icon name="heart" size={20} active={faved} color={faved ? C.heart : C.text} />
            </Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.playBtn} hitSlop={4} onPress={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={24} color={C.onBrand} />
          </TouchableOpacity>
        </View>
        <ProgressBar pct={pct} />
      </TouchableOpacity>
      <CollectSheet song={current} visible={collect} onClose={() => setCollect(false)} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 0 }, // vc78：老板要求沾满整行，左右不留间隙
  card: { height: 76, borderRadius: 0, backgroundColor: C.elev, overflow: 'hidden' },
  row: { height: 73, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 0 }, // 固定高度:进度条恒在底边(v1.1.5 修错位)
  vinylWrap: { width: 48, height: 48, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 }, // [老板 1010] 真盘圆卡(基准稿 pvinyl 46px,行高 73 内取 48)
  vinylDisc: { width: '100%', height: '100%', borderRadius: 999, position: 'absolute', top: 0, left: 0 },
  vinylLabel: { width: '42%', height: '42%', borderRadius: 999, overflow: 'hidden' }, // 封面嵌盘心(基准稿 mini-label 42%)
  vinylLabelFallback: { backgroundColor: '#2A6E4F' },
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
