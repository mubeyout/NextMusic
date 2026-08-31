// HD 播放页(横版全屏):左大封面+信息+收藏,右歌词窗口,底部大进度条+控件
// 车机优先:大触点、高对比;歌词窗口式 5 行(驾驶场景一眼可读)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
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

export function HDPlayer() {
  const insets = useSafeAreaInsets();
  const nav = { goBack: () => hdNav()?.goBack(), navigate: (s: string) => hdNav()?.navigate(s) };
  const { current, playing, position, duration, toggle, skipNext, skipPrev, seekTo, shuffle, repeat, setShuffle, cycleRepeat, queue } = usePlayer();
  const { connected, token } = useApp();
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [faved, setFaved] = useState(false);
  const trackW = React.useRef(0); // 进度条实际宽(onLayout 捕获,seek 点击定位用)

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
    setFaved(!faved); // 乐观更新
    try { await setFav(current, !faved); } catch { setFaved(faved); }
  };

  return (
    <View style={st.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: Math.max(insets.top, 18), paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={st.main}>
          {/* 左:封面 + 信息 */}
          <View style={st.left}>
            {current.img
              ? <Image source={{ uri: current.img }} style={st.art} />
              : <View style={[st.art, { backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={60} color={C.text2} /></View>}
            <View style={{ gap: 6, alignItems: 'center' }}>
              <Text style={st.title} numberOfLines={1}>{current.name}</Text>
              <Text style={st.sub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                <HDTouch style={st.tool} onPress={doFav}>
                  <Icon name="heart" size={26} color={faved ? C.brand : C.text2} />
                </HDTouch>
                <HDTouch style={st.tool} onPress={() => nav.navigate('Queue')}>
                  <Icon name="queue" size={26} color={C.text2} />
                </HDTouch>
                <HDTouch style={st.tool} onPress={() => nav.navigate('Route')}>
                  <Icon name="devices" size={26} color={C.text2} />
                </HDTouch>
              </View>
            </View>
          </View>

          {/* 右:歌词窗口 */}
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
              <View style={{ alignItems: 'center', gap: 10, paddingTop: 60 }}>
                <Icon name="music" size={36} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 15 }}>{current.source.toUpperCase()} · 暂无歌词</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 底:进度 + 大控件 */}
      <View style={[st.panel, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={st.progRow}>
          <Text style={st.time}>{fmtSec(position)}</Text>
          <TouchableOpacity style={st.track} activeOpacity={0.9} onLayout={e => { trackW.current = e.nativeEvent.layout.width; }} onPress={e => {
            const { locationX } = e.nativeEvent;
            const w = trackW.current;
            if (w > 0 && duration > 0) seekTo(Math.max(0, Math.min(1, locationX / w)) * duration);
          }}>
            <View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 3 }} />
            <View style={{ flex: 1 - pct, backgroundColor: '#333', borderRadius: 3 }} />
          </TouchableOpacity>
          <Text style={st.time}>{fmtSec(duration)}</Text>
        </View>
        <View style={st.ctrls}>
          <HDTouch style={st.cBtn} onPress={() => setShuffle(!shuffle)}>
            <Icon name="shuffle" size={28} active={shuffle} color={shuffle ? C.brand : C.text2} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={skipPrev}>
            <Icon name="previous" size={38} color={C.text} />
          </HDTouch>
          <HDTouch style={st.cMain} onPress={toggle} focusStyle={st.cMainFocus}>
            <Icon name={playing ? 'pause' : 'play'} size={44} color={C.onBrand} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={skipNext}>
            <Icon name="next" size={38} color={C.text} />
          </HDTouch>
          <HDTouch style={st.cBtn} onPress={cycleRepeat}>
            <Icon name="repeat" size={28} active={repeat !== 'off'} color={repeat !== 'off' ? C.brand : C.text2} />
          </HDTouch>
          <View style={{ flex: 1 }} />
          <HDTouch style={st.cBtn} onPress={nav.goBack}>
            <Icon name="close" size={28} color={C.text2} />
          </HDTouch>
        </View>
        <Text style={st.queueHint}>{queue.length ? `${queue.length} 首队列中` : ''}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bgDeep },
  main: { flexDirection: 'row', flex: 1, paddingHorizontal: 60, gap: 50, paddingTop: 6 },
  left: { width: 360, alignItems: 'center', gap: 18, paddingTop: 8 },
  art: { width: 340, height: 340, borderRadius: 22 },
  title: { color: C.text, fontSize: 27, fontWeight: '800', textAlign: 'center', maxWidth: 350 },
  sub: { color: C.text2, fontSize: 16, textAlign: 'center', maxWidth: 350 },
  tool: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center' },
  lyricsBox: { flex: 1, gap: 14, paddingTop: 40, paddingRight: 20 },
  lyric: { color: C.text3, fontSize: 22, lineHeight: 32, fontWeight: '500' },
  lyricOn: { color: C.text, fontSize: 31, lineHeight: 43, fontWeight: '800' },
  lyricTr: { color: '#FFFFFF55', fontSize: 15, lineHeight: 21, marginTop: 2 },
  panel: { backgroundColor: '#141414', paddingHorizontal: 60, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.stroke },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  time: { color: C.text2, fontSize: 14, fontVariant: ['tabular-nums'], width: 52, textAlign: 'center' },
  track: { flex: 1, height: 6, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  ctrls: { flexDirection: 'row', alignItems: 'center', gap: 26 },
  cBtn: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  cMain: { width: 92, height: 92, borderRadius: 46, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 46 },
  queueHint: { color: C.text3, fontSize: 12, textAlign: 'center' },
});
