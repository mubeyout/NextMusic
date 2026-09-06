// HD 播放页 v3 —— 完全重构:无底部工具 bar,所有元素融入左右两列,沉浸式
// v1 教训:固定尺寸溢出;v2 教训:深色底 panel 突兀(老板:粗糙,直接取消)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Animated, Easing, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { SpectrumRing } from './SpectrumRing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { parseLrc, mergeTranslation, findActiveLine, type LyricLine } from '../services/lyric';
import { useFav } from './useFav';
import { library } from '../state/library';
import { addToPlaylist } from '../state/favorites';
import { sync } from '../services/sync';
import { toast } from '../components/Dialog';
import { hdNav } from './hdnav';


// 唱片 SVG 纯 DOM 版(react-native-svg 的 web shim forwardRef 与 RNW 混用会 React#130,直出 DOM 稳)
function HD_VINYL_SVG(img?: string): React.ReactNode {
  const h = React.createElement;
  const rg = h('radialGradient', { id: 'hdSheen', cx: '0.32', cy: '0.26', r: '0.95' }, [
    h('stop', { key: 'a', offset: '0', stopColor: '#FFFFFF', stopOpacity: '0.10' }),
    h('stop', { key: 'b', offset: '0.45', stopColor: '#FFFFFF', stopOpacity: '0.025' }),
    h('stop', { key: 'c', offset: '1', stopColor: '#FFFFFF', stopOpacity: '0' }),
  ]);
  const circles: Array<[number, string, number]> = [
    [149, '#0A0A0D', 1], [143, '#FFFFFF0A', 1], [136, '#FFFFFF08', 1.5], [129, '#FFFFFF0F', 1],
    [122, '#FFFFFF06', 1.5], [115, '#FFFFFF12', 1], [108, '#FFFFFF08', 1.5], [101, '#FFFFFF14', 1], [90, '#FFFFFF0D', 1],
  ];
  return h('svg', { width: 300, height: 300, viewBox: '0 0 300 300' },
    h('defs', null, rg),
    ...circles.map(([r, col, sw], i) => h('circle', { key: 'c' + i, cx: 150, cy: 150, r, fill: r === 149 ? col : 'none', stroke: col, strokeWidth: sw })),
    h('path', { d: 'M33 107 A125 125 0 0 1 107 33', stroke: '#FFFFFF1F', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }),
    h('path', { d: 'M246 185 A102 102 0 0 1 168 250', stroke: '#FFFFFF17', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' }),
    h('circle', { cx: 150, cy: 150, r: 149, fill: 'url(#hdSheen)' }),
    h('circle', { cx: 150, cy: 150, r: 88, fill: '#101312' }),
    h('image', { href: img || undefined, x: 106, y: 106, width: 88, height: 88, clipPath: undefined,
      style: { borderRadius: 44 } as never }),
    h('circle', { cx: 150, cy: 150, r: 6, fill: '#000' }),
  );
}

// lx97:频谱水波——波浪形填充多层叠加(静态 SVG 波形 + native translateX 无缝滚动 + 层间相位/速度/透明度差)
// lx100:频谱水波——围绕唱片的波浪形环带多层叠加(静态波浪 path,native rotate 让波纹沿圆周流动;
// 三层不同半径/波数/速度/方向=水波互相穿插;禁用 overflow:米电视吃内容(坑133))
const RING_ZONE = 340;
const RINGS = [
  { r: 126, halfW: 7, k: 6, amp: 4, col: 'rgb(34,211,238)', op: 0.55, dur: 26000, dir: 1 },
  { r: 148, halfW: 9, k: 9, amp: 5, col: 'rgb(168,85,247)', op: 0.45, dur: 19000, dir: -1 },
  { r: 170, halfW: 12, k: 12, amp: 7, col: 'rgb(244,114,182)', op: 0.35, dur: 33000, dir: 1 },
];
/** 波浪环带(环形渐变填充):外缘波 + 内缘波(相位差 0.9)闭合 */
function ringBandPath(rMid: number, halfW: number, k: number, amp: number, size: number): string {
  const c = size / 2; const N = 96; const rOut = rMid + halfW; const rIn = Math.max(60, rMid - halfW);
  let d = '';
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const rr = rOut + Math.sin(th * k) * amp;
    d += (i === 0 ? 'M' : 'L') + (c + Math.cos(th) * rr).toFixed(1) + ' ' + (c + Math.sin(th) * rr).toFixed(1);
  }
  for (let i = N; i >= 0; i--) {
    const th = (i / N) * Math.PI * 2;
    const rr = rIn + Math.sin(th * k + 0.9) * amp;
    d += 'L' + (c + Math.cos(th) * rr).toFixed(1) + ' ' + (c + Math.sin(th) * rr).toFixed(1);
  }
  return d + 'Z';
}
function WaveRings({ anims }: { anims: Animated.Value[] }) {
  const c = RING_ZONE / 2;
  return (
    <View style={stWave.host} pointerEvents="none">
      {RINGS.map((rg, i) => {
        const fade = (rg.halfW + rg.amp + 5) / c;
        const mid = rg.r / c;
        return (
          <Animated.View key={i} style={{
            position: 'absolute', top: 0, left: 0, width: RING_ZONE, height: RING_ZONE,
            transform: [{ rotate: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * rg.dir}deg`] }) }],
          }}>
            <Svg width={RING_ZONE} height={RING_ZONE} viewBox={`0 0 ${RING_ZONE} ${RING_ZONE}`}>
              <Defs>
                <RadialGradient id={`wg${i}`} cx={c} cy={c} r={c} gradientUnits="userSpaceOnUse">
                  <Stop offset={Math.max(0, mid - fade)} stopColor={rg.col} stopOpacity="0" />
                  <Stop offset={mid} stopColor={rg.col} stopOpacity={String(rg.op)} />
                  <Stop offset={Math.min(1, mid + fade)} stopColor={rg.col} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Path d={ringBandPath(rg.r, rg.halfW, rg.k, rg.amp, RING_ZONE)} fill={`url(#wg${i})`} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function HDPlayer() {
  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const { faved, toggle: toggleFav } = useFav(current); // lx101:收藏统一 hook(取消也同步服务器)
  // lx102:收藏到歌单面板(长按收藏键)——与手机端 CollectSheet 同能力
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectPls, setCollectPls] = useState<Array<{ key: string; localId?: string; name: string }>>([]);
  useEffect(() => {
    if (!collectOpen) return;
    let dead = false;
    const local = library.all().map(p => ({ key: p.id, localId: p.id, name: p.name }));
    setCollectPls(local);
    if (connected && token) {
      sync.fetchLists().then(sp => {
        if (dead || !sp) return;
        setCollectPls([...local, ...(sp.userList || []).map(u => ({ key: u.id, name: u.name }))]);
      }).catch(() => {});
    }
    return () => { dead = true; };
  }, [collectOpen, connected, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const trackW = React.useRef(0);
  // v1.1.8 唱片旋转(18s/转;web 必须 JS driver——RNW Animated useNativeDriver 必 false,原生端 native driver 零 JS 开销)
  const spin = React.useRef(new Animated.Value(0)).current;
  // lx91:频谱 24 bar 全部 native driver(transform scaleY/translateY)——v3 的 height JS 动画每帧 24 次状态更新打满 JS 线程=卡顿真凶之一
  const NATIVE = Platform.OS !== 'web';
  const spinLoop = React.useRef<Animated.CompositeAnimation | null>(null);
  React.useEffect(() => {
    if (playing) {
      if (!spinLoop.current) {
        spinLoop.current = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: NATIVE }));
      }
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
    }
  }, [playing, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // lx100:水波环驱动——三层 rotate 循环(播放流动,暂停冻结);0→1 映射 360deg,循环回跳=同角度无缝
  const ringAnims = React.useRef(RINGS.map(() => new Animated.Value(0))).current;
  const ringLoops = React.useRef<Array<Animated.CompositeAnimation | null>>([]);
  React.useEffect(() => {
    if (playing) {
      RINGS.forEach((rg, k) => {
        if (ringLoops.current[k]) return;
        const loop = Animated.loop(Animated.timing(ringAnims[k], { toValue: 1, duration: rg.dur, easing: Easing.linear, useNativeDriver: NATIVE }));
        ringLoops.current[k] = loop;
        loop.start();
      });
    } else {
      ringLoops.current.forEach(l => l?.stop());
      ringLoops.current = [];
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => { ringLoops.current.forEach(l => l?.stop()); }, []); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    setLyrics(null);
    if (!current) return;
    let dead = false;
    (async () => {
      let r = await lxapi.lyric(current).catch(() => ({ lxlyric: '', lyric: '', lrc: '', tlyric: '' }));
      let raw = r.lxlyric || r.lyric || r.lrc;
      const isProvider = ['emby', 'jellyfin', 'subsonic', 'navidrome', 'daoliyu', 'webdav'].includes(current.source);
      if (!raw && isProvider) {
        try {
          r = await lxapi.lyricByName(current.name, current.singer);
          raw = r.lxlyric || r.lyric || r.lrc;
        } catch { /* 继续 */ }
      }
      if (!raw && connected && token) {
        try {
          const rs = await api.lyric(current);
          if (!dead) r = { ...r, ...rs };
          raw = rs.lxlyric || rs.lyric || rs.lrc || raw;
        } catch { /* 保持空 */ }
      }
      if (dead || !raw) return;
      let lines = parseLrc(raw);
      if (r.tlyric) lines = mergeTranslation(lines, r.tlyric);
      if (lines.length) setLyrics(lines);
    })();
    return () => { dead = true; };
  }, [current?.songmid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) {
    return (
      <View style={[st.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: C.text2, fontSize: 15 }}>没有正在播放的歌曲</Text>
      </View>
    );
  }

  const activeIdx = lyrics ? findActiveLine(lyrics, position) : -1;
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  const doFav = toggleFav;

  // ===== 桌面(网易云参照):封面模糊铺底 + 大图/歌词双列 + 底部一体控制条 =====
  if (Platform.OS === 'web') {
    const lines = lyrics ? lyrics.slice(Math.max(0, activeIdx - 5), activeIdx + 5) : [];
    const lineBase = lyrics ? Math.max(0, activeIdx - 5) : 0;
    return (
      <View style={stW.screen}>
        {current.img ? <Image source={{ uri: current.img }} style={stW.bgArt} blurRadius={90} resizeMode="cover" /> : null}
        <View style={stW.bgVeil} />
        <HDTouch style={stW.back} onPress={nav.goBack} focusStyle={st.focus}>
          <Icon name="back" size={19} color="#ffffffcc" />
        </HDTouch>

        <View style={stW.body}>
          <View style={stW.artCol}>
            {/* v1.1.8:圆形旋转唱片 + 频谱动效环(老板:酷炫) */}
            <View style={stW.vinylZone}>
              <SpectrumRing size={340} playing={playing} />
              {Platform.OS === 'web' ? (
                HD_VINYL_SVG(current?.img)
              ) : null}
            </View>
            <Text style={stW.srcTag}>{current.source.toUpperCase()}</Text>
          </View>

          <View style={stW.infoCol}>
            <Text style={stW.title} numberOfLines={1}>{current.name}</Text>
            <Text style={stW.sub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>
            <View style={stW.lyrics}>
              {lyrics ? lines.map((l, i) => {
                const idx = lineBase + i;
                const on = idx === activeIdx;
                return (
                  <TouchableOpacity key={idx} disabled={!on || !l.t} onPress={() => l.t && seekTo(l.t + 0.3)} activeOpacity={0.7}>
                    <Text style={[stW.lyric, on && stW.lyricOn]} numberOfLines={1}>{l.text || '\u266a'}</Text>
                    {l.trans ? <Text style={[stW.lyricTr, on && stW.lyricTrOn]} numberOfLines={1}>{l.trans}</Text> : null}
                  </TouchableOpacity>
                );
              }) : (
                <View style={stW.noLyric}>
                  <Icon name="music" size={30} color="#ffffff66" />
                  <Text style={stW.noLyricText}>暂无歌词</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={stW.dock}>
          <View style={stW.progRow}>
            <Text style={stW.time}>{fmtSec(position)}</Text>
            <TouchableOpacity
              style={stW.track}
              activeOpacity={0.9}
              onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
              onPress={e => {
                const { locationX } = e.nativeEvent;
                const w = trackW.current;
                if (w > 0 && duration > 0) seekTo(Math.max(0, Math.min(1, locationX / w)) * duration);
              }}
            >
              <View style={[stW.trackFill, { flex: pct }]} />
              <View style={[stW.trackRest, { flex: 1 - pct }]} />
            </TouchableOpacity>
            <Text style={stW.time}>{fmtSec(duration)}</Text>
          </View>
          <View style={stW.ctrlRow}>
            <View style={stW.ctrlCluster}>
              <HDTouch style={stW.cBtn} onPress={() => setShuffle(!shuffle)} focusStyle={st.focus}>
                <Icon name="shuffle" size={17} active={shuffle} color={shuffle ? C.brand : '#ffffff99'} />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={skipPrev} focusStyle={st.focus}>
                <Icon name="previous" size={22} color="#ffffffee" />
              </HDTouch>
              <HDTouch style={stW.cMain} onPress={toggle} focusStyle={stW.cMainFocus}>
                <Icon name={playing ? 'pause' : 'play'} size={26} color="#0b0f0d" />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={skipNext} focusStyle={st.focus}>
                <Icon name="next" size={22} color="#ffffffee" />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={cycleRepeat} focusStyle={st.focus}>
                <Icon name="repeat" size={17} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : '#ffffff99'} />
              </HDTouch>
            </View>
            <View style={stW.toolCluster}>
              <HDTouch style={stW.tBtn} onPress={doFav} focusStyle={st.focus}>
                <Icon name="heart" size={17} color={faved ? C.brand : '#ffffff99'} />
              </HDTouch>
              <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Comments')} focusStyle={st.focus}>
                <Icon name="comments" size={17} color="#ffffff99" />
              </HDTouch>
              <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Queue')} focusStyle={st.focus}>
                <Icon name="queue" size={17} color="#ffffff99" />
                {queue.length ? <Text style={stW.badge}>{queue.length}</Text> : null}
              </HDTouch>
              <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Route')} focusStyle={st.focus}>
                <Icon name="devices" size={17} color="#ffffff99" />
              </HDTouch>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // lx89:TV 播放页全屏独立屏(老板定夺)——头部返回行+左唱片活频谱+右歌词+单行控件
  return (
    <View style={st.screen}>
      {current.img ? <Image source={{ uri: current.img }} style={st.bgArt} blurRadius={60} resizeMode="cover" /> : null}
      <View style={st.bgVeil} />
      <LinearGradient colors={['rgba(4,6,5,0)', 'rgba(4,6,5,.62)']} locations={[0, 1]} style={st.bgBottomGrad} />

      {/* 头部:返回按钮入流式布局(不再悬浮怪位) */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <HDTouch style={st.backBtn} onPress={nav.goBack} hasTVPreferredFocus>
          <Icon name="back" size={16} color="#ffffffcc" />
          <Text style={st.backLabel}>返回</Text>
        </HDTouch>
      </View>

      <View style={[st.main, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={st.artCol}>
          {/* lx100:水波环三层围绕唱片旋转流动 */}
          <View style={st.vinylZone}>
            <WaveRings anims={ringAnims} />
            <View style={st.vinylWrap}>
              <Animated.Image
                source={current.img ? { uri: current.img } : undefined}
                style={[st.vinylArt, { transform: [{ rotate: spinDeg }] }]}
                resizeMode="cover"
              />
              {!current.img ? <View style={[st.vinylArt, st.artFallback]}><Icon name="music" size={52} color={C.text3} /></View> : null}
              <View style={st.vinylHole} />
            </View>
          </View>
          <View style={st.srcPill}>
            <View style={st.srcDot} />
            <Text style={st.srcTag}>{current.source.toUpperCase()}</Text>
          </View>
        </View>

        <View style={st.infoCol}>
          <Text style={st.title} numberOfLines={1}>{current.name}</Text>
          <Text style={st.sub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>

          <View style={st.lyricsBox}>
            {lyrics ? (
              lyrics.slice(Math.max(0, activeIdx - 3), activeIdx + 4).map((l, i) => {
                const idx = Math.max(0, activeIdx - 3) + i;
                const on = idx === activeIdx;
                return (
                  <TouchableOpacity key={idx} disabled={!on || !l.t} onPress={() => l.t && seekTo(l.t + 0.3)} activeOpacity={0.7}>
                    <Text style={[st.lyric, on && st.lyricOn]} numberOfLines={1}>{l.text || '♪'}</Text>
                    {l.trans ? <Text style={[st.lyricTr, on && st.lyricTrOn]} numberOfLines={1}>{l.trans}</Text> : null}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={st.noLyric}>
                <Icon name="music" size={28} color={C.text3} />
                <Text style={st.noLyricText}>{current.source.toUpperCase()} · 暂无歌词</Text>
              </View>
            )}
          </View>

          <View style={st.progRow}>
            <Text style={st.time}>{fmtSec(position)}</Text>
            <TouchableOpacity
              style={st.trackWrap}
              activeOpacity={0.9}
              onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
              onPress={e => {
                const { locationX } = e.nativeEvent;
                const w = trackW.current;
                if (w > 0 && duration > 0) seekTo(Math.max(0, Math.min(1, locationX / w)) * duration);
              }}
            >
              <View style={[st.trackFill, { flex: pct }]} />
              <View style={[st.trackRest, { flex: 1 - pct }]} />
              <View style={[st.playhead, { left: `${pct * 100}%` }]} />
            </TouchableOpacity>
            <Text style={st.time}>{fmtSec(duration)}</Text>
          </View>

          {/* lx89:控件单行(全屏 960dp 富余)——传输组+分隔+工具组,icon 純净排 */}
          <View style={st.ctrlRow}>
            <HDTouch style={st.cMode} onPress={() => setShuffle(!shuffle)}>
              <Icon name="shuffle" size={20} active={shuffle} color={shuffle ? C.brand : '#ffffff99'} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipPrev}>
              <Icon name="previous" size={26} color="#ffffffee" />
            </HDTouch>
            <HDTouch style={st.cMain} onPress={toggle} focusStyle={st.cMainFocus}>
              <Icon name={playing ? 'pause' : 'play'} size={32} color={C.onBrand} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipNext}>
              <Icon name="next" size={26} color="#ffffffee" />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={cycleRepeat}>
              <Icon name="repeat" size={20} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : '#ffffff99'} />
            </HDTouch>
            <View style={st.ctrlDivider} />
            <HDTouch style={st.cTool} onPress={doFav} onLongPress={() => setCollectOpen(true)}>
              <Icon name="heart" size={19} color={faved ? C.brand : '#ffffff99'} />
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Queue')}>
              <Icon name="queue" size={19} color="#ffffffcc" />
              {queue.length ? (
                <View style={st.qBadge}><Text style={st.qBadgeText}>{queue.length > 99 ? '99+' : queue.length}</Text></View>
              ) : null}
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Route')}>
              <Icon name="devices" size={19} color="#ffffffcc" />
            </HDTouch>
          </View>
        </View>
      </View>

      {/* lx102:收藏到歌单面板(长按收藏键;HDTouch 行 D-pad 可用) */}
      {collectOpen && current ? (
        <View style={st.collectPanel}>
          <Text style={st.collectTitle}>收藏到</Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <HDTouch style={st.collectRow} onPress={() => { toggleFav(); }}>
              <Icon name="heart" size={15} active={faved} color={faved ? C.brand : '#ffffff99'} />
              <Text style={[st.collectText, faved && { color: C.brand }]} numberOfLines={1}>我喜欢的{faved ? ' · 已收藏' : ''}</Text>
            </HDTouch>
            {collectPls.map(cp => (
              <HDTouch key={cp.key} style={st.collectRow} onPress={async () => {
                try {
                  if (cp.localId) await addToPlaylist({ id: cp.localId }, current);
                  else await addToPlaylist({ name: cp.name }, current,
                    connected && token ? () => sync.fetchLists() : undefined,
                    connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined);
                  toast(`已收藏到「${cp.name}」`);
                } catch { toast('收藏失败'); }
                setCollectOpen(false);
              }}>
                <Icon name="music" size={13} color="#ffffff77" />
                <Text style={st.collectText} numberOfLines={1}>{cp.name}</Text>
              </HDTouch>
            ))}
          </ScrollView>
          <HDTouch style={st.collectClose} onPress={() => setCollectOpen(false)}>
            <Text style={st.collectCloseText}>关闭</Text>
          </HDTouch>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0c0b' },
  bgArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
  bgVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,7,.62)' },
  bgBottomGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, zIndex: 5 },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 26 }, // web 分支控件环
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#ffffff14' },
  backLabel: { color: '#ffffffcc', fontSize: 13, fontWeight: '600' },
  vinylWrap: { width: 228, height: 228, borderRadius: 114, backgroundColor: '#0d100e', borderWidth: 5, borderColor: '#161a17', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 44px rgba(0,0,0,.55), 0 0 36px rgba(30,215,96,.14)' },
  vinylZone: { width: RING_ZONE, height: RING_ZONE, alignItems: 'center', justifyContent: 'center' },
  vinylArt: { width: 150, height: 150, borderRadius: 75 },
  vinylHole: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#0a0c0b', borderWidth: 3, borderColor: '#222823' },
  srcPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, borderRadius: 12, paddingHorizontal: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', backgroundColor: 'rgba(255,255,255,.06)' },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  srcTag: { color: '#ffffffaa', fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  main: { flex: 1, flexDirection: 'row', paddingHorizontal: 52, paddingTop: 4, gap: 42 },
  artCol: { width: 344, alignItems: 'center', justifyContent: 'center' },
  artFallback: { backgroundColor: '#1E2722', alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1, gap: 6, paddingTop: 22 }, // lx94:标题/歌词整体下移(老板:太高)
  title: { color: '#ffffff', fontSize: 25, fontWeight: '800' },
  sub: { color: '#ffffffb3', fontSize: 14 },
  lyricsBox: { flex: 1, gap: 8, justifyContent: 'center' }, // lx93:垂直居中(顶贴→太靠上),窗口 7 行填满空隙
  lyric: { color: '#ffffff7d', fontSize: 17, lineHeight: 24, fontWeight: '500' },
  lyricOn: { color: '#ffffff', fontSize: 22, lineHeight: 31, fontWeight: '800', textShadowColor: 'rgba(255,255,255,.3)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  lyricTr: { color: '#FFFFFF55', fontSize: 12, lineHeight: 17, marginTop: 2 },
  lyricTrOn: { color: '#FFFFFF99' },
  noLyric: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  noLyricText: { color: '#ffffff80', fontSize: 13 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  time: { color: '#ffffffb3', fontSize: 12, fontVariant: ['tabular-nums'], width: 42, textAlign: 'center' },
  trackWrap: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3 },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: '#ffffff2e', borderRadius: 3 },
  playhead: { position: 'absolute', top: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.brand, borderWidth: 2.5, borderColor: '#ffffff', marginLeft: -7, boxShadow: '0 0 12px rgba(30,215,96,.75)' },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cMode: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  cMain: { width: 66, height: 66, borderRadius: 33, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 33 },
  ctrlDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,.14)', marginHorizontal: 2 },
  cTool: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  collectPanel: { position: 'absolute', right: 44, top: 92, width: 300, maxHeight: 400, borderRadius: 16, backgroundColor: 'rgba(10,14,12,.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', padding: 12, gap: 8, zIndex: 40 },
  collectTitle: { color: '#ffffffcc', fontSize: 13, fontWeight: '700', paddingHorizontal: 4 },
  collectRow: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, borderRadius: 10, backgroundColor: '#ffffff0d', paddingHorizontal: 12 },
  collectText: { color: '#ffffffd9', fontSize: 13, flex: 1 },
  collectClose: { height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff12' },
  collectCloseText: { color: '#ffffffaa', fontSize: 12, fontWeight: '600' },
  qBadge: { position: 'absolute', top: -5, right: -7, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#0e1310' }, // lx95:队列数量优雅悬浮胶囊
  qBadgeText: { color: '#0b0f0d', fontSize: 9, fontWeight: '800' },
});

// ===== 桌面(网易云参照)样式 =====
// CSS keyframes:唱片旋转(18s/转,暂停时停止)
if (Platform.OS === 'web' && typeof (globalThis as { document?: unknown }).document !== 'undefined' && !(globalThis as never as { document?: { getElementById: (i: string) => unknown; createElement: (t: string) => { id: string; textContent: string }; head: { appendChild: (e: unknown) => void } } }).document?.getElementById('nm-vinyl-css')) {
  const doc = (globalThis as never as { document?: { createElement: (t: string) => { id: string; textContent: string }; head: { appendChild: (e: unknown) => void } } }).document!;
  const el = doc.createElement('style');
  el.id = 'nm-vinyl-css';
  el.textContent = '@keyframes nmSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.nm-vinyl-spin{animation:nmSpin 18s linear infinite}.nm-vinyl-paused{animation-play-state:paused}';
  doc.head.appendChild(el);
}
const stW = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0c0b' },
  bgArt: { position: 'absolute', top: -60, left: -60, right: -60, bottom: -60, width: '120%', height: '120%', opacity: 0.5 },
  bgVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,7,0.72)' },
  back: { position: 'absolute', top: 42, left: 22, zIndex: 5, width: 38, height: 38, borderRadius: 19, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: 72, paddingTop: 74, gap: 52, alignItems: 'center' },
  artCol: { flex: 0.9, alignItems: 'center' },
  vinylZone: { width: 340, height: 340, alignItems: 'center', justifyContent: 'center' },
  vinylSpinWrap: { width: 300, height: 300 },
  vinylLabel: { position: 'absolute', top: 106, left: 106, width: 88, height: 88, borderRadius: 44 },
  art: { width: '86%', aspectRatio: 1, borderRadius: 14, maxHeight: 400, maxWidth: 400, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 34, shadowOffset: { width: 0, height: 16 } },
  srcTag: { color: '#ffffff66', fontSize: 11, marginTop: 14, letterSpacing: 2 },
  infoCol: { flex: 1.1, alignSelf: 'stretch', justifyContent: 'center', gap: 8 },
  title: { color: '#ffffff', fontSize: 27, fontWeight: '800' },
  sub: { color: '#ffffffb0', fontSize: 14, marginBottom: 10 },
  lyrics: { minHeight: 320, gap: 13, justifyContent: 'center' },
  lyric: { color: '#ffffff59', fontSize: 17, lineHeight: 25, fontWeight: '500' },
  lyricOn: { color: '#ffffff', fontSize: 22, lineHeight: 32, fontWeight: '800' },
  lyricTr: { color: '#ffffff38', fontSize: 12, lineHeight: 17, marginTop: 1 },
  lyricTrOn: { color: '#ffffff70' },
  noLyric: { alignItems: 'center', gap: 10, marginTop: 30 },
  noLyricText: { color: '#ffffff55', fontSize: 13 },
  dock: { paddingHorizontal: 56, paddingBottom: 26, gap: 10 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { color: '#ffffff99', fontSize: 12, fontVariant: ['tabular-nums'], width: 44, textAlign: 'center' },
  track: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3 },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: '#ffffff26', borderRadius: 3 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctrlCluster: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  cBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ffffff10', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  cMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#ffffffaa', borderRadius: 32 },
  toolCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  badge: { color: '#ffffff77', fontSize: 10, marginLeft: 3 },
});

// lx100:水波环容器(vinylZone 内满铺)
const stWave = StyleSheet.create({
  host: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
