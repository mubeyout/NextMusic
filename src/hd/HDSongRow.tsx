// HDSongRow:HD 全场景歌曲行(搜索/播客/歌单详情共用)
// v4 老板反馈:行占满整行、文字留 padding、焦点/选中态贴附不生硬、播放中品牌绿
// v1.2.4 D1(A1,IS_WEB):hover 行内三钮(♡收藏/＋队列/⋯菜单)+封面▶视觉引导+右键菜单(A3)
//     TV 零 diff:全部 web 分支,onHover/contextmenu 仅 web 挂载
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useFav } from './useFav';
import { usePlayer } from '../state/PlayerProvider';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';
import type { CtxMenuItem } from './hdctxmenu';
import { setHoverMenu } from './hdctxmenu';

const IS_WEB = Platform.OS === 'web';

export function HDSongRow({ song, index, onPress, onLongPress, onAction, playing, showAlbum = true, first, buildMenu }: {
  song: SongItem;
  index?: number;
  onPress?: () => void;
  onLongPress?: () => void; // lx106:长按=管理菜单
  onAction?: () => void; // lx110:行尾"..."钮=管理菜单(可见交互,不依赖长按)
  playing?: boolean;
  showAlbum?: boolean;
  first?: boolean;
  buildMenu?: (song: SongItem) => CtxMenuItem[]; // v1.2.4 D1:web 行尾⋯/右键共用菜单数据
}) {
  const { faved, toggle } = useFav(song);
  const { appendQueue } = usePlayer(); // D1 A1:＋加入队列
  // A1 hover 态(100ms 延迟防扫过闪烁;transition 由样式透明度承担)
  const [hov, setHov] = useState(false);
  const hovTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hovBtnsRef = useRef<any>(null);
  const onHoverIn = () => {
    if (!IS_WEB) return;
    hovTimer.current && clearTimeout(hovTimer.current);
    hovTimer.current = setTimeout(() => setHov(true), 100);
    // D1 A3:hover 即注册右键菜单构造器(右键时 DOM 层取)
    if (buildMenu) setHoverMenu(() => buildMenu(song));
  };
  const onHoverOut = () => {
    if (!IS_WEB) return;
    hovTimer.current && clearTimeout(hovTimer.current);
    setHov(false);
    setHoverMenu(null);
  };
  const openMenu = (x: number, y: number) => {
    if (!buildMenu) { onAction?.(); return; }
    (globalThis as never as { __nmCtxMenu?: (x: number, y: number, items: CtxMenuItem[]) => void }).__nmCtxMenu?.(x, y, buildMenu(song));
  };

  return (
    <View style={st.rowWrap}>
    <HDTouch
      style={[st.row, IS_WEB && hov && { backgroundColor: C.hover }]}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: H.radius.row }}
      focusBg={C.hover}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress}
      activeOpacity={0.7}
      hasTVPreferredFocus={first}
      {...(IS_WEB ? {
        onHoverIn: () => onHoverIn(),
        onHoverOut: () => onHoverOut(),
      } as never : {})}
    >
      <Text style={[st.idx, playing && { color: C.brand }]}>{playing ? '▶' : index != null ? index : ''}</Text>
      <View style={st.artWrap}>
        {song.img
          ? <Image source={{ uri: song.img }} style={st.art} />
          : <View style={[st.art, { backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={12} color={C.text3} /></View>}
        {/* A1:hover 封面▶视觉引导(纯视觉,点封面=点行=播放,pointerEvents none) */}
        {IS_WEB ? (
          <View pointerEvents="none" style={[st.artPlay, { opacity: hov ? 1 : 0 }]}>
            <Icon name="play" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={[st.title, playing && { color: C.brand }]} numberOfLines={1}>
          {song.name}
          {song._types?.flac ? <Text style={st.hiRes}> 无损</Text> : null}
        </Text>
        <Text style={st.sub} numberOfLines={1}>{song.singer}{showAlbum && song.albumName ? ` · ${song.albumName}` : ''}</Text>
      </View>
      <View style={st.srcTag}><Text style={st.srcTagText}>{song.source}</Text></View>
      {/* A1:hover 时长淡出/三钮淡入(绝对定位覆盖时长区,宽度守恒不跳动;♡已收藏常驻) */}
      {IS_WEB ? (
        <View style={st.hoverZone}>
          <Text style={[st.dur, { opacity: hov ? 0 : 1 }]}>{playing ? '播放中' : song.interval}</Text>
          <View ref={hovBtnsRef} pointerEvents={hov ? 'auto' : 'none'} style={[st.hovBtns, { opacity: hov || faved ? 1 : 0 }]}>
            {/* ♡ 已收藏常驻粉色实心(不依赖 hover) */}
            <HDTouch style={st.hovBtn} onPress={toggle}>
              <Icon name="heart" size={14} active={faved} color={faved ? '#FF5A76' : C.text2} />
            </HDTouch>
            {/* ＋ 加入队列 */}
            <HDTouch style={st.hovBtn} onPress={() => { appendQueue([song]); toast('已加入队列'); }}>
              <Icon name="add" size={14} color={C.text2} />
            </HDTouch>
            {/* ⋯ 更多=A3 菜单(与右键同数据) */}
            <HDTouch style={st.hovBtn} onPress={() => {
              const el = (hovBtnsRef.current as unknown as { measure?: (cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void) => void } | null);
              if (!buildMenu) { onAction?.(); return; }
              // RNW View 有 measure;兜底 0,0(菜单自会视口翻转)
              el?.measure?.((_x, _y, _w, _h, px, py) => openMenu(px, py));
            }}>
              <Icon name="more" size={14} color={C.text2} />
            </HDTouch>
          </View>
        </View>
      ) : (
        <Text style={st.dur}>{playing ? '播放中' : song.interval}</Text>
      )}
    </HDTouch>
    {onAction ? (
      <HDTouch style={st.act} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius:  11 }} focusBg={C.hover} onPress={onAction}>
        <Icon name="more" size={14} color={C.text3} />
      </HDTouch>
    ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  // 整行占满(父容器全宽),左右留 16 padding —— 老板反馈「一行没有占满/文字太贴边」
  row: {
    minHeight: 52, borderRadius: H.radius.row, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1,
  },
  idx: { color: C.text3, fontSize: H.font.md, fontVariant: ['tabular-nums'], width: 24, textAlign: 'center' },
  artWrap: { position: 'relative' },
  art: { width: 36, height: 36, borderRadius: 6 },
  artPlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: H.font.md, fontWeight: '600' },
  sub: { color: C.text3, fontSize: H.font.xs },
  hiRes: { color: C.brand, fontSize: 7, fontWeight: '700' },
  srcTag: { backgroundColor: C.elev, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  srcTagText: { color: C.text3, fontSize: 7, fontWeight: '600', letterSpacing: 0.5 },
  dur: { color: C.text3, fontSize: H.font.sm, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
  hoverZone: { position: 'relative', minWidth: 34, alignItems: 'flex-end' },
  hovBtns: { position: 'absolute', right: 0, top: -10, flexDirection: 'row', gap: 2, height: 52, alignItems: 'center' },
  hovBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  act: { width: 30, height: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
