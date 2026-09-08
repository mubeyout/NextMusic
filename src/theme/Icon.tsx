import React from 'react';
import { Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ICONS } from './icon-data';
import { BRAND_ICONS } from './brand-icons';
import { C } from './tokens';

export type IconName =
  | 'home' | 'explore' | 'my' | 'search' | 'play' | 'pause' | 'more' | 'back'
  | 'chevronright' | 'download' | 'devices' | 'settings' | 'shuffle' | 'repeat'
  | 'queue' | 'previous' | 'next' | 'sliders' | 'headphones' | 'music' | 'close'
  | 'heart' | 'add' | 'volume' | 'phone' | 'speaker' | 'tv' | 'comments'
  | 'check' | 'status' | 'user' | 'server'
  | 'palette' | 'cloud' | 'globe' | 'wave' | 'info' | 'folder' | 'refresh' | 'trash'
  | 'podcast' | 'ranking' | 'history' | 'fullscreen' | 'edit';

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
  // 未显式传色：active 变体跟随主题品牌色；default 跟随正文色（深色=#FFFFFF 与原图一致，浅色=深色图标）
  xml = recolor(xml, color ?? (active ? C.brand : C.text));
  // v1.2.5 桌面:部分图标 xml 烘了 width/height 属性——RNW 下 svg 高度会吃 xml 属性(实测 16×24,
  // 「为我推荐」active 图标下坠 5px 的真因)。web 剥掉,让 props 的 width/height 独占;原生不受影响
  if (Platform.OS === 'web') xml = xml.replace(/<svg\s([^>]*?)\s*(width="\d+"\s+height="\d+")/, '<svg $1');
  return <SvgXml xml={xml} width={size} height={size} />;
}

// ---- Brand icons (no recolor) ----

export type BrandIconName = 'netease' | 'qqmusic' | 'kugou' | 'kuwo' | 'migu' | 'emby' | 'jellyfin' | 'navidrome' | 'subsonic' | 'webdav';

export function BrandIcon({ name, size = 24 }: { name: BrandIconName; size?: number }) {
  const xml = BRAND_ICONS[name];
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}
