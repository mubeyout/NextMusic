// CarTouch.tsx —— [D-pad 焦点系统 1107·车机规范] 车机旋钮/遥控焦点必须有视觉反馈(实测 TouchableOpacity 获焦零渲染差=盲转);Pressable+onFocus→brandDim 底+brand 描边,零布局位移(底色跟宿主圆角)
import React, { useState } from 'react';
import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { C } from '../theme/tokens';

export function CarTouch({ style, focusedStyle, onPress, disabled, children, ...tv }: {
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;  // 宿主自定义焦点态(默认 brandDim+brand 边)
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  [tvProp: string]: unknown;  // TV/车机专属 props(如 hasTVPreferredFocus)原样透传
}) {
  const [foc, setFoc] = useState(false);
  return (
    <Pressable
      focusable={!disabled}
      onPress={onPress}
      onFocus={() => setFoc(true)}
      onBlur={() => setFoc(false)}
      style={({ pressed }) => [style, foc && (focusedStyle ?? st.foc), pressed && { opacity: 0.85 }]}
      {...tv}>
      {children}
    </Pressable>
  );
}

const st = {
  // 默认焦点态:底色 brandDim(跟宿主 borderRadius)+brand 边框;无 borderWidth 变化=零布局位移
  foc: { backgroundColor: C.brandDim, borderColor: C.brand, borderWidth: 2 } as ViewStyle,
};

// hasTVPreferredFocus 兼容垫片:TV/车机环境首焦(非 TV no-op)
export const tvFirst = { hasTVPreferredFocus: true } as unknown as object;
export const __keepView = View; // 防 tree-shake 误删
