// HD 播放页 v3 —— 完全重构:无底部工具 bar,所有元素融入左右两列,沉浸式
// v1 教训:固定尺寸溢出;v2 教训:深色底 panel 突兀(老板:粗糙,直接取消)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
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
  const trackW = React.useRef(0);

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

  return (
    <View style={st.screen}>
      <HDTouch style={[st.backBtn, { top: Math.max(insets.top, 10) }]} onPress={nav.goBack} focusStyle={st.focus} hasTVPreferredFocus>
        <Icon name="back" size={20} color={C.text2} />
      </HDTouch>

      <View style={[st.main, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={st.artCol}>
          {current.img
            ? <Image source={{ uri: current.img }} style={st.art} resizeMode="cover" />
            : <View style={[st.art, st.artFallback]}><Icon name="music" size={64} color={C.text3} /></View>}
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
  screen: { flex: 1, backgroundColor: C.bgDeep },
  backBtn: { position: 'absolute', top: 10, left: 18, zIndex: 5, width: 40, height: 40, borderRadius: 12, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 26 },
  main: { flex: 1, flexDirection: 'row', paddingHorizontal: 64, gap: 44 },
  artCol: { flex: 0.85, alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', aspectRatio: 1, borderRadius: 20, maxHeight: 330, maxWidth: 330 },
  artFallback: { backgroundColor: '#1E2722', alignItems: 'center', justifyContent: 'center' },
  infoCol: { flex: 1.15, gap: 7 },
  title: { color: C.text, fontSize: 24, fontWeight: '800' },
  sub: { color: C.text2, fontSize: 14 },
  lyricsBox: { flex: 1, gap: 12, justifyContent: 'center' },
  lyric: { color: C.text3, fontSize: 19, lineHeight: 28, fontWeight: '500' },
  lyricOn: { color: C.text, fontSize: 26, lineHeight: 37, fontWeight: '800' },
  lyricTr: { color: '#FFFFFF55', fontSize: 13, lineHeight: 18, marginTop: 2 },
  lyricTrOn: { color: '#FFFFFF99' },
  noLyric: { alignItems: 'center', gap: 10, marginTop: 16 },
  noLyricText: { color: C.text3, fontSize: 13 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  time: { color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'], width: 46, textAlign: 'center' },
  track: { flex: 1, height: 5, flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  trackFill: { backgroundColor: C.brand, borderRadius: 3 },
  trackRest: { backgroundColor: '#3A3A3A', borderRadius: 3 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  cMode: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  cMain: { width: 78, height: 78, borderRadius: 39, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  cMainFocus: { borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 39 },
  ctrlDivider: { width: 1, height: 30, backgroundColor: C.stroke, marginHorizontal: 4 },
  badge: { color: C.text2, fontSize: 10, marginLeft: 3 },
});
