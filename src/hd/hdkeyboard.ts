// v1.2.4 D3(A2):键盘导航共享注册表——web 桌面壳(kbnav.ts)驱动,native 侧注册表恒空(零开销零行为)
// 行组件(HDSongRow/SongRow) web 挂载时注册,unmount 注销
import type { CtxMenuItem } from './hdctxmenu';

export interface KbRow {
  /** 异步量取自身矩形(RNW measure;px/py 为窗口坐标) */
  measure: (cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void) => void;
  /** Enter=播放 */
  play: () => void;
  /** Shift+F10/Menu=A3 菜单数据(与右键同源) */
  menu?: () => CtxMenuItem[];
}

const G = globalThis as never as {
  __nmKbRows?: Map<number, KbRow>;
  __nmKbReg?: (row: KbRow) => () => void;
};
if (!G.__nmKbRows) G.__nmKbRows = new Map();
if (!G.__nmKbReg) {
  G.__nmKbReg = (row: KbRow) => {
    const id = Date.now() * 1000 + (G.__nmKbRows!.size % 1000);
    G.__nmKbRows!.set(id, row);
    return () => { G.__nmKbRows!.delete(id); };
  };
}

/** 行组件调用:注册自身,返回注销函数(useEffect cleanup 用) */
export function registerKbRow(row: KbRow): () => void {
  return G.__nmKbReg!(row);
}
