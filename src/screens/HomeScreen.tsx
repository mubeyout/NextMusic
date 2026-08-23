import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lxapi } from '../services/lxapi';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PillTabs } from '../components/PillTabs';
import { useApp } from '../state/AppState';
import { usePlayer } from '../state/PlayerProvider';
import { getRecents } from '../state/recent';
import { api, type SongItem, type SongListMeta } from '../services/server';
import { sync, lxToApp } from '../services/sync';

import sky from '../assets/art/sky.jpg';
import vinyl from '../assets/art/vinyl.jpg';
import warm from '../assets/art/warm.jpg';
import night from '../assets/art/night.jpg';
import portrait from '../assets/art/portrait.jpg';
import city from '../assets/art/city.jpg';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function HomeScreen({ visible = true }: { visible?: boolean }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);
  const { username } = useApp();
  const hello = username ? `${greeting()}，${username}` : greeting();
  useEffect(() => { if (visible) setTabKey(k => k + 1); }, [visible]); // remount content on tab re-entry
  const [tabKey, setTabKey] = useState(0);

  return (
    <LinearGradient colors={[C.bgGradientTop, C.bg, C.bg]} locations={[0, 0.55, 1]} style={st.screen}>
      <ScrollView
        contentContainerStyle={[st.content, { paddingTop: insets.top + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={st.headerRow}>
          <Text style={st.hello}>{hello}</Text>
        </View>

        <PillTabs tabs={['全部', '音乐', '播客']} active={tab} onChange={setTab} />

        {tab === 0 && <HomeAll key={`a${tabKey}`} />}
        {tab === 1 && <HomeMusic key={`m${tabKey}`} />}
        {tab === 2 && <Text style={st.empty}>播客内容 · 即将上线</Text>}
      </ScrollView>
    </LinearGradient>
  );
}

/* ---------- 共享：真实歌单卡（Mix 卡 + 3 列网格卡） ---------- */

function MixCard({ pl, fallbackArt }: { pl: SongListMeta; fallbackArt: any }) {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  return (
    <TouchableOpacity
      style={st.mixCard} activeOpacity={0.85}
      onPress={() => nav.navigate('PlaylistDetail', {
        remoteId: pl.id, title: pl.name, cover: pl.img,
        meta: `${pl.total ?? ''} 首 · ${pl.author || '歌单'}`,
      })}
    >
      {pl.img ? <Image source={{ uri: pl.img }} style={st.mixArt} /> : <Image source={fallbackArt} style={st.mixArt} />}
      <LinearGradient colors={['#00000000', '#000000CC']} style={st.mixOverlay} />
      <View style={st.mixPlayBtn}><Icon name="play" size={24} active color={C.onBrand} /></View>
      <View style={st.mixTexts}>
        <Text style={st.mixTitle} numberOfLines={1}>{pl.name}</Text>
        <Text style={st.mixCaption} numberOfLines={1}>
          {pl.total ? `共 ${pl.total} 首` : '根据你的收听口味生成'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// 3 列自适应歌单网格卡：宽度自适应填满屏幕
function PlCard({ pl }: { pl: SongListMeta }) {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  return (
    <TouchableOpacity
      style={st.plCell} activeOpacity={0.85}
      onPress={() => nav.navigate('PlaylistDetail', {
        remoteId: pl.id, title: pl.name, cover: pl.img,
        meta: `${pl.total ?? ''} 首 · ${pl.author || '歌单'}`,
      })}
    >
      {pl.img
        ? <Image source={{ uri: pl.img }} style={st.plArt} />
        : <View style={[st.plArt, st.plFallback]}><Text style={st.plGlyph}>♫</Text></View>}
      <Text style={st.plName} numberOfLines={2}>{pl.name}</Text>
      <Text style={st.plMeta} numberOfLines={1}>{pl.total ? `${pl.total} 首` : (pl.author || '')}</Text>
    </TouchableOpacity>
  );
}

/* ---------- 全部 tab ---------- */

function HomeAll() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  const { connected, token } = useApp();
  const { playSong } = usePlayer();
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [loveSongs, setLoveSongs] = useState<SongItem[] | null>(null);
  const [hotBoard, setHotBoard] = useState<SongItem[]>([]);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);

  const reload = useCallback(() => { setRecents(getRecents()); }, []);
  useEffect(() => { reload(); }, [reload]);

  // 真实数据：热歌榜（每日推荐/私人雷达）+ 热门歌单（Mix 卡）——与登录无关
  useEffect(() => {
    lxapi.songListList('', '5', 1, 12).then(r => setMixes((r.list || []).slice(0, 6))).catch(() => {});
    if (token) sync.fetchLists().then(s => { if (s) setLoveSongs(s.loveList.map(lxToApp)); });
    lxapi.leaderboardBoards().then(boards => {
      const hot = boards.find(b => /热歌|TOP/i.test(b.name)) || boards[0];
      if (hot) lxapi.leaderboardList(hot.bangid).then(list => setHotBoard(list.slice(0, 50)));
    });
  }, [token]);

  const playHot = () => { if (hotBoard.length) playSong(hotBoard[0], hotBoard); };
  const [fetching, setFetching] = useState(false);
  const openSearch = async (q: string) => {
    if (fetching) return;
    setFetching(true);
    try {
      const songs = await lxapi.search(q, 'kw');
      nav.navigate('PlaylistDetail', { title: q, songs: songs.slice(0, 50), meta: `${songs.length} 首 · 搜索` });
    } finally { setFetching(false); }
  };
  const openRecent = () => nav.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` });
  const openLove = () => {
    if (loveSongs) nav.navigate('PlaylistDetail', { title: '我喜欢的', songs: loveSongs, meta: `${loveSongs.length} 首` });
    else nav.navigate('PlaylistDetail', { title: '我喜欢的', songs: [], meta: '登录后同步' });
  };

  return (
    <View style={st.body}>
      {/* 快捷入口：大卡 2×3（老板要求大气） */}
      <View style={st.quickGrid}>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={playHot} disabled={fetching}>
          <Image source={sky} style={st.quickArt} />
          <Text style={st.quickLabel}>每日推荐</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={openLove}>
          <Image source={vinyl} style={st.quickArt} />
          <Text style={st.quickLabel}>我的收藏</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={playHot} disabled={fetching}>
          <Image source={warm} style={st.quickArt} />
          <Text style={st.quickLabel}>私人雷达</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={() => openSearch('夜深人静')} disabled={fetching}>
          <Image source={night} style={st.quickArt} />
          <Text style={st.quickLabel}>夜深人静</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={() => openSearch('华语经典')} disabled={fetching}>
          <Image source={portrait} style={st.quickArt} />
          <Text style={st.quickLabel}>华语经典</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.quickCard} activeOpacity={0.8} onPress={openRecent}>
          <Image source={night} style={st.quickArt} />
          <Text style={st.quickLabel}>最近播放</Text>
        </TouchableOpacity>
      </View>

      <View style={st.sectionRow}>
        <Text style={st.sectionTitle}>为你打造</Text>
        <Text style={st.sectionMeta}>每日更新</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.mixRow}>
        {mixes.length
          ? mixes.slice(0, 4).map((pl, i) => (
            <MixCard key={pl.id} pl={pl} fallbackArt={[warm, city, night, sky][i % 4]} />
          ))
          : [0, 1].map(i => (
            <View key={i} style={[st.mixCard, st.mixPlaceholder]}>
              <Text style={st.mixPhText}>加载中…</Text>
            </View>
          ))}
      </ScrollView>

      <View style={st.sectionRow}>
        <Text style={st.sectionTitle}>最近播放</Text>
        <TouchableOpacity onPress={openRecent} hitSlop={4}><Text style={st.sectionMeta}>查看全部</Text></TouchableOpacity>
      </View>
      {recents.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.recentRow}>
          {recents.slice(0, 12).map((s, i) => (
            <TouchableOpacity key={`${s.source}-${s.songmid}-${i}`} style={st.recentCard} activeOpacity={0.85} onPress={() => playSong(s, recents)}>
              {s.img ? <Image source={{ uri: s.img }} style={st.recentArt} /> : <View style={[st.recentArt, st.recentFallback]}><Text style={st.recentGlyph}>♫</Text></View>}
              <Text style={st.recentTitle} numberOfLines={1}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={st.recentEmpty}>还没有播放记录，去探索页找点歌听</Text>
      )}
    </View>
  );
}

/* ---------- 音乐 tab：与「全部」同样设计，音乐向真实数据 ---------- */

function HomeMusic() {
  const { } = useApp();
  const { playSong } = usePlayer();
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void };
  const [boards, setBoards] = useState<{ id: string; name: string; bangid: string }[]>([]);
  const [lists, setLists] = useState<Record<string, SongItem[]>>({});
  const [playlists, setPlaylists] = useState<SongListMeta[]>([]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const bs = await lxapi.leaderboardBoards('kw');
        if (dead) return;
        setBoards(bs.slice(0, 6));
        for (const b of bs.slice(0, 6)) {
          try {
            const l = await lxapi.leaderboardList(b.bangid, 'kw');
            if (!dead) setLists(p => ({ ...p, [b.id]: l.slice(0, 50) }));
          } catch {}
        }
      } catch {}
      try {
        const r = await lxapi.songListList('', '5', 1, 12);
        if (!dead) setPlaylists(r.list || []);
      } catch {}
    })();
    return () => { dead = true; };
  }, []);

  const openBoard = async (b: { id: string; name: string; bangid: string }) => {
    let l = lists[b.id];
    if (!l) l = await lxapi.leaderboardList(b.bangid, 'kw');
    if (l.length) nav.navigate('PlaylistDetail', { title: b.name, songs: l, meta: `${l.length} 首 · 榜单` });
  };
  const arts = [sky, vinyl, warm, night, portrait, city];
  const playBoard = (b: { id: string; name: string; bangid: string }) => {
    const l = lists[b.id];
    if (l && l.length) playSong(l[0], l);
    else openBoard(b);
  };

  return (
    <View style={st.body}>
      {/* 榜单快捷大卡：真实榜单 */}
      <View style={st.quickGrid}>
        {boards.length ? boards.map((b, i) => (
          <TouchableOpacity key={b.id} style={st.quickCard} activeOpacity={0.8} onPress={() => playBoard(b)}>
            <Image source={arts[i % 5]} style={st.quickArt} />
            <Text style={st.quickLabel}>{b.name}</Text>
          </TouchableOpacity>
        )) : (
          <Text style={st.recentEmpty}>榜单加载中…</Text>
        )}
      </View>

      <View style={st.sectionRow}>
        <Text style={st.sectionTitle}>为你打造</Text>
        <Text style={st.sectionMeta}>每日更新</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.mixRow}>
        {playlists.slice(0, 2).map((pl, i) => <MixCard key={pl.id} pl={pl} fallbackArt={[warm, city][i % 2]} />)}
      </ScrollView>

      <View style={st.sectionRow}>
        <Text style={st.sectionTitle}>热门歌单</Text>
      </View>
      <View style={st.plGrid}>
        {playlists.slice(0, 9).map(pl => <PlCard key={pl.id} pl={pl} />)}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' },
  body: { gap: 12, paddingTop: 12 },
  empty: { color: C.text2, fontSize: 13, lineHeight: 18, paddingTop: 40, textAlign: 'center' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: {
    width: (Dimensions.get('window').width - 40 - 12) / 2, height: 88, borderRadius: 14,
    backgroundColor: '#1C1C1C', flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden',
    paddingHorizontal: 12,
  },
  quickArt: { width: 64, height: 64, borderRadius: 12 },
  quickLabel: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600', flex: 1, paddingRight: 4 },
  sectionRow: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700' },
  sectionMeta: { color: C.text2, fontSize: 11, lineHeight: 16 },
  mixRow: { gap: 10 },
  mixCard: { width: 170, height: 172, borderRadius: 10, overflow: 'hidden' },
  mixArt: { position: 'absolute', width: 170, height: 172 },
  mixOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 88 },
  mixPlayBtn: {
    position: 'absolute', right: 12, top: 12, width: 46, height: 48, borderRadius: 999,
    backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
  },
  mixTexts: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 4 },
  mixTitle: { color: C.text, fontSize: 18, lineHeight: 20, fontWeight: '700' },
  mixCaption: { color: C.text, fontSize: 10, lineHeight: 13, opacity: 0.72 },
  mixPlaceholder: { backgroundColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center' },
  mixPhText: { color: C.text2, fontSize: 11 },
  plGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plCell: { width: '31%', gap: 4 },
  plArt: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#232323' },
  plFallback: { alignItems: 'center', justifyContent: 'center' },
  plGlyph: { color: C.text2, fontSize: 24, fontWeight: '700' },
  plName: { color: C.text, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  plMeta: { color: C.text2, fontSize: 9, lineHeight: 12 },
  recentRow: { gap: 10 },
  recentCard: { width: 80, gap: 3 },
  recentArt: { width: 80, height: 104, borderRadius: 7, backgroundColor: '#232323' },
  recentFallback: { alignItems: 'center', justifyContent: 'center' },
  recentGlyph: { color: C.text2, fontSize: 26, fontWeight: '700' },
  recentTitle: { color: C.text, fontSize: 10, lineHeight: 13, fontWeight: '500' },
  recentEmpty: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingVertical: 18 },
});
