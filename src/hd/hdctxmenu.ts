// v1.2.4 D1(A3):右键菜单共享数据模型——TV/桌面共用 menuItems 结构
// 桌面渲染层由 desktop/src/ctxmenu.ts 注册 __nmCtxMenu(native 侧 undefined=调 no-op,TV 零侵入)
import type { SongItem } from '../services/server';

export interface CtxMenuItem {
  key?: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  shortcut?: string;
  children?: CtxMenuItem[];
  onPress?: () => void;
}

/** hover 行注册/注销菜单构造器——右键时 ctxmenu DOM 层取当前 hover 行的菜单(绕 RNW 不透传 onContextMenu) */
export function setHoverMenu(fn: (() => CtxMenuItem[]) | null) {
  (globalThis as never as { __nmHoverMenu?: (() => CtxMenuItem[]) | null }).__nmHoverMenu = fn;
}

/** 打开桌面右键菜单(web: DOM 浮层;native: no-op——TV 走自有 Overlays sheet) */
export function openCtxMenu(x: number, y: number, items: CtxMenuItem[]) {
  (globalThis as never as { __nmCtxMenu?: (x: number, y: number, items: CtxMenuItem[]) => void }).__nmCtxMenu?.(x, y, items);
}
