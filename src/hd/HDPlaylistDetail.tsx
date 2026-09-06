// HD 歌单详情 —— 对齐桌面版 PlaylistDetailScreen:
// 头部(封面 + 「歌单」标签/标题/meta/三钮) + 全宽歌曲行(焦点选中态/播放中品牌绿)
// 参数与 phone PlaylistDetailScreen 同构:title/songs/meta/localId(本地歌单封面取第一首)
import React, { useState } from 'react';
import { hdActions } from './HDActions';
import { HDCollect } from './HDCollect';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C, H, SH } from './hdtokens';
import { HDTouch } from './HDTouch';
import { HDSongRow } from './HDSongRow';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { setFav, isFav } from '../state/favorites';
import { enqueueDownload } from '../services/downloads';
import { toast, dialog } from '../components/Dialog';
import { sync, isPlatformList } from '../services/sync';
import { useApp } from '../state/AppState';
import type { SongItem } from '../services/server';

interface Params { title?: string; songs?: SongItem[]; meta?: string; localId?: string; plKey?: string; love?: boolean; }

export function HDPlaylistDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const route = useRoute();
  const p = route.params as Params;
  const { playSong, current } = usePlayer();

  // 本地歌单:进页时重读(支持返回后刷新);远端歌单:songs 直传
  const local = p.localId ? library.get(p.localId) : null;
  // lx106:songs 可变(移除单曲);非本地列表先取参数快照
  const [songs, setSongs] = useState<SongItem[]>(() => (local ? local.songs as SongItem[] : p.songs || []));
  const cover = local?.cover || songs[0]?.img;
  const title = local?.name || p.title || '歌单';
  const meta = p.meta || `${songs.length} 首`;

  const [dlBusy, setDlBusy] = useState(false);
  const [limit, setLimit] = useState(40); // lx104 懒加载行数(大歌单全渲染=TV 卡顿源)
  const [collectFor, setCollectFor] = useState<SongItem | null>(null); // lx125:行内收藏→选歌单面板
  // lx106/lx121:移除单曲——本地/我喜欢的直改;服务器歌单直改;平台导入(tx_/wy_ id)写不持久→复制本地副本编辑
  const removeSong = (sg: SongItem) => {
    const label = p.love ? '取消收藏' : '从歌单移除';
    if (p.plKey && isPlatformList(p.plKey)) {
      hdActions.menu(`「${title}」是平台导入歌单`, [
        { label: '复制为本地副本并移除该曲', icon: 'add', onPress: () => {
          const songs2 = songs.filter(x => !(x.source === sg.source && x.songmid === sg.songmid));
          library.create(title, songs2);
          setSongs(songs2);
          toast(`已创建本地副本「${title}」(${songs2.length} 首)`);
        } },
      ]);
      return;
    }
    hdActions.confirm(label, `确定将「${sg.name}」${p.love ? '移出我喜欢的' : '移出本歌单'}？`, async () => {
      try {
        if (p.love) {
          await setFav(sg, false,
            connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
            connected && token ? () => sync.fetchLists() : undefined);
        } else if (local) {
          library.removeSong(local.id, sg);
        } else if (p.plKey && connected && token) {
          const ok = await sync.removeSongFromUserList(p.plKey, sg);
          if (!ok) { toast('服务器操作失败'); return; }
        } else {
          // lx116:无 id 的收藏歌单兜底——按标题匹配本地库/服务器歌单移除
          const localByName = library.all().find(q => q.name === title);
          if (localByName) { library.removeSong(localByName.id, sg); }
          else if (connected && token) {
            const ok = await sync.removeSongFromUserListByName(title, sg);
            if (!ok) { toast('未找到对应收藏歌单'); return; }
          } else { toast('该歌单不支持移除'); return; }
        }
        setSongs(prev => prev.filter(x => !(x.source === sg.source && x.songmid === sg.songmid)));
        toast(`${label}成功`);
      } catch { toast('操作失败'); }
    });
  };

  // lx107:歌曲行长按管理菜单(播放/收藏切换/下载/移除)
  const rowMenu = (sg: SongItem) => {
    const favd = isFav(sg);
    const removable = !!(local || p.love || p.plKey || library.all().some(q => q.name === title)); // lx116:按名可解析的收藏歌单也可移除
    hdActions.menu(`${sg.name} · ${sg.singer}`, [
      { label: '播放', icon: 'play', onPress: () => playSong(sg, songs) },
      ...(favd ? [{ label: '取消收藏', danger: true, onPress: async () => {
        try {
          await setFav(sg, false,
            connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
            connected && token ? () => sync.fetchLists() : undefined);
          toast('已取消收藏');
          if (p.love) setSongs(prev => prev.filter(x => !(x.source === sg.source && x.songmid === sg.songmid)));
        } catch { toast('操作失败'); }
      } }] : []),
      { label: '收藏到歌单…', icon: 'heart', onPress: () => setCollectFor(sg) }, // lx125:选歌单(老板:无法选择歌单)
      { label: '下载', icon: 'download', onPress: () => { try { enqueueDownload([sg]); toast('已加入下载队列'); } catch { toast('下载失败'); } } },
      // lx158:去重——我喜欢的页由上方「取消收藏」承担(含移出列表);未收藏态(仅服务器侧)兑底用 removeSong;其余可移除歌单只留一个「从歌单移除」
      ...(p.love && !favd ? [{ label: '取消收藏', danger: true, onPress: () => removeSong(sg) }] : []),
      ...(removable && !p.love ? [{ label: '从歌单移除', danger: true, onPress: () => removeSong(sg) }] : []),
    ]);
  };

  // lx104:显式歌单管理入口(本地/服务器歌单都支持)
  const { connected, token } = useApp();
  const manage = () => {
    if (!p.localId && !p.plKey) { toast('该歌单请在歌单列表长按管理'); return; }
    if (!p.localId && p.plKey && isPlatformList(p.plKey)) {
      // 平台导入:重命名/删除不持久——只提供复制副本
      hdActions.menu(`管理「${title}」`, [
        { label: '重命名歌单', icon: 'edit', onPress: () => {
          hdActions.prompt('重命名歌单', {
            defaultValue: title,
            onSubmit: async (v) => {
              if (!v || v === title) return;
              toast((await sync.renameUserList(p.plKey!, v)) ? '已重命名' : '服务器操作失败');
            },
          });
        } },
        { label: '删除歌单', danger: true, onPress: async () => {
          toast((await sync.removeUserList(p.plKey!)) ? '已删除' : '服务器操作失败');
          nav.goBack();
        } },
        { label: '复制为可编辑本地副本', icon: 'add', onPress: () => {
          library.create(title, songs);
          toast(`已创建本地副本「${title}」`);
        } },
      ]);
      return;
    }
    hdActions.menu(`管理「${title}」`, [
      { label: '重命名歌单', icon: 'edit', onPress: () => {
        hdActions.prompt('重命名歌单', { defaultValue: title, onSubmit: async (v) => {
          if (!v || v === title) return;
          if (p.localId) { library.update(p.localId, { name: v }); toast('已重命名'); }
          else if (connected && token) toast((await sync.renameUserList(p.plKey!, v)) ? '已重命名' : '服务器操作失败');
        } });
      } },
      { label: '删除歌单', danger: true, onPress: async () => {
        if (p.localId) { library.remove(p.localId); toast('已删除'); nav.goBack(); }
        else if (connected && token) {
          toast((await sync.removeUserList(p.plKey!)) ? '已删除' : '服务器操作失败');
          nav.goBack();
        }
      } },
    ]);
  };
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
            {(p.localId || p.plKey) ? (
              <HDTouch style={st.btn} onPress={manage}>
                <Icon name="settings" size={11} color={C.text} />
                <Text style={st.btnText}>管理</Text>
              </HDTouch>
            ) : null}
            {!p.localId && !p.plKey && !p.love && songs.length ? (
              <HDTouch style={st.btnPrimary} glow={SH.brand} onPress={() => {
                // lx116:一键收藏整个歌单(榜单/推荐/播客 → 本地库,自动镜像服务器)
                if (library.all().some(q => q.name === title)) { toast('已在歌单库中'); return; }
                library.create(title, songs);
                toast(`已收藏「${title}」(${songs.length} 首)`);
              }}>
                <Icon name="heart" size={10} color={C.onBrand} />
                <Text style={st.btnPrimaryText}>收藏歌单</Text>
              </HDTouch>
            ) : null}
          </View>
        </View>
      </View>

      {/* ===== 歌曲列表(全宽行 + 焦点选中态) ===== */}
      {songs.length ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 + H.playbar, gap: 2 }} showsVerticalScrollIndicator={false}
          onScroll={e => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            if (layoutMeasurement.height + contentOffset.y > contentSize.height - 600) setLimit(n => (n < songs.length ? n + 40 : n));
          }}
          scrollEventThrottle={200}
        >
          {songs.slice(0, limit).map((s, i) => (
            <HDSongRow key={`${s.source}_${s.songmid}_${i}`} song={s} index={i + 1} first={i === 0}
              playing={current?.songmid === s.songmid && current?.source === s.source}
              onPress={() => playSong(s, songs)}
              onLongPress={() => rowMenu(s)}
              onAction={() => rowMenu(s)} />
          ))}
          {limit < songs.length ? <Text style={st.more}>滚动加载更多({limit}/{songs.length})</Text> : null}
        </ScrollView>
      ) : (
        <View style={st.empty}>
          <Icon name="music" size={22} color={C.text3} />
          <Text style={st.emptyText}>歌单是空的 —— 去「探索」搜索添加</Text>
        </View>
      )}
      {/* lx125:收藏到歌单面板(行内入口) */}
      {collectFor ? <HDCollect song={collectFor} onClose={() => setCollectFor(null)} /> : null}
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
  more: { color: C.text3, fontSize: 11, textAlign: 'center', paddingVertical: 10 },
  btnPrimaryText: { color: C.onBrand, fontSize: H.font.sm, fontWeight: '700' },
  btn: { height: 36, borderRadius: 9, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  btnText: { color: C.text, fontSize: H.font.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: C.text3, fontSize: H.font.sm },
});
