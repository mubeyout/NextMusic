// HD 设置页 —— 对齐桌面版 SettingsScreen:顶部 tab + 行式设置卡
// 行 = 标题/描述 + 右侧控件;TV 交互:整行可聚焦,CENTER 切换开关/循环选项/进入子页
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
const IS_WEB = Platform.OS === 'web';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, type IconName } from '../theme/Icon';
import { C, H } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useApp } from '../state/AppState';
import { settings, useSettings, type Quality } from '../services/settings';
import { createMMKV } from 'react-native-mmkv';
import { usePlayer } from '../state/PlayerProvider';
import { APP_VERSION, IS_HD } from '../services/appversion';
import { toast } from '../components/Dialog'; // v3.28:漏 import(5 处调用裸用)
import { api } from '../services/server';
import { hdNav } from './hdnav';
import { NativeModules } from 'react-native';
import { SelectSheet } from '../components/SelectSheet';

const Restart = NativeModules.AppRestart as { restart: () => void } | undefined;
const ACCENTS = [
  { name: 'Next 绿', color: '#1ED760' },
  { name: '薄暮蓝', color: '#3B82F6' },
  { name: '晚樱粉', color: '#F472B6' },
  { name: '琥珀橙', color: '#F59E0B' },
];
// lx48:主题/缩放切换热重载(JS bundle reload,样式全量重建;音乐不断、无退出动画)
// resume=重载前在播→标记断点续播(reload 后自动接同一首同一位置)
const HotReloadMod = NativeModules.AppReload as { reload: () => void } | undefined;
const hdRestart = (resume?: boolean) => {
  try { createMMKV({ id: 'nextmusic-playback' }).set('rr', resume ? '1' : ''); } catch { /* ignore */ }
  setTimeout(() => { if (HotReloadMod?.reload) HotReloadMod.reload(); else Restart?.restart(); }, 350);
};
// web 主题热切:设置已落 MMKV,整页 reload——各屏 StyleSheet 模块加载期固化旧色,单页刷新必花屏;
// 桌面 web 队列/进度冷启动自动恢复(restorePlayback web 默认开),体验等价即时
const hdWebReload = () => {
  try { createMMKV({ id: 'nextmusic-playback' }).set('rr', '1'); } catch { /* ignore */ }
  setTimeout(() => { const l = (globalThis as { location?: { reload: () => void } }).location; l?.reload(); }, 200);
};

const TABS = ['外观与界面', '播放体验', '账号与同步', '下载与备份', '关于'] as const;
type Tab = typeof TABS[number];

type RowDef =
  | { kind: 'toggle'; title: string; desc?: string; icon?: IconName; value: boolean; onToggle: () => void }
  | { kind: 'select'; title: string; desc?: string; icon?: IconName; value: string; options: string[]; onPick: (v: string) => void }
  | { kind: 'nav'; title: string; desc?: string; icon?: IconName; to?: string; action?: () => void }
  | { kind: 'info'; title: string; desc?: string; icon?: IconName; value: string };

export function HDSettingsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const [tab, setTab] = useState<Tab>('外观与界面');
  const s = useSettings();
  const { connected, base, username, disconnectServer } = useApp();
  const { playing } = usePlayer();

  const QUALITY_OPTS: string[] = ['128k', '320k', 'flac'];

  // v2 功能对齐:服务器缓存管理面板
  const [cacheOpen, setCacheOpen] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ totalSize: number; fileCount: number } | null>(null);
  // lx179(B):缓存列表状态 undefined=未加载 null=失败 数组=列表
  const [cacheFiles, setCacheFiles] = useState<{ name: string; size: number }[] | null | undefined>(undefined);
  const loadCacheStats = () => { api.cacheStats().then(setCacheStats).catch(() => setCacheStats({ totalSize: 0, fileCount: 0 })); };

  // carlink:phone 包内嵌车机模式时给退出开关;独立 hd 包不显示
  const carRows: RowDef[] = !IS_HD && s.carModeUi === true ? [
    { kind: 'toggle', icon: 'fullscreen', title: '车机模式', desc: '当前使用 HD 大屏界面,关闭恢复手机竖版', value: s.carModeUi === true, onToggle: () => settings.set('carModeUi', false) },
  ] : [];

  const rows: Record<Tab, RowDef[]> = {
    '外观与界面': [
      { kind: 'toggle', icon: 'palette', title: '纯黑背景', desc: 'OLED 友好的纯黑底色(仅深色模式)', value: s.pureBlack, onToggle: () => { settings.set('pureBlack', !s.pureBlack); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } },
      { kind: 'select', icon: 'palette', title: '界面主题', desc: IS_WEB ? '深色/浅色即时切换' : '深色(车机/TV 默认)或浅色,切换后自动重启生效', value: s.light ? '浅色' : '深色', options: ['深色', '浅色'], onPick: v => { settings.set('light', v === '浅色'); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } },
      { kind: 'select', icon: 'palette', title: '强调色', desc: IS_WEB ? '全局品牌色(即时生效)' : '全局品牌色(按钮/高亮/选中态),切换后自动重启生效', value: ACCENTS.find(a => a.color === s.accent)?.name ?? 'Next 绿', options: ACCENTS.map(a => a.name), onPick: v => { const hit = ACCENTS.find(a => a.name === v); if (hit) { settings.set('accent', hit.color); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } } },
      { kind: 'toggle', icon: 'wave', title: '歌词翻译', desc: '歌词下方显示翻译', value: s.showLyricTranslation, onToggle: () => settings.set('showLyricTranslation', !s.showLyricTranslation) },
      { kind: 'toggle', icon: 'wave', title: '歌词罗马音', desc: '显示罗马音注音', value: s.showLyricRoma, onToggle: () => settings.set('showLyricRoma', !s.showLyricRoma) },
      { kind: 'toggle', icon: 'wave', title: '歌词荧光效果', desc: '当前行荧光高亮', value: s.enableLyricGlow, onToggle: () => settings.set('enableLyricGlow', !s.enableLyricGlow) },
      { kind: 'select', icon: 'wave', title: '播放页背景', desc: '封面虚化/纯色/黑色', value: s.playerBackground === 'blur' ? '封面虚化' : s.playerBackground === 'solid' ? '纯色背景' : '黑色背景', options: ['封面虚化', '纯色背景', '黑色背景'], onPick: v => settings.set('playerBackground', v === '封面虚化' ? 'blur' : v === '纯色背景' ? 'solid' : 'dark') },
      // [audit 20260921] 以下死开关隐藏(设置审计:全仓零消费者;存储 key 保留)——接线或删除待拍板
      // { kind: 'toggle', icon: 'wave', title: '底部播放条可视化', desc: '频谱装饰', value: s.showFooterVisualizer, onToggle: () => settings.set('showFooterVisualizer', !s.showFooterVisualizer) },
      { kind: 'toggle', icon: 'wave', title: '播放页可视化', desc: '频谱环/粒子', value: s.showDetailVisualizer, onToggle: () => settings.set('showDetailVisualizer', !s.showDetailVisualizer) },
      { kind: 'toggle', icon: 'fullscreen', title: '屏幕常亮', desc: '播放时阻止休眠', value: s.keepScreenAwake, onToggle: () => settings.set('keepScreenAwake', !s.keepScreenAwake) },
      { kind: 'toggle', icon: 'edit', title: '键盘快捷键', desc: '空格播放/Alt 切歌', value: s.enableKeyboardShortcuts, onToggle: () => settings.set('enableKeyboardShortcuts', !s.enableKeyboardShortcuts) },
      { kind: 'select', icon: 'fullscreen', title: '界面缩放', desc: '全局字号/触点/行高缩放(桌面即时生效,手机/TV 切换后重启生效)', value: s.uiScale || '100%', options: IS_WEB ? ['100%', '110%', '125%', '150%', '175%'] : ['90%', '100%', '110%', '125%'], onPick: v => { settings.set('uiScale', v); if (IS_WEB) { const z = Math.max(0.75, Math.min(2, Number(v.replace('%', '')) / 100)); document.documentElement.style.zoom = String(z); } else hdRestart(playing); } }, // v3.28:tsconfig 补 dom 后 document 直用
    ],
    '播放体验': [
      { kind: 'select', icon: 'music', title: '默认音质', desc: '在线播放优先选择的音质档位', value: s.playQuality, options: QUALITY_OPTS, onPick: v => settings.set('playQuality', v as Quality) },
      { kind: 'toggle', icon: 'history', title: '恢复上次播放', desc: '启动时恢复退出前的播放队列与进度', value: s.restorePlayback, onToggle: () => settings.set('restorePlayback', !s.restorePlayback) },
      { kind: 'nav', title: '均衡器与音效', desc: '10 段 EQ · 空间混响 · 预设', icon: 'sliders', to: 'Fx' },
      // { kind: 'toggle', icon: 'play', title: '音频淡入淡出', desc: '切歌时平滑过渡', value: s.enableCrossfade, onToggle: () => settings.set('enableCrossfade', !s.enableCrossfade) },
      { kind: 'toggle', icon: 'next', title: '预读下一首', desc: '提前取链,切歌零等待', value: s.enablePreloader, onToggle: () => settings.set('enablePreloader', !s.enablePreloader) },
      { kind: 'toggle', icon: 'refresh', title: '自动尝试换源', desc: '取链失败自动切其他音源', value: s.enableAutoSwitchSource, onToggle: () => settings.set('enableAutoSwitchSource', !s.enableAutoSwitchSource) },
      // { kind: 'toggle', icon: 'refresh', title: '自动解析换源', desc: '通过 API 解析可用源', value: s.enableAutoSwitchApiSource, onToggle: () => settings.set('enableAutoSwitchApiSource', !s.enableAutoSwitchApiSource) },
      { kind: 'toggle', icon: 'music', title: '自动降低音质', desc: '高音质不可用时自动降档', value: s.enableAutoDegradeQuality, onToggle: () => settings.set('enableAutoDegradeQuality', !s.enableAutoDegradeQuality) },
      { kind: 'toggle', icon: 'next', title: '失败自动下一曲', desc: '防卡死', value: s.enableAutoSkipOnError, onToggle: () => settings.set('enableAutoSkipOnError', !s.enableAutoSkipOnError) },
      // { kind: 'toggle', icon: 'heart', title: '搜索播放切换队列', desc: '从搜索播放时替换当前队列', value: s.switchPlaylistOnSearchPlay, onToggle: () => settings.set('switchPlaylistOnSearchPlay', !s.switchPlaylistOnSearchPlay) },
      // { kind: 'toggle', icon: 'queue', title: '歌单播放切换队列', desc: '从歌单/榜单播放时替换队列', value: s.switchPlaylistOnSongListPlay, onToggle: () => settings.set('switchPlaylistOnSongListPlay', !s.switchPlaylistOnSongListPlay) },
      // { kind: 'toggle', icon: 'music', title: '同 ID 歌曲仅最高音质', desc: '去重时保留最高音质版本', value: s.deduplicatePlaylistByQuality, onToggle: () => settings.set('deduplicatePlaylistByQuality', !s.deduplicatePlaylistByQuality) },
    ],
    '账号与同步': [
      connected
        ? { kind: 'info', icon: 'server', title: '服务器', desc: `${username} @ ${base}`, value: '已连接' }
        : { kind: 'nav', title: '连接服务器', desc: '登录账号,同步歌单/收藏/音效', icon: 'server', to: 'AuthLogin' },
      { kind: 'nav', title: '音源管理', desc: 'LX 音源脚本,决定本地取链能力', icon: 'wave', to: 'Sources' },
      { kind: 'nav', title: '媒体库', desc: 'Emby / Jellyfin / Navidrome / WebDAV', icon: 'music', to: 'MediaLibs' },
      ...(connected ? [{ kind: 'nav' as const, title: '断开服务器', desc: '清除连接与凭据,回到本地模式', icon: 'close' as IconName, action: () => { disconnectServer(); nav.goBack(); } }] : []),
    ],
    '下载与备份': [
      { kind: 'select', icon: 'music', title: '下载音质', desc: '下载歌曲保存的音质档位', value: s.downloadQuality, options: QUALITY_OPTS, onPick: v => settings.set('downloadQuality', v as Quality) },
      { kind: 'select', icon: 'queue', title: '同时下载数', desc: '下载任务并发数', value: String(s.maxConcurrent), options: ['1', '2', '3', '5'], onPick: v => settings.set('maxConcurrent', Number(v)) },
      { kind: 'toggle', icon: 'heart', title: '备份歌单', desc: '云备份时包含本地歌单', value: s.backupPlaylists, onToggle: () => settings.set('backupPlaylists', !s.backupPlaylists) },
      { kind: 'nav', title: '云备份(WebDAV)', desc: '配置 WebDAV,备份/恢复全部数据 · 备份内容=容器 /server/data 全量', icon: 'cloud', to: 'BackupSettings' },
      // { kind: 'toggle', icon: 'cloud', title: '播放设置自动备份', desc: '音质/主题/播放开关等随账号云端同步,多端一致', value: s.syncSettingsCloud ?? true, onToggle: () => settings.set('syncSettingsCloud' as never, !(s.syncSettingsCloud ?? true) as never) },
      { kind: 'nav', title: '立即同步播放设置', desc: '上传当前播放设置到服务器账号', icon: 'refresh', action: () => { api.settingsPush({ playQuality: s.playQuality, downloadQuality: s.downloadQuality, light: s.light, pureBlack: s.pureBlack, accent: s.accent }).then(() => toast('已上传到服务器账号')).catch(() => toast('同步失败(未连接服务器)')); } },
      { kind: 'nav', title: '下载管理', desc: '查看下载队列与失败重试', icon: 'download', to: 'Downloads' },
      { kind: 'toggle', icon: 'cloud', title: '缓存歌曲到服务器', desc: '播放时自动把歌曲存到服务器缓存,再次播放零流量。Web 版点「下载」也是存这里(浏览器不落盘)。缓存目录:/server/data/cache/用户名 · Docker 宿主机路径=启动 -v 映射', value: s.enableServerCache, onToggle: () => settings.set('enableServerCache', !s.enableServerCache) },
      // { kind: 'toggle', icon: 'cloud', title: '缓存歌词到服务器', desc: '歌词存服务器缓存目录,多端同步极速加载', value: s.enableServerLyricCache, onToggle: () => settings.set('enableServerLyricCache', !s.enableServerLyricCache) },
      { kind: 'toggle', icon: 'heart', title: '优先播放缓存', desc: '有缓存直接用,失效自动重取', value: s.preferServerCache, onToggle: () => settings.set('preferServerCache', !s.preferServerCache) },
      // { kind: 'toggle', icon: 'heart', title: '本地歌词缓存', desc: '已加载歌词存本地', value: s.enableLyricCache, onToggle: () => settings.set('enableLyricCache', !s.enableLyricCache) },
      { kind: 'toggle', icon: 'heart', title: '播放链接缓存', desc: '缓存取链结果', value: s.enableSongUrlCache, onToggle: () => settings.set('enableSongUrlCache', !s.enableSongUrlCache) },
      // { kind: 'toggle', icon: 'download', title: '下载嵌入歌词', desc: '标签+.lrc 写入文件', value: s.embedLyricToFile, onToggle: () => settings.set('embedLyricToFile', !s.embedLyricToFile) },
      // { kind: 'toggle', icon: 'download', title: '下载独立目录', desc: '开:「下载」保存到下载目录 /server/data/music,与播放缓存分开管理 · 关:下载文件也存入缓存目录 /server/data/cache/用户名(两类文件混放)', value: s.enableOnlyDownloadMode, onToggle: () => settings.set('enableOnlyDownloadMode', !s.enableOnlyDownloadMode) },
      // { kind: 'toggle', icon: 'refresh', title: '下载目录歌曲洗版', desc: '自动替换为高音质版本', value: s.enableRemaster, onToggle: () => settings.set('enableRemaster', !s.enableRemaster) },
      // { kind: 'toggle', icon: 'wave', title: '自动更新网络歌单', desc: '定时检测歌单变更', value: s.autoUpdateNetworkList, onToggle: () => settings.set('autoUpdateNetworkList', !s.autoUpdateNetworkList) },
      // { kind: 'select', icon: 'globe', title: '歌单检测间隔', desc: '网络歌单自动检测', value: s.networkListAutoCheckInterval, options: ['30m', '1h', '3h', '6h', '12h', '1d'], onPick: v => settings.set('networkListAutoCheckInterval', v) },
      // lxfix(审计 20260920):代理三开关零消费(lxserver v2 字段对齐搬入从未接线,开了也不走代理=纯误导)——UI 隐藏;key 保留,真实现(取链 URL 模板代理)后再上
      // { kind: 'toggle', icon: 'globe', title: '公开源可见', desc: '显示管理员上传的公共音源', value: s.enablePublicSources, onToggle: () => settings.set('enablePublicSources', !s.enablePublicSources) },
      { kind: 'nav', title: '服务器缓存管理', desc: '缓存统计 · 缓存列表 · 一键清空', icon: 'server', action: () => { setCacheOpen(true); loadCacheStats(); } },
    ],
    '关于': [
      { kind: 'info', icon: 'info', title: '版本', desc: IS_HD ? 'HD 车机/电视版' : undefined, value: APP_VERSION },
      { kind: 'nav', title: '检查更新与关于', desc: '更新源 · 开源致谢', icon: 'refresh', to: 'About' },
      { kind: 'nav', title: '使用手册', desc: '功能说明 · 部署指南 · FAQ', icon: 'info', to: 'Manual' },
    ],
  };

  const fmtBytes = (n: number) => n > 1024 * 1024 * 1024 ? (n / 1024 ** 3).toFixed(2) + ' GB' : n > 1024 * 1024 ? (n / 1024 ** 2).toFixed(1) + ' MB' : (n / 1024).toFixed(1) + ' KB';

  return (
    <>
    {cacheOpen ? (
      <View style={st.cacheMask}>
        <View style={st.cachePanel}>
          <Text style={st.cacheTitle}>服务器缓存管理</Text>
          <Text style={st.cacheInfo}>
            {cacheStats ? `${cacheStats.fileCount} 个文件 · ${fmtBytes(cacheStats.totalSize)} · 歌曲播放时可缓存到服务器存储` : '统计加载中…'}
          </Text>
          {/* lx179(B):缓存列表——api.cacheList 首次接入消费者;展开懒加载,最多列 50 条 */}
          {cacheFiles === undefined ? null : cacheFiles === null ? (
            <Text style={[st.cacheInfo, { color: C.text3, marginTop: 4 }]}>列表加载失败或无权限（需登录）</Text>
          ) : cacheFiles.length ? (
            <View style={{ marginTop: 8, maxHeight: 220 }}>
              <ScrollView showsVerticalScrollIndicator>
                {cacheFiles.slice(0, 50).map(f => (
                  <Text key={f.name} numberOfLines={1} style={{ color: C.text2, fontSize: 11.5, lineHeight: 20 }}>
                    · {f.name} <Text style={{ color: C.text3 }}>{fmtBytes(f.size)}</Text>
                  </Text>
                ))}
              </ScrollView>
            </View>
          ) : (
            <Text style={[st.cacheInfo, { color: C.text3, marginTop: 4 }]}>缓存为空</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <HDTouch style={st.cacheBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} onPress={() => { loadCacheStats(); setCacheFiles(undefined); toast('已刷新'); }}>
              <Text style={st.cacheBtnText}>刷新统计</Text>
            </HDTouch>
            <HDTouch style={st.cacheBtn} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} onPress={() => {
              setCacheFiles(null);
              api.cacheList().then(l => setCacheFiles(l)).catch(() => setCacheFiles(null));
            }}>
              <Text style={st.cacheBtnText}>{cacheFiles ? '收起列表' : '缓存列表'}</Text>
            </HDTouch>
            <HDTouch style={[st.cacheBtn, { borderColor: '#F2545B66' }]} focusStyle={{ borderWidth: 2, borderColor: '#F2545B', borderRadius: 10 }} onPress={() => {
              api.cacheClear().then(() => { toast('服务器缓存已清空'); loadCacheStats(); setCacheFiles(undefined); }).catch(() => toast('清空失败(未连接服务器)'));
            }}>
              <Text style={[st.cacheBtnText, { color: '#F2545B' }]}>清空缓存</Text>
            </HDTouch>
            <HDTouch style={[st.cacheBtn, { backgroundColor: C.brand, borderColor: C.brand }]} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} onPress={() => { setCacheOpen(false); setCacheFiles(undefined); }}>
              <Text style={[st.cacheBtnText, { color: C.onBrand }]}>关闭</Text>
            </HDTouch>
          </View>
        </View>
      </View>
    ) : null}
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 30, paddingBottom: IS_WEB ? 30 + 64 + 20 : 30, gap: 14, ...(IS_WEB ? { width: '100%', alignSelf: 'stretch' } : {}) }} // #036:web playbar 绝对定位悬浮,底部让位 64+20(原 30 末行被遮)
      showsVerticalScrollIndicator={false}
    >
      <View style={st.head}>
        <HDTouch style={st.backBtn} onPress={nav.goBack} focusStyle={st.focus} hasTVPreferredFocus>
          <Icon name="back" size={18} color={C.text2} />
        </HDTouch>
        <Text style={st.title}>设置</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* 顶部 tab(桌面版同构:下划线高亮) */}
      <View style={st.tabRow}>
        {TABS.map(t => (
          <HDTouch key={t} style={st.tabItem} focusStyle={st.tabFocus} onPress={() => setTab(t)}>
            <Text style={[st.tabText, tab === t && st.tabTextOn]}>{t}</Text>
            {tab === t ? <View style={st.tabBar} /> : null}
          </HDTouch>
        ))}
      </View>

      {/* 行式设置卡 */}
      <View style={{ gap: 8 }}>
        {carRows.map((r, i) => <SettingsRow key={`car_${i}`} row={r} />)}
        {rows[tab].map((r, i) => <SettingsRow key={`${r.title}_${i}`} row={r} />)}
      </View>
    </ScrollView>
    </>
  );
}

function SettingsRow({ row }: { row: RowDef }) {
  const [sheet, setSheet] = useState(false);
  return (
    <>
    <HDTouch
      style={st.row}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}
      focusBg={C.hover}
      onPress={() => {
        if (row.kind === 'toggle') row.onToggle();
        else if (row.kind === 'select') {
          if (IS_WEB) setSheet(true); // 桌面:全部 select 走下拉选单(v1.1.6:2 项的主题也下拉,不再轮巡)
          else {
            const i = row.options.indexOf(row.value);
            row.onPick(row.options[(i + 1) % row.options.length]);
          }
        } else if (row.kind === 'nav') {
          if (row.action) row.action();
          else if (row.to) hdNav()?.navigate(row.to);
        }
      }}
    >
      {row.icon ? (
        <View style={st.rowIcon}><Icon name={row.icon} size={14} color={C.text3} /></View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.rowTitle}>{row.title}</Text>
        {row.desc ? <Text style={st.rowDesc} numberOfLines={2}>{row.desc}</Text> : null}
      </View>
      {row.kind === 'toggle' ? (
        <View style={[st.tgl, row.value && st.tglOn]}>
          <View style={[st.tglDot, row.value && st.tglDotOn]} />
        </View>
      ) : row.kind === 'select' ? (
        <View style={st.sel}>
          <Text style={st.selText}>{row.value}</Text>
          <Icon name="chevronright" size={10} color={C.text3} />
        </View>
      ) : row.kind === 'info' ? (
        <Text style={st.selText}>{row.value}</Text>
      ) : (
        <Icon name="chevronright" size={13} color={C.text3} />
      )}
    </HDTouch>
    {row.kind === 'select' ? (
      <SelectSheet visible={sheet} title={row.title} value={row.value} options={row.options}
        onPick={v => row.onPick(v)} onClose={() => setSheet(false)} />
    ) : null}
    </>
  );
}

const st = StyleSheet.create({
  cacheMask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.55)', zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  cachePanel: { width: 420, maxWidth: '90%', backgroundColor: C.elev, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: 22, gap: 4 },
  cacheTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  cacheInfo: { color: C.text2, fontSize: 12, lineHeight: 18 },
  cacheBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  cacheBtnText: { color: C.text, fontSize: 12.5, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  focus: { borderWidth: 2, borderColor: C.brand, borderRadius: 10 },
  title: { color: C.text, fontSize: H.font.hero, fontWeight: '800', flex: 1 },
  tabRow: { flexDirection: 'row', gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, paddingBottom: 2 },
  tabItem: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 8, minHeight: 38, justifyContent: 'center' },
  tabFocus: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 8 },
  tabText: { color: C.text3, fontSize: H.font.md, fontWeight: '500' },
  tabTextOn: { color: C.text, fontWeight: '700' },
  tabBar: { height: 2.5, borderRadius: 2, backgroundColor: C.brand, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64,
    backgroundColor: C.surface, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border, paddingHorizontal: 18, paddingVertical: 10,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: H.font.md, fontWeight: '600' },
  rowDesc: { color: C.text3, fontSize: H.font.xs, lineHeight: 15 },
  tgl: { width: 42, height: 23, borderRadius: 12, backgroundColor: C.track, padding: 2 },
  tglOn: { backgroundColor: C.brand },
  tglDot: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#8A8F98' },
  tglDotOn: { alignSelf: 'flex-end', backgroundColor: C.onBrand },
  sel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elev, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  selText: { color: C.text2, fontSize: H.font.sm },
});
