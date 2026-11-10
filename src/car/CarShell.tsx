// CarShell.tsx —— [v8.0 QQ 结构 1110 老板令] QQ 车机布局: 菜单在页面顶部(tab 流,侧栏撤) + 播放信息常驻左侧面板(无 playerbar) + 内容区主体
// 页面键与覆盖态沿用; CarPlayerBar/fab 撤; 左面板=封面+信息+控件(点击进 CarPlayer 全屏)
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CAR, CAR_FS } from './cartokens';
import { CarHome } from './CarHome';
import { CarPlayer } from './CarPlayer';
import { CarPlaylist } from './CarPlaylist';
import { CarExplore, CarBoards, CarPodcast } from './CarPages';
import { CarFavorites } from './CarFavorites';
import { CarSearch } from './CarSearch';
import { CarQueue } from './CarQueue';
import { CarFx } from './CarFx';
import { CarSettings } from './CarSettings';
import { CarMediaLibs } from './CarMediaLibs';
import { CarTouch } from './CarTouch';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useApp } from '../state/AppState';
import { usePubEntry } from '../services/publicLibrary';
import { localLib } from '../services/localLibrary';
import { usePlayer, usePlayerProgress } from '../state/PlayerProvider';
import { fixCoverUrl } from '../utils/cover';
import { BackHandler } from 'react-native';

type PageKey = 'home' | 'podcast' | 'explore' | 'boards' | 'search' | 'queue' | 'fx' | 'settings' | 'medialibs';

// [v8.0] 顶部 tab 主组(QQ 车机 tab 流; 乐库族入口收进「乐库」下拉或直接放次级)
const NAV: { key: PageKey; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: '推荐' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'explore', icon: 'explore', label: '探索' },
  { key: 'boards', icon: 'ranking', label: '榜单' },
  { key: 'medialibs', icon: 'server', label: '乐库' },
  { key: 'queue', icon: 'queue', label: '队列' },
];

function TabItem({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <CarTouch onPress={onPress} style={st2.tab}>
      <Icon name={icon as never} size={20} color={active ? C.brand : C.text2} />
      <Text style={[st2.tabLabel, active && { color: C.brand }]}>{label}</Text>
    </CarTouch>
  );
}

/** [v8.0] 左侧播放信息面板(QQ 律: 播放信息在左面,替代底部 playerbar) */
function PlayPanel({ onOpen, onFx }: { onOpen: () => void; onFx: () => void }) {
  const { current, playing, toggle, skipNext, skipPrev } = usePlayer();
  const { position, duration } = usePlayerProgress();
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;
  return (
    <View style={st2.panel}>
      <CarTouch style={{ flex: 1, minWidth: '100%' }} onPress={onOpen}>
        {img ? <Image source={{ uri: img }} style={st2.panelArt} /> : <View style={[st2.panelArt, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={30} color={C.text3} /></View>}
        <Text style={st2.panelTitle} numberOfLines={2}>{current?.name ?? '未在播放'}</Text>
        <Text style={st2.panelArtist} numberOfLines={1}>{current?.singer ?? '点击选歌'}</Text>
      </CarTouch>
      {current ? (
        <View style={st2.panelCtrls}>
          <CarTouch style={st2.pBtn} onPress={skipPrev}><Icon name="previous" size={22} color={C.text} /></CarTouch>
          <CarTouch style={st2.pMain} onPress={toggle}><Icon name={playing ? 'pause' : 'play'} size={24} active color={C.onBrand} /></CarTouch>
          <CarTouch style={st2.pBtn} onPress={skipNext}><Icon name="next" size={22} color={C.text} /></CarTouch>
        </View>
      ) : null}
      <View style={st2.panelProg}><View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} /><View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 2 }} /></View>
      <CarTouch style={st2.pFx} onPress={onFx}><Icon name="sliders" size={18} color={C.text2} /><Text style={st2.pFxText}>音效</Text></CarTouch>
    </View>
  );
}

export function CarShell() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<PageKey>('home');
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [playerOpen, setPlayerOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [playlist, setPlaylist] = useState<import('./CarPlaylist').CarPlRef | null>(null);
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playerOpen) { setPlayerOpen(false); return true; }
      if (favOpen) { setFavOpen(false); return true; }
      if (playlist) { setPlaylist(null); return true; }
      return false;
    });
    return () => h.remove();
  }, [playerOpen, favOpen, playlist]);
  const goPage = (k: PageKey) => { setFavOpen(false); setPlaylist(null); setPage(k); };
  const pub = usePubEntry();
  const hasToken = !!useApp().token;
  const hasLocalLibs = localLib.all().length > 0;

  return (
    <View style={{ flex: 1, flexDirection: 'column', backgroundColor: C.bg, paddingTop: Math.max(insets.top, 8) }}
      >
      {/* [v8.0 QQ 律] 顶部: 品牌 + tab 流 + 搜索/收藏/设置图标钮 */}
      <View style={st2.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 18 }}>
          <Image source={require('../assets/brand/mark.png')} style={{ width: 28, height: 28 }} />
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>Next<Text style={{ color: C.brand }}>Music</Text></Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
          {NAV.map(n => (
            <TabItem key={n.key} icon={n.icon} label={n.label} active={page === n.key && !favOpen && !playlist} onPress={() => goPage(n.key)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <CarTouch style={st2.iconBtn} onPress={() => goPage('search')}><Icon name="search" size={20} color={C.text2} /></CarTouch>
          <CarTouch style={st2.iconBtn} onPress={() => setFavOpen(true)}><Icon name="heart" size={20} color={C.text2} /></CarTouch>
          <CarTouch style={st2.iconBtn} onPress={() => goPage('settings')}><Icon name="settings" size={20} color={C.text2} /></CarTouch>
        </View>
      </View>

      {/* 主区: 左播放信息面板 + 右内容 */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={st2.panelWrap}>
          <PlayPanel onOpen={() => setPlayerOpen(true)} onFx={() => goPage('fx')} />
        </View>
        <View style={{ flex: 1 }}>
          {favOpen ? (
            <CarFavorites onBack={() => setFavOpen(false)} />
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
              {page === 'settings' && <CarSettings onBack={() => setPage('home')} />}
              {page === 'medialibs' && <CarMediaLibs onBack={() => setPage('home')} />}
            </>
          )}
        </View>
      </View>
      <CarPlayer visible={playerOpen} onClose={() => setPlayerOpen(false)} />
    </View>
  );
}

const st2 = {
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 64, paddingHorizontal: CAR.gutter, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  tab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, height: 44, paddingHorizontal: 16, borderRadius: 22 },
  tabLabel: { color: C.text2, fontSize: 15, fontWeight: '600' as const },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelWrap: { width: 264, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.surface },
  panel: { flex: 1, padding: 18, gap: 10, alignItems: 'center' as const },
  panelArt: { width: 150, height: 150, borderRadius: 14 },
  panelTitle: { color: C.text, fontSize: CAR_FS.body, fontWeight: '700' as const, textAlign: 'center' as const, width: '100%' },
  panelArtist: { color: C.text3, fontSize: CAR_FS.mini, textAlign: 'center' as const, width: '100%' },
  panelCtrls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18 },
  pBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  pMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelProg: { flexDirection: 'row' as const, height: 4, width: '100%', borderRadius: 2, overflow: 'hidden' as const },
  pFx: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.surface2 },
  pFxText: { color: C.text2, fontSize: CAR_FS.tiny },
};
