import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../theme/tokens';

// [D1 WP2 · LEO spec §一] ProTag——PRO 档位徽标（去锁化：可见、可用路径清晰，永不置灰）
// 三态：暗金(默认)/亮金(亮色主题)/owned 绿(已解锁)
// 三尺寸：compact 16 / standard 18 / large 22
// 禁 emoji；文案硬编码 'PRO'（档位词非营销文案）

type ProTagVariant = 'default' | 'owned';

interface ProTagProps {
  variant?: ProTagVariant;
  size?: 'compact' | 'standard' | 'large';
}

const SIZES = {
  compact: { height: 16, fontSize: 8.5, paddingH: 5 },
  standard: { height: 18, fontSize: 10, paddingH: 7 },
  large: { height: 22, fontSize: 11.5, paddingH: 9 },
};

export function ProTag({ variant = 'default', size = 'standard' }: ProTagProps) {
  const s = SIZES[size];
  const owned = variant === 'owned';
  return (
    <View style={[
      st.tag,
      { height: s.height, paddingHorizontal: s.paddingH },
      owned ? st.owned : st.gold,
    ]}>
      <Text style={[{ fontSize: s.fontSize, fontWeight: '700', letterSpacing: 0.5 }, owned ? st.ownedText : st.goldText]}>
        PRO
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  // 暗金(默认)
  gold: {
    backgroundColor: 'rgba(232,185,77,0.14)',
    borderColor: 'rgba(232,185,77,0.45)',
  },
  goldText: {
    color: C.proGold || '#F0C75E',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // 已解锁(Pro 用户看到=已拥有)
  owned: {
    backgroundColor: 'rgba(30,215,96,0.12)',
    borderColor: 'rgba(30,215,96,0.35)',
  },
  ownedText: {
    color: C.brand,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
