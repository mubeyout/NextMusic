// CarShell.tsx —— [车机专属壳 1105] LEO v75 终稿(1107 拍板): 侧栏 261 + 四主页面 + 我的乐库(HD 正序/条件渲染) + 管理组 + 右上角搜索/设置(Dock 撤·老板令 0916) + CarPlayerBar
// 不复用 HDMain(结构不同——老板令:车机重新设计,不是放大 HD)
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native'; // Image:brand mark
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAR } from './cartokens';
import { CarHome } from './CarHome';
import { CarPlayerBar } from './CarPlayerBar';
import { CarPlayer } from './CarPlayer';
import { CarPlaylist } from './CarPlaylist';
import { CarExplore, CarBoards, CarPodcast } from './CarPages';
import { CarFavorites } from './CarFavorites';
import { CarSearch } from './CarSearch';
import { CarQueue } from './CarQueue';
import { CarFx } from './CarFx';
import type { SongItem } from '../services/server';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { settings } from '../services/settings';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../state/AppState'; // [LEO 终稿 1107] token 响应式(云曲库条件渲染)
import { usePubEntry } from '../services/publicLibrary'; // [LEO 终稿 1107] 公共曲库条件渲染(=HD)
import { localLib } from '../services/localLibrary'; // [LEO 终稿 1107] 本地曲库=有库才显示(=HD)

// [LEO v75 缺口包 1107] PageKey 扩 search/queue/fx(右上角搜索/fab 队列/播放条 FX);CarDrawer 撤——搜索/队列升全页
type PageKey = 'home' | 'podcast' | 'explore' | 'boards' | 'search' | 'queue' | 'fx';

const NAV: { key: PageKey; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: '为我推荐' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'explore', icon: 'explore', label: '探索' },
  { key: 'boards', icon: 'rank', label: '榜单' },
];

function NavItem({ icon, label, active, onPress, size }: { icon: string; label: string; active?: boolean; onPress: () => void; size?: number }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[st.navItem, size ? { height: size } : null, active && { backgroundColor: C.surface2, borderRadius: 14 }]}>
      {active ? <View style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: C.brand }} /> : null}
      <Icon name={icon as never} size={24} color={active ? C.brand : C.text2} />
      <Text style={[st.navLabel, active && { color: C.brand }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: CAR.gutter }}>
      <Icon name="music" size={48} color={C.text3} />
      <Text style={{ color: C.text2, fontSize: CAR.secTitle, fontWeight: '700', marginTop: 16 }}>{title}</Text>
      <Text style={{ color: C.text3, fontSize: 15, marginTop: 8 }}>车机专属页面 · v7 规格实施中(骨架期占位)</Text>
    </View>
  );
}

export function CarShell() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<PageKey>('home');
  const nav = useNavigation() as { navigate: (s: string) => void }; // [老板 1106 抓] 设置/媒体库走 phone navigator 全功能页(账号/音源/服务器)
  const [playerOpen, setPlayerOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false); // [1106] 车机收藏页
  const [playlist, setPlaylist] = useState<import('./CarPlaylist').CarPlRef | null>(null);
  // [LEO 终稿 1107] 条件渲染三规则(继承 HD): 无库无本地行/未登录无云行/未授权无公共行
  const pub = usePubEntry();
  const hasToken = !!useApp().token;
  const hasLocalLibs = localLib.all().length > 0; // 渲染期重读(=HDMain 同法)
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg, paddingTop: Math.max(insets.top, IS_CAR_TOP) }}>
      {/* 侧栏 261 */}
      <View style={[st.sidebar, { paddingTop: 26, paddingBottom: 18 }]}>
        {/* [老板 1105 抓] brand 对齐真版:官方 mark.png + NextMusic 双色拼(与 HDMain 同源,不臆造) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, marginBottom: 24 }}>
          <Image source={require('../assets/brand/mark.png')} style={{ width: 34, height: 34 }} />
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
        </View>
        {NAV.map(n => (
          <NavItem key={n.key} icon={n.icon} label={n.label} active={page === n.key} onPress={() => setPage(n.key)} />
        ))}
        {/* [LEO 终稿 1107] 我的乐库: HD 正序(枢纽优先) */}
        <Text style={st.groupLabel}>我的乐库</Text>
        <NavItem icon="server" label="媒体库" onPress={() => nav.navigate('MediaLibs')} size={CAR.navItemSub} /> {/* 枢纽优先;[1106 老板钦点] 跳 phone 全功能页(账号/音源/服务器) */}
        {hasLocalLibs ? <NavItem icon="music" label="本地曲库" onPress={() => nav.navigate('MyLibrary')} size={CAR.navItemSub} /> : null}
        {hasToken ? <NavItem icon="cloud" label="云曲库" onPress={() => nav.navigate('CloudLibrary')} size={CAR.navItemSub} /> : null}
        {pub.authorized && pub.showEntry ? <NavItem icon="users" label="公共曲库" onPress={() => nav.navigate('PublicLibrary')} size={CAR.navItemSub} /> : null}
        <NavItem icon="heart" label="我的收藏" onPress={() => setFavOpen(true)} size={CAR.navItemSub} /> {/* [1106 完成] CarFavorites(收藏+最近播放) */}
        {/* [LEO 终稿 1107] 管理组 */}
        <Text style={st.groupLabel}>管理</Text>
        <NavItem icon="download" label="下载管理" onPress={() => nav.navigate('Downloads')} size={CAR.navItemSub} />
        <NavItem icon="clock" label="播放历史" onPress={() => setFavOpen(true)} size={CAR.navItemSub} /> {/* LEO 拍板: 保留独立行,目标沿用收藏页首区复用 */}
        <View style={{ flex: 1 }} />
        {/* Dock 撤(老板令 0916)→搜索/设置挪右上角(见内容区 cornerBtn) */}
      </View>

      {/* 内容区 */}
      <View style={{ flex: 1 }}>
        {favOpen ? (
          <CarFavorites />
        ) : playlist ? (
          <CarPlaylist pl={playlist} onBack={() => setPlaylist(null)} />
        ) : (
          <>
            {page === 'home' && <CarHome goExplore={() => setPage('explore')} onOpenPlaylist={setPlaylist} />}
            {page === 'podcast' && <CarPodcast />}
            {page === 'explore' && <CarExplore onOpenPlaylist={setPlaylist} />}
            {page === 'boards' && <CarBoards onOpenPlaylist={setPlaylist} />}
            {page === 'search' && <CarSearch onBack={() => setPage('home')} />}
            {page === 'queue' && <CarQueue onBack={() => setPage('home')} />}
            {page === 'fx' && <CarFx onBack={() => setPage('home')} />}
          </>
        )}
      </View>

      {/* 播放条: 底部常驻 96 无进度行(点击开 CarPlayer 全屏) */}
      <View style={{ position: 'absolute', left: playlist ? 0 : CAR.sidebar, right: 0, bottom: 0 }}>
        <TouchableOpacity activeOpacity={0.9} style={{ flex: 1 }} onPress={() => setPlayerOpen(true)}>
          <CarPlayerBar onFx={() => setPage('fx')} />
        </TouchableOpacity>
      </View>
      <CarPlayer visible={playerOpen} onClose={() => setPlayerOpen(false)} />
      {!playerOpen && !playlist && (
        <TouchableOpacity style={{ position: 'absolute', right: CAR.gutter, bottom: CAR.playbar.h + 16, width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setPage('queue')}>
          <Icon name="queue" size={22} color={C.text2} />
        </TouchableOpacity>
      )}
      {/* [老板令 0916 + LEO 终稿 1107] 右上角: 搜索 + 设置(Dock 撤) */}
      {!playerOpen && !playlist && !favOpen && (
        <View style={{ position: 'absolute', right: CAR.gutter, top: Math.max(insets.top, IS_CAR_TOP) + 16, flexDirection: 'row', gap: 12, zIndex: 30, elevation: 30 }}>
          <TouchableOpacity style={st.dockBtn} onPress={() => setPage('search')}>
            <Icon name="search" size={22} color={C.text2} />
          </TouchableOpacity>
          <TouchableOpacity style={st.dockBtn} onPress={() => nav.navigate('Settings')}>
            <Icon name="settings" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// 车机顶部系统状态栏让位(实车 72;模拟环境用 insets)
const IS_CAR_TOP = 0;

const st = {
  sidebar: { width: CAR.sidebar, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border },
  navItem: { height: CAR.navItem, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 24, position: 'relative' as const },
  navLabel: { color: C.text2, fontSize: 19, fontWeight: '600' as const },
  groupLabel: { color: C.text3, fontSize: 13, letterSpacing: 2, paddingHorizontal: 24, marginTop: 22, marginBottom: 6 },
  dockBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
};
