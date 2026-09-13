import React from 'react';
import { Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ICONS } from './icon-data';
import { BRAND_ICONS } from './brand-icons';
import { C } from './tokens';

// v3.26:recolor 结果缓存(xml 字符串引用稳定,SvgXml 不重解析)
const ICON_XML_CACHE = new Map<string, string>();

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
  const raw = ICONS[key] || ICONS[`${name}-default`];
  if (!raw) return null;
  // v3.26(老板:页面定时抖):recolor+replace 每次生成新 xml 字符串→SvgXml 重新解析整棵 svg 重挂
  // (侧栏/页面 100+ 图标每 3s 轮询重渲全部闪一遍)——按 图标键+色值 缓存结果,引用稳定后 SvgXml 零重挂
  const tint = color ?? (active ? C.brand : C.text);
  const cacheKey = key + '|' + tint;
  let xml = ICON_XML_CACHE.get(cacheKey);
  if (!xml) {
    xml = recolor(raw, tint);
    // v1.2.5 桌面:部分图标 xml 烘了 width/height 属性——RNW 下 svg 高度会吃 xml 属性(实测 16×24,
    // 「为我推荐」active 图标下坠 5px 的真因)。web 剥掉,让 props 的 width/height 独占;原生不受影响
    if (Platform.OS === 'web') xml = xml.replace(/<svg\s([^>]*?)\s*(width="\d+"\s+height="\d+")/, '<svg $1');
    ICON_XML_CACHE.set(cacheKey, xml);
  }
  return <SvgXml xml={xml} width={size} height={size} />;
}

// ---- Brand icons (no recolor) ----

export type BrandIconName = 'netease' | 'qqmusic' | 'kugou' | 'kuwo' | 'migu' | 'emby' | 'jellyfin' | 'navidrome' | 'subsonic' | 'webdav';

export function BrandIcon({ name, size = 24 }: { name: BrandIconName; size?: number }) {
  const xml = BRAND_ICONS[name];
  if (!xml) return null;
  // 道理鱼: webp 位图(官方 logo)——SvgXml 不适用,走 Image dataURI
  if (xml.startsWith('data:')) {
    const { Image } = require('react-native');
    return <Image source={{ uri: xml }} style={{ width: size, height: size, borderRadius: Math.round(size / 5) }} />;
  }
  return <SvgXml xml={xml} width={size} height={size} />;
}
