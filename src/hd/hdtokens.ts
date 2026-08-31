// HD(车机/TV)设计尺寸 —— 10-foot UI:大字、大触点、横屏
// 复用手机版色彩 tokens(C),尺寸独立体系不污染 phone
import { C } from '../theme/tokens';

export { C };

export const H = {
  // 字号
  font: {
    title34: 34,
    title24: 24,
    title20: 20,
    body17: 17,
    body15: 15,
    caption12: 12,
  },
  // 触点:车机戴手套/驾驶抖动 —— 最小 56dp
  touch: 56,
  // 行高(歌曲行)
  row: 72,
  // nav rail 宽
  rail: 116,
  // 播放条高
  playbar: 92,
};

export const fmtSec = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
