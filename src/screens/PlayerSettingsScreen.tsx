import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';

// Figma NM-PLAYER-SET-001 · 播放设置 (basic structure per design)
const SECTIONS: { title: string; rows: { label: string; value?: string; toggle?: boolean; chevron?: boolean }[] }[] = [
  {
    title: '默认播放',
    rows: [
      { label: '默认音质', value: '320k', chevron: true },
      { label: '自动播放', toggle: true },
      { label: '无缝播放', toggle: true },
    ],
  },
  {
    title: '音频输出',
    rows: [
      { label: '音频输出设备', value: '此手机', chevron: true },
      { label: '音量均衡', toggle: false },
    ],
  },
  {
    title: '缓存与下载',
    rows: [
      { label: '缓存上限', value: '10 GB', chevron: true },
      { label: '仅 Wi-Fi 下载', toggle: true },
    ],
  },
];

export function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>播放设置</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {SECTIONS.map(sec => (
          <View key={sec.title} style={st.section}>
            <Text style={st.secTitle}>{sec.title}</Text>
            {sec.rows.map((r, i) => (
              <View key={r.label} style={[st.row, i > 0 && st.rowDivide]}>
                <Text style={st.rowLabel}>{r.label}</Text>
                {r.toggle != null ? (
                  <View style={[st.switch, r.toggle && st.switchOn]}>
                    <View style={[st.knob, r.toggle && st.knobOn]} />
                  </View>
                ) : (
                  <View style={st.rowRight}>
                    {r.value ? <Text style={st.rowValue}>{r.value}</Text> : null}
                    <Icon name="chevronright" size={20} color={C.text2} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 8 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  section: { borderRadius: 14, backgroundColor: '#1A1A1A', padding: 16, marginBottom: 14 },
  secTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500', marginBottom: 8 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF0F', paddingTop: 8, marginTop: 8 },
  rowLabel: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { color: C.text2, fontSize: 12, lineHeight: 16 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#2E2E2E', padding: 2 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#8E8E8E' },
  knobOn: { backgroundColor: '#0E3B1F', alignSelf: 'flex-end' },
});
