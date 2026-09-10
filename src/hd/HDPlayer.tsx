// HD 播放页 v3 —— 完全重构:无底部工具 bar,所有元素融入左右两列,沉浸式
// v1 教训:固定尺寸溢出;v2 教训:深色底 panel 突兀(老板:粗糙,直接取消)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Animated, Easing, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { SpectrumRing } from './SpectrumRing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, T, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { parseLrc, mergeTranslation, findActiveLine, type LyricLine } from '../services/lyric';
import { useFav } from '../state/useFav';
import { startSpectrum } from '../services/visualizer';
import { HDCollect } from './HDCollect';
import { hdNav } from './hdnav';


// 唱片 SVG 纯 DOM 版(react-native-svg 的 web shim forwardRef 与 RNW 混用会 React#130,直出 DOM 稳)
// v1.2.5:size 参数化 + nm-vinyl-spin CSS 旋转接入(此前 web 唱片根本不转——nm-vinyl-css 注入了却没人用)
// v1.2.11(老板:封面太小+波浪圈不对齐):①封面 label 88→132(44% 唱片径,网易云规格)加标环;
// ②svg 绝对定位(top/left 0)与频谱环同一坐标系——两兄弟节点 flex 纵排在 320 盒里曾各被排到 ±160px(不同心真因);
// ③圆形底盘投影( borderRadius 50% 否则方影)
function HD_VINYL_SVG(img?: string, size = 300, playing?: boolean): React.ReactNode {
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
  return h('svg', { width: size, height: size, viewBox: '0 0 300 300', className: 'nm-vinyl-spin' + (playing ? '' : ' nm-vinyl-paused'),
    style: { position: 'absolute', top: 0, left: 0, borderRadius: '50%', boxShadow: '0 26px 70px rgba(0,0,0,.4), 0 0 54px rgba(30,215,96,.08)' } as never },
    h('defs', null, rg),
    ...circles.map(([r, col, sw], i) => h('circle', { key: 'c' + i, cx: 150, cy: 150, r, fill: r === 149 ? col : 'none', stroke: col, strokeWidth: sw })),
    h('path', { d: 'M33 107 A125 125 0 0 1 107 33', stroke: '#FFFFFF1F', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }),
    h('path', { d: 'M246 185 A102 102 0 0 1 168 250', stroke: '#FFFFFF17', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' }),
    h('circle', { cx: 150, cy: 150, r: 149, fill: 'url(#hdSheen)' }),
    h('circle', { cx: 150, cy: 150, r: 88, fill: '#101312' }),
    h('circle', { cx: 150, cy: 150, r: 70, fill: 'none', stroke: '#FFFFFF16', strokeWidth: 1.5 }),
    h('image', { href: img || undefined, x: 84, y: 84, width: 132, height: 132, clipPath: undefined,
      style: { borderRadius: 66 } as never }),
    h('circle', { cx: 150, cy: 150, r: 6, fill: '#000' }),
  );
}

// lx97:频谱水波——波浪形填充多层叠加(静态 SVG 波形 + native translateX 无缝滚动 + 层间相位/速度/透明度差)
// lx100:频谱水波——围绕唱片的波浪形环带多层叠加(静态波浪 path,native rotate 让波纹沿圆周流动;
// 三层不同半径/波数/速度/方向=水波互相穿插;禁用 overflow:米电视吃内容(坑133))
const RING_ZONE = 340;
const P_N = 48;
const P_R = 128;
const P_AMP = 30;
function ParticleRing({ bins, rot }: { bins: Animated.Value[]; rot: Animated.Value }) {
  const c = RING_ZONE / 2;
  const deg = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={stWave.host} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: RING_ZONE, height: RING_ZONE, transform: [{ rotate: deg }] }}>
        {Array.from({ length: P_N }, (_, i) => {
          const ang = (i / P_N) * 360;
          const hue = Math.round(140 + (i / P_N) * 320) % 360;
          const b = bins[Math.floor((i * bins.length) / P_N)];
          const ty = b.interpolate({ inputRange: [0, 1], outputRange: [-P_R, -(P_R + P_AMP)] });
          const sc = b.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.5] });
          const op = b.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
          return (
            <View key={i} style={{ position: 'absolute', left: c - 3, top: c - 3, width: 6, height: 6, transform: [{ rotate: ang + 'deg' }] }}>
              <Animated.View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: `hsl(${hue}, 90%, 62%)`,
                transform: [{ translateY: ty }, { scale: sc }],
                opacity: op,
              }} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

export function HDPlayer() {
  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const { faved } = useFav(current); // lx101:收藏统一 hook(faved 态;操作走选歌单面板,与 TV 同源)
  // lx103:收藏到歌单面板(点按收藏键即弹,对齐手机端)
  const [collectOpen, setCollectOpen] = useState(false);
  const trackW = React.useRef(0);
  // v1.2.11(老板:整体重排):唱片区实测方形(onLayout),尺寸自适应窗口,上限 440
  const [vsize, setVsize] = useState(0);
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

  // lx125:粒子环驱动——rot 慢旋转;bins=FFT 24bin 事件平滑跟随;暂停回落;无权限 1.2s 后伪律动
  const specBins = React.useRef(Array.from({ length: 24 }, () => new Animated.Value(0.08))).current;
  const ringRot = React.useRef(new Animated.Value(0)).current;
  const ringLoops = React.useRef<Array<Animated.CompositeAnimation | null>>([]);
  const binLoops = React.useRef<Array<Animated.CompositeAnimation | null>>([]);
  const stopBin = () => { binLoops.current.forEach(l => l?.stop()); binLoops.current = []; };

  React.useEffect(() => {
    if (playing) {
      if (!ringLoops.current.length) {
        const loop = Animated.loop(Animated.timing(ringRot, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: NATIVE }));
        ringLoops.current[0] = loop;
        loop.start();
      }
    } else {
      ringLoops.current.forEach(l => l?.stop());
      ringLoops.current = [];
      stopBin();
      specBins.forEach(b => Animated.timing(b, { toValue: 0.08, duration: 400, useNativeDriver: NATIVE }).start());
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!playing) return;
    let specLive = false;
    const fallbackTimer = setTimeout(() => {
      if (specLive) return;
      specBins.forEach((b, k) => {
        if (binLoops.current[k]) return;
        const dur = 500 + ((k * 137) % 500);
        const loop = Animated.loop(Animated.sequence([
          Animated.timing(b, { toValue: 0.3 + ((k * 61) % 60) / 100, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
          Animated.timing(b, { toValue: 0.1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        ]));
        binLoops.current[k] = loop;
        loop.start();
      });
    }, 1200);
    const stopSpec = startSpectrum(arr => {
      if (!specLive) { specLive = true; stopBin(); }
      for (let k = 0; k < specBins.length; k++) {
        const v = arr[k] || 0;
        Animated.timing(specBins[k], { toValue: Math.min(1, 0.06 + v * 1.15), duration: 90, useNativeDriver: NATIVE }).start();
      }
    });
    return () => { clearTimeout(fallbackTimer); stopSpec(); stopBin(); };
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


  // ===== v1.2.5 桌面播放页重排(老板:布局太草率):主题感知(浅色不再白条+黑页拼接) + 头部行内返回
  // + 唱片列(频谱环+旋转唱片+源胶囊) + 歌词列(上下渐隐遮罩) + 居中 dock(进度带播放头,控件居中/工具靠右)
  if (Platform.OS === 'web') {
    const lines = lyrics ? lyrics.slice(Math.max(0, activeIdx - 4), activeIdx + 5) : [];
    const lineBase = lyrics ? Math.max(0, activeIdx - 4) : 0;
    const maskRgb = T.light ? 'rgba(246,247,249' : 'rgba(10,12,11';
    return (
      <View style={stW.screen}>
        {current.img ? <Image source={{ uri: current.img }} style={stW.bgArt} blurRadius={90} resizeMode="cover" /> : null}
        <View style={stW.bgVeil} />

        {/* 头部:返回入流式行(不再悬浮圆钮) */}
        <View style={stW.top}>
          <HDTouch style={stW.back} onPress={nav.goBack} focusStyle={st.focus}>
            <Icon name="back" size={16} color={C.text2} />
            <Text style={stW.backLabel}>返回</Text>
          </HDTouch>
        </View>

        <View style={stW.body}>
          <View style={stW.artCol}>
            {/* v1.2.11 全重排:实测方形盒内,频谱环+唱片都绝对定位 inset 0 → 严格同心;
             * 尺寸随窗口自适应(旧固定 320 且两个 flow 子节点被 flex column 排到 ±160px 不同心) */}
            <View style={stW.vinylArea} onLayout={e => {
              const s = Math.min(Math.floor(e.nativeEvent.layout.width), Math.floor(e.nativeEvent.layout.height), 440);
              if (s > 60 && Math.abs(s - vsize) > 1) setVsize(s);
            }}>
              {vsize > 60 ? (
                <View style={{ width: vsize, height: vsize }}>
                  <SpectrumRing size={vsize} playing={playing} />
                  {HD_VINYL_SVG(current?.img, vsize, playing)}
                </View>
              ) : null}
            </View>
            <View style={stW.srcPill}>
              <View style={stW.srcDot} />
              <Text style={stW.srcTag}>{current.source.toUpperCase()}</Text>
            </View>
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
                  <Icon name="music" size={30} color={T.light ? '#8B9199' : '#ffffff66'} />
                  <Text style={stW.noLyricText}>暂无歌词</Text>
                </View>
              )}
              {/* 歌词上下渐隐(盖住窗口边缘行,避免硬切) */}
              <LinearGradient colors={[maskRgb + ',1)', maskRgb + ',0)']} locations={[0, 1]} style={stW.maskTop} pointerEvents="none" />
              <LinearGradient colors={[maskRgb + ',0)', maskRgb + ',1)']} locations={[0, 1]} style={stW.maskBottom} pointerEvents="none" />
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
              <View style={[stW.playhead, { left: `${pct * 100}%` }]} />
            </TouchableOpacity>
            <Text style={stW.time}>{fmtSec(duration)}</Text>
          </View>
          <View style={stW.ctrlRow}>
            <View style={stW.sideSpacer} />
            <View style={stW.ctrlCluster}>
              <HDTouch style={stW.cBtn} onPress={() => setShuffle(!shuffle)} focusStyle={st.focus} hoverBg={C.hover}>
                <Icon name="shuffle" size={17} active={shuffle} color={shuffle ? C.brand : C.text2} />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={skipPrev} focusStyle={st.focus} hoverBg={C.hover}>
                <Icon name="previous" size={22} color={C.text} />
              </HDTouch>
              <HDTouch style={stW.cMain} onPress={toggle} focusStyle={stW.cMainFocus}>
                <Icon name={playing ? 'pause' : 'play'} size={26} color={C.onBrand} />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={skipNext} focusStyle={st.focus} hoverBg={C.hover}>
                <Icon name="next" size={22} color={C.text} />
              </HDTouch>
              <HDTouch style={stW.cBtn} onPress={cycleRepeat} focusStyle={st.focus} hoverBg={C.hover}>
                <Icon name="repeat" size={17} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
              </HDTouch>
            </View>
            <View style={[stW.sideSpacer, { alignItems: 'flex-end' }]}>
              <View style={stW.toolCluster}>
                <HDTouch style={stW.tBtn} onPress={() => setCollectOpen(true)} focusStyle={st.focus} hoverBg={C.hover}>
                  <Icon name="heart" size={17} color={faved ? C.brand : C.text2} />
                </HDTouch>
                <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Comments')} focusStyle={st.focus} hoverBg={C.hover}>
                  <Icon name="comments" size={17} color={C.text2} />
                </HDTouch>
                <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Queue')} focusStyle={st.focus} hoverBg={C.hover}>
                  <Icon name="queue" size={17} color={C.text2} />
                  {queue.length ? <Text style={stW.badge}>{queue.length}</Text> : null}
                </HDTouch>
                <HDTouch style={stW.tBtn} onPress={() => nav.navigate('Route')} focusStyle={st.focus} hoverBg={C.hover}>
                  <Icon name="devices" size={17} color={C.text2} />
                </HDTouch>
              </View>
            </View>
          </View>
        </View>

        {/* lx103:收藏到歌单面板(与 TV 同源) */}
        {collectOpen && current ? <HDCollect song={current} onClose={() => setCollectOpen(false)} /> : null}
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
        <HDTouch style={st.backBtn} onPress={nav.goBack}>
          <Icon name="back" size={16} color="#ffffffcc" />
          <Text style={st.backLabel}>返回</Text>
        </HDTouch>
      </View>

      <View style={[st.main, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={st.artCol}>
          {/* lx125:粒子环(单圈 48 粒,FFT 分区驱动) */}
          <View style={st.vinylZone}>
            <ParticleRing bins={specBins} rot={ringRot} />
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
            <HDTouch style={st.cMain} onPress={toggle} focusStyle={st.cMainFocus} hasTVPreferredFocus>
              <Icon name={playing ? 'pause' : 'play'} size={32} color={C.onBrand} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipNext}>
              <Icon name="next" size={26} color="#ffffffee" />
            </HDTouch>
            {/* lx151:循环三态(手机端同款角标) */}
            <HDTouch style={st.cMode} onPress={cycleRepeat}>
              <Icon name="repeat" size={20} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : '#ffffff99'} />
              {repeat === 'one' ? <Text style={st.repOne}>1</Text> : null}
            </HDTouch>
            <View style={st.ctrlDivider} />
            <HDTouch style={st.cTool} onPress={() => setCollectOpen(true)}>
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

      {/* lx103:收藏到歌单面板(共享组件) */}
      {collectOpen && current ? <HDCollect song={current} onClose={() => setCollectOpen(false)} /> : null}
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
  repOne: { position: 'absolute', right: 8, top: 8, color: C.brand, fontSize: 9, fontWeight: '700' }, // 手机端同款角标位
  ctrlDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,.14)', marginHorizontal: 2 },
  cTool: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
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
  // v1.2.5 重排:全部主题感知(此前硬编码深色——浅色主题下左侧白侧栏条+纯黑播放页拼接);
  // 布局:头部行内返回 / 唱片列+歌词列 / 居中 dock(进度+播放头,控件居中、工具靠右)
  screen: { flex: 1, backgroundColor: C.bg },
  bgArt: { position: 'absolute', top: -60, left: -60, right: -60, bottom: -60, width: '120%', height: '120%', opacity: T.light ? 0.35 : 0.5 },
  bgVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: T.light ? 'rgba(246,247,249,.86)' : 'rgba(7,9,8,.74)' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, height: 52, zIndex: 5 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, borderRadius: 17, paddingHorizontal: 14, backgroundColor: C.hover },
  backLabel: { color: C.text2, fontSize: 13, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: 64, gap: 56, alignItems: 'stretch' },
  artCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vinylArea: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  srcPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, borderRadius: 12, marginTop: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.input },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  srcTag: { color: C.text2, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  infoCol: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: 8 },
  title: { color: C.text, fontSize: 28, fontWeight: '800' },
  sub: { color: C.text2, fontSize: 14, marginBottom: 12 },
  lyrics: { minHeight: 300, gap: 12, justifyContent: 'center' },
  lyric: { color: T.light ? '#26282C99' : '#FFFFFF73', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  lyricOn: { color: C.text, fontSize: 21, lineHeight: 31, fontWeight: '800' },
  lyricTr: { color: T.light ? '#26282C55' : '#FFFFFF45', fontSize: 12, lineHeight: 17, marginTop: 1 },
  lyricTrOn: { color: T.light ? '#26282C99' : '#FFFFFF8C' },
  maskTop: { position: 'absolute', top: -8, left: -16, right: -16, height: 44, zIndex: 2 },
  maskBottom: { position: 'absolute', bottom: -8, left: -16, right: -16, height: 44, zIndex: 2 },
  noLyric: { alignItems: 'center', gap: 10, marginTop: 30 },
  noLyricText: { color: T.light ? '#8B9199' : '#ffffff55', fontSize: 13 },
  dock: { paddingHorizontal: 48, paddingBottom: 22, gap: 12 },
  progRow: { alignSelf: 'center', width: '100%', maxWidth: 640, flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { color: C.text2, fontSize: 12, fontVariant: ['tabular-nums'], width: 44, textAlign: 'center' },
  track: { flex: 1, height: 6, flexDirection: 'row', borderRadius: 3 },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: C.track, borderRadius: 3 },
  playhead: { position: 'absolute', top: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.brand, borderWidth: 2.5, borderColor: '#ffffff', marginLeft: -7, shadowColor: C.brand, shadowOpacity: 0.75, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  sideSpacer: { flex: 1 },
  ctrlCluster: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.hover, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  cMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', shadowColor: C.brand, shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  cMainFocus: { borderWidth: 3, borderColor: T.light ? '#FFFFFF' : '#ffffffaa', borderRadius: 32 },
  toolCluster: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.hover, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  badge: { color: C.text2, fontSize: 10, marginLeft: 3 },
});

// lx100:水波环容器(vinylZone 内满铺)
const stWave = StyleSheet.create({
  host: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
