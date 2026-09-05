// HD 播客页 —— 对齐桌面版 PodcastScreen:8 主题频道渐变卡横滚 + 热门节目列表
// 数据复用 phone HomePodcast 逻辑:逐频道 lxapi.search 聚合长音频内容
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H, shadowOf } from './hdtokens';
import { HDGrid } from './HDGrid';
import { HDTouch } from './HDTouch';
import { HDSongRow } from './HDSongRow';
import { usePlayer } from '../state/PlayerProvider';
import { lxapi } from '../services/lxapi';
import { hdNav } from './hdnav';
import type { SongItem } from '../services/server';

interface PodChannel { id: string; name: string; query: string; sub: string; source: 'kw' | 'kg' | 'wy'; }

// 与 phone HomeScreen POD_CHANNELS 同源
const POD_CHANNELS: PodChannel[] = [
  { id: 'night', name: '晚安电台', query: '晚安电台 助眠', sub: '睡前陪伴 · 深夜频率', source: 'kw' },
  { id: 'talk', name: '脱口秀', query: '脱口秀 精选', sub: '笑到最后', source: 'kw' },
  { id: 'crosstalk', name: '相声评书', query: '郭德纲 相声', sub: '德云社 · 经典段子', source: 'kw' },
  { id: 'pingshu', name: '评书连播', query: '单田芳 评书', sub: '白眉大侠 · 隋唐演义', source: 'kw' },
  { id: 'audio', name: '有声书', query: '有声小说 精选', sub: '热门连载', source: 'kw' },
  { id: 'calm', name: '白噪音', query: '白噪音 自然音', sub: '雨声 · 海浪 · 森林', source: 'kw' },
  { id: 'emotion', name: '情感夜话', query: '情感电台 夜话', sub: '午夜情感树洞', source: 'kw' },
  { id: 'kids', name: '儿童故事', query: '儿童故事 睡前', sub: '童话 · 寓言', source: 'kw' },
];

const POD_GRADS: [string, string][] = [
  ['#5B6EE1', '#8A6BD6'], ['#E1656B', '#D6558A'], ['#2C8AE0', '#3FB8AF'],
  ['#7C4DFF', '#3F8CFF'], ['#0FA3A3', '#1ED760'], ['#4A5568', '#718096'],
  ['#D46A31', '#E89B3C'], ['#508BD9', '#6BC5D2'],
];

export function HDPodcast() {
  const insets = useSafeAreaInsets();
  const { playSong, current } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<Record<string, SongItem[]>>({});

  useEffect(() => {
    let dead = false;
    (async () => {
      for (const ch of POD_CHANNELS) {
        try {
          const songs = await lxapi.search(ch.query, ch.source, 1, 20); // eslint-disable-line no-await-in-loop
          if (dead) return;
          setFeeds(p => ({ ...p, [ch.id]: songs }));
        } catch { /* 单频道失败不阻塞 */ }
      }
      if (!dead) setLoading(false);
    })();
    return () => { dead = true; };
  }, []);

  const openChannel = (ch: PodChannel) => {
    const songs = feeds[ch.id] || [];
    if (!songs.length) return;
    hdNav()?.navigate('PlaylistDetail', { title: ch.name, songs, meta: `${songs.length} 期 · ${ch.sub}` });
  };
  const playChannel = (ch: PodChannel) => {
    const songs = feeds[ch.id] || [];
    if (songs.length) playSong(songs[0], songs);
  };

  // 热门节目 = 各频道头条交错混合
  const hotMix: SongItem[] = [];
  for (let i = 0; i < 6; i++) {
    for (const ch of POD_CHANNELS) {
      const f = feeds[ch.id];
      if (f && f[i]) hotMix.push(f[i]);
    }
  }

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 22, paddingBottom: 26, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={st.head}>
        <Text style={st.title}>播客</Text>
        <Text style={st.sub}>8 大主题频道 · 搜索聚合 · 自动连播</Text>
      </View>

      {/* 频道卡(桌面同构:自适应网格+彩色投影) */}
      <HDGrid min={132 * (H.font.sm / 10)}>
        {POD_CHANNELS.map((ch, ci) => {
          const f = feeds[ch.id] || [];
          return (
            <HDTouch key={ch.id} style={[st.card, { boxShadow: shadowOf(ch.name) }]} onPress={() => openChannel(ch)} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}>
              <LinearGradient colors={POD_GRADS[ci % POD_GRADS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cardCover}>
                <Icon name="podcast" size={30} color="#FFFFFF" />
                <View style={{ flex: 1 }} />
                <HDTouch style={st.cardPlay} onPress={() => playChannel(ch)} focusStyle={{ borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 15 }} activeOpacity={0.8}>
                  <Icon name="play" size={13} color="#FFFFFF" />
                </HDTouch>
              </LinearGradient>
              <View style={st.cardBody}>
                <Text style={st.cardName} numberOfLines={1}>{ch.name}</Text>
                <Text style={st.cardSub} numberOfLines={1}>{f.length ? `${f.length} 期 · ${f[0].name}` : ch.sub}</Text>
              </View>
            </HDTouch>
          );
        })}
      </HDGrid>

      {/* 热门节目 */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={st.secTitle}>热门节目</Text>
        <Text style={st.secHint}>混合各频道</Text>
      </View>
      {loading && !hotMix.length ? (
        <View style={st.loading}><ActivityIndicator color={C.brand} /><Text style={st.loadingText}>电台内容加载中…</Text></View>
      ) : hotMix.length ? (
        <View style={{ gap: 4 }}>
          {hotMix.slice(0, 14).map((s, i) => (
            <HDSongRow key={`${s.source}_${s.songmid}_${i}`} song={s} index={i + 1} first={i === 0}
              playing={current?.songmid === s.songmid && current?.source === s.source}
              onPress={() => playSong(s, hotMix)} />
          ))}
        </View>
      ) : (
        <Text style={st.loadingText}>频道内容暂时无法加载,稍后再试</Text>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { gap: 3 },
  title: { color: C.text, fontSize: H.font.hero, fontWeight: '800' },
  sub: { color: C.text3, fontSize: H.font.sm },
  card: { gap: 5 },
  cardCoverWrap: { borderRadius: 12 },
  cardBody: { paddingHorizontal: 8, paddingBottom: 6, alignSelf: 'center', width: '94%' },
  cardCover: { width: '100%', aspectRatio: 1.35, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start' },
  cardPlay: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' },
  cardName: { color: C.text, fontSize: H.font.sm, fontWeight: '700' },
  cardSub: { color: C.text3, fontSize: H.font.xs },
  secTitle: { color: C.text, fontSize: H.font.xl, fontWeight: '700' },
  secHint: { color: C.text3, fontSize: H.font.xs },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  loadingText: { color: C.text3, fontSize: H.font.sm },
});
