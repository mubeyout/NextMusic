import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SubPage } from '../components/SubPage';

// Figma 23·基本设置
const SECTIONS: { title: string; rows: { label: string; value?: string; toggle?: boolean }[] }[] = [
  { title: '启动', rows: [{ label: '启动页面', value: '首页' }, { label: '恢复上次播放状态', toggle: true }, { label: '启动即播放', toggle: false }] },
  { title: '界面', rows: [{ label: '语言', value: '跟随系统' }, { label: '底栏显示标签', toggle: true }, { label: '圆角风格', value: '标准' }] },
  { title: '缓存', rows: [{ label: '图片缓存', value: '128 MB' }, { label: '清除缓存', value: '' }, { label: '歌词缓存', value: '32 MB' }] },
];

export function BasicSettingsScreen() {
  return <SubPage title="基本设置" sections={SECTIONS} />;
}

// Figma 11·主题与外观
export function ThemeScreen() {
  const accents = [
    { name: 'Next 绿', color: '#1ED760' },
    { name: '薄暮蓝', color: '#3B82F6' },
    { name: '晚樱粉', color: '#F472B6' },
    { name: '琥珀橙', color: '#F59E0B' },
  ];
  return (
    <SubPage
      title="主题与外观"
      sections={[
        { title: '模式', rows: [{ label: '深色模式', value: '始终深色' }, { label: '跟随系统', toggle: false }, { label: '纯黑背景', toggle: true }] },
        { title: '强调色', rows: [] },
      ]}
      extra={
        <View style={ts.swatchRow}>
          {accents.map((a, i) => (
            <TouchableOpacity key={a.name} style={ts.swatchItem}>
              <View style={[ts.swatch, { backgroundColor: a.color }, i === 0 && ts.swatchOn]}>
                {i === 0 ? <Icon name="check" size={16} color="#121212" /> : null}
              </View>
              <Text style={ts.swatchName}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      }
    />
  );
}

// Figma 24·关于与帮助
export function AboutScreen() {
  return (
    <SubPage
      title="关于与帮助"
      sections={[
        { title: '版本', rows: [{ label: '当前版本', value: '3.0.0 (30000)' }, { label: '检查更新', value: '' }, { label: '更新日志', value: '' }] },
        { title: '帮助', rows: [{ label: '使用手册', value: '' }, { label: '服务器部署指南', value: '' }, { label: '常见问题', value: '' }] },
        { title: '开源与致谢', rows: [{ label: 'LX Music', value: '' }, { label: 'IconPark 图标体系', value: '' }, { label: '第三方许可', value: '' }] },
      ]}
      footer={<Text style={ts.footer}>NextMusic · 为纯粹听歌而生</Text>}
    />
  );
}

const ts = StyleSheet.create({
  swatchRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 20, marginTop: 10 },
  swatchItem: { alignItems: 'center', gap: 8 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: C.text },
  swatchName: { color: C.text2, fontSize: 11 },
  footer: { color: C.text3, fontSize: 11, textAlign: 'center', marginTop: 24, marginBottom: 8 },
});

// Figma 19·下载设置
export function DownloadsSettingsScreen() {
  return (
    <SubPage
      title="下载设置"
      sections={[
        { title: '网络', rows: [{ label: '仅 Wi-Fi 下载', toggle: true }, { label: '允许流量下载', toggle: false }, { label: '下载音质', value: '无损 FLAC' }] },
        { title: '存储', rows: [{ label: '下载位置', value: '/storage/emulated/0/NextMusic' }, { label: '同时下载数', value: '3' }] },
      ]}
    />
  );
}

// Figma 20·云备份（WebDAV）
export function BackupSettingsScreen() {
  return (
    <SubPage
      title="云备份"
      sections={[
        { title: 'WebDAV', rows: [{ label: '服务器地址', value: '未配置' }, { label: '账号', value: '未配置' }, { label: '自动备份', toggle: false }] },
        { title: '备份内容', rows: [{ label: '歌单与收藏', toggle: true }, { label: '播放历史', toggle: false }, { label: '设置项', toggle: true }] },
      ]}
    />
  );
}

// Figma 22·可视化
export function VizSettingsScreen() {
  return (
    <SubPage
      title="可视化设置"
      sections={[
        { title: '样式', rows: [{ label: '波形', value: '' }, { label: '频谱', value: '当前' }, { label: '圆形律动', value: '' }] },
        { title: '播放页', rows: [{ label: '显示可视化', toggle: true }, { label: '随音乐变色', toggle: true }] },
      ]}
    />
  );
}

// 代理设置
export function ProxySettingsScreen() {
  return (
    <SubPage
      title="代理设置"
      sections={[
        { title: '网络', rows: [{ label: '使用代理', toggle: false }, { label: '自动检测', toggle: true }, { label: '代理类型', value: 'HTTP' }] },
        { title: '服务器', rows: [{ label: '地址', value: '未配置' }, { label: '端口', value: '未配置' }] },
      ]}
    />
  );
}
