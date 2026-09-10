import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import type { SongItem } from '../services/server';
import { registerKbRow } from '../hd/hdkeyboard';

// Figma Song Row: 350x46, art 46x46 r=6, title 13 w500 / sub 10, duration right, more icon 20
// extra: 右侧操作位（下载按钮等）；onMore: ⋯ 菜单回调(不传且无 extra 则不渲染 ⋯——lx163 老板:死图标等于欺骗)
export function SongRow({ song, onPress, playing, extra, onMore, onLongPress }: { song: SongItem; onPress?: () => void; playing?: boolean; extra?: React.ReactNode; onMore?: () => void; onLongPress?: () => void }) { // lx167d:onLongPress(TV 长按管理)
  const [focus, setFocus] = useState(false); // lx145:TV D-pad 光标(队列页无选中态)
  const kbRef = useRef<unknown>(null);
  // D3 A2:键盘导航注册(队列/媒体库浏览行;web only,native 注册表无人读)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return registerKbRow({
      measure: (cb) => {
        const el = kbRef.current as unknown as { getBoundingClientRect?: () => { width: number; height: number; left: number; top: number } } | null;
        if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); cb(0, 0, r.width, r.height, r.left, r.top); }
        else cb(0, 0, 0, 0, 0, 0);
      },
      play: () => onPress?.(),
      menu: undefined, // 队列行 A3 菜单 v1.2.4 后续接入
    });
  }, [song.songmid, song.source]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable
      ref={kbRef as never}
      style={({ pressed }: { pressed: boolean }) => [
        st.row, st.ringBase, focus && st.ringOn,
        pressed && { opacity: 0.72, transform: [{ scale: 0.985 }] }, // lx168:按压反馈全站统一(轻缩+透明)
      ]}
      onPress={onPress} onLongPress={onLongPress} disabled={!onPress}
      focusable={!!onPress}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}>
      <View style={st.artWrap}>
        {song.img ? <Image source={{ uri: song.img }} style={st.art} /> : <View style={[st.art, st.fallback]} />}
      </View>
      <View style={st.meta}>
        <Text style={[st.title, playing && { color: C.brandText }]} numberOfLines={1}>{song.name}</Text>
        <Text style={st.sub} numberOfLines={1}>
          {song.singer}{song.albumName ? ` · ${song.albumName}` : ''}{song._types?.flac ? ' · 无损' : ''}
        </Text>
      </View>
      <Text style={st.dur}>{playing ? '正在播放' : song.interval}</Text>
      {extra != null ? (
        <View style={st.more}>{extra}</View>
      ) : onMore ? (
        <Pressable hitSlop={10} style={st.more} onPress={(e) => { e.stopPropagation?.(); onMore(); }}>
          <Icon name="more" size={20} color={C.text2} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginVertical: 1 }, // lx148:上下 padding
  ringBase: { borderWidth: 2, borderColor: 'transparent' }, // 常驻占位,布局恒定
  ringOn: { borderColor: C.brand, backgroundColor: C.hover },
  artWrap: { width: 46, height: 46, borderRadius: 6, overflow: 'hidden' },
  art: { width: 46, height: 46 },
  fallback: { backgroundColor: C.surface2 },
  meta: { flex: 1, gap: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 10, lineHeight: 15 },
  dur: { color: C.text2, fontSize: 10, lineHeight: 15 },
  more: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 0 },
});
