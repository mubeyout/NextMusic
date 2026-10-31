// PlaylistRow —— 统一歌单/列表行(设计系统批次1·老板令 1011 12:04:歌单显示各屏不一致,收口为组件库集体调用)
// 44px 方圆角10 封面(cover 直链 Image;缺封面=gradKey 名哈希渐变+music 图标兜底,禁死灰块)
// +名(FS.md 600)+副行(FS.xs)+chevron16;HD:HDTouch+focus(12);phone 行高≥44;样式全 SP/FS token
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { HDTouch } from '../hd/HDTouch';
import { focus } from '../hd/hdstyle';
import { Icon } from '../theme/Icon';
import { C, FS, FW, SP } from '../theme/tokens';
import { gradOf } from '../theme/grads'; // [老板 1011 15:39] 渐变唯一源
import { IS_HD } from '../services/appversion';

export function PlaylistRow({ cover, name, sub, gradKey, onPress, onLongPress }: {
  cover?: string | null; name: string; sub?: string; gradKey?: string; onPress?: () => void; onLongPress?: () => void;
}) {
  const [g1, g2] = gradOf(gradKey || name);
  const inner = (
    <>
      <View style={st.cv}>
        {cover ? <Image source={{ uri: cover }} style={st.img} resizeMode="cover" /> : (
          <>
            <View style={[st.grad, { backgroundColor: g1, opacity: 0.55 }]} />
            <View style={[st.grad, { backgroundColor: g2, opacity: 0.35 }]} />
            <Icon name="music" size={20} color="#ffffffcc" />
          </>
        )}
      </View>
      <View style={st.meta}>
        <Text style={st.name} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={st.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Icon name="chevronright" size={16} color={C.text3} />
    </>
  );
  if (IS_HD) return (
    <HDTouch style={st.row} onPress={onPress} onLongPress={onLongPress} disabled={!onPress} focusStyle={focus(12)}>{inner}</HDTouch>
  );
  return (
    <TouchableOpacity style={st.row} onPress={onPress} onLongPress={onLongPress} disabled={!onPress} activeOpacity={0.75}>{inner}</TouchableOpacity>
  );
}

const st = StyleSheet.create({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: SP.lg, paddingVertical: SP.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  cv: { width: 44, height: 44, borderRadius: SP.lg, backgroundColor: C.artTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  grad: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  img: { width: '100%', height: '100%' },
  meta: { flex: 1, minWidth: 0, gap: SP.xs },
  name: { color: C.text, fontSize: FS.md, fontWeight: FW.semibold },
  sub: { color: C.text3, fontSize: FS.xs },
});
