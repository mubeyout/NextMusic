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
    backgroundColor: '#2B2B2B',
  },
  pillOn: { backgroundColor: C.brand },
  label: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '400' },
  labelOn: { color: C.onBrand, fontWeight: '500' },
});
