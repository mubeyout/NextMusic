// lx165(老板):我的收藏合并页(HD/桌面)——歌曲(我喜欢的)/歌手/专辑 三 tab 一入口,
// 替代侧栏三菜单;行内 ♥ 即管理(取消收藏),歌曲行 tap 播放、♥ 长按语义=取消
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { PillTabs } from '../components/PillTabs';
import { SongRow } from '../components/SongRow';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';
import { sync, lxToApp, subscribeSync } from '../services/sync';
import { lxapi } from '../services/lxapi';
import { toast } from '../components/Dialog';
import { hdActions } from '../hd/HDActions';
import { usePlayer } from '../state/PlayerProvider';
import { isFav, setFav, songKey } from '../state/favorites';
import { isArtistFav, toggleArtistFav, refreshArtistFavs, useArtistFavTick, type ArtistFav } from '../state/artistFavs';
import { isAlbumFav, toggleAlbumFav, refreshAlbumFavs, useAlbumFavTick, type AlbumFav } from '../state/albumFavs';
import { useApp } from '../state/AppState';
import type { SongItem } from '../services/server';

const Row = IS_HD ? HDTouch : TouchableOpacity;

export function MyFavoritesScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const { connected, token } = useApp();
  const { playSong, current } = usePlayer();
  const [tab, setTab] = useState(0); // 0 歌曲 1 歌手 2 专辑
  const [songs, setSongs] = useState<SongItem[] | null>(null);
  const [artists, setArtists] = useState<ArtistFav[] | null>(null);
  const [albums, setAlbums] = useState<AlbumFav[] | null>(null);
  useArtistFavTick(); useAlbumFavTick();

  // 歌曲(loveList):缓存先行+sync 订阅
  useEffect(() => {
    const load = () => {
      const snap = sync.cachedLists();
      setSongs((snap?.loveList || []).map(lxToApp));
    };
    load();
    if (connected && token) sync.fetchLists().then(load).catch(() => {});
    return subscribeSync(load);
  }, [connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx167c(老板):收藏歌曲缺封面→音源搜同名补图(懒补全,缺图的才搜,最多10首)
  useEffect(() => {
    if (!songs?.length) return;
    const missing = songs.filter(s => !s.img).slice(0, 10);
    if (!missing.length) return;
    let dead = false;
    missing.forEach(s => {
      lxapi.search(`${s.name} ${s.singer}`, s.source || 'kw').then((r: { img?: string }[]) => {
        if (dead || !r?.[0]?.img) return;
        setSongs(prev => (prev || []).map(x => (x.source === s.source && x.songmid === s.songmid ? { ...x, img: (r[0] as { img?: string }).img } : x)));
      }).catch(() => {});
    });
    return () => { dead = true; };
  }, [songs != null && songs.every(s => s.img)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 1 && artists == null) refreshArtistFavs().then(setArtists);
    if (tab === 2 && albums == null) refreshAlbumFavs().then(setAlbums);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const unfav = (s: SongItem) => {
    setFav(s, false,
      connected && token ? ((snap: any) => sync.pushLists(snap)) : undefined,
      connected && token ? () => sync.fetchLists() : undefined).then(() => {
        setSongs(prev => (prev || []).filter(x => songKey(x) !== songKey(s)));
        toast(`已取消收藏「${s.name}」`);
      });
  };

  const tabs = ['歌曲', '歌手', '专辑'];
  return (
    <View style={st.screen}>
      <PageHeader title="我的收藏" onBack={() => nav.goBack()} />
      <View style={{ paddingHorizontal: 16 }}>
        {IS_HD ? (
          /* lx167c(老板):TV 遥控可达——HDTouch 焦点 pills(PillTabs 是手机组件无焦点) */
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tabs.map((t, i) => (
              <HDTouch key={t} style={[st.tvPill, tab === i && st.tvPillOn]}
                focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 14 }}
                hasTVPreferredFocus={i === 0}
                onPress={() => setTab(i)}>
                <Text style={[st.tvPillText, tab === i && { color: C.onBrand, fontWeight: '700' }]}>{t}</Text>
              </HDTouch>
            ))}
          </View>
        ) : (
          <PillTabs tabs={tabs} active={tab} onChange={setTab} />
        )}
      </View>
      {tab === 0 ? (
        songs == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        : songs.length ? (
          <FlatList data={songs} keyExtractor={(s, i) => `${s.source}_${s.songmid}_${i}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: s }) => (
              <SongRow song={s} playing={current?.songmid === s.songmid && current?.source === s.source}
                onPress={() => playSong(s, songs)}
                onLongPress={IS_HD ? () => hdActions.menu(`${s.name} · ${s.singer}`, [
                  { label: '取消收藏', icon: 'heart', danger: true, onPress: () => unfav(s) }, // lx167d(老板):TV 长按管理
                ]) : undefined}
                extra={IS_HD ? (
                  <Icon name="heart" size={20} active color="#FF5A76" /> /* TV:状态指示器,管理走长按 */
                ) : (
                  <TouchableOpacity hitSlop={8} onPress={() => unfav(s)}>
                    <Icon name="heart" size={20} active color="#FF5A76" />
                  </TouchableOpacity>
                )} />
            )} />
        ) : <Text style={st.empty}>还没有收藏的歌曲{'\n'}播放页点心即可收藏</Text>
      ) : tab === 1 ? (
        artists == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        : artists.length ? (
          <FlatList data={artists} keyExtractor={a => `${a.source || 'wy'}_${a.id}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: a }) => {
              const favd = isArtistFav(a);
              return (
                <Row style={st.row} activeOpacity={0.85}
                  focusStyle={IS_HD ? { borderWidth: 2, borderColor: C.brand, borderRadius: 12 } : undefined}
                  onLongPress={IS_HD ? () => hdActions.menu(`${a.name}`, [
                    { label: isArtistFav(a) ? '取消收藏' : '收藏', icon: 'heart', danger: isArtistFav(a), onPress: () => toggleArtistFav(a).then(on => toast(on ? `已收藏 ${a.name}` : '已取消收藏')).catch(() => toast('服务器写入失败')) },
                  ]) : undefined}
                  onPress={() => nav.navigate('ArtistDetail', { artist: a })}>
                  {a.img ? <Image source={{ uri: a.img }} style={st.round} /> : <View style={[st.round, st.avaFallback]}><Text style={st.glyph}>{a.name.slice(0, 1)}</Text></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.name} numberOfLines={1}>{a.name}</Text>
                    <Text style={st.meta}>{a.count != null ? `${a.count} 首歌曲` : '点击查看'}</Text>
                  </View>
                  {IS_HD ? (
                    <Icon name="heart" size={20} active={favd} color={favd ? '#FF5A76' : C.text2} /> /* lx167d:TV 指示器 */
                  ) : (
                    <TouchableOpacity hitSlop={8} onPress={() => toggleArtistFav(a).then(on => toast(on ? `已收藏 ${a.name}` : '已取消收藏')).catch(() => toast('服务器写入失败'))}>
                      <Icon name="heart" size={20} active={favd} color={favd ? '#FF5A76' : C.text2} />
                    </TouchableOpacity>
                  )}
                </Row>
              );
            }} />
        ) : <Text style={st.empty}>还没有收藏的歌手{'\n'}搜索歌手进入内页即可收藏</Text>
      ) : (
        albums == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        : albums.length ? (
          <FlatList data={albums} keyExtractor={a => `${a.source || 'wy'}_${a.id}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: a }) => {
              const favd = isAlbumFav(a);
              return (
                <Row style={st.row} activeOpacity={0.85}
                  focusStyle={IS_HD ? { borderWidth: 2, borderColor: C.brand, borderRadius: 12 } : undefined}
                  onLongPress={IS_HD ? () => hdActions.menu(`${a.name}`, [
                    { label: isAlbumFav(a) ? '取消收藏' : '收藏', icon: 'heart', danger: isAlbumFav(a), onPress: () => toggleAlbumFav(a).then(on => toast(on ? '已收藏' : '已取消收藏')).catch(() => toast('服务器写入失败')) },
                  ]) : undefined}
                  onPress={() => nav.navigate('AlbumDetail', { album: a })}>
                  {a.img ? <Image source={{ uri: a.img }} style={st.square} /> : <View style={[st.square, st.avaFallback]}><Icon name="music" size={22} color={C.text3} /></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.name} numberOfLines={1}>{a.name}</Text>
                    <Text style={st.meta} numberOfLines={1}>{a.singer || ''}</Text>
                  </View>
                  {IS_HD ? (
                    <Icon name="heart" size={20} active={favd} color={favd ? '#FF5A76' : C.text2} /> /* lx167d:TV 指示器 */
                  ) : (
                    <TouchableOpacity hitSlop={8} onPress={() => toggleAlbumFav(a).then(on => toast(on ? '已收藏' : '已取消收藏')).catch(() => toast('服务器写入失败'))}>
                      <Icon name="heart" size={20} active={favd} color={favd ? '#FF5A76' : C.text2} />
                    </TouchableOpacity>
                  )}
                </Row>
              );
            }} />
        ) : <Text style={st.empty}>还没有收藏的专辑{'\n'}搜索专辑进入内页即可收藏</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingHorizontal: 12, borderRadius: 12 },
  tvPill: { borderRadius: 14, paddingHorizontal: 16, height: 32, backgroundColor: C.surface2, justifyContent: 'center' },
  tvPillOn: { backgroundColor: C.brand },
  tvPillText: { color: C.text2, fontSize: 12 },
  round: { width: 46, height: 46, borderRadius: 23 },
  square: { width: 46, height: 46, borderRadius: 8 },
  avaFallback: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: C.text2, fontSize: 18, fontWeight: '700' },
  name: { color: C.text, fontSize: 14, fontWeight: '600' },
  meta: { color: C.text2, fontSize: 11, marginTop: 2 },
});
