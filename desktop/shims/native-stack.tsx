// @react-navigation/native-stack web shim：复用 JS 实现的 @react-navigation/stack，
// 忽略 native 专属 options（animation/presentation 等）保证 API 兼容。
// RNW 下手势/原生转场不可用，桌面用键盘/鼠标导航即可。
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

export const createNativeStackNavigator: typeof createStackNavigator =
  createStackNavigator as never;

export default { createNativeStackNavigator };
