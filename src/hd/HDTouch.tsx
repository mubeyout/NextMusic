// HDTouch:HD 全场景可聚焦触点(TV 遥控/车机旋钮 D-pad 友好)
// 关键:必须用 Pressable 而非 TouchableOpacity —— RN 0.87 的 TouchableOpacity 会把
// onFocus/onBlur 从 View props 里剥掉(backward-compat),Android TV 焦点环收不到事件(实测坑)
// Pressable 会把 focus/blur 事件原样挂到 View,BaseViewManager 原生派发 topFocus/topBlur。
//
// v4:焦点环自动贴附 —— 从元素自身样式读 borderRadius,环与元素同圆角(老板反馈「描边不贴附」);
//     可选 glow(聚焦时彩色弥散投影)与 focusBg(选中态背景提亮)。
// v1.2.6 桌面(老板:选中改 hover 不需要描边):web 端焦点环/glow 全部不渲染(点击出现绿框=TV 交互),
//     新增 hoverBg prop——web hover 时背景提亮(桌面态);TV 端零变化。
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { C, TV_LOW_GPU } from './hdtokens';
const IS_WEB = Platform.OS === 'web';
type Props = React.ComponentProps<typeof Pressable> & {
  /** 聚焦时附加样式;不传 = 自动贴附环(元素圆角 + 2px 品牌描边);传 false = 无视觉;仅 TV 渲染 */
  focusStyle?: false | ViewStyle | ViewStyle[];
  /** 聚焦时背景提亮色(选中态);默认不动背景 */
  focusBg?: string;
  /** 聚焦时弥散投影(RN boxShadow 字符串,如 SH.brand);TV 低 GPU 自动忽略 */
  glow?: string;
  /** lx87:聚焦放大悬浮(TV 卡片标准交互)——transform scale 不占布局+投影抬升;如 1.06 */
  zoom?: number;
  /** lx132:彩色弥散光晕(描边式,替代不稳定的 boxShadow)——传 haloOf(seed) 结果 */
  haloColor?: string;
  /** v1.2.6 web:hover 背景色(桌面选中态;TV 忽略) */
  hoverBg?: string | false;
  activeOpacity?: number;
  /** lx170(动效 standard 档):web 按压缩放(行类大面积交互用更轻的 0.985,钮类默认 0.97);TV 忽略 */
  pressScale?: number;
};

export function HDTouch({ style, focusStyle, focusBg, glow, zoom, haloColor, hoverBg, activeOpacity = 0.8, pressScale = 0.97, children, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  const [hov, setHov] = useState(false);
  const flat = (StyleSheet.flatten(style as ViewStyle | ViewStyle[]) || {}) as { borderRadius?: number };
  // v6(lx75b): border 环(米电视渲染稳定) + padding 负补偿抵消 border 占位——环外扩 2px 描边,内容零位移
  // v5 overlay 在米电视 Pressable 内不渲染(同 overflow 裁剪家族 bug),废弃
  const baseRing: ViewStyle = { borderWidth: 2, borderColor: 'transparent', borderRadius: (flat.borderRadius ?? 12) + (haloColor ? 6 : 0) };
  const autoRing: ViewStyle = { borderColor: C.brand }; // lx142:常驻透明描边,聚焦只换色——布局/outline 恒定,无残框
  const haloStyle: ViewStyle | null = null;
  // v1.2.6:合并外部 hover 处理器(PlCardWeb 等自管 hover 的组件)
  const restIn = rest.onHoverIn as (() => void) | undefined;
  const restOut = rest.onHoverOut as (() => void) | undefined;
  if (IS_WEB) { delete rest.onHoverIn; delete rest.onHoverOut; }
  return (
    <Pressable
      focusable
      {...rest}
      {...(IS_WEB ? {
        onHoverIn: () => { setHov(true); restIn?.(); },
        onHoverOut: () => { setHov(false); restOut?.(); },
      } : {})}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }: { pressed: boolean }) => [
        style as ViewStyle | ViewStyle[] | undefined,
        baseRing,
        haloStyle,
        pressed && { opacity: activeOpacity },
        // v1.2.11 桌面按压反馈:轻微缩底(hover 上浮/平铺都可叠加,松手即回)——TV 零变化
        // lx170:pressScale 可调(行 0.985/钮 0.97,动效 standard 档)
        pressed && IS_WEB && { transform: [{ scale: pressScale }] },
        // v1.2.6 桌面:hover 背景(选中态)——不需要描边
        IS_WEB && hov && hoverBg != null && hoverBg !== false && { backgroundColor: hoverBg },
        // TV:焦点环/glow/zoom(原逻辑零变化;web 全部不渲染)
        !IS_WEB && focus && (focusStyle === undefined ? autoRing : focusStyle === false ? null : focusStyle),
        !IS_WEB && focus && zoom != null && { transform: [{ scale: zoom }] }, // lx129:transform 仅聚焦时挂——常驻 scale(1) 强制硬件层,Android boxShadow 投影消失真凶(彩色弥散投影随卡保留,不另加暗影)
        !IS_WEB && focus && focusBg != null && { backgroundColor: focusBg },
        !IS_WEB && focus && glow != null && !TV_LOW_GPU && { boxShadow: glow },
      ]}
    >
      {children}
    </Pressable>
  );
}

// lx133:双层弥散光晕(替代 border 描边——老板:光晕效果太差)——两层圆角半透明层由内向外渐隐,
// 纯 View 自绘(米电视 boxShadow 不稳定),wrapper padding 保证不裁切
export function HDHalo({ color, radius = 12, pad = 12, children }: {
  color: string; radius?: number; pad?: number; children: React.ReactNode;
}) {
  // rgba(r,g,b,A) → 基色前缀
  const m = color.match(/^(rgba\([^)]*?),[\d.]+\)$/);
  const base = m ? m[1] : 'rgba(120,120,120';
  return (
    <View style={{ padding: pad }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: pad - 7, left: pad - 7, right: pad - 7, bottom: pad - 7, borderRadius: radius + 7, backgroundColor: base + ',0.22)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius + pad, backgroundColor: base + ',0.08)' }} />
      {children}
    </View>
  );
}
