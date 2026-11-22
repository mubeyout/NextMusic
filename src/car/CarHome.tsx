// CarHome.tsx —— [HTML01 car.js 1120] 车机首页:filters(pills+note) / car-home-highlights(car-daily+双 shortcut) / 为你推荐 wall / 最近播放 car-resume / 我的歌单 wall
import { CarTouch } from './CarTouch';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, useWindowDimensions, Linking, ActivityIndicator } from 'react-native';
import { CAR, carScale, CAR_FS, carGrid } from './cartokens';
import { TrialBar, QuotaBar, PaywallCard } from './commercial';
import { useLicense } from '../services/license';
import { GATE_COPY, BUY_LINKS } from '../services/benefits';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { lxapi } from '../services/lxapi';
import { library } from '../state/library';
import { getRecents } from '../state/recent';
import { sync, lxToApp } from '../services/sync';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import type { SongItem, SongListMeta } from '../services/server';

function Section({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32, marginTop: 16, marginBottom: 9, gap: 9 }}>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '650' as never }}>{title}</Text>
      <View style={{ flex: 1 }} />
      {more ? <CarTouch style={{ paddingVertical: 2, paddingHorizontal: 5 }} onPress={onMore}><Text style={{ color: C.brand, fontSize: 11 }}>{more} ›</Text></CarTouch> : null}
    </View>
  );
}

/** [HTML01] 推荐墙卡(r18 border surface/封面 aspect1.25/题16/副13 →÷1.5)+右下播放钮 */
function WallCard({ pl, onOpen, onPlay, w }: { pl: SongListMeta; onOpen: () => void; onPlay: () => void; w: number }) {
  return (
    <CarTouch activeOpacity={0.95} onPress={onOpen}
      style={{ width: w, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      <View style={{ position: 'relative' }}>
        <View style={{ width: '100%', aspectRatio: 1.25, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          {pl.img ? <Image source={{ uri: pl.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={20} color={C.text3} />}
        </View>
        <CarTouch style={{ position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }} onPress={onPlay}>
          <Icon name="play" size={10} color={C.onBrand} />
        </CarTouch>
      </View>
      <View style={{ paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8, gap: 3 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '550' as never }} numberOfLines={1}>{pl.name}</Text>
        <Text style={{ color: C.text3, fontSize: 10.5 }} numberOfLines={1}>{pl.total ? pl.total + ' 首' : (pl.author || '推荐歌单')}</Text>
      </View>
    </CarTouch>
  );
}

export function CarHome({ goExplore, goPodcast, onOpenFav, onOpenPlaylist }: { goExplore: () => void; goPodcast?: () => void; onOpenFav?: () => void; onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const player = usePlayer();
  const { height, width: winW } = useWindowDimensions();
  const dense = carScale(height) < 0.9;
  // [老板令1121#2] 统一栅格: carGrid 定宽卡 + 横向滚动,一行4个,右边不留空,第二行不再出现巨卡
  const G = carGrid(winW);
  const cardW = G.cardW;
  const GAP = G.gap;
  const { username } = useApp();
  const lic = useLicense();
  const [tab, setTab] = useState<'全部' | '音乐' | '播客'>('全部');
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);
  const [mine, setMine] = useState<SongListMeta[]>([]);
  const [dailyBusy, setDailyBusy] = useState(false);
  const localPls = library.all();
  const favCount = localPls.find(p => p.name === '我喜欢的')?.songs.length ?? 0;

  useEffect(() => {
    setRecents(getRecents().slice(0, 6));
    const seen = new Set<string>();
    const dedup = (list: SongListMeta[], limit: number) => {
      const out: SongListMeta[] = [];
      for (const pl of list) {
        const key = `${pl.name}|${pl.id ?? ''}`;
        if (!seen.has(key)) { seen.add(key); out.push(pl); }
        if (out.length >= limit) break;
      }
      return out;
    };
    // [1122#2] mine = server user lists first, lxapi fallback    sync.fetchLists().then(snap => {      const uls = (snap && snap.userList || []).slice(0, 12);      if (uls.length) setMine(uls.map(ul => ({        id: String(ul.id), name: ul.name, source: 'custom',        total: (ul.list || []).length,        img: (ul.list || []).map(x => lxToApp(x).img).find(Boolean),      })));    }).catch(() => {});
    Promise.all([
      lxapi.songListList('', '5', 1, 12, 'wy').catch(() => ({ list: [] as SongListMeta[] })),
      lxapi.songListAuto('', '5', 1, 12, false).catch(() => ({ list: [] as SongListMeta[] })),
    ]).then(([mineRes, mixRes]) => {
      const mineList = (mineRes?.list || []).slice(0, 6);
      setMine(mineList);
      const mixPool = (mixRes?.list || []).filter((pl: SongListMeta) => {
        const key = `${pl.name}|${pl.id ?? ''}`;
        return !mineList.some(m => `${m.name}|${m.id ?? ''}` === key);
      });
      setMixes(dedup(mixPool, 8));
    });
  }, []);

  const openPl = (pl: SongListMeta) => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img });
  const playPl = (pl: SongListMeta) => {
    lxapi.songListDetail(pl.id, 1, pl.source || 'wy').then(d => {
      const l = d?.list || [];
      if (l.length) void player.playSong(l[0], l);
    }).catch(() => {});
  };

  // car-daily:每日精选(recents 兜底 mixes 首歌单)
  const playDaily = () => {
    if (dailyBusy) return;
    setDailyBusy(true);
    if (recents.length) { void player.playSong(recents[0], recents); setDailyBusy(false); return; }
    const m = mixes[0];
    if (m) { void lxapi.songListDetail(m.id).then(d => { const l = d?.list || []; if (l.length) void player.playSong(l[0], l); }).catch(() => {}).finally(() => setDailyBusy(false)); }
    else setDailyBusy(false);
  };
  // 私人雷达:最近循环随机
  const playRadar = () => {
    if (!recents.length) return;
    const shuffled = [...recents].sort(() => Math.random() - 0.5);
    void player.playSong(shuffled[0], shuffled);
  };

  const radarImg = mixes[0]?.img;

  return (
    <ScrollView focusable={false} contentContainerStyle={{ padding: 14, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
      {/* [HTML01 car.js] car-home-filters:pills 54h r16(20px) + car-home-note */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {(['全部', '音乐', '播客'] as const).map(label => (
          <CarTouch key={label} style={{ paddingHorizontal: 16, height: 36, borderRadius: 11, backgroundColor: tab === label ? C.brand : C.surface, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => { if (label === '播客') { goPodcast?.(); return; } setTab(label); }}>
            <Text style={{ color: tab === label ? '#111214' : C.text2, fontSize: 13.5, fontWeight: tab === label ? '650' as never : '500' as never }}>{label}</Text>
          </CarTouch>
        ))}
        <Text style={{ color: C.text3, fontSize: 12, marginLeft: 6 }}>让喜欢的音乐，陪你这一程</Text>
      </View>

      {tab === '全部' ? (
      <View>
      {/* [老板令1121#3] highlights 三卡横排等高:每日精选(品牌大卡) + 我喜欢的 + 私人雷达 */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <CarTouch activeOpacity={0.92} onPress={playDaily}
          style={{ flex: 1.4, height: dense ? 116 : 136, borderRadius: 13, borderWidth: 1, borderColor: '#2E5A4E', overflow: 'hidden', backgroundColor: '#19302B' }}>
          {mixes[1]?.img ? <Image source={{ uri: mixes[1].img }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" /> : null}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,41,35,.88)' }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 17, paddingRight: 60, gap: 5 }}>
            <Text style={{ color: '#D0E3DC', fontSize: 11 }}>{dailyBusy ? '正在准备…' : '每日精选'}</Text>
            <Text style={{ color: '#FFFFFF', fontSize: dense ? 18 : 23, fontWeight: '650' as never, letterSpacing: -0.8 }}>下一程，好音乐</Text>
            <Text style={{ color: '#D0E3DC', fontSize: 11.5 }}>为你选好的熟悉旋律</Text>
          </View>
          <View style={{ position: 'absolute', right: 15, bottom: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
            {dailyBusy ? <ActivityIndicator size="small" color="#111214" /> : <Icon name="play" size={19} active color="#111214" />}
          </View>
        </CarTouch>
        <CarTouch activeOpacity={0.95} onPress={() => onOpenFav?.()}
          style={{ flex: 1, height: dense ? 116 : 136, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,90,118,.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="heart" size={21} color="#FF5A76" active />
          </View>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '650' as never }} numberOfLines={1}>我喜欢的</Text>
          <Text style={{ color: C.text2, fontSize: 11 }} numberOfLines={1}>{favCount} 首收藏</Text>
        </CarTouch>
        <CarTouch activeOpacity={0.95} onPress={playRadar}
          style={{ flex: 1, height: dense ? 116 : 136, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(30,215,96,.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wave" size={21} color={C.brand} />
          </View>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '650' as never }} numberOfLines={1}>私人雷达</Text>
          <Text style={{ color: C.text2, fontSize: 11 }} numberOfLines={1}>发现新的喜欢</Text>
        </CarTouch>
      </View>

      {/* [HTML01] 为你推荐 wall:min190 auto-fill ×6 */}
      <Section title="为你推荐" more="发现更多" onMore={goExplore} />
      <ScrollView focusable={false} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + GAP} decelerationRate="fast"
        contentContainerStyle={{ gap: GAP, paddingRight: 14 }}>
        {mixes.map(pl => (
          <WallCard key={`x${pl.source}_${pl.id}`} w={cardW} pl={pl} onOpen={() => openPl(pl)} onPlay={() => playPl(pl)} />
        ))}
      </ScrollView>
      </View>
      ) : null}

      {/* [HTML01] 最近播放:car-resume 3 列(img64/题21/副17 →÷1.5)或空态 */}
      <Section title="最近播放" />
      {recents.length ? (
        <ScrollView focusable={false} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + GAP} decelerationRate="fast"
          contentContainerStyle={{ gap: GAP, paddingRight: 14 }}>
          {recents.map((s, i) => (
              <CarTouch key={`r${i}`} activeOpacity={0.9} onPress={() => void player.playSong(s, recents)}
                style={{ width: cardW, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <View style={{ width: '100%', aspectRatio: 1.25, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  {s.img ? <Image source={{ uri: s.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="music" size={22} color={C.text3} />}
                </View>
                <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 9, gap: 3 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '550' as never }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: C.text3, fontSize: 10.5 }} numberOfLines={1}>{s.singer}</Text>
                </View>
              </CarTouch>
          ))}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
          <Icon name="music" size={18} color={C.text3} />
          <Text style={{ flex: 1, color: C.text2, fontSize: 12, lineHeight: 19 }}>听过的音乐会留在这里，随时接着听。</Text>
          <CarTouch style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }} onPress={playDaily}>
            <Text style={{ color: '#111214', fontSize: 11, fontWeight: '650' as never }}>开始听歌</Text>
          </CarTouch>
        </View>
      )}

      {/* [HTML01] 我的歌单 wall */}
      {mine.length ? (
        <View>
          <Section title="我的歌单" />
          <ScrollView focusable={false} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + GAP} decelerationRate="fast"
            contentContainerStyle={{ gap: GAP, paddingRight: 14 }}>
            {mine.map(pl => (
              <WallCard key={`m${pl.id}`} w={cardW} pl={pl} onOpen={() => openPl(pl)} onPlay={() => playPl(pl)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}
