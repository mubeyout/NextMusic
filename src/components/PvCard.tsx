// PvCard —— [老板 1011 16:15 卡族定盘] 全站唯一歌单卡(卡族矩阵:PvCard=歌单卡)
// nm-card 完全体:surface 底/r12/彩色弥散影+hover 上浮;文字区统一档(padding SP.md/gap SP.xs/minHeight 46)
// 方卡:封面或 gradOf 同名渐变兜底(与 DiscCard 兜底同族,同名同色);圆卡:artTint2+brandText 首字母
// fill=GridWall 列内撑满;width 档=CARD.rail(112/132/148)
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { HDTouch } from '../hd/HDTouch';
import { focus } from '../hd/hdstyle';
import { Icon } from '../theme/Icon';
import { C, SP, FS, CARD, FW } from '../theme/tokens';
import { gradOf } from '../theme/grads';
import { useHoverCard } from '../hd/hdweb';
import { IS_HD } from '../services/appversion';

export function PvCard({ cover, name, meta, round, fill, onPress, onLongPress }: {
  cover?: string; name: string; meta?: string; round?: boolean; fill?: boolean; onPress?: () => void; onLongPress?: () => void;
}) {
  const size = IS_HD ? CARD.rail.hd : (Platform.OS === 'web' ? CARD.rail.web : CARD.rail.phone);
  const { elRef, onHoverIn, onHoverOut, cardStyle } = useHoverCard(name);
  const wrap = { width: fill ? ('100%' as const) : size, backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' } as never;
  const hoverProps = (Platform.OS === 'web' ? { onHoverIn, onHoverOut } : {}) as Record<string, unknown>;

  const body = round ? (
    <>
      <View style={{ padding: SP.sm }}>
        <View style={[
          { width: fill ? '100%' : size - SP.sm * 2, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
          { backgroundColor: C.artTint2 },
        ]}>
          <Text style={pv.init}>{name.slice(0, 1)}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: SP.md, paddingBottom: SP.md, gap: SP.xs, alignItems: 'center' }}>
        <Text style={[pv.name, IS_HD && pv.nameHD]} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={[pv.meta, IS_HD && pv.metaHD]} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </>
  ) : (
    <>
      {cover ? (
        <Image source={{ uri: cover }} style={fill ? { width: '100%', aspectRatio: 1, backgroundColor: C.surface2 } : { width: size, height: size, backgroundColor: C.surface2 }} />
      ) : (
        <LinearGradient colors={gradOf(name)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[fill ? { width: '100%', aspectRatio: 1 } : { width: size, height: size }, pv.gradFallback]}>
          <Icon name="music" size={22} color="#ffffffb3" />
        </LinearGradient>
      )}
      <View style={{ padding: SP.md, gap: SP.xs, minHeight: 46 }}>
        <Text style={[pv.name, IS_HD && pv.nameHD]} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={[pv.meta, IS_HD && pv.metaHD]} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </>
  );

  if (IS_HD) return (
    <HDTouch style={[wrap, cardStyle as never]} ref={elRef as never} onPress={onPress} onLongPress={onLongPress} focusStyle={focus(10)} {...hoverProps}>
      {body}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={[wrap, cardStyle as never]} ref={elRef as never} activeOpacity={0.85} onPress={onPress} onLongPress={onLongPress} {...hoverProps}>
      {body}
    </TouchableOpacity>
  );
}

const pv = StyleSheet.create({
  init: { color: C.brandText, fontSize: FS.headline, fontWeight: FW.bold },
  name: { color: C.text, fontSize: FS.body, fontWeight: FW.semibold },
  meta: { color: C.text2, fontSize: FS.xs },
  nameHD: { fontSize: FS.md },
  metaHD: { fontSize: FS.sm },
  gradFallback: { alignItems: 'center', justifyContent: 'center' },
});
