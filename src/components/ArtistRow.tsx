// ArtistRow —— 统一歌手行(设计系统批次1·老板令 1011 12:04:歌手显示各屏不一致,收口为组件库集体调用)
// 48px 圆头像(cover 直链 Image;缺封面=artTint2 底+首字母兜底)+名(FS.md 600)+副行(FS.xs)+chevron16
// HD:HDTouch+focus(12) 遥控焦点环;phone 触摸行高≥44;样式全 SP/FS token,禁裸 gap/fontSize
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { HDTouch } from '../hd/HDTouch';
import { focus } from '../hd/hdstyle';
import { Icon } from '../theme/Icon';
import { C, SP, FS } from '../theme/tokens';
import { IS_HD } from '../services/appversion';

export function ArtistRow({ cover, name, sub, onPress, onLongPress, round = 48 }: {
  cover?: string | null; name: string; sub?: string; onPress?: () => void; onLongPress?: () => void; round?: number;
}) {
  const inner = (
    <>
      <View style={[st.av, { width: round, height: round, borderRadius: round / 2 }]}>
        {cover ? <Image source={{ uri: cover }} style={st.img} resizeMode="cover" />
          : <Text style={st.init}>{name.slice(0, 1)}</Text>}
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
  av: { backgroundColor: C.artTint2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  init: { color: C.brandText, fontSize: FS.headline, fontWeight: '700' },
  meta: { flex: 1, minWidth: 0, gap: SP.xs },
  name: { color: C.text, fontSize: FS.md, fontWeight: '600' },
  sub: { color: C.text3, fontSize: FS.xs },
});
