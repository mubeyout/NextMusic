// HDTouch:HD 全场景可聚焦触点(TV 遥控/车机旋钮 D-pad 友好)
// 关键:必须用 Pressable 而非 TouchableOpacity —— RN 0.87 的 TouchableOpacity 会把
// onFocus/onBlur 从 View props 里剥掉(backward-compat),Android TV 焦点环收不到事件(实测坑)
// Pressable 会把 focus/blur 事件原样挂到 View,BaseViewManager 原生派发 topFocus/topBlur。
import React, { useState } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { C } from './hdtokens';

type Props = React.ComponentProps<typeof Pressable> & {
  /** 聚焦时附加样式;不传 = 默认品牌绿描边环;传 false = 无视觉 */
  focusStyle?: false | ViewStyle | ViewStyle[];
  activeOpacity?: number;
};

export function HDTouch({ style, focusStyle, activeOpacity = 0.8, children, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      focusable
      {...rest}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }: { pressed: boolean }) => [
        style as ViewStyle | ViewStyle[] | undefined,
        pressed && { opacity: activeOpacity },
        focus && (focusStyle === undefined ? st.ring : focusStyle === false ? null : focusStyle),
      ]}
    >
      {children}
    </Pressable>
  );
}

const st = StyleSheet.create({
  // borderWidth 在 RN 里不改变盒子外尺寸,不会引起布局跳动
  ring: { borderWidth: 3, borderColor: C.brand, borderRadius: 14 },
});
