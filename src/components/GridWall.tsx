// GridWall —— [老板 1011 15:40 统一组件令] 内容墙容器(全站墙卡规格唯一源)
// HD/web = HDGrid 自适应密网格(探索 HDDiscover 同款 min=128×缩放,等宽整行填满);
// phone = 百分比三列流(与 Home/Explore 歌单网格同大小);
// cell 规约:phone 态 width '31%'(st.albumCell),HD/web 态叠加 width '100%'(st.albumCellFill 撑满 HDGrid 列宽)
import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDGrid } from '../hd/HDGrid';
import { H } from '../hd/hdtokens';
import { SP, GRID } from '../theme/tokens';

export function GridWall({ children, phoneGap = SP.xl }: { children: React.ReactNode; phoneGap?: number }) {
  if (IS_HD || Platform.OS === 'web') return <HDGrid min={GRID.hdMin * (H.font.sm / 10)}>{children}</HDGrid>;
  // 1105 老板实测(我的页自建歌单一屏一张):phone 分支缺列约束——fill 卡(width 100%)直接占满整行
  // → 每卡包一层 31% cell(三列,同 plCell 规格)
  return (
    <View style={wallSt.grid}>
      {React.Children.map(children, ch => (ch == null ? null : <View style={{ width: '31%' }}>{ch}</View>))}
    </View>
  );
}

const wallSt = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl },
});
