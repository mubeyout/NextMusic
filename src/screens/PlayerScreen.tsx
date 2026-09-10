import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, PanResponder, Animated, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { usePlayer } from '../state/PlayerProvider';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { parseLrc, mergeTranslation, findActiveLine, type LyricLine } from '../services/lyric';
import { sync, appToLx, lxToApp, lxNormKey } from '../services/sync';
import { isFav, songKey } from '../state/favorites';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { useFav } from '../state/useFav'; // lx157:统一收藏 hook(本地MMKV+歌单+服务器三源实时联动,替代手搓 effect)
import { CollectSheet } from '../components/CollectSheet';
import { LyricCardModal } from '../components/LyricCardModal'; // lx161:歌词卡片
import { ActionSheet } from '../components/ActionSheet';
import { DeviceSheet } from './RouteScreen';
import { enqueueDownload, downloads as dlStore, downloadProgress, subscribeDownloads } from '../services/downloads';
import { dialog, toast } from '../components/Dialog';

// Figma 04·播放页: vinyl hero + synced lyrics + secondary tools + playback panel
export function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const { faved, toggle: toggleFav } = useFav(current); // lx157:收藏状态三源实时联动(isFav+歌单+服务器快照,取订刷新)
  const [collect, setCollect] = useState(false);
  const [more, setMore] = useState(false);
  const [cardOpen, setCardOpen] = useState(false); // lx161:歌词卡片
  const [deviceSheet, setDeviceSheet] = useState(false); // 设备选择：悬浮层（不再全屏跳页）
  const [, forceDl] = useState(0);
  useEffect(() => subscribeDownloads(() => forceDl(n => n + 1)), []);
  const dlProg = current ? downloadProgress(current) : null;
  const [seekPct, setSeekPct] = useState<number | null>(null); // 拖动中的进度

  // 唱片旋转：播放时匀速转动，暂停时停在当前角度，恢复后继续
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (playing) {
      if (!spinLoop.current) {
        spinLoop.current = Animated.loop(
          Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' })
        );
      }
      spinLoop.current.start();
    } else {
      spin.stopAnimation(); // 冻结在当前角度
    }
    return () => { spin.stopAnimation(); };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const openCollect = () => { if (current) setCollect(true); };
  // CollectSheet 内部完成收藏/取消（同步服务器 + 本机歌单）

  // lx157:是否收录在任意歌单(本地或服务器)——心钮分流用
  const hasPlCollect = (s: { source: string; songmid: string }) => {
    const k = `${s.source}_${s.songmid}`;
    const snapNow = sync.cachedLists();
    return library.all().some(pl => (pl.songs || []).some(x => songKey(x) === k))
      || (snapNow?.userList || []).some(u => (u.list || []).some(x => lxNormKey(x as never) === k));
  };
  // 心钮已收藏→直接移除(高频单步);未收藏→打开收藏面板(低频多选)
  const doUnfav = async () => {
    if (!current) return;
    const inPl = hasPlCollect(current);
    await toggleFav();
    toast(inPl ? '已移出「我喜欢的」· 仍收藏于歌单' : '已取消收藏');
  };
  // lx168:♥ 弹跳反馈(动效评审)
  const heartScale = useRef(new Animated.Value(1)).current;
  const popHeart = () => {
    heartScale.setValue(0.65);
    Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  // 心钮总入口:未收藏→面板;仅歌单收录(非我喜欢的)→面板里移除;我喜欢的在→一键移除
  const heartPress = () => {
    if (!current) return;
    popHeart();
    if (!faved || (!isFav(current) && hasPlCollect(current))) return openCollect();
    doUnfav();
  };

  useEffect(() => {
    setLyrics(null);
    if (!current) return;
    let dead = false;
    (async () => {
      // 取词优先级：音源引擎 → （媒体库源：按名匹配）→ 服务器（登录态）；全空才显示「暂无歌词」
      let r = await lxapi.lyric(current);
      let raw = r.lxlyric || r.lyric || r.lrc;
      const isProvider = ['emby', 'jellyfin', 'subsonic', 'navidrome', 'daoliyu', 'webdav'].includes(current.source);
      if (!raw && isProvider) {
        // 媒体库歌曲 id 对平台无意义，按歌名+歌手模糊匹配取词（LRC 文本通用）
        try {
          r = await lxapi.lyricByName(current.name, current.singer);
          raw = r.lxlyric || r.lyric || r.lrc;
        } catch { /* 匹配失败继续 */ }
      }
      if (!raw && connected && token) {
        try {
          const rs = await api.lyric(current);
          if (!dead) r = { ...r, ...rs };
          raw = rs.lxlyric || rs.lyric || rs.lrc || raw;
        } catch { /* 服务器也失败则保持空 */ }
      }
      if (dead || !raw) return;
      let lines = parseLrc(raw);
      const tly = r.tlyric;
      if (tly) lines = mergeTranslation(lines, tly);
      if (lines.length) setLyrics(lines);
    })();
    return () => { dead = true; };
  }, [current?.songmid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) {
    return (
      <View style={[st.screen, { paddingTop: insets.top + 60, alignItems: 'center' }]}>
        <Text style={{ color: C.text2, fontSize: 13 }}>没有正在播放的歌曲</Text>
      </View>
    );
  }

  const activeIdx = lyrics ? findActiveLine(lyrics, position) : -1;

  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <View style={st.screen}>
      {/* 内容层：设备选择悬浮时背景模糊作用于这一层（nativeID 原生侧 RenderEffect） */}
      <View nativeID="playerContent" style={{ flex: 1 }}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={st.hBtn} onPress={() => nav.goBack()} hitSlop={4}>
          <Icon name="back" size={24} />
        </TouchableOpacity>
        <Text style={st.hTitle}>正在播放</Text>
        <TouchableOpacity style={st.hBtn} hitSlop={4} onPress={() => setMore(true)}>
          <Icon name="more" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Vinyl hero（整体旋转：胶纹纹理+偏心高光让旋转可见；容器不裁切） */}
        <View style={st.vinylWrap}>
          <Animated.View style={[st.vinylSpin, { transform: [{ rotate: spinDeg }] }]}>
            <Svg width={270} height={270}>
              <Defs>
                <RadialGradient id="sheenA" cx="0.32" cy="0.26" r="0.95">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
                  <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.025" />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="sheenB" cx="0.74" cy="0.82" r="0.65">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.05" />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={135} cy={135} r={134} fill="#0A0A0D" stroke="#00000085" strokeWidth={1} />
              {/* 胶纹：多道交替透明度的刻痕环 */}
              <Circle cx={135} cy={135} r={129} stroke="#FFFFFF0A" strokeWidth={1} fill="none" />
              <Circle cx={135} cy={135} r={124} stroke="#FFFFFF08" strokeWidth={1.5} fill="none" />
              <Circle cx={135} cy={135} r={119} stroke="#FFFFFF0F" strokeWidth={1} fill="none" />
              <Circle cx={135} cy={135} r={114} stroke="#FFFFFF06" strokeWidth={1.5} fill="none" />
              <Circle cx={135} cy={135} r={109} stroke="#FFFFFF12" strokeWidth={1} fill="none" />
              <Circle cx={135} cy={135} r={104} stroke="#FFFFFF08" strokeWidth={1.5} fill="none" />
              <Circle cx={135} cy={135} r={99} stroke="#FFFFFF14" strokeWidth={1} fill="none" />
              <Circle cx={135} cy={135} r={89} stroke="#FFFFFF0D" strokeWidth={1} fill="none" />
              {/* 两道偏心高光弧：旋转的视觉主线索 */}
              <Path d="M29.8 96.7 A112 112 0 0 1 96.7 29.8" stroke="#FFFFFF1F" strokeWidth={3} strokeLinecap="round" fill="none" />
              <Path d="M221.5 166.5 A92 92 0 0 1 151 225.6" stroke="#FFFFFF17" strokeWidth={4} strokeLinecap="round" fill="none" />
              {/* 径向光泽（偏心，随盘旋转） */}
              <Circle cx={135} cy={135} r={134} fill="url(#sheenA)" />
              <Circle cx={135} cy={135} r={134} fill="url(#sheenB)" />
              <Circle cx={135} cy={135} r={79} fill={C.brand} />
            </Svg>
            {current.img ? (
              <Image source={{ uri: current.img }} style={st.vinylLabel} />
            ) : (
              <View style={[st.vinylLabel, { backgroundColor: '#2A2A2A' }]} />
            )}
            <View style={st.spindle} />
          </Animated.View>
        </View>
        <View style={st.modeRow}>
          <View style={st.modeMarker} />
          <View>
            <Text style={st.modeTitle}>黑胶歌词</Text>
            <Text style={st.modeCaption}>唱片与歌词同步</Text>
          </View>
        </View>

        {/* Lyrics */}
        <View style={st.lyrics}>
          {lyrics ? lyrics.slice(Math.max(0, activeIdx - 2), activeIdx + 3).map((l, i) => {
            const real = Math.max(0, activeIdx - 2) + i;
            const state = real === activeIdx ? 'active' : real === activeIdx - 1 ? 'lead' : 'far';
            return (
              <View key={real}>
                <Text style={state === 'active' ? st.lActive : state === 'lead' ? st.lLead : st.lFar}>
                  {l.text}
                </Text>
                {state === 'active' && l.trans ? (
                  <Text style={st.lTrans}>{l.trans}</Text>
                ) : null}
              </View>
            );
          }) : (
            <>
              <Text style={st.lFar}>{current.name}</Text>
              <Text style={st.lLead}>{current.singer}</Text>
              <Text style={st.lActive}>暂无歌词</Text>
            </>
          )}
        </View>

        {/* Secondary tools */}
        <View style={st.tools}>
          <TouchableOpacity style={st.tool} onPress={() => nav.navigate('Comments')}>
            <Icon name="comments" size={20} color={C.text2} />
            <Text style={st.toolLabel}>评论</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.tool} onPress={() => nav.navigate('Fx')}>
            <Icon name="sliders" size={20} color={C.text2} />
            <Text style={st.toolLabel}>音效</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.tool} onPress={() => setDeviceSheet(true)}>
            <Icon name="devices" size={20} color={C.text2} />
            <Text style={st.toolLabel}>设备</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.tool} onPress={() => nav.navigate('PlayerSettings')}>
            <Icon name="settings" size={20} color={C.text2} />
            <Text style={st.toolLabel}>设置</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Playback panel */}
      <View style={[st.panel, { paddingBottom: insets.bottom + 12 }]}>
        <View style={st.pTrackRow}>
          {current.img ? <Image source={{ uri: current.img }} style={st.pArt} /> : <View style={[st.pArt, { backgroundColor: C.surface2 }]} />}
          <View style={st.pMeta}>
            <Text style={st.pTitle} numberOfLines={1}>{current.name}</Text>
            <Text style={st.pSub} numberOfLines={1}>{current.singer}  ·  {current._types?.flac ? 'SQ 无损' : '128k'}</Text>
          </View>
          <View style={st.pActions}>
            <TouchableOpacity style={st.pIcon} hitSlop={6} onPress={heartPress}>
              <Animated.Text style={{ transform: [{ scale: heartScale }] }}>
                <Icon name="heart" size={20} active={faved} color={faved ? '#FF5A76' : C.text} />
              </Animated.Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.pIcon}
              hitSlop={6}
              onPress={() => {
                if (dlStore.isDownloaded(current)) return;
                const n = enqueueDownload([current]);
                toast(n ? `已加入下载队列 · ${current.name}` : '该歌曲已在下载队列');
              }}
            >
              {dlProg != null ? (
                <Text style={st.pProg}>{Math.round(dlProg * 100)}%</Text>
              ) : dlStore.isDownloaded(current) ? (
                <Icon name="check" size={20} active />
              ) : (
                <Icon name="download" size={20} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={st.pIcon} onPress={() => nav.navigate('Queue')}><Icon name="queue" size={20} /></TouchableOpacity>
          </View>
        </View>

        <SeekBar pct={seekPct ?? pct} duration={duration} onSeek={p => { setSeekPct(null); seekTo(p * duration); }} onDrag={setSeekPct} />
        <View style={st.timeRow}>
          <Text style={st.time}>{fmt(seekPct != null ? seekPct * duration : position)}</Text>
          <Text style={st.time}>{fmt(duration)}</Text>
        </View>

        <View style={st.controls}>
          <TouchableOpacity style={st.cBtn} onPress={() => setShuffle(!shuffle)}>
            <Icon name="shuffle" size={22} active={shuffle} />
          </TouchableOpacity>
          <TouchableOpacity style={st.cBtn} onPress={skipPrev}><Icon name="previous" size={24} /></TouchableOpacity>
          <TouchableOpacity style={st.cMain} onPress={toggle}>
            <Icon name={playing ? 'pause' : 'play'} size={30} color={C.onBrand} />
          </TouchableOpacity>
          <TouchableOpacity style={st.cBtn} onPress={skipNext}><Icon name="next" size={24} /></TouchableOpacity>
          <TouchableOpacity style={st.cBtn} onPress={cycleRepeat}>
            <Icon name="repeat" size={22} active={repeat !== 'off'} />
            {repeat === 'one' ? <Text style={st.repeatOne}>1</Text> : null}
          </TouchableOpacity>
        </View>
      </View>
      </View>{/* /playerContent */}

      <CollectSheet song={current} visible={collect} onClose={() => setCollect(false)} />
      <ActionSheet
        visible={more} onClose={() => setMore(false)} title={current.name}
        items={[
          dlStore.isDownloaded(current)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载这首歌', onPress: () => { enqueueDownload([current]); toast(`已加入下载队列 · ${current.name}`); } },
          { label: '收藏到歌单', onPress: openCollect },
          { label: '查看播放队列', onPress: () => nav.navigate('Queue') },
          { label: '歌词卡片', onPress: () => setCardOpen(true) }, // lx161:歌词卡片分享
          { label: '均衡器与音效', onPress: () => nav.navigate('Fx') },
          { label: '选择播放设备', onPress: () => setDeviceSheet(true) },
          { label: '播放器设置', onPress: () => nav.navigate('PlayerSettings') },
        ]}
      />

      <DeviceSheet visible={deviceSheet} onClose={() => setDeviceSheet(false)} />
      <LyricCardModal visible={cardOpen} onClose={() => setCardOpen(false)} song={current} lyrics={lyrics} positionSec={position} />
    </View>
  );
}

// 可拖动进度条：拖动实时预览，松手 seek
function SeekBar({ pct, duration, onSeek, onDrag }: {
  pct: number; duration: number; onSeek: (p: number) => void; onDrag: (p: number | null) => void;
}) {
  const w = useRef(1);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e: any) => {
      const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / w.current));
      onDrag(p);
    },
    onPanResponderMove: (e: any) => {
      const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / w.current));
      onDrag(p);
    },
    onPanResponderRelease: (e: any) => {
      const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / w.current));
      onSeek(p);
    },
    onPanResponderTerminate: () => onDrag(null),
  }), [onDrag, onSeek]);
  return (
    <View
      style={st.seekHit}
      onLayout={e => { w.current = Math.max(e.nativeEvent.layout.width, 1); }}
      {...pan.panHandlers}
    >
      <View style={st.bar}>
        <View style={[st.barValue, { flex: Math.max(pct, 0.001) }]} />
        <View style={{ flex: Math.max(1 - pct, 0.001) }} />
      </View>
      <View style={[st.barThumb, { left: `${pct * 100}%` }]} />
      {duration > 0 ? null : null}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bgDeep },
  header: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, color: C.text, fontSize: 16, lineHeight: 19, fontWeight: '500' }, // lx166 居左(播放页返回头行)
  vinylWrap: { alignSelf: 'center', width: 270, height: 270, marginTop: 10 },
  vinylSpin: { width: 270, height: 270 },
  vinylLabel: {
    position: 'absolute', left: 61, top: 61, width: 148, height: 148, borderRadius: 74,
    overflow: 'hidden',
  },
  spindle: { position: 'absolute', left: 130, top: 130, width: 10, height: 10, borderRadius: 5, backgroundColor: '#0D0D0D' },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, marginTop: 8 },
  modeMarker: { width: 3, height: 38, borderRadius: 2, backgroundColor: C.brand },
  modeTitle: { color: C.text, fontSize: 15, lineHeight: 18, fontWeight: '500' },
  modeCaption: { color: C.text2, fontSize: 11, lineHeight: 13 },
  lyrics: { paddingHorizontal: 30, paddingTop: 10, gap: 7, minHeight: 158 },
  lActive: { color: C.brandSoft, fontSize: 26, lineHeight: 31, fontWeight: '700' },
  lTrans: { color: C.text2, fontSize: 14, lineHeight: 18, marginTop: 2 },
  lLead: { color: C.text, fontSize: 18, lineHeight: 22, opacity: 0.86 },
  lFar: { color: C.text2, fontSize: 14, lineHeight: 17, opacity: 0.55 },
  tools: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 8 },
  tool: {
    flex: 1, height: 44, borderRadius: 14, backgroundColor: C.inputBar,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  toolLabel: { color: C.text2, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  panel: {
    borderRadius: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    backgroundColor: C.elev, paddingTop: 18, paddingHorizontal: 20, gap: 7,
  },
  pTrackRow: { flexDirection: 'row', alignItems: 'center', height: 56 },
  pActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pArt: { width: 52, height: 52, borderRadius: 10 },
  pMeta: { flex: 1, marginLeft: 13, gap: 2 },
  pTitle: { color: C.text, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  pSub: { color: C.text2, fontSize: 12, lineHeight: 14 },
  pProg: { color: C.brandSoft, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  pIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center' },
  seekHit: { height: 28, justifyContent: 'center' },
  bar: { height: 4, flexDirection: 'row', backgroundColor: C.surface2 },
  barValue: { backgroundColor: C.brand },
  barThumb: {
    position: 'absolute', top: 7, width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.text, marginLeft: -7,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: C.text2, fontSize: 10, lineHeight: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 68 },
  cBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cMain: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  repeatOne: { position: 'absolute', right: 6, top: 6, color: C.brandText, fontSize: 9, fontWeight: '700' },
});
