// 媒体库详情页（amcfy 式即点即播）：专辑 / 服务器歌单 → 曲目列表；艺术家 → 专辑网格
// 替代原「点专辑弹 5 钮对话框」——看得到曲目、能单曲点播，导入/下载降级为次级动作
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { toast } from '../components/Dialog';
import { PageHeader } from '../components/PageChrome';
import { library } from '../state/library';
import { usePlayer } from '../state/PlayerProvider';
import { enqueueDownload, downloads as dlStore, downloadProgress, subscribeDownloads } from '../services/downloads';
import { providers, providerApi, type PvAlbum } from '../services/providers';
import type { SongItem } from '../services/server';

type Params = {
  acctId: string;
  kind: 'album' | 'playlist' | 'artist';
  id: string;
  name: string;
  cover?: string;
  sub?: string; // 列表页带来的副标题（艺人/歌曲数等）
};

export function ProviderDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const p = useRoute().params as Params;
  const { playSong, current } = usePlayer();
  const acct = providers.get(p.acctId);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [albums, setAlbums] = useState<PvAlbum[]>([]); // artist 模式
  const [actSong, setActSong] = useState<SongItem | null>(null);
  const [collect, setCollect] = useState(false);
  const [, force] = useState(0);
  useEffect(() => subscribeDownloads(() => force(n => n + 1)), []);

  const load = async () => {
    if (!acct) { setErr('账号不存在'); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      if (p.kind === 'artist') setAlbums(await providerApi.artistAlbums(acct, p.id));
      else if (p.kind === 'playlist') setSongs(await providerApi.playlistSongs(acct, p.id));
      else setSongs(await providerApi.albumSongs(acct, p.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [p.acctId, p.kind, p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const importPl = () => {
    if (!acct || !songs.length) return;
    library.create(p.name, songs, { desc: `来自 ${acct.name}`, providerType: acct.type, providerName: acct.name, providerId: acct.id });
    toast(`已导入「${p.name}」· ${songs.length} 首`);
  };

  const songAction = (s: SongItem) => {
    const prog = downloadProgress(s);
    const done = dlStore.isDownloaded(s);
    if (prog != null) return <Text style={st.prog}>{Math.round(prog * 100)}%</Text>;
    if (done) return <Icon name="check" size={18} active />;
    return (
      <TouchableOpacity hitSlop={8} onPress={() => setActSong(s)}>
        <Icon name="more" size={20} color={C.text2} />
      </TouchableOpacity>
    );
  };

  const isArtist = p.kind === 'artist';
  const headSub = isArtist
    ? (albums.length ? `${albums.length} 张专辑` : (p.sub || ''))
    : (songs.length ? `${songs.length} 首` : (p.sub || ''));

  return (
    <View style={st.screen}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: current ? 116 : 32 }}>
        <PageHeader title="" />

        <View style={st.headCard}>
          {!isArtist ? (
            p.cover ? <Image source={{ uri: p.cover }} style={st.cover} />
              : <View style={[st.cover, st.coverFallback]}><Text style={st.glyph}>♫</Text></View>
          ) : (
            <View style={[st.cover, st.artistFallback]}><Text style={st.artistInitial}>{p.name.slice(0, 1)}</Text></View>
          )}
          <View style={st.headMeta}>
            <Text style={st.title} numberOfLines={2}>{p.name}</Text>
            <Text style={st.stat}>{headSub}{acct ? ` · ${acct.name}` : ''}</Text>
          </View>
        </View>

        {/* 艺术家 → 专辑网格；专辑/歌单 → 播放动作 + 曲目列表 */}
        {loading ? (
          <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>
        ) : err ? (
          <View style={st.center}>
            <Text style={st.empty}>{err}</Text>
            <TouchableOpacity style={st.retryBtn} onPress={load}>
              <Icon name="refresh" size={16} color={C.onBrand} />
              <Text style={st.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : isArtist ? (
          albums.length ? (
            <View style={st.albumGrid}>
              {albums.map(al => (
                <TouchableOpacity
                  key={al.id} style={st.albumCell} activeOpacity={0.85}
                  onPress={() => nav.navigate('ProviderDetail', {
                    acctId: p.acctId, kind: 'album', id: al.id, name: al.name,
                    cover: al.cover, sub: `${al.year || ''}${al.songCount ? ` ${al.songCount}首` : ''}`.trim() || undefined,
                  })}
                >
                  {al.cover ? <Image source={{ uri: al.cover }} style={st.albumCover} />
                    : <View style={[st.albumCover, st.coverFallback]}><Text style={st.glyph}>♫</Text></View>}
                  <Text style={st.albumName} numberOfLines={1}>{al.name}</Text>
                  <Text style={st.albumMeta} numberOfLines={1}>{al.year || ''}{al.songCount ? ` · ${al.songCount}首` : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : <Text style={st.empty}>该艺术家没有专辑</Text>
        ) : (
          <>
            <TouchableOpacity style={st.playAllBtn} onPress={() => songs.length && playSong(songs[0], songs)} disabled={!songs.length}>
              <Icon name="play" size={20} active color={C.onBrand} />
              <Text style={st.playAllText}>播放全部</Text>
              <Text style={st.playAllCount}>{songs.length ? `(${songs.length})` : ''}</Text>
            </TouchableOpacity>
            <View style={st.actionRow}>
              <TouchableOpacity style={st.action} onPress={() => { if (songs.length) playSong(songs[Math.floor(Math.random() * songs.length)], songs); }} disabled={!songs.length}>
                <Icon name="shuffle" size={20} color={C.text2} /><Text style={st.actionText}>随机播</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.action} onPress={importPl} disabled={!songs.length}>
                <Icon name="add" size={20} color={C.text2} /><Text style={st.actionText}>导入歌单</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.action} onPress={() => { if (songs.length) { const n = enqueueDownload(songs); toast(n ? `${n} 首加入下载队列` : '歌曲均已下载'); } }} disabled={!songs.length}>
                <Icon name="download" size={20} color={C.text2} /><Text style={st.actionText}>下载</Text>
              </TouchableOpacity>
            </View>
            {songs.length ? (
              <View style={st.songList}>
                {songs.map((s, i) => (
                  <SongRow
                    key={`${s.source}-${s.songmid}-${i}`}
                    song={s}
                    playing={current?.songmid === s.songmid}
                    onPress={() => playSong(s, songs)}
                    extra={songAction(s)}
                  />
                ))}
              </View>
            ) : <Text style={st.empty}>{p.kind === 'playlist' ? '歌单为空' : '该专辑没有曲目'}</Text>}
          </>
        )}
      </ScrollView>
      <View style={st.miniDock} pointerEvents="box-none">
      </View>
      <ActionSheet
        visible={!!actSong} onClose={() => setActSong(null)}
        title={actSong ? `${actSong.name} · ${actSong.singer}` : ''}
        items={actSong ? [
          dlStore.isDownloaded(actSong)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载', onPress: () => { enqueueDownload([actSong]); } },
          { label: '收藏到歌单', onPress: () => setCollect(true) },
        ] : []}
      />
      <CollectSheet song={collect ? actSong : null} visible={collect} onClose={() => setCollect(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  headCard: { flexDirection: 'row', gap: 14, marginTop: 4 },
  cover: { width: 120, height: 120, borderRadius: 10 },
  coverFallback: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  artistFallback: { backgroundColor: C.artTint2, alignItems: 'center', justifyContent: 'center' },
  artistInitial: { color: C.brandText, fontSize: 44, fontWeight: '700' },
  glyph: { color: C.text2, fontSize: 32, fontWeight: '700' },
  headMeta: { flex: 1, justifyContent: 'center', gap: 6 },
  title: { color: C.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  stat: { color: C.text2, fontSize: 12, lineHeight: 17 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 },
  retryText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
  playAllBtn: { height: 46, borderRadius: 14, backgroundColor: C.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  playAllText: { color: C.onBrand, fontSize: 14, fontWeight: '700' },
  playAllCount: { color: C.onBrand, fontSize: 12, opacity: 0.8 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1, minHeight: 56, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { color: C.text2, fontSize: 11, fontWeight: '500' },
  songList: { marginTop: 14, gap: 8 },
  prog: { color: C.brandText, fontSize: 11, width: 38, textAlign: 'right' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  albumCell: { width: '31%', gap: 4 },
  albumCover: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.surface2 },
  albumName: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  albumMeta: { color: C.text2, fontSize: 9, lineHeight: 12 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
