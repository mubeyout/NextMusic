// hdweb:web 卡片 hover 共享设施(v1.2.6 老板:卡片要 hover 效果+投影不被裁切)
// useHoverCard——彩色弥散投影(webCardShadow)+hover 上浮/投影加深(.nm-card 160ms CSS 过渡);
// TV 端不 import 本文件的行为面(钩子返回值在原生侧恒空样式,但调用处均 IS_WEB 门控,双保险)
import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';


export function useHoverCard(seed: string, opts?: { lift?: number; scale?: number }) {
  const [hov, setHov] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elRef = useRef<unknown>(null);
  const lift = opts?.lift ?? 4;
  const scale = opts?.scale ?? 1.02;
  useEffect(() => {
    // React19 ref-as-prop → RNW View ref = DOM(坑131)——挂 .nm-card 过渡类
    const el = elRef.current as { classList?: { add: (c: string) => void } } | null;
    if (el?.classList) el.classList.add('nm-card');
  }, []);
  const onHoverIn = () => { if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setHov(true), 80); };
  const onHoverOut = () => { if (t.current) clearTimeout(t.current); setHov(false); };
  const cardStyle: Record<string, unknown> | null = Platform.OS === 'web'
    // 1028 老板令去投影后 hover 反馈(LEO 规范 A.1③):描边升档+位移收敛(-2/1.01),叠亮由 .nm-card CSS 承担
    ? { ...(hov ? { transform: [{ translateY: -2 }, { scale: 1.01 }], borderColor: 'rgba(255,255,255,.16)' } : null) }
    : null;
  return { hov, elRef, onHoverIn, onHoverOut, cardStyle };
}
