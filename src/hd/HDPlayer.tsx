// HD 播放页(横版全屏)v2 —— 完全重构:单屏自适应布局,封面永远完整显示
// 结构:左列封面(高度自适应方形) | 右列 标题/歌词窗口/工具行;底部 进度+控件;左上返回
// v1 教训:固定 340 封面 + 底部面板在 960x540 视口必然溢出 → ScrollView 切封面(老板实测"显示不完")
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, fmtSec } from './hdtokens';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { parseLrc, mergeTranslation, findActiveLine, type LyricLine } from '../services/lyric';
import { sync } from '../services/sync';
import { isFav, setFav } from '../state/favorites';
import { hdNav } from './hdnav';

export function HDPlayer() {
  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [faved, setFaved] = useState(false);
  const trackW = React.useRef(0);

  // 收藏态(本地 + 服务器远端合并)
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

  // 歌词:音源引擎 → 媒体库按名匹配 → 服务器兜底(与 phone PlayerScreen 同链)
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

  return (
    <View style={st.screen}>
      {/* 主区:左封面(自适应) | 右信息+歌词 */}
      <View style={[st.main, { paddingTop: Math.max(insets.top, 14) }]}>
        {/* 左列:封面占满可用高,方形永远完整 */}
        <View style={st.artCol}>
          {current.img
            ? <Image source={{ uri: current.img }} style={st.art} resizeMode="cover" />
            : <View style={[st.art, { backgroundColor: '#1E2722', alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="music" size={64} color={C.text3} />
              </View>}
        </View>

        {/* 右列:标题 / 歌词窗口 / 工具行 */}
        <View style={st.infoCol}>
          <Text style={st.title} numberOfLines={1}>{current.name}</Text>
          <Text style={st.sub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>

          <View style={st.lyricsBox}>
            {lyrics ? (
              lyrics.slice(Math.max(0, activeIdx - 1), activeIdx + 4).map((l, i) => {
                const idx = Math.max(0, activeIdx - 1) + i;
                const on = idx === activeIdx;
                return (
                  <TouchableOpacity key={idx} disabled={!on || !l.t} onPress={() => l.t && seekTo(l.t + 0.3)} activeOpacity={0.7}>
                    <Text style={[st.lyric, on && st.lyricOn]} numberOfLines={1}>{l.text || '♪'}</Text>
                    {l.trans ? <Text style={[st.lyricTr, on && { color: '#FFFFFF99' }]} numberOfLines={1}>{l.trans}</Text> : null}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={{ alignItems: 'center', gap: 10, marginTop: 26 }}>
                <Icon name="music" size={30} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 13 }}>{current.source.toUpperCase()} · 暂无歌词</Text>
              </View>
            )}
          </View>

          <View style={st.tools}>
            <HDTouch style={st.tool} onPress={doFav}>
              <Icon name="heart" size={22} color={faved ? C.brand : C.text2} />
            </HDTouch>
            <HDTouch style={st.tool} onPress={() => nav.navigate('Queue')}>
              <Icon name="queue" size={22} color={C.text2} />
              {queue.length ? <Text style={st.toolBadge}>{queue.length}</Text> : null}
            </HDTouch>
            <HDTouch style={st.tool} onPress={() => nav.navigate('Route')}>
              <Icon name="devices" size={22} color={C.text2} />
            </HDTouch>
          </View>
        </View>

        {/* 左上返回 */}
        <HDTouch style={st.backBtn} onPress={nav.goBack} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} hasTVPreferredFocus>
          <Icon name="back" size={20} color={C.text2} />
        </HDTouch>
      </View>

      {/* 底:进度 + 控件 */}
      <View style={[st.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={st.progRow}>
          <Text style={st.time}>{fmtSec(position)}</Text>
          <TouchableOpacity style={st.track} activeOpacity={0.9} onLayout={e => { trackW.current = e.nativeEvent.layout.width; }} onPress={e => {
            const { locationX } = e.nativeEvent;
            const w = trackW.current;
            if (w > 0 && duration > 0) seekTo(Math.max(0, Math.min(1, locationX / w)) * duration);
          }}>
            <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} />
            <View style={{ flex: 1 - pct, backgroundColor: '#333', borderRadius: 2 }} />
          </TouchableOpacity>
          <Text style={st.time}>{fmtSec(duration)}</Text>
        </View>
        <View style={st.ctrls}>
          <HDTouch style={st.cBtn} onPress={() => setShuffle(!shuffle)}>
            <Icon name="shuffle" size={24} active={shuffle} color={shuffle ? C.brand : C.text2} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={skipPrev}>
            <Icon name="previous" size={32} color={C.text} />
          </HDTouch>
          <HDTouch style={st.cMain} onPress={toggle} focusStyle={st.cMainFocus}>
            <Icon name={playing ? 'pause' : 'play'} size={38} color={C.onBrand} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={skipNext}>
            <Icon name="next" size={32} color={C.text} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={cycleRepeat}>
            <Icon name="repeat" size={24} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
          </HDTouch>
          <View style={{ flex: 1 }} />
          <Text style={st.queueHint}>{queue.length ? `${queue.length} 首队列` : ''}</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bgDeep },
  main: { flex: 1, flexDirection: 'row', paddingHorizontal: 46, gap: 40 },
  // 左列:封面 flex 自适应高度(一屏内永远完整),方形 aspectRatio,上限 330
  artCol: { flex: 0.9, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', aspectRatio: 1, borderRadius: 20, maxHeight: 330, maxWidth: 330 },
  // 右列
  infoCol: { flex: 1.1, gap: 8, paddingBottom: 10 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', marginTop: 4 },
  sub: { color: C.text2, fontSize: 14 },
  lyricsBox: { flex: 1, gap: 12, justifyContent: 'center' },
  lyric: { color: C.text3, fontSize: 19, lineHeight: 28, fontWeight: '500' },
  lyricOn: { color: C.text, fontSize: 27, lineHeight: 38, fontWeight: '800' },
  lyricTr: { color: '#FFFFFF55', fontSize: 13, lineHeight: 18, marginTop: 2 },
  tools: { flexDirection: 'row', gap: 14, paddingBottom: 4 },
  tool: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  toolBadge: { color: C.text2, fontSize: 10, marginLeft: 4 },
  // 返回(左上绝对定位)
  backBtn: { position: 'absolute', top: 6, left: -28, width: 40, height: 40, borderRadius: 12, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  // 底部面板
  panel: { backgroundColor: '#141414', paddingHorizontal: 46, paddingTop: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.stroke },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time: { color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'], width: 48, textAlign: 'center' },
  track: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 2, overflow: 'hidden' },
  ctrls: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  cBtn: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  cMain: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 42 },
  queueHint: { color: C.text3, fontSize: 11 },
});
