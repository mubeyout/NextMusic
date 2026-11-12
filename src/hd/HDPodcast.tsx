// HD 播客页 —— 对齐桌面版 PodcastScreen:8 主题频道渐变卡横滚 + 热门节目列表
// 数据复用 phone HomePodcast 逻辑:逐频道 lxapi.search 聚合长音频内容
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { FocusBridge } from './HDMain';
import { useHoverCard } from './hdweb'; // lx162 补:并行会话漏导入(v1.2.6 播客卡 web hover,缺失=HD 播客页运行时崩溃)
const IS_WEB = Platform.OS === 'web';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H, shadowStyleOf } from './hdtokens';
import { HDGrid } from './HDGrid';
import { HDTouch } from './HDTouch';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { songMenu } from './hdmenubuilders';
import { lxapi } from '../services/lxapi';
import { hdNav } from './hdnav';
import { cacheStale, cacheSet } from './hdcache';
import type { SongItem } from '../services/server';
import { GRID, FW, SP } from '../theme/tokens';

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
  const { playSong, current, appendQueue, playNextUp } = usePlayer();
  const { connected, token } = useApp(); // #018:歌曲行统一菜单 deps
  // lx91:陈旧缓存秒开(SWR)+ 8 频道并行拉取(原串行 for-await=8 次顺序网络往返,加载慢真凶)
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<Record<string, SongItem[]>>(() => cacheStale<Record<string, SongItem[]>>('pod.feeds') || {});

  useEffect(() => {
    let dead = false;
    if (Object.keys(feeds).length) setLoading(false); // 缓存命中即不转圈
    (async () => {
      const results = await Promise.all(POD_CHANNELS.map(async ch => {
        const songs = await lxapi.search(ch.query, ch.source, 1, 20).catch(() => [] as SongItem[]);
        return [ch.id, songs] as const;
      }));
      if (dead) return;
      const merged: Record<string, SongItem[]> = { ...feeds };
      results.forEach(([id, songs]) => { merged[id] = songs; });
      setFeeds(merged);
      cacheSet('pod.feeds', merged);
      setLoading(false);
    })();
    return () => { dead = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const [ch, setCh] = useState(0); // [产品包HD 批3] 设计稿 pillbar:选中频道驱动下方 4 卡网格
  const feed = feeds[POD_CHANNELS[ch].id] || [];

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: IS_WEB ? 42 : 26, paddingBottom: 28, gap: SP.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* page-head(设计: 播客29 + 副句14) */}
      <View style={st.head}>
        <Text style={st.title}>播客</Text>
        <Text style={st.sub}>用声音，打开另一种日常</Text>
      </View>

      {/* [产品包HD 批3 1:1] 频道 pillbar(设计: 52h/r28/17px,on=白底黑字650,off=surface2/text2) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: IS_WEB ? 10 : SP.md, paddingRight: 26 }}>
        {POD_CHANNELS.map((c, i) => (
          <HDTouch key={c.id} style={{ paddingHorizontal: 21, height: IS_WEB ? 52 : 44, borderRadius: 28, backgroundColor: i === ch ? '#F5F5F5' : C.surface2, alignItems: 'center', justifyContent: 'center' }}
            focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 28 }}
            onPress={() => setCh(i)}>
            <Text style={{ color: i === ch ? C.bg : C.text2, fontSize: IS_WEB ? 17 : H.font.lg, fontWeight: i === ch ? '600' : '500' }}>{c.name}</Text>
          </HDTouch>
        ))}
      </ScrollView>

      {/* 当前频道节目 4 列卡网格(设计 .grid: 4列 gap18 / 竖卡 386×446 封面出血+底部信息) */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
        <Text style={st.secTitle}>{POD_CHANNELS[ch].name}</Text>
        <Text style={st.secHint}>{feed.length ? `${feed.length} 期节目` : POD_CHANNELS[ch].sub}</Text>
      </View>
      {loading && !feed.length ? (
        <View style={st.loading}><ActivityIndicator color={C.brand} /><Text style={st.loadingText}>电台内容加载中…</Text></View>
      ) : feed.length ? (
        <HDGrid min={310} gap={IS_WEB ? 18 : 12}>
          {feed.slice(0, 8).map((s, i) => (
            <PodEpCard key={`${s.source}_${s.songmid}_${i}`} song={s} i={i}
              playing={current?.songmid === s.songmid && current?.source === s.source}
              onPress={() => playSong(s, feed)}
              onMenu={sg => songMenu(sg, feed, { playSong, appendQueue, playNextUp, connected, token })} />
          ))}
        </HDGrid>
      ) : (
        <Text style={st.loadingText}>频道内容暂时无法加载,稍后再试</Text>
      )}
                       <FocusBridge active />
      </ScrollView>
  );
}

/** [产品包HD 批3 1:1] 节目卡:竖卡封面出血 r12+底部名称+副文(设计 .grid .card 386×446 实测) */
function PodEpCard({ song, i, playing, onPress, onMenu }: { song: SongItem; i: number; playing?: boolean; onPress: () => void; onMenu?: (s: SongItem) => unknown }) {
  return (
    <HDTouch style={{ borderRadius: 12, backgroundColor: C.surface, overflow: 'hidden' }} zoom={1.03} onPress={onPress}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }}
      onLongPress={onMenu ? () => onMenu(song) : undefined}>
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: C.inset }}>
        {song.img ? <Image source={{ uri: song.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
          <LinearGradient colors={POD_GRADS[i % POD_GRADS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="podcast" size={38} color="#FFFFFFB3" />
          </LinearGradient>
        )}
      </View>
      <View style={{ padding: IS_WEB ? 13 : 10, gap: 4 }}>
        <Text style={{ color: playing ? C.brand : C.text, fontSize: IS_WEB ? 16 : H.font.lg, fontWeight: FW.semibold }} numberOfLines={1}>{song.name}</Text>
        <Text style={{ color: '#979797', fontSize: IS_WEB ? 13 : H.font.sm }} numberOfLines={1}>{song.singer}{song.interval ? ` · ${song.interval}` : ''}</Text>
      </View>
    </HDTouch>
  );
}


const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { gap: SP.xs },
  title: { color: C.text, fontSize: H.font.hero, fontWeight: FW.heavy },
  sub: { color: C.text3, fontSize: H.font.sm },
  card: { gap: SP.sm, borderRadius: 12, backgroundColor: C.surface, overflow: 'hidden' },
  cardCover: { width: '100%', aspectRatio: 1.35, padding: 12, flexDirection: 'row', alignItems: 'flex-start' },
  // v1.2.11 web 版封面:更竖的幅面+icon 居中+光晕圆底(与 HD 左上角小 icon 分流)
  cardCoverWeb: { width: '100%', aspectRatio: 1.2, alignItems: 'center', justifyContent: 'center' },
  coverHaloWeb: { width: 82, height: 82, borderRadius: 41, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' },
  cardPlayWeb: { position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,.24)', alignItems: 'center', justifyContent: 'center' },
  cardBody: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 0, gap: SP.xs },
  cardPlay: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' },
  cardName: { color: C.text, fontSize: H.font.sm, fontWeight: FW.bold },
  cardSub: { color: C.text3, fontSize: H.font.xs },
  secTitle: { color: C.text, fontSize: H.font.xl, fontWeight: FW.bold },
  secHint: { color: C.text3, fontSize: H.font.xs },
  loading: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, paddingVertical: 18 },
  loadingText: { color: C.text3, fontSize: H.font.sm },
});
