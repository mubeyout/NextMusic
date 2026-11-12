import React from 'react';
import { Platform, Image as RNImage } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ICONS } from './icon-data';
import { BRAND_ICONS } from './brand-icons';
import { C } from './tokens';

// v3.26:recolor 结果缓存(xml 字符串引用稳定,SvgXml 不重解析)
const ICON_XML_CACHE = new Map<string, string>();

// [1107 老板报:HD/web 侧栏图标视觉大小不齐] 光学归一层——
// 图标库混两种网格: Figma 24vb(实测占幅 15~18.5/24) + iconpark 48vb(占幅 38~40/48),
// 同 size=16 渲染视觉直径 10.0(heart)~13.3(podcast)px,极差 33%。按 bbox 实测补偿到统一 ≈11.5px。
// 数据: icon-bbox.py 量化(1107),LEO 可复核系数
const OPTICAL: Partial<Record<string, number>> = {
  // 48vb 组(占幅偏大 → 压) [KAI 1107 修:LEO 行尾注释吞键——history/user 被注释吃掉致运行时无补偿,按 LEO 意图恢复独立行]
  podcast: 0.87, ranking: 0.89, library: 0.91, 'folder-music': 0.85, // [LEO 1107 实测13px->12]
  history: 0.87,
  // 24vb 组占幅偏小 → 放;偏大 → 压;≈中位 → 1.0
  heart: 1.15, explore: 1.1, search: 1.1, download: 1.1,
  music: 1.0, // [LEO 1107 实测13px->12]
  user: 0.97, // [LEO 1107 实测13px->12]
  globe: 0.89, // [LEO 1107 实测13px->12]
  cloud: 0.94, server: 0.91, // [LEO 1107 实测13px->12]
  settings: 0.98,
};
// 48vb iconpark 组线宽归一: library/folder-music sw=4 → 3(与 podcast/ranking/history 一致;16px 渲染线宽 1.0px)
const SW48_NORMALIZE = new Set(['podcast', 'ranking', 'library', 'folder-music', 'history']);

export type IconName =
  | 'home' | 'explore' | 'my' | 'search' | 'play' | 'pause' | 'more' | 'back'
  | 'chevronright' | 'download' | 'devices' | 'settings' | 'shuffle' | 'repeat' | 'sun' | 'moon'
  | 'queue' | 'previous' | 'next' | 'sliders' | 'headphones' | 'music' | 'close'
  | 'heart' | 'add' | 'volume' | 'phone' | 'speaker' | 'tv' | 'comments'
  | 'check' | 'status' | 'user' | 'server'
  | 'palette' | 'cloud' | 'globe' | 'wave' | 'info' | 'folder' | 'refresh' | 'trash'
  | 'artist' // [老板 1110] 歌手行专属(唱片+唱针),播放页 singer 前缀用
  | 'podcast' | 'ranking' | 'history' | 'fullscreen' | 'edit'
  | 'folder-music' | 'file-question' | 'shield' | 'library' // ②本机曲库(LEO v2.1:iconpark folder-music 同形手绘)+④公共曲库(library,icon-data 家族手绘)
  | 'cloud-check' | 'upload' | 'wifi-off'; // cloud-library(spec③):双在角标/上传动作/离线横幅

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
    if (SW48_NORMALIZE.has(name)) xml = xml.replace(/stroke-width="4"/g, 'stroke-width="3"'); // [1107] 48vb 组线宽统一
    // v1.2.5 桌面:部分图标 xml 烘了 width/height 属性——RNW 下 svg 高度会吃 xml 属性(实测 16×24,
    // 「为我推荐」active 图标下坠 5px 的真因)。web 剥掉,让 props 的 width/height 独占;原生不受影响
    if (Platform.OS === 'web') xml = xml.replace(/<svg\s([^>]*?)\s*(width="\d+"\s+height="\d+")/, '<svg $1');
    ICON_XML_CACHE.set(cacheKey, xml);
  }
  const opt = OPTICAL[name]; // [1107] 光学归一:补偿后的实际渲染尺寸
  const sz = opt ? size * opt : size;
  return <SvgXml xml={xml} width={sz} height={sz} />;
}

// ---- Brand icons (no recolor) ----

export type BrandIconName = 'netease' | 'qqmusic' | 'kugou' | 'kuwo' | 'migu' | 'emby' | 'jellyfin' | 'navidrome' | 'subsonic' | 'webdav' | 'tingfeng'
  | 'plex' | 'audiobookshelf' | 'audiostation' | 'mstream' | 'songloft' | 'feiniu' | 'daoliyu';

// PNG 品牌图（Amcfy APK 提取，src/assets/brands/）——SvgXml 不适用，走 Image source
const PNG_BRANDS: Partial<Record<BrandIconName, any>> = {
  plex: require('../assets/brands/plex.png'),
  audiobookshelf: require('../assets/brands/audiobookshelf.png'),
  audiostation: require('../assets/brands/audiostation.png'),
  mstream: require('../assets/brands/mstream.png'),
  songloft: require('../assets/brands/songloft.png'),
  feiniu: require('../assets/brands/feiniu.png'),
  daoliyu: require('../assets/brands/daoliyu.png'),
  tingfeng: require('../assets/brands/tingfeng.png'),
  // [audit 20260921 老板实锤「菜单icon与添加时对不上」]:以下五类有品牌 PNG 但未登记,菜单回退灰色 SVG 云朵/音符——与添加页彩 PNG 两张皮;
  // 全量登记后 BrandIcon 恒优先 PNG,添加页(TYPE_CARDS logo)与菜单同源
  navidrome: require('../assets/brands/navidrome.png'),
  emby: require('../assets/brands/emby.png'),
  jellyfin: require('../assets/brands/jellyfin.png'),
  subsonic: require('../assets/brands/subsonic.png'),
  webdav: require('../assets/brands/webdav.png'),
};

export function BrandIcon({ name, size = 24 }: { name: BrandIconName; size?: number }) {
  const png = PNG_BRANDS[name];
  if (png) {
    return <RNImage source={png} style={{ width: size, height: size, borderRadius: Math.round(size / 5) }} resizeMode="contain" />;
  }
  const xml = BRAND_ICONS[name];
  if (!xml) return null;
  // 道理鱼: webp 位图(官方 logo)——SvgXml 不适用,走 Image dataURI
  if (xml.startsWith('data:')) {
    return <RNImage source={{ uri: xml }} style={{ width: size, height: size, borderRadius: Math.round(size / 5) }} />;
  }
  return <SvgXml xml={xml} width={size} height={size} />;
}
