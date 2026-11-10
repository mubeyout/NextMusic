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

// [v8.1 LEO spec] 顶 tab 5 组:首页/探索/榜单/播客/我的(队列进面板工具排;乐库进「我的」)
const NAV: { key: PageKey; icon: string; label: string }[] = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'explore', icon: 'explore', label: '探索' },
  { key: 'boards', icon: 'ranking', label: '榜单' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'medialibs', icon: 'server', label: '乐库' },
];

function TabItem({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <CarTouch onPress={onPress} style={[st2.tab, active && st2.tabOn]}>
      <Text style={[st2.tabLabel, active && { color: C.brand, fontWeight: '800' }]}>{label}</Text>
      {active ? <View style={st2.tabUnder} /> : null}
    </CarTouch>
  );
}

/** [v8.0] 左侧播放信息面板(QQ 律: 播放信息在左面,替代底部 playerbar) */
/** [v8.1 LEO spec] 左侧播放面板 300dp 八件套:封面260/歌名/歌手/进度+时间/三控(56绿主钮)/工具排(收藏下载队列音效)/徽标行/队列底锚 */
function PlayPanel({ onOpen, onFx, onQueue, onFav, onDownload }: { onOpen: () => void; onFx: () => void; onQueue: () => void; onFav: () => void; onDownload: () => void }) {
  const { current, playing, toggle, skipNext, skipPrev, queue } = usePlayer();
  const { position, duration } = usePlayerProgress();
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  return (
    <View style={st2.panel}>
      <CarTouch style={{ width: '100%', alignItems: 'center' }} onPress={onOpen}>
        {img ? <Image source={{ uri: img }} style={st2.panelArt} /> : <View style={[st2.panelArt, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={44} color={C.text3} /></View>}
      </CarTouch>
      <Text style={st2.panelTitle} numberOfLines={1}>{current?.name ?? '未在播放'}</Text>
      <Text style={st2.panelArtist} numberOfLines={1}>{current?.singer ?? '从首页选一首开始'}</Text>
      <View style={st2.panelProg}><View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} /><View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 2 }} /></View>
      <View style={st2.panelTimes}><Text style={st2.panelTime}>{fmt(position)}</Text><Text style={st2.panelTime}>{fmt(duration)}</Text></View>
      <View style={st2.panelCtrls}>
        <CarTouch style={st2.pBtn} onPress={skipPrev}><Icon name="previous" size={20} color={C.text} /></CarTouch>
        <CarTouch style={st2.pMain} onPress={toggle}><Icon name={playing ? 'pause' : 'play'} size={26} active color={C.onBrand} /></CarTouch>
        <CarTouch style={st2.pBtn} onPress={skipNext}><Icon name="next" size={20} color={C.text} /></CarTouch>
      </View>
      <View style={st2.panelTools}>
        <CarTouch style={st2.pTool} onPress={onFav}><Icon name="heart" size={16} color={C.text2} /></CarTouch>
        <CarTouch style={st2.pTool} onPress={onDownload}><Icon name="download" size={16} color={C.text2} /></CarTouch>
        <CarTouch style={st2.pTool} onPress={onQueue}><Icon name="queue" size={16} color={C.text2} /></CarTouch>
        <CarTouch style={st2.pTool} onPress={onFx}><Icon name="sliders" size={16} color={C.text2} /></CarTouch>
      </View>
      <View style={st2.panelBadges}>
        <Text style={st2.pBadge}>{current?.source || '—'}</Text>
        <Text style={st2.pBadge}>320k</Text>
      </View>
      <View style={{ flex: 1 }} />
      <CarTouch style={st2.panelQueue} onPress={onQueue}>
        <Text style={st2.panelQueueText} numberOfLines={1}>正在播放 · 队列 {queue.length} 首 ›</Text>
      </CarTouch>
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
          <CarTouch style={st2.iconBtn} onPress={() => goPage('settings')}><Icon name="settings" size={20} color={C.text2} /></CarTouch>
        </View>
      </View>

      {/* 主区: 左播放信息面板 + 右内容 */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={st2.panelWrap}>
          <PlayPanel onOpen={() => setPlayerOpen(true)} onFx={() => goPage('fx')} onQueue={() => goPage('queue')} onFav={() => setFavOpen(true)} onDownload={() => nav.navigate('Downloads')} />
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
              {page === 'medialibs' && <CarMediaLibs onBack={() => setPage('home')} onFav={() => setFavOpen(true)} />}
            </>
          )}
        </View>
      </View>
      <CarPlayer visible={playerOpen} onClose={() => setPlayerOpen(false)} />
    </View>
  );
}

const st2 = {
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 52, paddingHorizontal: CAR.gutter, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  tab: { alignItems: 'center' as const, justifyContent: 'center' as const, height: 52, paddingHorizontal: 18 },
  tabOn: {},
  tabUnder: { width: 20, height: 3, borderRadius: 2, backgroundColor: C.brand, marginTop: 4 },
  tabLabel: { color: C.text2, fontSize: 17, fontWeight: '600' as const },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelWrap: { width: 300, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.surface },
  panel: { flex: 1, padding: 20, gap: 10, alignItems: 'center' as const },
  panelArt: { width: 260, height: 260, borderRadius: 16 },
  panelTitle: { color: C.text, fontSize: 18, fontWeight: '700' as const, textAlign: 'center' as const, width: '100%' },
  panelArtist: { color: C.text2, fontSize: 14, textAlign: 'center' as const, width: '100%' },
  panelProg: { flexDirection: 'row' as const, height: 4, width: '100%', borderRadius: 2, overflow: 'hidden' as const },
  panelTimes: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, width: '100%' },
  panelTime: { color: C.text3, fontSize: 11, fontVariant: ['tabular-nums' as never] },
  panelCtrls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18, marginTop: 6 },
  pBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  pMain: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelTools: { flexDirection: 'row' as const, gap: 12, marginTop: 8 },
  pTool: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelBadges: { flexDirection: 'row' as const, gap: 8 },
  pBadge: { color: C.text3, fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: C.surface2 },
  panelQueue: { width: '100%', paddingVertical: 8, alignItems: 'center' as const },
  panelQueueText: { color: C.text3, fontSize: CAR_FS.tiny },
};
