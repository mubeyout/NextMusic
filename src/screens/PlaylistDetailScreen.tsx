import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { dialog, toast } from '../components/Dialog';
import { PageHeader } from '../components/PageChrome';
import { library } from '../state/library';
import { usePlayer } from '../state/PlayerProvider';
import { api, type SongItem, type SongListMeta } from '../services/server';
import type { LocalPlaylist } from '../state/library';
type ListMeta = SongListMeta & Partial<Pick<LocalPlaylist, 'providerType' | 'providerName' | 'providerId'>>;
import { useApp } from '../state/AppState';
import { enqueueDownload, downloads as dlStore, downloadProgress, subscribeDownloads } from '../services/downloads';
import { MiniPlayer } from '../components/MiniPlayer';
import { lxapi } from '../services/lxapi';
import { providers, providerApi, isProviderSongSource } from '../services/providers';

type Params = {
  // remote playlist
  remoteId?: string;
  remoteSource?: string;
  title?: string;
  cover?: string;
  meta?: string;
  desc?: string;
  playCount?: string;
  // direct song list (local / synced / leaderboard) — skip remote fetch
  songs?: SongItem[];
  // local playlist id
  localId?: string;
};

// Figma 26·歌单详情: header (cover + title + stats + desc + play all), action row, song list
export function PlaylistDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void; replace: (s: string, p?: object) => void };
  const route = useRoute();
  const p = route.params as Params;
  const { playSong, current } = usePlayer();
  const { connected } = useApp();

  const [songs, setSongs] = useState<SongItem[] | null>(null);
  const [info, setInfo] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actSong, setActSong] = useState<SongItem | null>(null);
  const [plMenu, setPlMenu] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [kw, setKw] = useState('');
  const [searching, setSearching] = useState(false);
  const localPl = p.localId ? library.get(p.localId) : null;
  const [collect, setCollect] = useState(false);
  const [, force] = useState(0);

  const shown = React.useMemo(() => {
    if (!songs) return [];
    if (!kw.trim()) return songs;
    const k = kw.trim().toLowerCase();
    return songs.filter(x => x.name.toLowerCase().includes(k) || x.singer.toLowerCase().includes(k) || (x.albumName || '').toLowerCase().includes(k));
  }, [songs, kw]);
  useEffect(() => subscribeDownloads(() => force(n => n + 1)), []);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (p.songs && p.songs.length) {
        setSongs(p.songs);
        setTotal(p.songs.length);
        return;
      }
      if (p.remoteId) {
        const r = await lxapi.songListDetail(p.remoteId, 1, p.remoteSource || 'wy');
        if (dead) return;
        setSongs(r.list || []);
        setInfo(r.info || null);
        setTotal(r.info?.total || r.list?.length || 0);
      } else {
        setSongs([]);
      }
    })();
    return () => { dead = true; };
  }, [p.remoteId, p.songs]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!p.remoteId || busy || !songs || songs.length >= total) return;
    setBusy(true);
    const r = await lxapi.songListDetail(p.remoteId, page + 1, p.remoteSource || 'wy');
    const more = r.list || [];
    if (more.length) { setSongs(prev => [...(prev || []), ...more]); setPage(pg => pg + 1); }
    setBusy(false);
  };

  const title = p.title || info?.name || '歌单';
  const cover = p.cover || info?.img;
  const stat = total ? `${total} 首${p.remoteId ? ' · 在线歌单' : ''}` : (p.meta || '歌单');

  return (
    <View style={st.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: current ? 116 : 32 }}
        onScroll={({ nativeEvent }) => {
          if (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height > nativeEvent.contentSize.height - 300) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <PageHeader
          title=""
          onBack={() => nav.goBack()}
          right={(
            <TouchableOpacity hitSlop={6} onPress={() => { if (localPl) setPlMenu(true); else setSearching(true); }}>
              <Icon name="more" size={22} />
            </TouchableOpacity>
          )}
        />

        <View style={st.headCard}>
          {cover ? (
            <Image source={{ uri: cover }} style={st.cover} />
          ) : (
            <View style={[st.cover, st.coverFallback]}><Text style={st.coverGlyph}>♫</Text></View>
          )}
          <View style={st.headMeta}>
            <Text style={st.title} numberOfLines={2}>{title}</Text>
            <Text style={st.stat}>{stat}</Text>
            {info?.play_count ? <Text style={st.stat}>播放 {info.play_count} 次</Text> : null}
          </View>
        </View>
        {(localPl?.desc ?? info?.desc) ? <Text style={st.desc} numberOfLines={2}>{localPl?.desc ?? info?.desc}</Text> : null}
        {/* 媒体库导入的歌单：连接状态行（断开时给用户明确原因，而不是播放时才报错） */}
        {localPl?.providerType ? (
          <Text style={st.desc}>
            {(() => {
              const accts = providers.all();
              const alive = accts.some(p => p.id === localPl.providerId)
                || accts.filter(p => p.type === localPl.providerType).length === 1;
              const nm = localPl.providerName || localPl.providerType;
              return alive
                ? `✓ 媒体库「${nm}」已连接`
                : `媒体库「${nm}」已断开 · 重新连接同一服务器后可恢复播放`;
            })()}
          </Text>
        ) : null}

        <TouchableOpacity
          style={st.playAllBtn}
          onPress={() => { if (shown.length) playSong(shown[0], shown); }}
          disabled={!songs?.length}
        >
          <Icon name="play" size={20} active color={C.onBrand} />
          <Text style={st.playAllText}>播放全部</Text>
          <Text style={st.playAllCount}>{total ? `(${total})` : ''}</Text>
        </TouchableOpacity>

        {searching ? (
          <View style={st.searchBar}>
            <Icon name="search" size={16} color={C.text3} />
            <TextInput
              style={st.searchInput}
              value={kw}
              placeholder="搜索歌单内歌曲/歌手"
              placeholderTextColor={C.text3}
              autoFocus
              onChangeText={setKw}
            />
            {kw ? (
              <TouchableOpacity hitSlop={6} onPress={() => { setKw(''); setSearching(false); }}>
                <Icon name="close" size={16} color={C.text3} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={st.actionRow}>
          <TouchableOpacity style={st.action} onPress={() => { if (songs?.length) { const n = enqueueDownload(songs); toast(n ? `${n} 首加入下载队列` : '歌内歌曲均已下载'); } }}>
            <Icon name="download" size={20} color={C.text2} /><Text style={st.actionText}>下载全部</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.action} onPress={() => setCollect(true)} disabled={!songs?.length}>
            <Icon name="heart" size={20} color={C.text2} /><Text style={st.actionText}>收藏全部</Text>
          </TouchableOpacity>
          {p.remoteId && !localPl ? (
            <TouchableOpacity style={st.action} onPress={importPl} disabled={!songs?.length}>
              <Icon name="download" size={20} color={C.brandText} /><Text style={[st.actionText, { color: C.brandText }]}>导入到本地</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={st.action} onPress={() => { if (songs?.length) playSong(songs[Math.floor(Math.random() * songs.length)], songs); }}>
              <Icon name="shuffle" size={20} color={C.text2} /><Text style={st.actionText}>随机播</Text>
            </TouchableOpacity>
          )}
        </View>

        {songs == null ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : !shown.length ? (
          <Text style={st.empty}>{kw ? `没有匹配「${kw}」的歌曲` : '歌单为空'}</Text>
        ) : (
          <View style={st.songList}>
            {shown.map((s, i) => (
              <SongRow
                key={`${s.source}-${s.songmid}-${i}`}
                song={s}
                playing={current?.songmid === s.songmid}
                onPress={() => playSong(s, shown)}
                extra={renderSongAction(s)}
              />
            ))}
          </View>
        )}
        {busy ? <View style={st.center}><ActivityIndicator color={C.brand} /></View> : null}
      </ScrollView>
      {/* Figma 歌单页有底部播放栏：MiniPlayer 绝对定位悬浮（无播放时自隐藏） */}
      <View style={st.miniDock} pointerEvents="box-none">
        <MiniPlayer />
      </View>
      {/* 歌单管理菜单：ActionSheet（自定义 sheet，交互与单曲菜单一致） */}
      <ActionSheet
        visible={plMenu} onClose={() => setPlMenu(false)}
        title={localPl?.name || '歌单'}
        items={[
          { label: '歌单内搜索', onPress: () => setSearching(true) },
          ...(localPl?.remoteId ? [{ label: syncing ? '同步中…' : '重新同步歌单', onPress: () => resyncPl() }] : []),
          ...(localPl?.songs.some(s => isProviderSongSource(s.source)) ? [{ label: '移除失效歌曲', onPress: () => cleanBroken() }] : []),
          { label: '重命名歌单', onPress: () => renamePl() },
          { label: '删除歌单', danger: true, onPress: () => deletePl() },
        ]}
      />
      <ActionSheet
        visible={!!actSong} onClose={() => setActSong(null)}
        title={actSong ? `${actSong.name} · ${actSong.singer}` : ''}
        items={actSong ? [
          dlStore.isDownloaded(actSong)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载', onPress: () => { enqueueDownload([actSong]); } },
          { label: '收藏到歌单', onPress: () => setCollect(true) },
          ...(localPl ? [{ label: '从本歌单移除', danger: true as const, onPress: () => {
            library.removeSong(localPl.id, actSong);
            setSongs(prev => (prev || []).filter(s => !(s.source === actSong.source && s.songmid === actSong.songmid)));
            setTotal(t => Math.max(0, t - 1));
            toast(`已移除「${actSong.name}」`);
          } }] : []),
        ] : []}
      />
      <CollectSheet song={actSong} visible={collect} onClose={() => { setCollect(false); setActSong(null); }} />
    </View>
  );

  // 移除失效歌曲：媒体库连接已断且无本地下载副本的歌（与播放兑底同口径），一键从歌单清理
  function cleanBroken() {
    if (!localPl) return;
    const broken = localPl.songs.filter(s => isProviderSongSource(s.source) && !dlStore.pathFor(s) && !providerApi.streamFor(s));
    if (!broken.length) { toast('没有失效歌曲'); return; }
    dialog.confirm(
      '移除失效歌曲',
      `检测到 ${broken.length} 首歌曲的媒体库连接已断开且无本地文件，是否从歌单移除？`,
      () => {
        const dead = new Set(broken.map(s => `${s.source}:${s.songmid}`));
        library.replaceSongs(localPl.id, localPl.songs.filter(s => !dead.has(`${s.source}:${s.songmid}`)));
        setSongs(prev => (prev || []).filter(s => !dead.has(`${s.source}:${s.songmid}`)));
        setTotal(t => Math.max(0, t - broken.length));
        toast(`已移除 ${broken.length} 首失效歌曲`);
      },
      '移除',
    );
  }

  function renamePl() {
    if (!localPl) return;
    dialog.prompt('重命名歌单', {
      defaultValue: localPl.name,
      onSubmit: (v) => {
        if (!v) return;
        library.update(localPl.id, { name: v });
        toast('已重命名');
        nav.goBack();
        nav.navigate('PlaylistDetail', { localId: localPl.id, title: v, songs: library.get(localPl.id)?.songs });
      },
    });
  }

  function deletePl() {
    if (!localPl) return;
    dialog.confirm('删除歌单', `确定删除「${localPl.name}」？${localPl.songs.length} 首歌曲将从此歌单移除`, () => {
      library.remove(localPl.id);
      toast('歌单已删除');
      nav.goBack();
    }, '删除', '取消');
  }

  // 重新同步：从源平台全量拉取覆盖本地歌曲（导入时的 remoteId/source）
  async function resyncPl() {
    if (!localPl?.remoteId || syncing) return;
    setSyncing(true);
    try {
      const fetcher = connected ? api : lxapi;
      const src = localPl.source || 'wy';
      const first = await fetcher.songListDetail(localPl.remoteId, 1, src);
      const all = first.list || [];
      const total = first.info?.total || all.length;
      let pg = 1;
      while (all.length < total && pg < 10) {
        pg++;
        const r = await fetcher.songListDetail(localPl.remoteId, pg, src); // eslint-disable-line no-await-in-loop
        const more = r.list || [];
        if (!more.length) break;
        all.push(...more);
      }
      if (!all.length) { toast('源歌单已空或无法读取'); setSyncing(false); return; }
      library.replaceSongs(localPl.id, all);
      setSongs(all); setTotal(all.length); setPage(1);
      toast(`已同步 · ${all.length} 首`);
    } catch {
      toast('同步失败，请检查网络与音源');
    } finally { setSyncing(false); }
  }

  // 导入到本地：在线浏览的歌单一键存为本地歌单（带 remoteId，后续可重新同步）
  function importPl() {
    if (!songs?.length || !p.remoteId) { toast('歌单尚未加载完成'); return; }
    const created = library.create(title, songs, {
      source: p.remoteSource || 'wy', remoteId: p.remoteId, cover,
      desc: '从探索导入',
    });
    toast(`已导入「${title}」· ${songs.length} 首`);
    // 切换到本地歌单模式：more 菜单的重命名/删除/同步立即可用
    nav.replace('PlaylistDetail', { localId: created.id, title, songs, cover });
  }

  function renderSongAction(s: SongItem) {
    const prog = downloadProgress(s);
    const done = dlStore.isDownloaded(s);
    if (prog != null) {
      return <Text style={st.progText}>{Math.round(prog * 100)}%</Text>;
    }
    if (done) return <Icon name="check" size={18} active />;
    if (s.source === 'device') return null;
    return (
      <TouchableOpacity hitSlop={8} onPress={() => setActSong(s)}>
        <Icon name="more" size={20} color={C.text2} />
      </TouchableOpacity>
    );
  }
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center' },
  hBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headCard: { flexDirection: 'row', gap: 14, marginTop: 4 },
  cover: { width: 120, height: 120, borderRadius: 10 },
  coverFallback: { backgroundColor: C.artTint, alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { color: C.text, fontSize: 40, fontWeight: '700' },
  headMeta: { flex: 1, paddingTop: 4, gap: 6 },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  stat: { color: C.text2, fontSize: 11, lineHeight: 16 },
  desc: { color: C.text2, fontSize: 11, lineHeight: 16, marginTop: 12 },
  playAllBtn: {
    height: 46, borderRadius: 14, backgroundColor: C.brand, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18,
  },
  playAllText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '600' },
  playAllCount: { color: C.onBrand, fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, borderRadius: 10, backgroundColor: C.elev, paddingHorizontal: 12, marginTop: 12 },
  searchInput: { flex: 1, color: C.text, fontSize: 13, paddingVertical: 0 },
  action: {
    flex: 1, height: 40, borderRadius: 12, backgroundColor: C.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  actionText: { color: C.text2, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  progText: { color: C.brandSoft, fontSize: 11, lineHeight: 14, width: 36, textAlign: 'right' },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  songList: { gap: 8, marginTop: 4 },
});
