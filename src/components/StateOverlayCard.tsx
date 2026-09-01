import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../theme/tokens';

interface StateOverlayCardProps {
  glyph: string;
  glyphSize: number;
  title: string;
  body: string;
  primary: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  radius?: number;
  padV?: number;
  gap?: number;
}

export function StateOverlayCard({
  glyph, glyphSize, title, body,
  primary, secondary,
  onPrimary, onSecondary,
  radius = 16, padV = 36, gap = 12,
}: StateOverlayCardProps) {
  return (
    <View style={[s.card, { borderRadius: radius, paddingTop: padV, paddingBottom: padV, gap }]}>
      <Text style={[s.glyph, { fontSize: glyphSize }]}>{glyph}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      <TouchableOpacity style={s.primaryBtn} activeOpacity={0.85} onPress={onPrimary}>
        <Text style={s.primaryText}>{primary}</Text>
      </TouchableOpacity>
      {secondary ? (
        <TouchableOpacity style={s.secondaryBtn} activeOpacity={0.85} onPress={onSecondary}>
          <Text style={s.secondaryText}>{secondary}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.bg,
    paddingHorizontal: 24,
    alignItems: 'center',
    // caller handles absolute positioning + width
  },
  glyph: {
    color: C.brandText,
    fontWeight: '700',
  },
  title: {
    color: C.text,
    fontWeight: '700',
  },
  body: {
    color: C.text2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: C.onBrand,
    fontSize: 13,
    fontWeight: '500',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: C.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
