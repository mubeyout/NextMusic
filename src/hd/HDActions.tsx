// HDActions:HD 专用页内操作面板(替代 dialog.menu/prompt/confirm 的 Modal 实现)
// 根因:Modal 新窗口在米电视上 D-pad 焦点不可靠(老板反复反馈"无法选中")——
// 本组件走应用根节点 absolute 覆盖层 + HDTouch 行(原生焦点链,遥控实测稳)
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { Icon } from '../theme/Icon';

export interface HDActionItem { label: string; danger?: boolean; onPress?: () => void; }
export interface HDActionReq {
  title: string;
  items?: HDActionItem[];
  /** 输入模式:弹输入行+确定(重命名等);与 items 可共存 */
  input?: { defaultValue?: string; placeholder?: string; onSubmit: (v: string) => void };
}

type Host = (req: HDActionReq | null) => void;
let host: Host | null = null;

export const hdActions = {
  menu(title: string, items: HDActionItem[]) { host?.({ title, items }); },
  prompt(title: string, opts: { defaultValue?: string; placeholder?: string; onSubmit: (v: string) => void }) {
    host?.({ title, input: opts });
  },
  confirm(title: string, message: string, onOk: () => void) {
    host?.({ title: title + (message ? `\n${message}` : ''), items: [{ label: '取消' }, { label: '确定', onPress: onOk }] });
  },
  close() { host?.(null); },
};

export function HDActionHost() {
  const [req, setReq] = useState<HDActionReq | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => { host = setReq; return () => { if (host === setReq) host = null; }; }, []);
  useEffect(() => { if (req?.input) setVal(req.input.defaultValue || ''); }, [req]);
  const close = () => setReq(null);
  if (!req) return null;
  const submit = () => { const v = val.trim(); close(); if (v) req.input?.onSubmit(v); };
  return (
    <View style={st.scrim} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} focusable={false} onPress={close} />
      <View style={st.panel}>
        <View style={st.head}>
          <Text style={st.title} numberOfLines={1}>{req.title}</Text>
          <HDTouch style={st.x} focusStyle={{ borderWidth: 1.5, borderColor: C.brand, borderRadius: 12 }} onPress={close}>
            <Icon name="close" size={13} color={C.text2} />
          </HDTouch>
        </View>
        {req.input ? (
          <View style={st.inputRow}>
            <TextInput
              style={st.input}
              value={val}
              onChangeText={setVal}
              placeholder={req.input.placeholder || ''}
              placeholderTextColor={C.text3}
              selectionColor={C.brand}
              autoFocus={false}
              focusable
              onSubmitEditing={submit}
            />
            <HDTouch style={st.okBtn} focusStyle={{ borderWidth: 2, borderColor: '#fff', borderRadius: 10 }} onPress={submit} hasTVPreferredFocus>
              <Text style={st.okText}>确定</Text>
            </HDTouch>
          </View>
        ) : null}
        {(req.items || []).map((it, i) => (
          <HDTouch
            key={it.label + i}
            style={st.row}
            focusStyle={{ borderWidth: 2, borderColor: it.danger ? '#FF6B6B' : C.brand, borderRadius: 11 }}
            focusBg={C.inset}
            hasTVPreferredFocus={!req.input && i === 0}
            onPress={() => { close(); it.onPress?.(); }}
          >
            <Text style={[st.rowText, it.danger && { color: '#FF6B6B' }]} numberOfLines={1}>{it.label}</Text>
          </HDTouch>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 },
  panel: { position: 'absolute', right: 60, top: 110, width: 340, maxHeight: 520, borderRadius: 18, backgroundColor: 'rgba(14,18,16,.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  title: { color: '#ffffffdd', fontSize: 14, fontWeight: '700', flex: 1 },
  x: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff14' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 42, borderRadius: 10, backgroundColor: '#ffffff10', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', paddingHorizontal: 12, color: '#ffffffee', fontSize: 13 },
  okBtn: { height: 42, borderRadius: 10, backgroundColor: C.brand, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  okText: { color: '#0b0f0d', fontSize: 12, fontWeight: '800' },
  row: { height: 44, borderRadius: 11, backgroundColor: '#ffffff0d', justifyContent: 'center', paddingHorizontal: 14 },
  rowText: { color: '#ffffffe0', fontSize: 13, fontWeight: '600' },
});
