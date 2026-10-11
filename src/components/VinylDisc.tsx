// 唱片盘体(共享)——v3.39(老板 1011 三稿):盘体换 brand 位图 clover.png(1024²,中心 625² 圆形透明窗)
// 封面垫在盘图下层穿窗显示(老板设计/测量,勿复验);无封面回退深色盘心;
// SVG 几何绘制退役(历史规格见 v3.38 的 VINYL_SPEC)——「位图盘面禁令」在此为老板亲定资产开例外
import React from 'react';
import { View, Image } from 'react-native';

const WIN = 625 / 1024; // 中心透明窗直径/盘径(老板测量)

/**
 * v3.39 位图黑胶。img = 歌曲封面(垫底穿透明窗);无图回退深色圆。
 * 旋转归调用方:phone/TV=外层 Animated rotate,HD/web=nm-vinyl-spin CSS。
 */
export function VinylDisc({ size, img }: { size: number; img?: string }) {
  const w = size * WIN;
  const win = {
    position: 'absolute' as const,
    left: (size - w) / 2, top: (size - w) / 2, width: w, height: w, borderRadius: w / 2,
  };
  return (
    <View style={{ width: size, height: size }}>
      {img ? (
        <Image source={{ uri: img }} style={win} resizeMode="cover" />
      ) : (
        <View style={[win, { backgroundColor: '#141414' }]} />
      )}
      {/* 盘体位图(上层):中心透明窗露封面,中心小实心图案压在封面上 */}
      <Image source={require('../assets/disc/clover.png')} style={{ width: size, height: size }} resizeMode="stretch" />
    </View>
  );
}
