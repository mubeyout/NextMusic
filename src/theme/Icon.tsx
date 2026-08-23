import React from 'react';
import { SvgXml } from 'react-native-svg';
import { ICONS } from './icon-data';

export type IconName =
  | 'home' | 'explore' | 'my' | 'search' | 'play' | 'pause' | 'more' | 'back'
  | 'chevronright' | 'download' | 'devices' | 'settings' | 'shuffle' | 'repeat'
  | 'queue' | 'previous' | 'next' | 'sliders' | 'headphones' | 'music' | 'close'
  | 'heart' | 'add' | 'volume' | 'phone' | 'speaker' | 'tv' | 'comments'
  | 'check' | 'status' | 'user' | 'server';

// Figma semantic icons export two literal colors; map them to a requested color.
function recolor(xml: string, color?: string): string {
  if (!color) return xml;
  return xml
    .replace(/fill="(white|#FFFFFF|#ffffff|#1ED760)"/g, `fill="${color}"`)
    .replace(/stroke="(white|#FFFFFF|#ffffff|#1ED760)"/g, `stroke="${color}"`);
}

export function Icon({
  name,
  size = 24,
  active = false,
  color,
}: {
  name: IconName;
  size?: number;
  active?: boolean;
  color?: string;
}) {
  const key = `${name}-${active ? 'active' : 'default'}`;
  let xml = ICONS[key] || ICONS[`${name}-default`];
  if (!xml) return null;
  xml = recolor(xml, color);
  return <SvgXml xml={xml} width={size} height={size} />;
}
