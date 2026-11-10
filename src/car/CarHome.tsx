// CarHome.tsx —— [车机 P1 为我推荐 1105] LEO v7 规格 §1: 问候 hero + 双大卡 + 最近播放行 + 推荐歌单 rail
import { CarTouch } from './CarTouch';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions, Linking } from 'react-native';
import { CAR, carScale, CAR_FS } from './cartokens';
import { TrialBar, QuotaBar, PaywallCard } from './commercial';
import { useLicense } from '../services/license';
import { GATE_COPY, BUY_LINKS } from '../services/benefits';
import { CarBigCard, CarRecCard, CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { lxapi } from '../services/lxapi';
import { getRecents } from '../state/recent';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import type { SongItem, SongListMeta } from '../services/server';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function SecHead({ title, hint, more, onMore }: { title: string; hint?: string; more?: boolean; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
      <Text style={{ color: C.text, fontSize: CAR_FS.sec, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: C.text3, fontSize: CAR_FS.mini, paddingBottom: 2 }}>{hint}</Text> : null}
      {more ? <CarTouch onPress={onMore} style={{ marginLeft: 'auto' }}><Text style={{ color: C.brand, fontSize: 15 }}>更多 ›</Text></CarTouch> : null}
    </View>
  );
}

export function CarHome({ goExplore, onOpenPlaylist }: { goExplore: () => void; onOpenPlaylist: (pl: import('./CarPlaylist').CarPlRef) => void }) {
  const player = usePlayer();
  // [720 紧凑档 1106] 屏高 <800(车机横屏)→卡片压缩,首屏保密度
  const { height } = useWindowDimensions();
  const dense = carScale(height) < 0.9;
  const { username } = useApp();
  const lic = useLicense(); // [1107] 商业化三件接线:试用条/配额条/付费墙
  const openBuy = () => {
    // CTA 金钮 → 爱发电商品页(与 BenefitsSheet/GateSheet 同链)
    if (typeof window !== 'undefined') window.open(BUY_LINKS.pro, '_blank', 'noopener');
    else Linking.openURL(BUY_LINKS.pro);
  };
  const openTrial = () => { /* 试用入口:走授权页 activate(见 LicenseScreen) */ };
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [mixes, setMixes] = useState<SongListMeta[]>([]);

  const [mine, setMine] = useState<SongListMeta[]>([]);
  useEffect(() => {
    setRecents(getRecents().slice(0, 3));
    // [老板 1110] 推荐歌单与自建歌单双区重复——同区合并: 自建优先,推荐按 name 去重后补位(对齐 HD 内容口径)
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
      setMixes(dedup(mixPool, 6 - Math.min(mineList.length, 3)));
    });
  }, []);

  // 歌单卡点击→P5 详情页(下批实施;骨架期 noop)

  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800', marginBottom: 20 }}>
        {username ? `${greeting()}，${username}` : greeting()}
      </Text>

      {/* 双大卡: 每日精选 / 私人雷达 (v7 真版基准组件) */}
      <View style={{ flexDirection: 'row', gap: CAR.gap, marginBottom: CAR.sectionGap }}>
        <CarBigCard dense={dense} badge="每日精选" title="30 首热歌" sub="每天更新" accent="#3B2F6F"
          onPress={() => {
            // [1107 真机实锤] 新用户无播放史时大卡点击无反应——fallback 推荐歌单第一首
            if (recents.length) { void player.playSong(recents[0], recents); return; }
            const m = mixes[0];
            if (m) void lxapi.songListDetail(m.id).then(d => { const l = d?.list || []; if (l.length) void player.playSong(l[0], l); }).catch(() => {});
          }} />
        <CarBigCard dense={dense} badge="私人雷达" title="你最近循环的歌" sub="根据口味生成" accent="#1E5F56"
          onPress={() => {
            if (recents.length) { void player.playSong(recents[0], recents); return; }
            const m = mixes[Math.min(1, mixes.length - 1)];
            if (m) void lxapi.songListDetail(m.id).then(d => { const l = d?.list || []; if (l.length) void player.playSong(l[Math.floor(l.length / 2)], l); }).catch(() => {});
          }} />
      </View>

      {recents.length > 0 && (
        <View style={{ marginBottom: CAR.sectionGap }}>
          <SecHead title="最近播放" />
          {recents.map((s, i) => (
            <CarSongRow key={`r${i}`} song={s} onPress={() => void player.playSong(s, recents)} />
          ))}
        </View>
      )}

      {mine.length > 0 && (
        <View style={{ marginBottom: CAR.sectionGap }}>
          <SecHead title="我的歌单" hint="自建/同步" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: CAR.gap, paddingRight: CAR.gutter }}>
            {mine.map(pl => (
              <CarRecCard dense={dense} key={`m${pl.id}`} img={pl.img} name={pl.name} sub={pl.total ? `共 ${pl.total} 首` : undefined}
                onPress={() => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img })} />
            ))}
          </ScrollView>
        </View>
      )}

      {mixes.length > 0 && (
        <View style={{ marginBottom: CAR.sectionGap }}>
          <SecHead title="推荐歌单" hint="五源聚合" more onMore={goExplore} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: CAR.gap, paddingRight: CAR.gutter }}>
            {mixes.map(pl => (
              <CarRecCard key={pl.id} img={pl.img} name={pl.name} sub={pl.total ? `共 ${pl.total} 首` : undefined}
                onPress={() => onOpenPlaylist({ kind: 'pl', id: pl.id, name: pl.name, img: pl.img })} />
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}
