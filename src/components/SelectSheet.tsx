// SelectSheet:select 行的真下拉(ActionSheet 定宽版,桌面/TV 通用)
import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';

export function SelectSheet({ visible, title, value, options, onPick, onClose }: {
  visible: boolean; title: string; value: string; options: string[];
  onPick: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={st.scrim} activeOpacity={1} onPress={onClose}>
        <View style={st.card} onStartShouldSetResponder={() => true}>
          <Text style={st.title}>{title}</Text>
          {options.map(op => (
            <TouchableOpacity key={op} style={[st.row, op === value && st.rowOn]} activeOpacity={0.7}
              onPress={() => { onClose(); onPick(op); }}>
              <Text style={[st.label, op === value && { color: C.brandText, fontWeight: '700' }]}>{op}</Text>
              {op === value ? <Icon name="check" size={13} color={C.brand} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, alignItems: 'flex-end', justifyContent: 'flex-start' },
  card: {
    marginTop: 120, marginRight: 40, minWidth: 200, borderRadius: 12, backgroundColor: C.sheet,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.strokeFaint, paddingVertical: 6,
  },
  title: { color: C.text3, fontSize: 10, paddingHorizontal: 16, paddingVertical: 8, letterSpacing: 1, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 40 },
  rowOn: { backgroundColor: C.selTint, borderRadius: 8 },
  label: { color: C.text, fontSize: 13 },
});
