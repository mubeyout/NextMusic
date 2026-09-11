// 交互式设置行：开关 / 值选择(ActionSheet) / 动作 / 跳转 / 文本输入
// 与 SubPage 视觉一致，但行为真实
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Icon } from '../theme/Icon';
import { PageHeader } from './PageChrome';
import { C } from '../theme/tokens';
import { ActionSheet } from './ActionSheet';

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity style={[s.row, s.rowDivide]} activeOpacity={0.7} onPress={() => onChange(!value)}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={[s.switch, value && s.switchOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

export function ValueRow({ label, value, options, onPick }: {
  label: string; value: string;
  options: { label: string; value: string }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.value === value)?.label || value;
  return (
    <>
      <TouchableOpacity style={[s.row, s.rowDivide]} activeOpacity={0.7} onPress={() => setOpen(true)}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.rowRight}>
          <Text style={s.rowValue}>{cur}</Text>
          <Icon name="chevronright" size={18} color={C.text3} />
        </View>
      </TouchableOpacity>
      <ActionSheet
        visible={open} onClose={() => setOpen(false)} title={label}
        items={options.map(o => ({ label: o.label + (o.value === value ? ' ✓' : ''), onPress: () => onPick(o.value) }))}
      />
    </>
  );
}

export function ActionRow({ label, value, destructive, onPress }: { label: string; value?: string; destructive?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.row, s.rowDivide]} activeOpacity={0.7} onPress={onPress}>
      <Text style={[s.rowLabel, destructive && { color: '#FF6B6B' }]}>{label}</Text>
      <View style={s.rowRight}>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
        <Icon name="chevronright" size={18} color={C.text3} />
      </View>
    </TouchableOpacity>
  );
}

export function StaticRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={[s.row, s.rowDivide]}>
      <Text style={s.rowLabel}>{label}</Text>
      {value ? <Text style={s.rowValue}>{value}</Text> : null}
    </View>
  );
}

export function NavRow({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return <ActionRow label={label} value={value} onPress={onPress} />;
}

export function InputRow({ label, value, placeholder, onChange, secure }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void; secure?: boolean;
}) {
  return (
    <View style={[s.row, s.rowDivide, { height: 60 }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.secTitle}>{title}</Text>
      <View>{children}</View>
    </View>
  );
}

export function PageShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={s.screen}>
      <PageHeader title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, maxWidth: 860, alignSelf: 'flex-start', width: '100%' }}>{children}</ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  section: { borderRadius: 14, backgroundColor: C.surface, padding: 16, marginBottom: 14 },
  secTitle: { color: C.text, fontSize: 13, lineHeight: 16, fontWeight: '500', marginBottom: 8 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint, paddingTop: 10, marginTop: 10 },
  rowLabel: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { color: C.text2, fontSize: 12, lineHeight: 16, maxWidth: 180 },
  input: { width: 190, color: C.text, fontSize: 13, textAlign: 'right', paddingVertical: 4 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.inset2, padding: 2 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#8E8E8E' },
  knobOn: { backgroundColor: C.knobOn, alignSelf: 'flex-end' },
});
