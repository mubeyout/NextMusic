import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { C } from '../theme/tokens';

// Figma pill tabs: active pill filled brand green (C.brand, label #121212),
// inactive #2B2B2B (label #B3B3B3), r=18, h=30, pad 16/8, label 12px
export function PillTabs({ tabs, active, onChange }: {
  tabs: string[]; active: number; onChange: (i: number) => void;
}) {
  return (
    <View style={st.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
        {tabs.map((t, i) => {
          const on = i === active;
          return (
            <TouchableOpacity key={t} onPress={() => onChange(i)} style={st.hit}>
              <View style={[st.pill, on && st.pillOn]}>
                <Text style={[st.label, on && st.labelOn]}>{t}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { height: 40, justifyContent: 'center' },
  row: { gap: 8, alignItems: 'center' },
  hit: { height: 40, justifyContent: 'center' },
  pill: {
    height: 30, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.surface2,
  },
  pillOn: { backgroundColor: C.brand },
  label: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '400' },
  labelOn: { color: C.onBrand, fontWeight: '500' },
});


// v3.28(老板:统一 token/规范化):HD/桌面胶囊 tab——HDTouch 可聚焦(遥控可达),尺寸对齐桌面
// 手机端继续用上方 PillTabs;两处 tvPill 自绘散件(我的收藏)收口到这里
import { HDTouch } from '../hd/HDTouch';
import { FOCUS_PILL } from '../hd/hdstyle';
const hp = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  pill: { height: 36, borderRadius: 999, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface2 },
  pillOn: { backgroundColor: C.brand },
  label: { color: C.text2, fontSize: 13, fontWeight: '600' },
  labelOn: { color: C.onBrand, fontWeight: '700' },
});
export function PillTabsHD({ tabs, active, onChange, autoFocusFirst }: {
  tabs: string[]; active: number; onChange: (i: number) => void; autoFocusFirst?: boolean;
}) {
  return (
    <View style={hp.row}>
      {tabs.map((t, i) => {
        const on = i === active;
        return (
          <HDTouch key={t} style={[hp.pill, on && hp.pillOn]} focusStyle={FOCUS_PILL}
            hasTVPreferredFocus={autoFocusFirst && i === 0}
            onPress={() => onChange(i)}>
            <Text style={[hp.label, on && hp.labelOn]}>{t}</Text>
          </HDTouch>
        );
      })}
    </View>
  );
}
