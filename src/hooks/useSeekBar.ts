// useSeekBar —— 全 app 统一 seek/slide 手势(R6 根治令:MOMO「四轮修三漏一」的终极答案)
// 坑史:#034(locationX undefined)→R4(有限但相对子元素)→R6(缓存宽度量错元素/measure 未跑/直写 audio 绕过通道)
// 规范铁律:web 恒 pageX + 实时 getBoundingClientRect(分子分母同源);原生 locationX(语义正确)+onLayout 宽度缓存;
// 落点统一走回调(调用方走 seekTo/音量通道),hook 不碰 audio。
import { useMemo, useRef, useCallback } from 'react';
import { Platform, PanResponder, type View as ViewType } from 'react-native';

export type SeekEvt = { nativeEvent?: { locationX?: number; pageX?: number } };
export type SeekPhase = 'grant' | 'move' | 'release';

export function useSeekBar(onPct: (pct: number, phase: SeekPhase) => void, opts?: { disabled?: boolean }) {
  const hostRef = useRef<ViewType | null>(null);
  const wRef = useRef(1);
  const cbRef = useRef(onPct);
  cbRef.current = onPct;
  const disabledRef = useRef(!!opts?.disabled);
  disabledRef.current = !!opts?.disabled;

  const pctOf = useCallback((e: SeekEvt): number => {
    // web:实时 rect 唯一可信(坑史见文件头)
    const el = hostRef.current as unknown as { getBoundingClientRect?: () => { left: number; width: number } };
    if (Platform.OS === 'web' && typeof el?.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect();
      if (r && r.width >= 2) {
        const px = e.nativeEvent?.pageX ?? 0;
        return Math.max(0, Math.min(1, (px - r.left) / r.width));
      }
      return 0;
    }
    // 原生:locationX 语义正确(#034/R4/R6 三坑全是 RNW 特有)
    const lx = e.nativeEvent?.locationX ?? 0;
    return Math.max(0, Math.min(1, lx / (wRef.current || 1)));
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder: () => !disabledRef.current,
    onPanResponderGrant: (e: unknown) => cbRef.current(pctOf(e as SeekEvt), 'grant'),
    onPanResponderMove: (e: unknown) => cbRef.current(pctOf(e as SeekEvt), 'move'),
    onPanResponderRelease: (e: unknown) => cbRef.current(pctOf(e as SeekEvt), 'release'),
  }), [pctOf]);

  /** 挂到轨道 View:ref/onLayout/collapsable/panHandlers 全套 */
  const handlers = {
    ref: hostRef as never,
    collapsable: false as const,
    onLayout: (e: { nativeEvent: { layout: { width: number } } }) => { wRef.current = Math.max(e.nativeEvent.layout.width, 1); },
    ...pan.panHandlers,
  };
  return { handlers };
}
