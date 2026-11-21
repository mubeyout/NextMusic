// CarShell.tsx —— [HTML01 car.js 1120 rail 重构] 左侧主导航 rail(brand+6 tab+播放钮) + 面包屑 header + 左播放面板 + 内容区
// 撤 v8.0 顶 tab 流(QQ 结构)。rail 112px/header 100px ÷1.5;页面键与覆盖态沿用。
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { CAR, CAR_FS } from './cartokens';
import { CarHome } from './CarHome';
import { CarPlayer } from './CarPlayer';
import { toast } from '../components/Dialog';
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
import { Icon, type IconName } from '../theme/Icon';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useApp } from '../state/AppState';
import { usePubEntry } from '../services/publicLibrary';
import { localLib } from '../services/localLibrary';
import { usePlayer, usePlayerProgress } from '../state/PlayerProvider';
import { fixCoverUrl } from '../utils/cover';
import { BackHandler } from 'react-native';

type PageKey = 'home' | 'podcast' | 'explore' | 'boards' | 'search' | 'queue' | 'fx' | 'settings' | 'medialibs';

// [HTML01 car.js] rail 导航 6 项:home推荐/explore探索/boards榜单/podcast播客/mymusic我的(收藏overlay)/library媒体库
const NAV: { key: PageKey | 'fav'; icon: IconName; label: string }[] = [
  { key: 'home', icon: 'home', label: '推荐' },
  { key: 'explore', icon: 'explore', label: '探索' },
  { key: 'boards', icon: 'ranking', label: '榜单' },
  { key: 'podcast', icon: 'podcast', label: '播客' },
  { key: 'fav', icon: 'heart', label: '我的' },
  { key: 'medialibs', icon: 'server', label: '媒体库' },
];

const TITLES: Record<string, string> = {
  home: '为我推荐', explore: '探索音乐', boards: '排行榜', podcast: '播客', medialibs: '媒体库',
  search: '搜索', queue: '播放队列', fx: '均衡器与音效', settings: '设置', fav: '我喜欢的',
};

/** [HTML01 car.css #carRail .tab] 竖排导航项:icon 28/label 18/80h r18 →÷1.5;on=brand 12% 底 */
function RailTab({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <CarTouch onPress={onPress} style={[st2.railTab, active && { backgroundColor: 'rgba(30,215,96,.13)' }]}>
      <Icon name={icon} size={19} color={active ? C.brand : C.text2} />
      <Text style={{ color: active ? C.text : C.text2, fontSize: 12, fontWeight: '550' as never, lineHeight: 14 }}>{label}</Text>
    </CarTouch>
  );
}

/** [v8.1 保留] 左侧播放面板 300dp 八件套(封面/信息/进度/三控/工具排/徽标行/队列底锚)——对应 web #panel 家族 */
function PlayPanel({ onOpen, onFx, onQueue, onFav, onArtistTap }: { onOpen: () => void; onFx: () => void; onQueue: () => void; onFav: () => void; onArtistTap: (singer: string) => void }) {
  const { current, playing, toggle, skipNext, skipPrev, queue } = usePlayer();
  const { position, duration } = usePlayerProgress();
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const img = current ? fixCoverUrl(current.img) : undefined;
  const curIdx = queue.findIndex(q => current && q.songmid === current.songmid);
  const nextName = queue.length > 1 ? (queue[(curIdx + 1) % queue.length]?.name ?? '') : '';
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  return (
    <View style={st2.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.brand, marginRight: 5 }} />
        <Text style={{ color: C.text2, fontSize: 9.5 }}>正在播放</Text>
      </View>
      <CarTouch style={{ width: '100%', alignItems: 'center' }} onPress={onOpen}>
        {img ? <Image source={{ uri: img }} style={[st2.panelArt, { width: '92%' }]} /> : <View style={[st2.panelArt, { width: '92%', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={44} color={C.text3} /></View>}
      </CarTouch>
      <Text style={st2.panelTitle} numberOfLines={1}>{current?.name ?? '未在播放'}</Text>
      <CarTouch style={{ width: '100%', alignItems: 'center' }} onPress={() => { if (current?.singer) onArtistTap(current.singer); }}>
        <Text style={st2.panelArtist} numberOfLines={1}>{current?.singer ?? '从首页选一首开始'}</Text>
      </CarTouch>
      <View style={st2.panelProg}><View style={{ flex: pct, backgroundColor: C.brand, borderRadius: 2 }} /><View style={{ flex: 1 - pct, backgroundColor: C.track, borderRadius: 2 }} /></View>
      <View style={st2.panelTimes}><Text style={st2.panelTime}>{fmt(position)}</Text><Text style={st2.panelTime}>{fmt(duration)}</Text></View>
      <View style={st2.panelCtrls}>
        <CarTouch style={st2.pBtn} onPress={skipPrev}><Icon name="previous" size={20} color={C.text} /></CarTouch>
        <CarTouch style={st2.pMain} onPress={toggle}><Icon name={playing ? 'pause' : 'play'} size={26} active color={C.onBrand} /></CarTouch>
        <CarTouch style={st2.pBtn} onPress={skipNext}><Icon name="next" size={20} color={C.text} /></CarTouch>
      </View>
      <View style={[st2.panelTools, { gap: 6 }]}>
        <CarTouch style={[st2.pTool, { flex: 1, width: undefined }]} onPress={onFav}><Icon name="heart" size={16} color={C.text2} /></CarTouch>
        <CarTouch style={[st2.pTool, { flex: 1, width: undefined }]} onPress={onQueue}><Icon name="queue" size={16} color={C.text2} /></CarTouch>
        <CarTouch style={[st2.pTool, { flex: 1, width: undefined }]} onPress={onFx}><Icon name="sliders" size={16} color={C.text2} /></CarTouch>
      </View>
      <View style={st2.panelBadges}>
        <Text style={st2.pBadge}>{current?.source || 'NextMusic'}</Text>
      </View>
      <View style={{ flex: 1 }} />
      <CarTouch style={st2.panelQueue} onPress={onQueue}>
        <Text style={st2.panelQueueText} numberOfLines={1}>接下来 · {nextName} ›</Text>
      </CarTouch>
    </View>
  );
}

export function CarShell() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // [老板令1121 CAR自适应] 结构元素按屏幕百分比(车屏853dp→TV 960dp→平板等自适应)
  const railW = 68; // [老板令1121] rail 固定窄
  const panelW = 200; // [老板令1121] 播放面板固定
  const [page, setPage] = useState<PageKey>('home');
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [playerOpen, setPlayerOpen] = useState(false);
  const [seedQ, setSeedQ] = useState('');
  const [clock, setClock] = useState('');
  useEffect(() => { const f = () => { const d = new Date(); setClock(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); }; f(); const t = setInterval(f, 30000); return () => clearInterval(t); }, []);
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
  const breadcrumb = playlist ? (playlist.name || '歌单') : favOpen ? TITLES.fav : TITLES[page] || 'NextMusic';

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg, paddingTop: Math.max(insets.top, 6), paddingHorizontal: Math.max(insets.left, 0) }}
      >
      {/* [HTML01 car.js] #carRail:brand(36/14) + tabs 竖排 + car-rail-player(70h r16 surface)——rail 112px ÷1.5 */}
      <View style={[st2.rail, { width: railW }]}>
        <View style={st2.railBrand}>
          <Image source={require('../assets/brand/mark.png')} style={{ width: 24, height: 24 }} />
          <Text style={{ color: C.text, fontSize: 9, letterSpacing: -0.3 }}>NextMusic</Text>
        </View>
        <View style={st2.railTabs}>
          {NAV.map(n => (
            <RailTab key={n.key} icon={n.icon} label={n.label}
              active={n.key === 'fav' ? favOpen && !playlist : page === n.key && !favOpen && !playlist}
              onPress={() => n.key === 'fav' ? (setPlaylist(null), setFavOpen(true)) : goPage(n.key as PageKey)} />
          ))}
        </View>
        <CarTouch style={st2.railPlayer} onPress={() => setPlayerOpen(true)}>
          <Icon name="wave" size={17} color={C.brand} />
          <Text style={{ color: C.text2, fontSize: 11 }}>播放</Text>
        </CarTouch>
      </View>

      {/* 右列:面包屑 header(100px ÷1.5) + 主区(panel+content) */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st2.carHeader}>
          <Text style={st2.breadcrumb} numberOfLines={1}>{breadcrumb}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CarTouch style={st2.searchPill} onPress={() => goPage('search')}>
              <Icon name="search" size={15} color={C.text2} />
              <Text style={{ color: C.text2, fontSize: 11 }} numberOfLines={1}>搜索歌曲、歌手、专辑</Text>
            </CarTouch>
            <CarTouch style={st2.iconBtn} onPress={() => goPage('settings')}><Icon name="settings" size={17} color={C.text2} /></CarTouch>
            <Text style={{ color: C.text2, fontSize: 10, fontVariant: ['tabular-nums' as never], marginLeft: 2 }}>{clock}</Text>
          </View>
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[st2.panelWrap, { width: panelW }]}>
            <PlayPanel onOpen={() => setPlayerOpen(true)} onFx={() => goPage('fx')} onQueue={() => goPage('queue')} onFav={() => setFavOpen(true)} onArtistTap={(s) => { setSeedQ(s); goPage('search'); }} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {favOpen ? (
              <CarFavorites onBack={() => setFavOpen(false)} />
            ) : playlist ? (
              <CarPlaylist pl={playlist} onBack={() => setPlaylist(null)} />
            ) : (
              <>
                {page === 'home' && <CarHome goExplore={() => setPage('explore')} goPodcast={() => setPage('podcast')} onOpenFav={() => setFavOpen(true)} onOpenPlaylist={setPlaylist} />}
                {page === 'podcast' && <CarPodcast />}
                {page === 'explore' && <CarExplore onOpenPlaylist={setPlaylist} />}
                {page === 'boards' && <CarBoards onOpenPlaylist={setPlaylist} />}
                {page === 'search' && <CarSearch onBack={() => setPage('home')} seed={seedQ} />}
                {page === 'queue' && <CarQueue onBack={() => setPage('home')} />}
                {page === 'fx' && <CarFx onBack={() => setPage('home')} />}
                {page === 'settings' && <CarSettings onBack={() => setPage('home')} />}
                {page === 'medialibs' && <CarMediaLibs onBack={() => setPage('home')} onFav={() => setFavOpen(true)} />}
              </>
            )}
          </View>
        </View>
      </View>
      <CarPlayer visible={playerOpen} onClose={() => setPlayerOpen(false)} onArtistTap={(s) => { setPlayerOpen(false); setSeedQ(s); goPage('search'); }} />
    </View>
  );
}

const st2 = {
  rail: { flexDirection: 'column' as const, alignItems: 'center' as const, gap: 13, paddingTop: 17, paddingBottom: 13, borderRightWidth: 1, borderRightColor: C.border }, // [1121自适应] width 由 JSX 动态设
  railBrand: { alignItems: 'center' as const, gap: 7, marginBottom: 8 },
  railTabs: { flex: 1, width: '100%' as const, gap: 7, justifyContent: 'flex-start' as const },
  railTab: { width: '100%' as const, minHeight: 53, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5, borderRadius: 12 }, // tab 80h r18 ÷1.5
  railPlayer: { width: '100%' as const, minHeight: 47, borderRadius: 11, backgroundColor: C.surface, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5 }, // car-rail-player 70h r16 ÷1.5
  carHeader: { height: 67, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingLeft: 16, paddingRight: 10, gap: 12 }, // header 100px ÷1.5
  breadcrumb: { color: C.text, fontSize: 21, fontWeight: '650' as never, letterSpacing: -0.3, flex: 1, minWidth: 0 },
  searchPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, height: 36, paddingHorizontal: 13, borderRadius: 12, backgroundColor: C.surface2 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelWrap: { borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.surface }, // [1121自适应] width 由 JSX 动态设
  panel: { flex: 1, padding: 14, gap: 6, alignItems: 'center' as const },
  panelArt: { aspectRatio: 1, maxWidth: 176, borderRadius: 10, backgroundColor: C.surface2 },
  panelTitle: { color: C.text, fontSize: 15, fontWeight: '700' as const, textAlign: 'center' as const, width: '100%' },
  panelArtist: { color: C.text2, fontSize: 11.5, textAlign: 'center' as const, width: '100%' },
  panelProg: { flexDirection: 'row' as const, height: 4, width: '100%', borderRadius: 2, overflow: 'hidden' as const },
  panelTimes: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, width: '100%' },
  panelTime: { color: C.text3, fontSize: 11, fontVariant: ['tabular-nums' as never] },
  panelCtrls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginTop: 4 },
  pBtn: { width: 43, height: 43, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  pMain: { width: 51, height: 51, borderRadius: 26, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelTools: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 6, width: '100%' as const },
  pTool: { width: 57, height: 41, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelBadges: { flexDirection: 'row' as const, gap: 8 },
  pBadge: { color: C.text3, fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: C.surface2 },
  panelQueue: { width: '100%', paddingVertical: 8, alignItems: 'center' as const },
  panelQueueText: { color: C.text3, fontSize: 9 },
};
