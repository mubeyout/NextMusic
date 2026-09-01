import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { PageHeader } from './PageChrome';
import { C } from '../theme/tokens';

// Shared settings sub-page scaffold (Figma 21/22/23 pattern)
export function SubPage({
  title,
  sections,
  extra,
  footer,
}: {
  title: string;
  sections: { title: string; rows: { label: string; value?: string; toggle?: boolean }[] }[];
  extra?: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };

  return (
    <View style={[st.screen]}>
      <PageHeader title={title} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {sections.map(sec => (
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
                    <Icon name="chevronright" size={18} color={C.text3} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
        {extra}
        {footer}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  section: { borderRadius: 14, backgroundColor: C.surface, padding: 16, marginBottom: 14 },
  secTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500', marginBottom: 8 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint, paddingTop: 8, marginTop: 8 },
  rowLabel: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { color: C.text2, fontSize: 12, lineHeight: 16 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.inset2, padding: 2 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#8E8E8E' },
  knobOn: { backgroundColor: C.knobOn, alignSelf: 'flex-end' },
});
