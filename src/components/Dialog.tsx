// 全局命令式弹窗 & Toast：深色主题，替代系统 Alert
// 用法：dialog.alert(title, message?, buttons?) / dialog.confirm(title, message, onOk) / toast(msg)
// <DialogHost /> 挂在 App 根部
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, TextInput } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';

// 触点抽象:HD(TV/车机)用 HDTouch(D-pad 焦点环)——弹窗按钮遥控器可达(老板实测无法选中)
function DTouch(props: { style?: unknown; onPress?: () => void; children?: React.ReactNode; activeOpacity?: number } & Record<string, unknown>) {
  const { style, onPress, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} {...(rest as object)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} activeOpacity={0.75} {...(rest as object)}>
      {children}
    </TouchableOpacity>
  );
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme/tokens';

export interface DialogButton { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }

interface DialogReq {
  title: string;
  message?: string;
  buttons: DialogButton[];
  // ActionSheet 风格（底部弹出菜单）
  sheet?: boolean;
  // 输入框（prompt）
  input?: { placeholder?: string; defaultValue?: string; onSubmit: (v: string) => void };
}

type Listener = (req: DialogReq | null) => void;
let listener: Listener | null = null;

export const dialog = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    listener?.({
      title, message,
      buttons: buttons && buttons.length ? buttons : [{ text: '好' }],
    });
  },
  confirm(title: string, message: string, onOk: () => void, okText = '确定', cancelText = '取消') {
    listener?.({
      title, message,
      buttons: [
        { text: cancelText, style: 'cancel' },
        { text: okText, style: 'default', onPress: onOk },
      ],
    });
  },
  menu(title: string, items: { label: string; danger?: boolean; onPress?: () => void }[]) {
    listener?.({
      title, message: undefined, sheet: true,
      buttons: items.map(it => ({ text: it.label, style: it.danger ? ('destructive' as const) : ('default' as const), onPress: it.onPress })),
    });
  },
  prompt(title: string, opts: { placeholder?: string; defaultValue?: string; onSubmit: (v: string) => void }) {
    listener?.({
      title,
      message: undefined,
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => undefined }, // 实际提交在键盘/按钮统一处理
      ],
      input: { placeholder: opts.placeholder, defaultValue: opts.defaultValue, onSubmit: opts.onSubmit },
    });
  },
};

// ---------- Toast ----------
let toastListener: ((msg: string) => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string) {
  toastListener?.(msg);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastListener?.(''), 2200);
}

export function DialogHost() {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [tmsg, setTmsg] = useState('');
  const insets = useSafeAreaInsets();
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [inputVal, setInputVal] = useState('');

  useEffect(() => {
    listener = (r) => {
      setReq(r);
      if (r?.input) setInputVal(r.input.defaultValue || '');
    };
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    toastListener = (m) => {
      setTmsg(m);
      Animated.timing(toastAnim, {
        toValue: m ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };
    return () => { toastListener = null; };
  }, [toastAnim]);

  const close = (b: DialogButton) => {
    setReq(null);
    b.onPress?.();
  };

  const closeWithInput = (ok: boolean) => {
    const r = req;
    setReq(null);
    if (ok && r?.input) r.input.onSubmit(inputVal.trim());
  };

  const btnColor = (b: DialogButton) =>
    b.style === 'destructive' ? '#FF6B6B' : b.style === 'cancel' ? C.text2 : C.brand;

  // 按钮宽度规则：≤2 个（含 prompt）横向排列，flex:1 对半分（单个即占满整行）；3+ 个竖排各占一行
  const stacked = req ? !req.input && req.buttons.length > 2 : false;

  return (
    <>
      {req ? (
        req.sheet ? (
          // 底部菜单风格
          <Modal animationType="slide" transparent visible onRequestClose={() => setReq(null)}>
            <TouchableOpacity style={s.scrim} activeOpacity={1} focusable={false} onPress={() => setReq(null)}>
              <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
                <View style={s.handle} />
                {req.title ? <Text style={s.sheetTitle} numberOfLines={1}>{req.title}</Text> : null}
                {req.buttons.map(b => (
                  <DTouch key={b.text} style={s.sheetRow} onPress={() => close(b)}>
                    <Text style={[s.sheetRowText, { color: btnColor(b) }]}>{b.text}</Text>
                  </DTouch>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          // 居中对话框风格
          <Modal animationType="fade" transparent visible onRequestClose={() => setReq(null)}>
            <TouchableOpacity style={s.center} activeOpacity={1} focusable={false} onPress={() => setReq(null)}>
              <View style={s.card} onStartShouldSetResponder={() => true}>
                <Text style={s.cardTitle}>{req.title}</Text>
                {req.message ? <Text style={s.cardMsg}>{req.message}</Text> : null}
                {req.input ? (
                  <TextInput
                    style={s.input}
                    value={inputVal}
                    placeholder={req.input.placeholder}
                    placeholderTextColor={C.text3}
                    onChangeText={setInputVal}
                    autoFocus
                    selectTextOnFocus
                    onSubmitEditing={() => closeWithInput(true)}
                  />
                ) : null}
                <View style={[s.btnRow, !stacked && { flexDirection: 'row' }]}>
                  {req.input ? (
                    <>
                      <DTouch style={[s.btn, { flex: 1 }]} onPress={() => closeWithInput(false)}>
                        <Text style={s.btnText}>取消</Text>
                      </DTouch>
                      <DTouch style={[s.btn, { flex: 1 }, s.btnMain]} onPress={() => closeWithInput(true)}>
                        <Text style={[s.btnText, s.btnMainText]}>确定</Text>
                      </DTouch>
                    </>
                  ) : req.buttons.map((b, bi) => (
                    <DTouch
                      key={b.text}
                      style={[s.btn, !stacked && { flex: 1 }, b.style !== 'cancel' && s.btnMain]}
                      hasTVPreferredFocus={bi === 0}
                      onPress={() => close(b)}
                    >
                      <Text style={[s.btnText, b.style !== 'cancel' && s.btnMainText, b.style === 'destructive' && { color: '#FF6B6B' }]}>
                        {b.text}
                      </Text>
                    </DTouch>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
        )
      ) : null}

      {/* Toast */}
      {tmsg ? (
        <View style={s.toastWrap} pointerEvents="none">
          <Animated.View style={[s.toast, { opacity: toastAnim, marginBottom: insets.bottom + 84 }]}>
            <Text style={s.toastText} numberOfLines={2}>{tmsg}</Text>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.elev, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.handle, marginBottom: 10 },
  sheetTitle: { color: C.text2, fontSize: 12, lineHeight: 16, marginBottom: 6 },
  sheetRow: { minHeight: 54, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint },
  sheetRowText: { color: C.text, fontSize: 15, lineHeight: 21, fontWeight: '500', textAlign: 'center' },
  center: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: { width: '100%', maxWidth: 320, borderRadius: 16, backgroundColor: C.elev, padding: 20 },
  cardTitle: { color: C.text, fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  cardMsg: { color: C.text2, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'column', gap: 8, marginTop: 18 },
  btn: { height: 44, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: C.brand },
  btnText: { color: C.text, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  btnMainText: { color: C.onBrand },
  input: { backgroundColor: C.surface2, borderRadius: 10, color: C.text, fontSize: 14, paddingHorizontal: 14, height: 44, marginTop: 14 },
  toastWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end' },
  toast: { backgroundColor: '#2E2E2EF2', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, maxWidth: 300 },
  toastText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
