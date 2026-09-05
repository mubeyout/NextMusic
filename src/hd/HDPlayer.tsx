// HD 播放页 v3 —— 完全重构:无底部工具 bar,所有元素融入左右两列,沉浸式
// v1 教训:固定尺寸溢出;v2 教训:深色底 panel 突兀(老板:粗糙,直接取消)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Animated, Easing } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
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
import { sync } from '../services/sync';
import { isFav, setFav } from '../state/favorites';
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

export function HDPlayer() {
  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [faved, setFaved] = useState(false);
  const trackW = React.useRef(0);
  // v1.1.8 唱片旋转(18s/转;web JS driver——RNW Animated useNativeDriver 必 false)
  const spin = React.useRef(new Animated.Value(0)).current;
  const spinLoop = React.useRef<Animated.CompositeAnimation | null>(null);
  React.useEffect(() => {
    if (playing) {
      if (!spinLoop.current) {
        spinLoop.current = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: false }));
      }
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
    }
  }, [playing, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    let dead = false;
    if (!current) return;
    let base = isFav(current);
    if (connected && token) {
      sync.fetchLists().then(s => {
        if (dead || !s) return;
        const key = `${current.source}_${current.songmid}`;
        setFaved(base || s.loveList.some(x => x.id === key));
      }).catch(() => setFaved(base));
    } else setFaved(base);
    return () => { dead = true; };
  }, [current?.songmid, current?.source, connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const doFav = async () => {
    setFaved(!faved);
    try { await setFav(current, !faved); } catch { setFaved(faved); }
  };

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

  // lx68:TV 版参照桌面重设计——封面模糊铺底 + 左旋转唱片(频谱环) + 右标题歌词 + 底部一体 dock
  return (
    <View style={st.screen}>
      {current.img ? <Image source={{ uri: current.img }} style={st.bgArt} blurRadius={60} resizeMode="cover" /> : null}
      <View style={st.bgVeil} />
      <HDTouch style={[st.backBtn, { top: Math.max(insets.top, 10) }]} onPress={nav.goBack} focusStyle={st.focus} hasTVPreferredFocus>
        <Icon name="back" size={20} color="#ffffffcc" />
      </HDTouch>

      <View style={[st.main, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={st.artCol}>
          {/* lx68 桌面同构:旋转圆形唱片 + 静态律动环(SpectrumRing 是 web DOM 组件,TV 原生用 View 环替代——坑125) */}
          <View style={st.ringOuter} pointerEvents="none">
            <View style={[st.ringDot, { top: 2, left: '50%' }]} />
            <View style={[st.ringDot, { bottom: 2, left: '50%' }]} />
            <View style={[st.ringDot, { left: 2, top: '50%' }]} />
            <View style={[st.ringDot, { right: 2, top: '50%' }]} />
          </View>
          <View style={st.vinylWrap}>
            <Animated.Image
              source={current.img ? { uri: current.img } : undefined}
              style={[st.vinylArt, { transform: [{ rotate: spinDeg }] }]}
              resizeMode="cover"
            />
            {!current.img ? <View style={[st.vinylArt, st.artFallback]}><Icon name="music" size={56} color={C.text3} /></View> : null}
            <View style={st.vinylHole} />
          </View>
          <Text style={st.srcTag}>{current.source.toUpperCase()}</Text>
        </View>

        <View style={st.infoCol}>
          <Text style={st.title} numberOfLines={1}>{current.name}</Text>
          <Text style={st.sub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>

          <View style={st.lyricsBox}>
            {lyrics ? (
              lyrics.slice(Math.max(0, activeIdx - 1), activeIdx + 3).map((l, i) => {
                const idx = Math.max(0, activeIdx - 1) + i;
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
              style={st.track}
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
            </TouchableOpacity>
            <Text style={st.time}>{fmtSec(duration)}</Text>
          </View>

          <View style={st.ctrlRow}>
            <HDTouch style={st.cMode} onPress={() => setShuffle(!shuffle)} focusStyle={st.focus}>
              <Icon name="shuffle" size={22} active={shuffle} color={shuffle ? C.brand : C.text2} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipPrev} focusStyle={st.focus}>
              <Icon name="previous" size={28} color={C.text} />
            </HDTouch>
            <HDTouch style={st.cMain} onPress={toggle} focusStyle={st.cMainFocus}>
              <Icon name={playing ? 'pause' : 'play'} size={34} color={C.onBrand} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipNext} focusStyle={st.focus}>
              <Icon name="next" size={28} color={C.text} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={cycleRepeat} focusStyle={st.focus}>
              <Icon name="repeat" size={22} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
            </HDTouch>
            <View style={st.ctrlDivider} />
            <HDTouch style={st.cMode} onPress={doFav} focusStyle={st.focus}>
              <Icon name="heart" size={22} color={faved ? C.brand : C.text2} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={() => nav.navigate('Queue')} focusStyle={st.focus}>
              <Icon name="queue" size={22} color={C.text2} />
              {queue.length ? <Text style={st.badge}>{queue.length}</Text> : null}
            </HDTouch>
            <HDTouch style={st.cMode} onPress={() => nav.navigate('Route')} focusStyle={st.focus}>
              <Icon name="devices" size={22} color={C.text2} />
            </HDTouch>
          </View>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0c0b' },
  bgArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
  bgVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,7,.62)' },
  vinylWrap: { width: 240, height: 240, borderRadius: 120, backgroundColor: '#0d100e', borderWidth: 6, borderColor: '#161a17', alignItems: 'center', justifyContent: 'center' },
  ringOuter: { position: 'absolute', width: 330, height: 330, borderRadius: 165, borderWidth: 1.5, borderColor: '#ffffff22' },
  ringDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: C.brandDim },
  vinylArt: { width: 150, height: 150, borderRadius: 75 },
  vinylHole: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#0a0c0b', borderWidth: 3, borderColor: '#222823' },
  srcTag: { color: '#ffffff66', fontSize: 11, letterSpacing: 2, marginTop: 14 },
  backBtn: { position: 'absolute', top: 10, left: 18, zIndex: 5, width: 40, height: 40, borderRadius: 12, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 26 },
  main: { flex: 1, flexDirection: 'row', paddingHorizontal: 64, gap: 44 },
  artCol: { flex: 0.85, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', aspectRatio: 1, borderRadius: 20, maxHeight: 330, maxWidth: 330 },
  artFallback: { backgroundColor: '#1E2722', alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1.15, gap: 7 },
  title: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  sub: { color: '#ffffffb3', fontSize: 14 },
  lyricsBox: { flex: 1, gap: 12, justifyContent: 'center' },
  lyric: { color: '#ffffff80', fontSize: 19, lineHeight: 28, fontWeight: '500' },
  lyricOn: { color: '#ffffff', fontSize: 26, lineHeight: 37, fontWeight: '800' },
  lyricTr: { color: '#FFFFFF55', fontSize: 13, lineHeight: 18, marginTop: 2 },
  lyricTrOn: { color: '#FFFFFF99' },
  noLyric: { alignItems: 'center', gap: 10, marginTop: 16 },
  noLyricText: { color: '#ffffff80', fontSize: 13 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  time: { color: '#ffffffb3', fontSize: 13, fontVariant: ['tabular-nums'], width: 46, textAlign: 'center' },
  track: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: '#ffffff2e', borderRadius: 3 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  cMode: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  cMain: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 39 },
  ctrlDivider: { width: 1, height: 30, backgroundColor: C.stroke, marginHorizontal: 4 },
  badge: { color: C.text2, fontSize: 10, marginLeft: 3 },
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
  track: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
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
