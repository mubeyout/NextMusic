// AzIndex —— A-Z 字母索引条(library-system-v2-ui-spec ⑤节第 4 条)
// 歌手/专辑/歌曲列表右缘快跳竖条:手机 20px 触区(pointer events 拖动连续跳/点击),当前字母高亮 +
// 28px surface2 圆角浮标;HD(TV/车机)分支:字母=可聚焦 HDTouch,遥控上下选、OK 确认,浮标居中反馈。
// '#' = 数字/符号/非字母归组(收尾)。
// 中文首字母:localeCompare('zh') 与 A-Z 边界比较近似定位拼音桶 —— 无逐字拼音 collator,
// 多音字/生僻字/非拼音文字(假名等)可能落邻桶或 '#',与 ⑥「标题 A-Z」排序(localeCompare)同口径,
// 保证条与列表序一致(诚实注释,不装精确拼音)。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  type LayoutChangeEvent, type PointerEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { focus } from '../hd/hdstyle';

/** 条上字母序:A-Z,'#'(非字母归组)收尾 */
const AZ_ORDER: string[] = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).concat('#');

/** 首字母分桶:ASCII 字母直取;数字/符号→'#';中文经 localeCompare('zh') 近似拼音桶 */
export function azBucketOf(name?: string | null): string {
  const s = (name || '').trim();
  if (!s) return '#';
  const ch = s[0];
  if (ch >= '0' && ch <= '9') return '#';
  if (ch >= 'A' && ch <= 'Z') return ch;
  if (ch >= 'a' && ch <= 'z') return ch.toUpperCase();
  // Z→A 找首个 s≥L 的拼音边界(ICU zh collation 按拼音排序的近似利用,非逐字拼音)
  for (let i = 25; i >= 0; i--) {
    const L = String.fromCharCode(65 + i);
    if (s.localeCompare(L, 'zh') >= 0) return L;
  }
  return '#';
}

/** 列表按首字母分组(通用):
 *  letters  = 条上字母(AZ_ORDER 序);
 *  chunks   = 字母分块(墙式列表渲染用;块内保持原列表相对顺序);
 *  firstIdx = 字母→列表内首项 index;firstIds = idOf→字母(平铺行首项包 onLayout 登记 y 用) */
export function azGroup<T>(list: readonly T[], nameOf: (t: T) => string, idOf?: (t: T) => string) {
  const chunks: { letter: string; items: T[] }[] = [];
  const at = new Map<string, number>();
  const firstIdx = new Map<string, number>();
  list.forEach((t, i) => {
    const L = azBucketOf(nameOf(t));
    let ci = at.get(L);
    if (ci == null) { ci = chunks.length; at.set(L, ci); chunks.push({ letter: L, items: [t] }); firstIdx.set(L, i); }
    else chunks[ci].items.push(t);
  });
  chunks.sort((a, b) => AZ_ORDER.indexOf(a.letter) - AZ_ORDER.indexOf(b.letter));
  const firstIds = new Map<string, string>();
  if (idOf) firstIdx.forEach((i, L) => firstIds.set(idOf(list[i]), L));
  return { letters: chunks.map(x => x.letter), chunks, firstIdx, firstIds };
}

/** 列表侧接线:ScrollView ref + 键控 onLayout 登记 + 跳转。
 *  key 加前缀区分同屏多列表/多态(如 'mgmt:B' / 'alb:#')。
 *  reg/jump:直接登记 y(RNW ResizeObserver 对挂载与尺寸变化会重放 onLayout,平铺行足够);
 *  regH/jumpSeq:按渲染顺序登记块高、跳转=前序块高累加 —— RNW 位置平移不重放 onLayout,
 *  追加分页撑高前块导致后块平移时直接 y 会 stale,自累加免疫(墙式分块用) */
export function useAzJump(topPad = 8) {
  // ref 类型同 SearchScreen 先例:RN 0.87 ScrollView 是函数组件,须取 ElementRef(实例带 scrollTo)
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const offs = useRef(new Map<string, number>());
  const hs = useRef(new Map<string, number>());
  const reg = useCallback((key: string) => (e: LayoutChangeEvent) => {
    offs.current.set(key, e.nativeEvent.layout.y);
  }, []);
  const regH = useCallback((key: string) => (e: LayoutChangeEvent) => {
    hs.current.set(key, e.nativeEvent.layout.height);
  }, []);
  const jump = useCallback((key: string) => {
    const y = offs.current.get(key);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - topPad), animated: true });
  }, [topPad]);
  /** 累加跳转:keys=按渲染顺序的全部分块 key;目标 y=前序块高之和 */
  const jumpSeq = useCallback((keys: string[], key: string) => {
    let y = 0;
    for (const k of keys) {
      if (k === key) break;
      y += hs.current.get(k) || 0;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, y - topPad), animated: true });
  }, [topPad]);
  return { scrollRef, reg, regH, jump, jumpSeq };
}

const CELL_H = IS_HD ? 17 : 13.5; // 字母格高(HD 大格可聚焦;手机密排)
const BUB = 28;                   // 浮标 28px(spec⑤-4:surface2 圆角)

// ── 组件 ──
// letters:条上字母(azGroup.letters);active:外部已知当前字母(不传=内部记最近选中);
// onPick:字母回调(拖动中逐字母连续触发);style:覆盖定位(默认右缘竖直居中)
export function AzIndex({ letters, active, onPick, style }: {
  letters: string[];
  active?: string;
  onPick: (letter: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [cur, setCur] = useState<string | null>(null);
  const [bub, setBub] = useState<string | null>(null); // 浮标字母(拖动/点选中显示,松手短暂停留)
  const bubT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef(false);
  const [h, setH] = useState(0); // 触区实测高(y→字母序号映射)
  const stripRef = useRef<React.ElementRef<typeof View>>(null);
  const baseY = useRef(0);       // 触区窗口坐标基线(measure;NativePointerEvent 无 locationY,用 pageY−基线换算)
  const shown = active ?? cur;

  useEffect(() => () => { if (bubT.current) clearTimeout(bubT.current); }, []);

  const pick = useCallback((l: string) => {
    setCur(l);
    if (bubT.current) clearTimeout(bubT.current);
    setBub(l);
    onPick(l);
  }, [onPick]);

  // 拖动结束:浮标短暂停留后收起
  const settle = useCallback(() => {
    drag.current = false;
    if (bubT.current) clearTimeout(bubT.current);
    bubT.current = setTimeout(() => setBub(null), 550);
  }, []);

  const locate = (y: number): string | null => {
    if (!h || !letters.length) return null;
    const i = Math.max(0, Math.min(letters.length - 1, Math.floor((y / h) * letters.length)));
    return letters[i];
  };
  const onDown = (e: PointerEvent) => {
    drag.current = true;
    const l = locate(e.nativeEvent.pageY - baseY.current);
    if (l) pick(l);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const l = locate(e.nativeEvent.pageY - baseY.current);
    if (l && l !== shown) pick(l);
  };

  if (!letters.length) return null;

  if (IS_HD) {
    // HD(TV/车机):字母=可聚焦触点(D-pad 上下逐格,OK=onPress),浮标居中反馈当前字母
    return (
      <View style={[s.hdWrap, style]} pointerEvents="box-none">
        <View style={s.hdCol}>
          {letters.map(l => (
            <HDTouch key={l} style={[s.hdCell, l === shown && s.cellOnBg]} focusStyle={focus(7)} onPress={() => pick(l)}>
              <Text style={[s.hdT, l === shown && s.cellOnT]}>{l}</Text>
            </HDTouch>
          ))}
        </View>
        {bub ? (
          <View style={[s.bub, s.bubHD]} pointerEvents="none">
            <Text style={s.bubT}>{bub}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // 手机/桌面 web:20px 触区竖条(pointer events;子元素 pointerEvents=none 保证 move 恒以条为 target,
  // locationY 稳定相对条;hitSlop 左向放宽容忍轻微出界拖动)
  const bubIdx = bub != null ? letters.indexOf(bub) : -1;
  const realCell = h && letters.length ? h / letters.length : CELL_H;
  return (
    <View style={[s.wrap, style]} pointerEvents="box-none">
      <View
        ref={stripRef}
        style={s.strip}
        onLayout={e => {
          setH(e.nativeEvent.layout.height);
          // 全屏壳无文档滚动,pageY≈窗口坐标;条不在 ScrollView 内,基线恒定(挂载/尺寸变化时重测)
          stripRef.current?.measure((_x: number, y: number) => { baseY.current = y; });
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onPointerLeave={settle}
        hitSlop={{ left: 12, right: 2, top: 6, bottom: 6 }}
      >
        {letters.map(l => (
          <Text key={l} style={[s.cell, l === shown && s.cellOn]} pointerEvents="none">{l}</Text>
        ))}
        {bub && bubIdx >= 0 ? (
          <View
            style={[s.bub, { top: Math.max(0, bubIdx * realCell - (BUB - realCell) / 2) }]}
            pointerEvents="none"
          >
            <Text style={s.bubT}>{bub}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // 手机:右缘贴边,竖直居中,20px 触区
  wrap: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 20, justifyContent: 'center', alignItems: 'center' },
  strip: { width: 20, alignItems: 'center', borderRadius: 999 },
  cell: { height: CELL_H, fontSize: 9, lineHeight: CELL_H, color: C.text3, fontWeight: '600', textAlign: 'center' },
  cellOn: { color: C.text, fontWeight: '900' },
  // HD:右缘大格,可聚焦
  hdWrap: { position: 'absolute', top: 0, bottom: 0, right: 8, justifyContent: 'center', alignItems: 'center' },
  hdCol: { gap: 1 },
  hdCell: { width: 26, height: CELL_H, borderRadius: 7, backgroundColor: 'rgba(255,255,255,.045)', alignItems: 'center', justifyContent: 'center' },
  hdT: { color: C.text3, fontSize: 9.5, fontWeight: '700' },
  cellOnBg: { backgroundColor: C.surface2 },
  cellOnT: { color: C.text, fontWeight: '900' },
  // 浮标:28px surface2 圆角(手机贴字母位,HD 居中)
  bub: {
    position: 'absolute', width: BUB, height: BUB, borderRadius: 10,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.stroke,
    alignItems: 'center', justifyContent: 'center',
  },
  bubT: { color: C.text, fontSize: 13, fontWeight: '800' },
  bubHD: { right: 44, top: '50%', marginTop: -BUB / 2 },
});
