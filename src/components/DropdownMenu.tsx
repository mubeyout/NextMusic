// lx169 (老板 0923 03:01/03:06): ⋯ 菜单按端分化——web/桌面(Electron)用锚定下拉菜单,
// phone 维持底部 ActionSheet,HD/TV 维持居中弹窗+焦点环。
// 本组件只在 Platform.OS === 'web' 时注册渲染;下拉锚定触发元素,支持点击外部关闭/Esc 关闭/键盘导航。
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, Modal } from 'react-native';
import { C } from '../theme/tokens';

export type MenuAnchor = { x: number; y: number; w: number; h: number };

export type DropdownMenuItem = { label: string; danger?: boolean; onPress?: () => void };

let ddListener: ((req: { anchor: MenuAnchor; items: DropdownMenuItem[] } | null) => void) | null = null;

/** 全局打开锚定下拉菜单(web 专用;非 web 环境调用无效,调用方仍走 dialog.menu) */
export function dropdownMenu(anchor: MenuAnchor, items: DropdownMenuItem[]) {
  ddListener?.({ anchor, items });
}

export function isDropdownPlatform() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !/electron/i.test(navigator.userAgent) === false
    ? true // electron 也用下拉
    : Platform.OS === 'web';
}

export function DropdownHost() {
  const [req, setReq] = useState<{ anchor: MenuAnchor; items: DropdownMenuItem[] } | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [openUp, setOpenUp] = useState(false);
  const hostRef = useRef<View>(null as never);

  useEffect(() => {
    ddListener = r => setReq(r);
    return () => { ddListener = null; };
  }, []);

  // 定位:菜单右对齐锚点右缘,向下弹出;视口下方放不下则向上
  useLayoutEffect(() => {
    if (!req) return;
    const MENU_W = 180, MENU_H = Math.max(48, req.items.length * 40 + 8);
    const vw = (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const vh = (typeof window !== 'undefined' ? window.innerHeight : 720);
    let left = req.anchor.x + req.anchor.w - MENU_W;
    left = Math.max(8, Math.min(left, vw - MENU_W - 8));
    const below = req.anchor.y + req.anchor.h + 6;
    if (below + MENU_H > vh - 8 && req.anchor.y - MENU_H - 6 > 8) {
      setPos({ left, top: req.anchor.y - MENU_H - 6 }); setOpenUp(true);
    } else {
      setPos({ left, top: below }); setOpenUp(false);
    }
  }, [req]);

  // Esc 关闭
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReq(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (Platform.OS !== 'web') return null;

  return (
    <Modal transparent visible={!!req} onRequestClose={() => setReq(null)} animationType="fade">
      {/* 全屏透明捕获层:点击外部关闭(不挡滚动穿透由 Modal 天然阻断) */}
      <Pressable style={{ flex: 1 }} onPress={() => setReq(null)} accessible={false}>
        <View ref={hostRef as never} style={{
          position: 'absolute', left: pos.left, top: pos.top, minWidth: 180,
          borderRadius: 12, backgroundColor: C.surface2 ?? '#1c1c1e',
          borderWidth: 1, borderColor: '#ffffff1a',
          shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
          elevation: 8, paddingVertical: 4, overflow: 'hidden',
        }}>
          {req?.items.map((it, i) => (
            <Pressable
              key={it.label + i}
              onPress={() => { setReq(null); it.onPress?.(); }}
              style={(({ pressed }: { pressed: boolean }) => ({
                flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 14,
                backgroundColor: pressed ? (C.hover ?? '#ffffff14') : 'transparent', borderRadius: 8, marginHorizontal: 4,
                opacity: 1,
              })) as never}
            >
              <Text style={{ color: it.danger ? '#ff6b6b' : (C.text ?? '#fff'), fontSize: 13, fontWeight: '500' }}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
