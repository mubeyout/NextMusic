// HD 播放页 v3 —— 完全重构:无底部工具 bar,所有元素融入左右两列,沉浸式
// v1 教训:固定尺寸溢出;v2 教训:深色底 panel 突兀(老板:粗糙,直接取消)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Animated, Easing, ScrollView, ActivityIndicator } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { settings } from '../services/settings';
import { LyricCardModal } from '../components/LyricCardModal';
import { WebLyricCardModal } from './WebLyricCardModal';
import { enqueueDownload, webDownloadToServer, isWebServerMode } from '../services/downloads';
import { toast } from '../components/Dialog';
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
// v3.13(老板:你知道唱片长什么样吗):盘心恢复真 vinyl label——封面正圆裁切(SVG clipPath,不再靠 borderRadius 的方图贴纸)
// + label 描边环 + 轴孔;无图时回退深色纸 label
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
    h('defs', null, rg,
      h('clipPath', { id: 'hdLblClip', key: 'lc' }, h('circle', { key: 'c', cx: 150, cy: 150, r: 56 }))),
    ...circles.map(([r, col, sw], i) => h('circle', { key: 'c' + i, cx: 150, cy: 150, r, fill: r === 149 ? col : 'none', stroke: col, strokeWidth: sw })),
    h('path', { d: 'M33 107 A125 125 0 0 1 107 33', stroke: '#FFFFFF1F', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }),
    h('path', { d: 'M246 185 A102 102 0 0 1 168 250', stroke: '#FFFFFF17', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' }),
    h('circle', { cx: 150, cy: 150, r: 149, fill: 'url(#hdSheen)' }),
    /* 盘心 label:深色纸底→正圆裁切封面(slice 不变形)→label 描边环→轴孔
       v3.23(老板:唱片变白):label 盘径 50%→38%(经典黑胶比例)——浅色封面时半张盘发白,黑胶面必须为主视觉 */
    h('circle', { cx: 150, cy: 150, r: 58, fill: '#101312' }),
    img ? h('image', { href: img, x: 94, y: 94, width: 112, height: 112, preserveAspectRatio: 'xMidYMid slice', clipPath: 'url(#hdLblClip)' }) : null,
    h('circle', { cx: 150, cy: 150, r: 58, fill: 'none', stroke: '#FFFFFF2E', strokeWidth: 1.5 }),
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

const IS_WEB = Platform.OS === 'web';

export function HDPlayer() {
  // web: 黑胶尺寸 = min(300, 视口高 40%)(RN StyleSheet 不支持 CSS min,需运行时计算)
  const [winH, setWinH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onR = () => setWinH(window.innerHeight);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const vinylSize = IS_WEB ? Math.min(320, Math.round(winH * 0.34)) : 228; // 设计稿:黑胶为主视觉
  const ringSize = vinylSize + Math.round(vinylSize * 0.06); // 波浪环(黑胶 106%) // 缩小一半(老板)

  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue, speed, setSpeed, sleepRemain, enableSleep } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const { faved } = useFav(current); // lx101:收藏统一 hook(faved 态;操作走选歌单面板,与 TV 同源)
  // lx103:收藏到歌单面板(点按收藏键即弹,对齐手机端)
  const [collectOpen, setCollectOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState<null | 'quality' | 'speed' | 'sleep'>(null); // v2 功能对齐:音质/倍速/睡眠
  // v3.15(老板):web Esc 关闭面板
  useEffect(() => {
    if (!IS_WEB || !panelOpen || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);
  const [cardOpen, setCardOpen] = useState(false); // v2 功能对齐:歌词卡片分享
  // v3.18(老板:播放页补下载):当前曲一键下载/缓存到服务器
  const [dlBusy, setDlBusy] = useState(false);
  const dlCurrent = async () => {
    if (!current || dlBusy) return;
    setDlBusy(true);
    try {
      if (isWebServerMode()) {
        const r = await webDownloadToServer([current]);
        toast(r.ok ? '已缓存到服务器(后台·设置·存储备份可查)' : '缓存失败:取链失败');
      } else {
        enqueueDownload([current]);
        toast('已加入下载队列');
      }
    } catch (e) { toast('下载失败:' + (e as Error).message); }
    setDlBusy(false);
  };
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
      const st = settings.get();
      const rr = r as { tlyric?: string; rlyric?: string }; // v3.28:api 两分支返回型联,统一断言
      if (rr.tlyric && st.showLyricTranslation) lines = mergeTranslation(lines, rr.tlyric);
      if (rr.rlyric && st.showLyricRoma) lines = mergeTranslation(lines, rr.rlyric);
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
  // v3.2: web/TV/HD 统一走下方 st 版布局(web 特化分支移除——设计稿重排已在 st 版,旧 web 分支把改动全挡住了)
  // lx89:TV 播放页全屏独立屏(老板定夺)——头部返回行+左唱片活频谱+右歌词+单行控件
  return (
    <View style={st.screen}>
      {current.img ? <Image source={{ uri: current.img }} style={st.bgArt} blurRadius={60} resizeMode="cover" /> : null}
      <View style={st.bgVeil} />

      {/* 头部:返回按钮入流式布局(不再悬浮怪位) */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <HDTouch style={st.backBtn} onPress={nav.goBack}>
          <Icon name="back" size={16} color="#ffffffcc" />
          <Text style={st.backLabel}>返回</Text>
        </HDTouch>
      </View>

      <View style={[st.main, IS_WEB && st.mainWeb, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={st.rowWrap}>
        <View style={[st.artCol, IS_WEB && { width: '45%' }]}> {/* v3.19(老板:.r-1vcqxpo→45%):web 唱片列宽 344→45%,TV 保持 344 */}
          {/* lx125:粒子环(单圈 48 粒,FFT 分区驱动) */}
          {(<View style={[st.vinylZone, IS_WEB && { width: ringSize, height: ringSize }]}>
            {/* v3.14(老板):删多余的下层方形封面,只留盘内正圆 label;盘回正中 */}
            {/* v3.11(老板):web 波浪环换 HD 版粒子环——按盘径缩放,与 TV 同比例(盘 228↔环 340);层序:粒子环(下)→唱片(上) */}
            {IS_WEB ? (
              <View style={{ position: 'absolute', top: '50%', left: '50%', width: RING_ZONE, height: RING_ZONE, marginLeft: -RING_ZONE / 2, marginTop: -RING_ZONE / 2, transform: [{ scale: vinylSize / 228 }] }}>
                <ParticleRing bins={specBins} rot={ringRot} />
              </View>
            ) : (
              <ParticleRing bins={specBins} rot={ringRot} />
            )}
            {IS_WEB ? (
              /* v3.3(老板:黑胶没质感):web 换 HD_VINYL_SVG——纹理沟槽+光泽+盘心正圆 label,真黑胶质感 */
              <View style={{ position: 'absolute', top: '50%', left: '50%', width: vinylSize, height: vinylSize, marginLeft: -Math.round(vinylSize / 2), marginTop: -Math.round(vinylSize / 2), transform: [{ rotate: String(spinDeg) }] }}>
                {HD_VINYL_SVG(current.img, vinylSize, playing)}
              </View>
            ) : (
              <View style={st.vinylWrap}>
                <Animated.Image
                  source={current.img ? { uri: current.img } : undefined}
                  style={[st.vinylArt, { transform: [{ rotate: spinDeg }] }]}
                  resizeMode="cover"
                />
                {!current.img ? <View style={[st.vinylArt, st.artFallback]}><Icon name="music" size={52} color={C.text3} /></View> : null}
                <View style={st.vinylHole} />
              </View>
            )}
          </View>)}
          
          <View style={st.srcPill}>
            <View style={st.srcDot} />
            <Text style={st.srcTag}>{current.source.toUpperCase()}</Text>
          </View>
        </View>

        <View style={[st.infoCol, IS_WEB && st.infoColWeb]}>
          <Text style={[st.title, IS_WEB && st.titleWeb]} numberOfLines={1}>{current.name}</Text>
          <Text style={[st.sub, IS_WEB && st.subWeb]} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>

          <View style={[st.lyricsBox, IS_WEB && { maxHeight: Math.round(winH * 0.5), overflow: 'hidden' }]}>
            {lyrics ? (
              lyrics.slice(Math.max(0, activeIdx - (IS_WEB ? 5 : 3)), activeIdx + (IS_WEB ? 6 : 4)).map((l, i) => {
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

        </View>
        </View>
          <View style={[st.progRow, IS_WEB && st.progRowWeb]}>
            <Text style={[st.time, IS_WEB && { minWidth: 42 }]}>{fmtSec(position)}</Text>
            <TouchableOpacity
              style={[st.trackWrap, IS_WEB && { height: 6, borderRadius: 3 }]}
              activeOpacity={0.9}
              onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
              onPress={e => {
                const { locationX } = e.nativeEvent;
                const w = trackW.current;
                if (w > 0 && duration > 0) seekTo(Math.max(0, Math.min(1, locationX / w)) * duration);
              }}
              {...(IS_WEB ? ({
                onStartShouldSetResponder: () => duration > 0,
                onResponderMove: (e: import('react-native').GestureResponderEvent) => {
                  const lx = e.nativeEvent.locationX;
                  const w = trackW.current || 1;
                  if (duration > 0) seekTo(Math.max(0, Math.min(1, lx / w)) * duration);
                },
              } as never) : {})} /* v3.28:responder props 运行时支持但已从 TouchableOpacity 类型移除 */
            >
              <View style={[st.trackFill, { flex: pct }]} />
              <View style={[st.trackRest, { flex: 1 - pct }]} />
              <View style={[st.playhead, { left: `${pct * 100}%` }]} />
            </TouchableOpacity>
            <Text style={[st.time, IS_WEB && { minWidth: 42, textAlign: 'right' }]}>{fmtSec(duration)}</Text>
          </View>

          {/* lx89:控件单行(全屏 960dp 富余)——传输组+分隔+工具组,icon 純净排 */}
          <View style={[st.ctrlRow, IS_WEB && st.ctrlRowWeb]}>
            <HDTouch style={st.cMode} onPress={() => setShuffle(!shuffle)}>
              <Icon name="shuffle" size={20} active={shuffle} color={shuffle ? C.brand : '#ffffff99'} />
            </HDTouch>
            <HDTouch style={st.cMode} onPress={skipPrev}>
              <Icon name="previous" size={26} color="#ffffffee" />
            </HDTouch>
            <HDTouch style={[st.cMain, IS_WEB && st.cMainWeb]} onPress={toggle} focusStyle={st.cMainFocus} hasTVPreferredFocus>
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
            {/* v3.8 工具序(老板): 收藏·下载·队列·评论·设备·音效·卡片·音质·倍速·定时 */}
            <HDTouch style={st.cTool} onPress={() => setCollectOpen(true)} title="收藏">
              <Icon name="heart" size={17} color={faved ? C.brand : '#ffffff99'} />
            </HDTouch>
            <HDTouch style={st.cTool} onPress={dlCurrent} title="下载">
              {dlBusy ? <ActivityIndicator size="small" color="#ffffffcc" /> : <Icon name="download" size={17} color="#ffffffcc" />}
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Queue')} title="播放队列">
              <Icon name="queue" size={17} color="#ffffffcc" />
              {queue.length ? (
                <View style={st.qBadge}><Text style={st.qBadgeText}>{queue.length > 99 ? '99+' : queue.length}</Text></View>
              ) : null}
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Comments')} title="评论">
              <Icon name="comments" size={17} color="#ffffffcc" />
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Route')} title="投屏设备">
              <Icon name="devices" size={17} color="#ffffffcc" />
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => nav.navigate('Fx')} title="均衡器与音效">
              <Icon name="sliders" size={17} color="#ffffffcc" />
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => setCardOpen(true)} title="歌词卡片">
              <Text style={[st.cToolText, { color: '#ffffff99' }]}>卡片</Text>
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => setPanelOpen(panelOpen === 'quality' ? null : 'quality')} title="音质">
              <Text style={st.cToolText}>{settings.get().playQuality === 'flac' ? 'SQ' : settings.get().playQuality}</Text>
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => setPanelOpen(panelOpen === 'speed' ? null : 'speed')} title="倍速">
              <Text style={st.cToolText}>{speed.toFixed(2).replace(/0$/, '')}x</Text>
            </HDTouch>
            <HDTouch style={st.cTool} onPress={() => setPanelOpen(panelOpen === 'sleep' ? null : 'sleep')} title="睡眠定时">
              <Text style={[st.cToolText, sleepRemain != null && { color: C.brand }]}>{sleepRemain != null ? `${Math.floor(sleepRemain / 60)}:${String(sleepRemain % 60).padStart(2, '0')}` : '定时'}</Text>
            </HDTouch>

            {/* v3.15(老板:三面板交互修复):面板移入 ctrlRow 内——bottom:100% 锚定按钮正上方(原锚 main 顶部=浮到页顶);
                zIndex 20 盖过 header(原 0 被头叠层吃掉点击);web 加透明遮罩点外部关闭+Esc 关闭 */}
            {IS_WEB && panelOpen ? (
              <TouchableOpacity activeOpacity={1} style={st.panelScrim} onPress={() => setPanelOpen(null)} />
            ) : null}
            {panelOpen === 'quality' ? (
            <View style={[st.panelRow, IS_WEB && st.panelRowWeb]}>
              {(['128k', '320k', 'flac'] as const).map(q => (
                <HDTouch key={q} style={[st.panelPill, settings.get().playQuality === q && st.panelPillOn]} hoverBg="#ffffff1f"
                  onPress={() => { settings.set('playQuality', q); setPanelOpen(null); }}>
                  <Text style={[st.panelPillText, settings.get().playQuality === q && { color: C.onBrand }]}>{q === 'flac' ? '无损' : q === '320k' ? '320k' : '128k'}</Text>
                </HDTouch>
              ))}
            </View>
          ) : null}
          {panelOpen === 'speed' ? (
            <View style={[st.panelRow, IS_WEB && st.panelRowWeb]}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(v => (
                <HDTouch key={v} style={[st.panelPill, speed === v && st.panelPillOn]} hoverBg="#ffffff1f"
                  onPress={() => { setSpeed(v); setPanelOpen(null); }}>
                  <Text style={[st.panelPillText, speed === v && { color: C.onBrand }]}>{v}x</Text>
                </HDTouch>
              ))}
            </View>
          ) : null}
          {panelOpen === 'sleep' ? (
            <View style={[st.panelRow, IS_WEB && st.panelRowWeb]}>
              {[15, 30, 60, 90].map(v => (
                <HDTouch key={v} style={[st.panelPill, sleepRemain != null && st.panelPillOn]} hoverBg="#ffffff1f"
                  onPress={() => { enableSleep(v); setPanelOpen(null); }}>
                  <Text style={[st.panelPillText, sleepRemain != null && { color: C.onBrand }]}>{v} 分钟</Text>
                </HDTouch>
              ))}
              <HDTouch style={st.panelPill} hoverBg="#ffffff1f" onPress={() => { enableSleep(null); setPanelOpen(null); }}>
                <Text style={st.panelPillText}>取消定时</Text>
              </HDTouch>
            </View>
          ) : null}
          </View>
      </View>

      {/* lx103:收藏到歌单面板(共享组件) */}
      {collectOpen && current ? <HDCollect song={current} onClose={() => setCollectOpen(false)} /> : null}
      {cardOpen && current ? (IS_WEB
        ? <WebLyricCardModal onClose={() => setCardOpen(false)} song={current} lyrics={lyrics} positionSec={position} />
        : <LyricCardModal visible onClose={() => setCardOpen(false)} song={current} lyrics={lyrics} positionSec={position} />) : null}
    </View>
  );
}

const st = StyleSheet.create({
  cToolText: { color: '#ffffff99', fontSize: 11, fontWeight: '700' }, // 工具组降为次级灰
  // v3.9 面板交互: 悬浮深色卡(玻璃拟态,从按钮上方浮出+入场动画,锚定居中)——替代裸 pill 排
  panelRow: { position: 'absolute', bottom: '100%', left: '50%', transform: [{ translateX: -210 }], flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(24,26,24,.92)', boxShadow: '0 18px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08)' },
  // v3.15:web 面板真居中(translateX -50% 自适应宽度,不再硬编码 -210)+ zIndex 20(原 0 被 header 盖住吞点击)
  panelRowWeb: { transform: [{ translateX: '-50%' }], zIndex: 20 },
  // v3.15:web 点击面板外关闭——透明遮罩覆盖按钮行以上全部区域(不盖按钮行本身,切换面板仍直达)
  panelScrim: { position: 'absolute', top: -1200, left: -300, right: -300, bottom: '100%', zIndex: 19 },
  panelPill: { borderRadius: 999, paddingHorizontal: 14, height: 30, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  panelPillOn: { backgroundColor: C.brand, borderColor: C.brand, shadowColor: '#1ED760', shadowOpacity: .4, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }, // 选中态绿辉
  panelPillText: { color: '#ffffffcc', fontSize: 12, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: '#0a0c0b' },
  bgArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
  bgVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,7,.62)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, zIndex: 5 },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 26 }, // web 分支控件环
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#ffffff14' },
  backLabel: { color: '#ffffffcc', fontSize: 13, fontWeight: '600' },
    webArtCard: { borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05)', backgroundColor: C.inset },
  webArtImg: { width: '100%', height: '100%' },
// web vinyl 尺寸
  vinylWrap: { width: 228, height: 228, borderRadius: 114, backgroundColor: '#0d100e', borderWidth: 5, borderColor: '#161a17', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 44px rgba(0,0,0,.55), 0 0 36px rgba(30,215,96,.14)' },
  vinylZone: { width: RING_ZONE, height: RING_ZONE, alignItems: 'center', justifyContent: 'center' },
  vinylArt: { width: 150, height: 150, borderRadius: 75 },
  vinylHole: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#0a0c0b', borderWidth: 3, borderColor: '#222823' },
  srcPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, borderRadius: 12, paddingHorizontal: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', backgroundColor: 'rgba(255,255,255,.06)' },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand },
  srcTag: { color: '#ffffffaa', fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  main: { flex: 1, flexDirection: 'row', paddingHorizontal: 52, paddingTop: 4, gap: 42 },
  mainWeb: { flexDirection: 'column', paddingHorizontal: '5%', gap: 20, justifyContent: 'flex-end' }, // v3.5:行2(进度+控件)紧贴页面底部
  rowWrap: { flex: 1, flexDirection: 'row', gap: '10%', alignItems: 'center', minWidth: 0 }, // 行1:黑胶(左半靠右)|10%|标题歌词(右半靠左)
  artCol: { width: 344, alignItems: 'center', justifyContent: 'center' }, // TV 基准;web 见行内 45% 覆写
  artFallback: { backgroundColor: '#1E2722', alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1, gap: 6, paddingTop: 22 },
  infoColWeb: { paddingTop: 0, gap: 10, flex: 1, alignItems: 'flex-start' }, // 行1 右半区·左对齐 // lx94:标题/歌词整体下移(老板:太高)
  title: { color: '#ffffff', fontSize: 25, fontWeight: '800' },
  titleWeb: { fontSize: 30, letterSpacing: -.5 },
  subWeb: { fontSize: 15, marginTop: 4 },
  sub: { color: '#ffffffb3', fontSize: 14 },
  lyricsBox: { flex: 1, gap: 8, justifyContent: 'center', alignItems: 'flex-start' }, // 设计稿:歌词左对齐
  // 歌词窗 web 限高: 运行时算(50vh), // lx93:垂直居中(顶贴→太靠上),窗口 7 行填满空隙
  lyric: { color: '#ffffff7d', fontSize: 17, lineHeight: 24, fontWeight: '500' },
  lyricOn: { color: '#ffffff', fontSize: 22, lineHeight: 31, fontWeight: '800', textShadowColor: 'rgba(255,255,255,.3)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  lyricTr: { color: '#FFFFFF55', fontSize: 12, lineHeight: 17, marginTop: 2 },
  lyricTrOn: { color: '#FFFFFF99' },
  noLyric: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  noLyricText: { color: '#ffffff80', fontSize: 13 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  progRowWeb: { width: '100%', marginBottom: 10 }, // v3.6:全宽(参照 playbar)
  time: { color: '#ffffffb3', fontSize: 12, fontVariant: ['tabular-nums'], width: 42, textAlign: 'center' },
  trackWrap: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3 },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: '#ffffff2e', borderRadius: 3 },
  playhead: { position: 'absolute', top: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.brand, borderWidth: 2.5, borderColor: '#ffffff', marginLeft: -7, boxShadow: '0 0 12px rgba(30,215,96,.75)' },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctrlRowWeb: { justifyContent: 'center', gap: 10, columnGap: 20, marginTop: 0, flexWrap: 'nowrap' }, // v3.7:单排不换行
  cMainWeb: { width: 60, height: 60, borderRadius: 30, boxShadow: '0 8px 30px rgba(30,215,96,.4)' }, // Spotify 大播放键
  ctrlDividerWeb: { opacity: .7 },
  cMode: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, // v3.7:去黑底
  cMain: { width: 66, height: 66, borderRadius: 33, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 33 },
  repOne: { position: 'absolute', right: 8, top: 8, color: C.brand, fontSize: 9, fontWeight: '700' }, // 手机端同款角标位
  ctrlDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,.14)', marginHorizontal: 2 },
  cTool: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, // v3.7:去黑底·紧凑
  qBadge: { position: 'absolute', top: -5, right: -7, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#0e1310' }, // lx95:队列数量优雅悬浮胶囊
  qBadgeText: { color: '#0b0f0d', fontSize: 9, fontWeight: '800' },
});

// ===== 桌面(网易云参照)样式 =====
// v3.4: 工具按钮 hover 浮出 tip(老板:按钮选项改 tips 上浮)
if (Platform.OS === 'web' && typeof (globalThis as { document?: unknown }).document !== 'undefined' && !(globalThis as never as { document?: { getElementById: (i: string) => unknown } }).document?.getElementById('nm-tip-css')) {
  const d = (globalThis as never as { document?: { createElement: (t: string) => { id: string; textContent: string; head?: unknown }; head: { appendChild: (e: unknown) => void } } }).document!;
  const el = d.createElement('style'); el.id = 'nm-tip-css';
  const cssTip = '[title]{position:relative}[title]:hover::after{content:attr(title);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#22262E;color:#fff;font:11px/1.6 sans-serif;padding:5px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.5);pointer-events:none;z-index:99}';
  el.textContent = cssTip;
  (d.head as unknown as { appendChild: (e: unknown) => void }).appendChild(el);
  (d.head as unknown as { appendChild: (e: unknown) => void }).appendChild(el);
}
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
  artColWeb: { flex: 1, alignItems: 'flex-end', paddingRight: '5%' }, // 行1 左半区·靠右
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
