// 统一页面头（子页）+ 空态组件
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, type IconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';

// 统一子页 header：返回 + 居中标题 + 右侧动作槽
export function PageHeader({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const back = onBack || (() => nav.goBack());
  return (
    <View style={[h.wrap, { paddingTop: insets.top + 20 }]}>
      {IS_HD ? (
        <HDTouch onPress={back} style={h.sideBtn}>
          <Icon name="back" size={22} color={C.text} />
        </HDTouch>
      ) : (
        <TouchableOpacity onPress={back} hitSlop={6} style={h.sideBtn}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
      )}
      <Text style={h.title} numberOfLines={1}>{title}</Text>
      <View style={h.sideBtn}>{right}</View>
    </View>
  );
}

// 统一空态：icon + 主文案 + 副文案
export function EmptyState({ icon, title, sub }: { icon?: IconName; title: string; sub?: string }) {
  return (
    <View style={e.wrap}>
      <View style={e.iconWrap}><Icon name={icon || 'music'} size={28} color={C.text3} /></View>
      <Text style={e.title}>{title}</Text>
      {sub ? <Text style={e.sub}>{sub}</Text> : null}
    </View>
  );
}

const h = StyleSheet.create({
  wrap: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  sideBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center', marginHorizontal: 4 },
});

const e = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 40 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { color: C.text2, fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  sub: { color: C.text3, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
