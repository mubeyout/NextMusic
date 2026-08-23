import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme/tokens';

// 通用底部菜单（右上角 ⋯ / 更多）
export function ActionSheet({ visible, onClose, title, items }: {
  visible: boolean; onClose: () => void; title?: string;
  items: { label: string; sub?: string; onPress?: () => void; danger?: boolean; selected?: boolean }[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {items.map(it => (
              <TouchableOpacity key={it.label} style={s.row} activeOpacity={0.7}
                onPress={() => { onClose(); it.onPress?.(); }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, it.danger && s.danger]}>{it.label}</Text>
                  {it.sub ? <Text style={s.sub}>{it.sub}</Text> : null}
                </View>
                {it.selected ? <View style={s.dot} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF2E', marginBottom: 10 },
  title: { color: C.text2, fontSize: 12, lineHeight: 16, marginBottom: 4 },
  row: { minHeight: 54, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF0D' },
  label: { color: C.text, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  danger: { color: '#FF6B6B' },
  sub: { color: C.text2, fontSize: 11, lineHeight: 15, marginTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand, alignSelf: 'center' },
});
