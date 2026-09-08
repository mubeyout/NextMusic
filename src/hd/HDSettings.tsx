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

  const rows: Record<Tab, RowDef[]> = {
    '外观与界面': [
      { kind: 'toggle', icon: 'palette', title: '纯黑背景', desc: 'OLED 友好的纯黑底色(仅深色模式)', value: s.pureBlack, onToggle: () => { settings.set('pureBlack', !s.pureBlack); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } },
      { kind: 'select', icon: 'palette', title: '界面主题', desc: IS_WEB ? '深色/浅色即时切换' : '深色(车机/TV 默认)或浅色,切换后自动重启生效', value: s.light ? '浅色' : '深色', options: ['深色', '浅色'], onPick: v => { settings.set('light', v === '浅色'); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } },
      { kind: 'select', icon: 'palette', title: '强调色', desc: IS_WEB ? '全局品牌色(即时生效)' : '全局品牌色(按钮/高亮/选中态),切换后自动重启生效', value: ACCENTS.find(a => a.color === s.accent)?.name ?? 'Next 绿', options: ACCENTS.map(a => a.name), onPick: v => { const hit = ACCENTS.find(a => a.name === v); if (hit) { settings.set('accent', hit.color); if (IS_WEB) { hdWebReload(); } else hdRestart(playing); } } },
      { kind: 'select', icon: 'fullscreen', title: '界面缩放', desc: '全局字号/触点/行高缩放(桌面即时生效,手机/TV 切换后重启生效)', value: s.uiScale || '100%', options: IS_WEB ? ['100%', '110%', '125%', '150%', '175%'] : ['90%', '100%', '110%', '125%'], onPick: v => { settings.set('uiScale', v); if (IS_WEB) { const z = Math.max(0.75, Math.min(2, Number(v.replace('%', '')) / 100)); const doc = (globalThis as { document?: { documentElement?: { style?: Record<string, string> } } }).document; if (doc?.documentElement?.style) doc.documentElement.style.zoom = String(z); } else hdRestart(playing); } },
    ],
    '播放体验': [
      { kind: 'select', icon: 'music', title: '默认音质', desc: '在线播放优先选择的音质档位', value: s.playQuality, options: QUALITY_OPTS, onPick: v => settings.set('playQuality', v as Quality) },
      { kind: 'toggle', icon: 'history', title: '恢复上次播放', desc: '启动时恢复退出前的播放队列与进度', value: s.restorePlayback, onToggle: () => settings.set('restorePlayback', !s.restorePlayback) },
      { kind: 'nav', title: '均衡器与音效', desc: '10 段 EQ · 空间混响 · 预设', icon: 'sliders', to: 'Fx' },
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
      { kind: 'nav', title: '云备份(WebDAV)', desc: '配置 WebDAV,备份/恢复全部数据', icon: 'cloud', to: 'BackupSettings' },
      { kind: 'nav', title: '下载管理', desc: '查看下载队列与失败重试', icon: 'download', to: 'Downloads' },
    ],
    '关于': [
      { kind: 'info', icon: 'info', title: '版本', desc: IS_HD ? 'HD 车机/电视版' : undefined, value: APP_VERSION },
      { kind: 'nav', title: '检查更新与关于', desc: '更新源 · 开源致谢', icon: 'refresh', to: 'About' },
      { kind: 'nav', title: '使用手册', desc: '功能说明 · 部署指南 · FAQ', icon: 'info', to: 'Manual' },
    ],
  };

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(Math.min(insets.top, 16), 14), paddingHorizontal: 30, paddingBottom: 30, gap: 14, ...(IS_WEB ? { maxWidth: 880, width: '100%', alignSelf: 'center' } : {}) }}
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
        {rows[tab].map((r, i) => <SettingsRow key={`${r.title}_${i}`} row={r} />)}
      </View>
    </ScrollView>
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
