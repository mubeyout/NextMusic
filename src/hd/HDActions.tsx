// HDActions:HD 专用页内操作面板(替代 dialog.menu/prompt/confirm 的 Modal 实现)
// 根因:Modal 新窗口在米电视上 D-pad 焦点不可靠(老板反复反馈"无法选中")——
// 本组件走应用根节点 absolute 覆盖层 + HDTouch 行(原生焦点链,遥控实测稳)
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, BackHandler, Dimensions, Modal } from 'react-native';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { Icon } from '../theme/Icon';

export interface HDActionItem { label: string; danger?: boolean; onPress?: () => void; icon?: string; }
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
    // lx159:confirm 生成项也带 icon(与 menu 统一;close/check 语义固定)
    host?.({ title: title + (message ? `\n${message}` : ''), items: [{ label: '取消', icon: 'close' }, { label: '确定', icon: 'check', onPress: onOk }] });
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
    <Modal transparent visible onRequestClose={close} animationType="none" statusBarTranslucent>
      <View style={st.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
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
              {it.icon ? <Icon name={it.icon as never} size={15} color={it.danger ? '#FF6B6B' : C.text2} /> : null}
              <Text style={[st.rowText, it.danger && { color: '#FF6B6B' }]} numberOfLines={1}>{it.label}</Text>
            </HDTouch>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 }, // lx150:捕捉器 focusable——光标脱离面板即关
  panel: { position: 'absolute', left: (Dimensions.get('window').width - 380) / 2, top: 180, width: 380, maxHeight: 560, borderRadius: 18, backgroundColor: C.elev, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8, elevation: 12 }, // lx130(老板):屏幕中间
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  title: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  x: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inset },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 42, borderRadius: 10, backgroundColor: C.inset, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, color: C.text, fontSize: 13 },
  okBtn: { height: 42, borderRadius: 10, backgroundColor: C.brand, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  okText: { color: '#0b0f0d', fontSize: 12, fontWeight: '800' },
  // lx159(老板):icon+文字左右排布(原默认 column 上下堆叠不合理);左对齐菜单范式
  row: { height: 44, borderRadius: 11, backgroundColor: C.inset, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 },
  rowText: { color: C.text, fontSize: 13, fontWeight: '600' },
});
