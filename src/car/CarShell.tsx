// CarShell.tsx —— [车机专属壳 1105] LEO v7 规格: 侧栏 261 + 四主页面切换 + Dock(搜索/设置) + CarPlayerBar
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
import { CarDrawer } from './CarDrawer';
import type { SongItem } from '../services/server';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { settings } from '../services/settings';
import { useNavigation } from '@react-navigation/native';

type PageKey = 'home' | 'podcast' | 'explore' | 'boards';

const NAV: { key: PageKey; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: '为我推荐' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'explore', icon: 'explore', label: '探索' },
  { key: 'boards', icon: 'rank', label: '榜单' },
];

function NavItem({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[st.navItem, active && { backgroundColor: C.surface2, borderRadius: 14 }]}>
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
  const [drawer, setDrawer] = useState<'search' | 'queue' | null>(null);
  const [playlist, setPlaylist] = useState<import('./CarPlaylist').CarPlRef | null>(null);
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
        <Text style={st.groupLabel}>我的乐库</Text>
        <NavItem icon="heart" label="我的收藏" onPress={() => setPage('home')} />
        <NavItem icon="server" label="媒体库" onPress={() => nav.navigate('MediaLibs')} /> {/* [1106] 音源/账号管理入口 */}
        {/* 歌单行×n: 骨架期占位,数据接线下批 */}
        <View style={{ flex: 1 }} />
        {/* Dock: 搜索 + 设置 */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24 }}>
          <TouchableOpacity style={st.dockBtn} onPress={() => setDrawer('search')}>
            <Icon name="search" size={20} color={C.text2} />
          </TouchableOpacity>
          <TouchableOpacity style={st.dockBtn} onPress={() => nav.navigate('Settings')}>
            <Icon name="settings" size={20} color={C.text2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 内容区 */}
      <View style={{ flex: 1 }}>
        {playlist ? (
          <CarPlaylist pl={playlist} onBack={() => setPlaylist(null)} />
        ) : (
          <>
            {page === 'home' && <CarHome goExplore={() => setPage('explore')} onOpenPlaylist={setPlaylist} />}
            {page === 'podcast' && <CarPodcast />}
            {page === 'explore' && <CarExplore onOpenPlaylist={setPlaylist} />}
            {page === 'boards' && <CarBoards onOpenPlaylist={setPlaylist} />}
          </>
        )}
      </View>

      {/* 播放条: 底部常驻 96 无进度行(点击开 CarPlayer 全屏) */}
      <View style={{ position: 'absolute', left: playlist ? 0 : CAR.sidebar, right: 0, bottom: 0 }}>
        <TouchableOpacity activeOpacity={0.9} style={{ flex: 1 }} onPress={() => setPlayerOpen(true)}>
          <CarPlayerBar />
        </TouchableOpacity>
      </View>
      <CarPlayer visible={playerOpen} onClose={() => setPlayerOpen(false)} />
      <CarDrawer mode={drawer} onClose={() => setDrawer(null)} />
      {drawer === null && !playerOpen && (
        <TouchableOpacity style={{ position: 'absolute', right: CAR.gutter, bottom: CAR.playbar.h + 16, width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setDrawer('queue')}>
          <Icon name="queue" size={22} color={C.text2} />
        </TouchableOpacity>
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
