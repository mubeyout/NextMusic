// 唱片盘体(共享)——landing draft-2 规格的 SVG 复刻
// 设计源:NextMusic-design/landing/draft-2.html .vinyl/.disc(行 136-152)
//   盘底 radial:#171717 → #0e0e0e 60% → #191919 95% → #060606 100%
//   细胶纹:白 5% alpha,0.9px 刻痕/3.1px 节距(≈40+ 圈,程序化循环生成)
//   宽纹带:黑 22% alpha,1.2px/36px 节距
//   盘缘内描边:白 6% 1px inset 环
//   外阴影(0 24px 70px 黑 55%)属容器层,由调用方 View 施加
// 裁量点(给 LEO 验收裁):保留一道低幅偏心 sheen(白 4%→0)随盘旋转——
//   纯对称纹理(胶纹圈)旋转无感知,去掉 sheen 后转动不可见
// 双端几何单一真源:phone 端经本组件(react-native-svg);
//   HD/web 端因 RNW+svg shim React#130 历史坑直出 DOM(HDPlayer 内),
//   但半径序列/渐变规格一律取 vinylDiscSpec/VINYL_SPEC,勿在调用方手写胶纹
import React from 'react';
import { View, Image } from 'react-native';

/** [老板 1010] Amcfy 真盘(820×820 透明底,APK 提取;源 NextMusic-design/docs/mockups/assets/disc.webp)——播放条/双端播放页共用单源 */
export const DISC_IMG = require('../assets/disc.webp');

/** draft-2 .disc 三层渐变的参数化(两端共用,单源) */
export const VINYL_SPEC = {
  baseStops: [
    { offset: '0', color: '#171717' },
    { offset: '0.6', color: '#0e0e0e' },
    { offset: '0.95', color: '#191919' },
    { offset: '1', color: '#060606' },
  ],
  fine: { stroke: '#FFFFFF', opacity: 0.05, width: 0.9, pitch: 3.1 }, // 细胶纹(白5% 0.9px/3.1px)
  wide: { stroke: '#000000', opacity: 0.22, width: 1.2, pitch: 36 }, // 宽纹带(黑22% 1.2px/36px)
  rim: { stroke: '#FFFFFF', opacity: 0.06, width: 1, inset: 1 }, // 盘缘内描边(inset 1px 环)
  sheen: {
    // 偏心低幅 sheen:白 4%→0;cx/cy/r 用百分比(RN-SVG 与 DOM 语义一致)
    cx: '36%', cy: '30%', r: '95%',
    stops: [
      { offset: '0', opacity: 0.04 },
      { offset: '0.5', opacity: 0.015 },
      { offset: '1', opacity: 0 },
    ],
  },
} as const;

/** repeating-radial 的 Circle 等价:纹带 [0,width) 起,每 pitch 重复;止于盘缘描边带内侧 */
function ringRadii(radius: number, width: number, pitch: number): number[] {
  const out: number[] = [];
  const limit = radius - VINYL_SPEC.rim.inset - width / 2;
  for (let r = width / 2; r <= limit; r += pitch) out.push(r);
  return out;
}

export interface VinylDiscSpec {
  size: number;
  center: number;
  radius: number;
  /** 细胶纹半径序列(size=270 → 43 圈) */
  fineGrooves: number[];
  /** 宽纹带半径序列(size=270 → 4 道) */
  wideBands: number[];
  /** 盘缘内描边环半径 */
  rimR: number;
}

/** 按 size 生成盘体几何(双端同源:phone 组件与 HD/web DOM 版都吃这份) */
export function vinylDiscSpec(size: number): VinylDiscSpec {
  const radius = size / 2;
  return {
    size,
    center: radius,
    radius,
    fineGrooves: ringRadii(radius, VINYL_SPEC.fine.width, VINYL_SPEC.fine.pitch),
    wideBands: ringRadii(radius, VINYL_SPEC.wide.width, VINYL_SPEC.wide.pitch),
    rimR: radius - VINYL_SPEC.rim.inset + VINYL_SPEC.rim.width / 2,
  };
}

/**
 * draft-2 唱片盘体。children = 盘心封面槽(位置/裁切由调用方传入,本组件只管盘体)。
 * 旋转机制也归调用方:phone=外层 Animated rotate,HD/web=nm-vinyl-spin CSS。
 */
export function VinylDisc({ size, children }: {
  size: number;
  children?: React.ReactNode;
}) {
  // [老板 1010] 真盘换皮:只换黑胶盘体(draft-2 几何退役→Amcfy 真盘图);封面仍由 children 提供嵌在盘心(老板令:只换黑胶唱片,封面要留);VINYL_SPEC/vinylDiscSpec 保留供 HDPlayer label 几何用
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Image source={DISC_IMG} style={{ width: size, height: size }} resizeMode="cover" />
      {children}
    </View>
  );
}
