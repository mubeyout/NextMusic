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
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

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
export function VinylDisc({ size, children, gradientId = 'vd', sheen = true }: {
  size: number;
  children?: React.ReactNode;
  /** 同屏多实例时的渐变 id 前缀(默认单实例够用) */
  gradientId?: string;
  /** 偏心 sheen 开关(验收裁撤用) */
  sheen?: boolean;
}) {
  const spec = vinylDiscSpec(size);
  const { center: c, radius: R } = spec;
  const baseId = `${gradientId}Base`;
  const sheenId = `${gradientId}Sheen`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={baseId} cx="50%" cy="50%" r="50%">
            {VINYL_SPEC.baseStops.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </RadialGradient>
          {sheen ? (
            <RadialGradient id={sheenId} cx={VINYL_SPEC.sheen.cx} cy={VINYL_SPEC.sheen.cy} r={VINYL_SPEC.sheen.r}>
              {VINYL_SPEC.sheen.stops.map((s, i) => (
                <Stop key={i} offset={s.offset} stopColor="#FFFFFF" stopOpacity={String(s.opacity)} />
              ))}
            </RadialGradient>
          ) : null}
        </Defs>
        {/* 盘底 */}
        <Circle cx={c} cy={c} r={R} fill={`url(#${baseId})`} />
        {/* 细胶纹(程序化循环) */}
        {spec.fineGrooves.map((r, i) => (
          <Circle key={`f${i}`} cx={c} cy={c} r={r} fill="none"
            stroke={VINYL_SPEC.fine.stroke} strokeOpacity={VINYL_SPEC.fine.opacity} strokeWidth={VINYL_SPEC.fine.width} />
        ))}
        {/* 宽纹带 */}
        {spec.wideBands.map((r, i) => (
          <Circle key={`w${i}`} cx={c} cy={c} r={r} fill="none"
            stroke={VINYL_SPEC.wide.stroke} strokeOpacity={VINYL_SPEC.wide.opacity} strokeWidth={VINYL_SPEC.wide.width} />
        ))}
        {/* 盘缘内描边 */}
        <Circle cx={c} cy={c} r={spec.rimR} fill="none"
          stroke={VINYL_SPEC.rim.stroke} strokeOpacity={VINYL_SPEC.rim.opacity} strokeWidth={VINYL_SPEC.rim.width} />
        {/* 偏心 sheen(裁量保留,让旋转可见) */}
        {sheen ? <Circle cx={c} cy={c} r={R} fill={`url(#${sheenId})`} /> : null}
      </Svg>
      {children}
    </View>
  );
}
