// HD(车机/TV)主壳:左侧 nav rail + 内容区(层叠保状态) + 底部常驻播放条
// 业务层(播放引擎/音源/媒体库)全复用 phone 版,仅 UI 形态不同
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, fmtSec } from './hdtokens';
import { usePlayer } from '../state/PlayerProvider';
import { hdNav } from './hdnav';
import { HDHome } from './HDHome';
import { HDSearch } from './HDSearch';
import { HDBoards } from './HDBoards';
import { HDMy } from './HDMy';

const TABS = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'search', icon: 'search', label: '搜索' },
  { key: 'boards', icon: 'explore', label: '榜单' },
  { key: 'my', icon: 'my', label: '我的' },
] as const;

export function HDMain() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<number>(0);

  return (
    <View style={st.screen}>
      {/* 左 nav rail（横屏 insets.top 可能很大，capped 防挤出） */}
      <View style={[st.rail, { paddingTop: Math.min(insets.top, 16), paddingBottom: Math.min(insets.bottom, 12) }]}>
        <View style={st.logo}>
          <Icon name="play" size={26} color={C.brand} />
        </View>
        <View style={{ flex: 1, gap: 6, marginTop: 12 }}>
          {TABS.map((t, i) => (
            <TouchableOpacity
              key={t.key}
              style={[st.navBtn, tab === i && st.navBtnOn]}
              activeOpacity={0.8}
              hasTVPreferredFocus={i === 0}
              onPress={() => setTab(i)}
            >
              <Icon name={t.icon} size={24} color={tab === i ? C.brand : C.text2} />
              <Text style={[st.navLabel, tab === i && st.navLabelOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={st.navBtn} activeOpacity={0.8} onPress={() => hdNav()?.navigate('Settings')}>
          <Icon name="settings" size={24} color={C.text2} />
          <Text style={st.navLabel}>设置</Text>
        </TouchableOpacity>
      </View>

      {/* 内容区:层叠保状态(防闪屏,同 phone MainTabs) */}
      <View style={st.body}>
        <View style={st.tabStack} collapsable={false}>
          <View style={[st.tabHost, tab !== 0 && st.tabOff]}><HDHome /></View>
          <View style={[st.tabHost, tab !== 1 && st.tabOff]}><HDSearch /></View>
          <View style={[st.tabHost, tab !== 2 && st.tabOff]}><HDBoards /></View>
          <View style={[st.tabHost, tab !== 3 && st.tabOff]}><HDMy /></View>
        </View>
        <HDPlayBar />
      </View>
    </View>
  );
}

// 底部常驻播放条:封面 + 信息 + 进度 + 大控件 + 展开进全屏播放页
function HDPlayBar() {
  const insets = useSafeAreaInsets();
  const { current, playing, position, duration, toggle, skipNext, skipPrev } = usePlayer();
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={[st.playbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {current ? (
        <>
          <TouchableOpacity activeOpacity={0.85} style={st.pbLeft} onPress={() => hdNav()?.navigate('Player')}>
            {current.img ? (
              <Image source={{ uri: current.img }} style={st.pbArt} />
            ) : (
              <View style={[st.pbArt, { backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name="music" size={22} color={C.text2} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={st.pbTitle} numberOfLines={1}>{current.name}</Text>
              <Text style={st.pbSub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>
            </View>
          </TouchableOpacity>

          {/* 进度(不可拖,展示) */}
          <View style={st.pbProg}>
            <Text style={st.pbTime}>{fmtSec(position)}</Text>
            <View style={st.pbTrack}>
              <View style={[st.pbFill, { flex: pct }]} />
              <View style={{ flex: 1 - pct }} />
            </View>
            <Text style={st.pbTime}>{fmtSec(duration)}</Text>
          </View>

          <View style={st.pbCtrls}>
            <TouchableOpacity style={st.pbBtn} activeOpacity={0.8} onPress={skipPrev}>
              <Icon name="previous" size={30} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={st.pbMain} activeOpacity={0.85} onPress={toggle}>
              <Icon name={playing ? 'pause' : 'play'} size={34} color={C.onBrand} />
            </TouchableOpacity>
            <TouchableOpacity style={st.pbBtn} activeOpacity={0.8} onPress={skipNext}>
              <Icon name="next" size={30} color={C.text} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={st.pbSub}>NextMusic HD · 搜索或打开榜单开始播放</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  rail: { width: H.rail, backgroundColor: '#181818', alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.stroke, gap: 6 },
  logo: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  navBtn: { width: 96, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navBtnOn: { backgroundColor: '#242424' },
  navLabel: { color: C.text2, fontSize: 12 },
  navLabelOn: { color: C.brand, fontWeight: '700' },
  body: { flex: 1 },
  tabStack: { flex: 1 },
  tabHost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tabOff: { opacity: 0, pointerEvents: 'none', elevation: 0 },
  playbar: {
    height: H.playbar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, gap: 22,
    backgroundColor: '#1D1D1D', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.stroke,
  },
  pbLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 },
  pbArt: { width: 62, height: 62, borderRadius: 10 },
  pbTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  pbSub: { color: C.text2, fontSize: 13 },
  pbProg: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 300 },
  pbTime: { color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'] },
  pbTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#333', flexDirection: 'row', overflow: 'hidden' },
  pbFill: { backgroundColor: C.brand },
  pbCtrls: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  pbBtn: { width: H.touch, height: H.touch, alignItems: 'center', justifyContent: 'center' },
  pbMain: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
});
