// HD 歌单详情 —— 对齐桌面版 PlaylistDetailScreen:
// 头部(封面 + 「歌单」标签/标题/meta/三钮) + 全宽歌曲行(焦点选中态/播放中品牌绿)
// 参数与 phone PlaylistDetailScreen 同构:title/songs/meta/localId(本地歌单封面取第一首)
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C, H, SH } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDSongRow } from './HDSongRow';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload } from '../services/downloads';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';

interface Params { title?: string; songs?: SongItem[]; meta?: string; localId?: string; }

export function HDPlaylistDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const route = useRoute();
  const p = route.params as Params;
  const { playSong, current } = usePlayer();

  // 本地歌单:进页时重读(支持返回后刷新);远端歌单:songs 直传
  const local = p.localId ? library.get(p.localId) : null;
  const songs = useMemo<SongItem[]>(() => {
    if (local) return local.songs as SongItem[];
    return p.songs || [];
  }, [local, p.songs]);
  const cover = local?.cover || songs[0]?.img;
  const title = local?.name || p.title || '歌单';
  const meta = p.meta || `${songs.length} 首`;

  const [dlBusy, setDlBusy] = useState(false);
  const playAll = () => { if (songs.length) playSong(songs[0], songs); };
  const shuffleAll = () => {
    if (!songs.length) return;
    const sh = [...songs].sort(() => Math.random() - 0.5);
    playSong(sh[0], sh);
  };
  const downloadAll = async () => {
    if (!songs.length) { toast('歌单为空'); return; }
    setDlBusy(true);
    try { const n = enqueueDownload(songs); toast(`已加入下载队列:${n} 首`); }
    catch (e) { toast(`下载失败:${(e as Error).message.slice(0, 40)}`); }
    finally { setDlBusy(false); }
  };

  return (
    <View style={[st.screen, { paddingTop: Math.max(Math.min(insets.top, 14), 12) }]}>
      {/* ===== 头部:封面 + 信息 + 操作(桌面同构) ===== */}
      <View style={st.head}>
        <HDTouch style={st.backBtn} onPress={nav.goBack}>
          <Icon name="back" size={18} color={C.text2} />
        </HDTouch>
        {cover
          ? <Image source={{ uri: cover }} style={st.cover} />
          : <View style={[st.cover, { backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={40} color={C.text3} /></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={st.kindTag}>歌单</Text>
          <Text style={st.title} numberOfLines={1}>{title}</Text>
          <Text style={st.meta} numberOfLines={1}>{meta}</Text>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 4 }}>
            <HDTouch style={st.btnPrimary} glow={SH.brand} onPress={playAll}>
              <Icon name="play" size={10} color={C.onBrand} />
              <Text style={st.btnPrimaryText}>播放全部</Text>
            </HDTouch>
            <HDTouch style={st.btn} onPress={shuffleAll}>
              <Icon name="shuffle" size={11} color={C.text} />
              <Text style={st.btnText}>随机播放</Text>
            </HDTouch>
            <HDTouch style={st.btn} onPress={downloadAll} disabled={dlBusy}>
              {dlBusy ? <ActivityIndicator size="small" color={C.text2} /> : <Icon name="download" size={11} color={C.text} />}
              <Text style={st.btnText}>下载全部</Text>
            </HDTouch>
          </View>
        </View>
      </View>

      {/* ===== 歌曲列表(全宽行 + 焦点选中态) ===== */}
      {songs.length ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20, gap: 2 }} showsVerticalScrollIndicator={false}>
          {songs.map((s, i) => (
            <HDSongRow key={`${s.source}_${s.songmid}_${i}`} song={s} index={i + 1} first={i === 0}
              playing={current?.songmid === s.songmid && current?.source === s.source}
              onPress={() => playSong(s, songs)} />
          ))}
        </ScrollView>
      ) : (
        <View style={st.empty}>
          <Icon name="music" size={22} color={C.text3} />
          <Text style={st.emptyText}>歌单是空的 —— 去「探索」搜索添加</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', gap: 14, paddingHorizontal: 22, paddingBottom: 12, alignItems: 'center' },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  cover: { width: 128, height: 128, borderRadius: 11 },
  kindTag: { color: C.brand, fontSize: H.font.xs, fontWeight: '700', letterSpacing: 1 },
  title: { color: C.text, fontSize: H.font.hero, fontWeight: '800' },
  meta: { color: C.text2, fontSize: H.font.sm },
  btnPrimary: { height: 36, borderRadius: 9, backgroundColor: C.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  btnPrimaryText: { color: C.onBrand, fontSize: H.font.sm, fontWeight: '700' },
  btn: { height: 36, borderRadius: 9, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  btnText: { color: C.text, fontSize: H.font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: C.text3, fontSize: H.font.sm },
});
