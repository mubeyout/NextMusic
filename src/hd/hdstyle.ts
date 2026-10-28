// v3.28(老板:全局统一 token·规范化):共享样式 token 唯一源
// 背景:栅格 16/20/22/26/30 散落、焦点环 borderWidth:2+borderColor:C.brand 复制 50+ 处、
// 播放条让位 paddingBottom 硬编码 100/116/32 各屏各写——全部收口到这里
// 规则:HD/桌面内页水平栅格一律 GUTTER;焦点环一律 focus(容器圆角);底部一律 pageBottom()
import { C, H } from './hdtokens';
import { settings } from '../services/settings';
import { IS_CAR_DEVICE } from '../services/appversion';

/** 车机/HD 底部安全让位（1028 星愿实锤，报告：tmp-re-apk/星愿-底部bar机制与App避让报告.md）：
 * 星愿 SystemUI CarNavigationBar 高 112px(framework navigation_bar_height sw900dp=112dip +
 * GeelyAutoLauncher 写死 112px 双证据)，平台对三方窗口不提供 inset 自动避让(safe-area bottom≈0)，
 * Geely 自家应用全用固定 112px margin。用户显式值优先；0=自动(车机 112，TV/桌面 0)。 */
export const effectiveBottomInset = (): number => {
  const v = settings.get().hdBottomInset ?? 0;
  if (v > 0) return v;
  return IS_CAR_DEVICE ? 112 : 0;
};

/** 页面水平栅格(HDPlaylistDetail 基准;手机屏不引,保持各自紧凑值) */
export const GUTTER = 22;

/** D-pad/遥控焦点环——半径传容器自身圆角(行 8 / 卡 11 / 胶囊 999) */
export const focus = (radius: number) => ({ borderWidth: 2, borderColor: C.brand, borderRadius: radius });

export const FOCUS_ROW = focus(H.radius.row);
export const FOCUS_CARD = focus(H.radius.card);
export const FOCUS_PILL = focus(H.radius.pill);

/** 页面底部 padding:常驻播放条 H.playbar 让位(base=内容额外呼吸空间) */
// 1028 车机适配:叠加底部安全让位(车机系统 bar 覆盖时播放条整体抬升,页面让位同步抬高)
export const pageBottom = (base = 24) => base + H.playbar + effectiveBottomInset();
