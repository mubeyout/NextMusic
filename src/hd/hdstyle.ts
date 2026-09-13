// v3.28(老板:全局统一 token·规范化):共享样式 token 唯一源
// 背景:栅格 16/20/22/26/30 散落、焦点环 borderWidth:2+borderColor:C.brand 复制 50+ 处、
// 播放条让位 paddingBottom 硬编码 100/116/32 各屏各写——全部收口到这里
// 规则:HD/桌面内页水平栅格一律 GUTTER;焦点环一律 focus(容器圆角);底部一律 pageBottom()
import { C, H } from './hdtokens';

/** 页面水平栅格(HDPlaylistDetail 基准;手机屏不引,保持各自紧凑值) */
export const GUTTER = 22;

/** D-pad/遥控焦点环——半径传容器自身圆角(行 8 / 卡 11 / 胶囊 999) */
export const focus = (radius: number) => ({ borderWidth: 2, borderColor: C.brand, borderRadius: radius });

export const FOCUS_ROW = focus(H.radius.row);
export const FOCUS_CARD = focus(H.radius.card);
export const FOCUS_PILL = focus(H.radius.pill);

/** 页面底部 padding:常驻播放条 H.playbar 让位(base=内容额外呼吸空间) */
export const pageBottom = (base = 24) => base + H.playbar;
