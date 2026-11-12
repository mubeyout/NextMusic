// CarShell.tsx —— [APK 三版合一 WebView 壳 1112 老板令]
// 车机形态弃原生页面族(v8 QQ 布局家族退役,git 史可考),改 react-native-webview 离线壳
// 直载 assets/web/car.html(NextMusic-HD-Web dist 单文件自包含,QQ 车机布局 web 版)。
// 壳实现/注入(nm.real.base+fetch 包装)/返回桥全在 WebShell,本文件仅指派入口页。
import React from 'react';
import { WebShell } from '../web/WebShell';

export function CarShell() {
  return <WebShell entry="car.html" />;
}
