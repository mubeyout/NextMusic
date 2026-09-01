// HD 引导页(横版) v2:顶部品牌 + 一排三张竖版大卡(对齐 v4 卡片设计语言)
// 整卡可聚焦可遥控;主推卡品牌高亮;焦点环 + focusBg + glow
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C, SH } from './hdtokens';
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
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 28), paddingBottom: Math.min(insets.bottom, 20) }]}>
      {/* 顶部品牌区 */}
      <View style={st.brand}>
        <View style={st.brandLogo}><Icon name="play" size={34} color={C.brand} /></View>
        <Text style={st.brandName}>NextMusic HD</Text>
        <Text style={st.brandSlogan}>车机 · 电视 · 大屏音乐</Text>
      </View>

      {/* 一排三张竖版大卡 */}
      <View style={st.cardRow}>
        {CARDS.map((c, i) => (
          <HDTouch
            key={c.key}
            style={[st.card, c.primary && st.cardPrimary]}
            hasTVPreferredFocus={i === 0}
            focusStyle={st.cardFocus}
            focusBg="#232323"
            glow={SH.brand}
            onPress={c.onPress}
          >
            <View style={[st.cardIcon, c.primary && st.cardIconPrimary]}>
              <Icon name={c.icon} size={34} color={c.primary ? C.onBrand : C.brand} />
            </View>
            <View style={st.cardTitleRow}>
              <Text style={st.cardTitle}>{c.title}</Text>
              {c.tag ? (
                <View style={[st.cardTag, c.primary && st.cardTagPrimary]}>
                  <Text style={[st.cardTagText, c.primary && st.cardTagTextPrimary]}>{c.tag}</Text>
                </View>
              ) : null}
            </View>
            <Text style={st.cardDesc}>{c.desc}</Text>
            <View style={[st.cardBtn, c.primary && st.cardBtnPrimary]}>
              <Text style={[st.cardBtnText, c.primary && st.cardBtnTextPrimary]}>{c.btn} ›</Text>
            </View>
          </HDTouch>
        ))}
      </View>

      <Text style={st.footHint}>用遥控器方向键选择,按确认键进入 · 之后可随时在 设置 → 使用方式与账号 切换</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  brand: { alignItems: 'center', gap: 4, marginTop: 10, marginBottom: 18 },
  brandLogo: {
    width: 62, height: 62, borderRadius: 18, backgroundColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    boxShadow: '0 8px 26px rgba(30,215,96,.22)',
  },
  brandName: { color: C.text, fontSize: 28, fontWeight: '800' },
  brandSlogan: { color: C.text2, fontSize: 14 },
  cardRow: { flex: 1, flexDirection: 'row', gap: 22, alignSelf: 'stretch', paddingHorizontal: 56, maxHeight: 460 },
  card: {
    flex: 1, borderRadius: 20, backgroundColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12,
    boxShadow: SH.card,
  },
  cardPrimary: { borderWidth: 1.5, borderColor: C.brand + '66' },
  cardFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 20 },
  cardIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  cardIconPrimary: { backgroundColor: C.brand },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { color: C.text, fontSize: 21, fontWeight: '800' },
  cardTag: { backgroundColor: C.brandDim, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  cardTagPrimary: { backgroundColor: C.brandDim },
  cardTagText: { color: C.brand, fontSize: 12, fontWeight: '700' },
  cardTagTextPrimary: { color: C.brand },
  cardDesc: { color: C.text2, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  cardBtn: {
    marginTop: 6, height: 50, borderRadius: 15, borderWidth: 1.5, borderColor: '#4A4A4A',
    paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center',
  },
  cardBtnPrimary: { backgroundColor: C.brand, borderColor: C.brand, boxShadow: SH.brand },
  cardBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  cardBtnTextPrimary: { color: C.onBrand },
  footHint: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
