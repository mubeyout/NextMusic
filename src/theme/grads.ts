// grads —— [老板 1011 15:39 全局统一令] 渐变 token 唯一源(全站封面兜底/快捷卡渐变族)
// 曾散落 8 处重复定义(MyLibrary/PublicLibrary/MediaLibs/SongRow/PlaylistRow/MyScreen/HDMy 等)——同值合并,跨页面零差距
// 用法:import { GRAD, gradOf } from '../theme/grads'; LinearGradient colors={gradOf(name)}
import type { LinearGradientProps } from 'react-native-linear-gradient';

/** 封面兜底渐变族(7 组沉稳深色系,MyLibrary 源;无封面条目按名哈希取用) */
export const GRAD = {
  cover: [
    ['#3f8766', '#265141'], ['#5d7ba3', '#3a506e'], ['#a3765d', '#6e4d3a'],
    ['#6b5da3', '#463c6e'], ['#87663f', '#514126'], ['#3d4c5a', '#28333f'], ['#4c5a3d', '#333f28'],
  ] as [string, string][],
  /** 快捷卡/自建歌单封面渐变族(6 组;MyScreen/HDMy 同源) */
  quick: [
    ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'], ['#5c297a', '#1f3861'],
    ['#146b85', '#1f2e47'], ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'],
  ] as [string, string][],
};

/** 名字哈希取渐变(与各屏原 gradOf 同算法同源——同名字在任意页面取到同一组,跨页视觉一致) */
export function gradOf(name?: string, family: [string, string][] = GRAD.cover): [string, string] {
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (name || '').charCodeAt(i) + ((h << 5) - h);
  return family[Math.abs(h) % family.length];
}

/** 单色版(SongRow 封面兜底底色——取渐变首色) */
export function gradColorOf(name?: string): string {
  return gradOf(name)[0];
}

/** CSS 版(web View style background 用;MediaLibs coverGrad 同源) */
export function gradCssOf(name?: string): { background: string } {
  const g = gradOf(name);
  return { background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` };
}

export type { LinearGradientProps };
