// HD 引导页(横版):左品牌区 + 右三张大卡,整卡可聚焦可遥控(替代手机竖版 BootScreen)
// 布局对齐桌面版 150% 观感:大字、大卡、焦点高亮
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useApp } from '../state/AppState';
import { hdNav } from './hdnav';

export function HDBootScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { reset: (o: unknown) => void };
  const { setMode } = useApp();

  const goLocal = () => { setMode('local'); nav.reset({ index: 0, routes: [{ name: 'Main' }] }); };

  const CARDS = [
    {
      key: 'local', icon: 'play' as const, title: '本地使用', tag: '推荐',
      desc: '搜索、榜单、歌单直连音乐平台,无需服务器。添加音源或登录后即可播放。',
      btn: '直接进入', primary: true, onPress: goLocal,
    },
    {
      key: 'server', icon: 'server' as const, title: '连接服务器', tag: '同步',
      desc: '登录服务器账号,同步收藏与歌单,并使用服务器端音源播放。',
      btn: '去登录', primary: false, onPress: () => hdNav()?.navigate('AuthLogin'),
    },
    {
      key: 'media', icon: 'music' as const, title: '接入私有音乐库', tag: 'NAS',
      desc: 'Emby / Jellyfin / Navidrome / 道理鱼 / WebDAV:把 NAS 上的音乐库接入浏览播放。',
      btn: '去添加', primary: false, onPress: () => hdNav()?.navigate('MediaLibs'),
    },
  ];

  return (
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 24), paddingBottom: Math.min(insets.bottom, 20) }]}>
      <View style={st.row}>
        {/* 左:品牌区 */}
        <View style={st.brand}>
          <View style={st.brandLogo}><Icon name="play" size={40} color={C.brand} /></View>
          <Text style={st.brandName}>NextMusic HD</Text>
          <Text style={st.brandSlogan}>车机 · 电视 · 大屏音乐</Text>
          <View style={{ height: 1, backgroundColor: C.stroke, alignSelf: 'stretch', marginVertical: 22 }} />
          <Text style={st.brandHint}>用遥控器方向键选择,按确认键进入</Text>
        </View>

        {/* 右:三张大卡 */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 22, justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 12 }}>
          {CARDS.map((c, i) => (
            <HDTouch
              key={c.key}
              style={st.card}
              hasTVPreferredFocus={i === 0}
              focusStyle={st.cardFocus}
              onPress={c.onPress}
            >
              <View style={st.cardIcon}><Icon name={c.icon} size={32} color={C.brand} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={st.cardTitle}>{c.title}</Text>
                  {c.tag ? <View style={st.cardTag}><Text style={st.cardTagText}>{c.tag}</Text></View> : null}
                </View>
                <Text style={st.cardDesc} numberOfLines={2}>{c.desc}</Text>
              </View>
              <View style={[st.cardBtn, c.primary && st.cardBtnPrimary]}>
                <Text style={[st.cardBtnText, c.primary && st.cardBtnTextPrimary]}>{c.btn} ›</Text>
              </View>
            </HDTouch>
          ))}
          <Text style={st.footHint}>之后可随时在 设置 → 使用方式与账号 切换</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  row: { flex: 1, flexDirection: 'row' },
  brand: { width: 360, paddingHorizontal: 48, justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.stroke, gap: 8 },
  brandLogo: { width: 76, height: 76, borderRadius: 22, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brandName: { color: C.text, fontSize: 32, fontWeight: '800' },
  brandSlogan: { color: C.text2, fontSize: 15 },
  brandHint: { color: C.text3, fontSize: 13 },
  card: {
    minHeight: 138, borderRadius: 20, backgroundColor: '#1A1A1A',
    flexDirection: 'row', alignItems: 'center', padding: 24, gap: 20,
  },
  cardFocus: { borderWidth: 2.5, borderColor: C.brand, backgroundColor: '#222222' },
  cardIcon: { width: 68, height: 68, borderRadius: 20, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: C.text, fontSize: 23, fontWeight: '800' },
  cardTag: { backgroundColor: C.brandDim, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  cardTagText: { color: C.brand, fontSize: 12, fontWeight: '700' },
  cardDesc: { color: C.text2, fontSize: 14, lineHeight: 20 },
  cardBtn: { height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#4A4A4A', paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
  cardBtnPrimary: { backgroundColor: C.brand, borderColor: C.brand },
  cardBtnText: { color: C.text, fontSize: 16, fontWeight: '700' },
  cardBtnTextPrimary: { color: C.onBrand },
  footHint: { color: C.text3, fontSize: 12, textAlign: 'center', paddingTop: 2 },
});
