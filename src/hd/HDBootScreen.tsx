// HD 引导页(横版) v3:单行字标(去大 logo 块)+紧凑三卡(老板反馈:卡片太大、banner/logo 不对)
// 整卡可聚焦可遥控;主推卡品牌高亮;焦点环 + focusBg + glow
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
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
    <View style={[st.screen, { paddingTop: Math.min(insets.top, 28), paddingBottom: Math.min(insets.bottom, 20), justifyContent: 'center' }]}>
      {/* 顶部品牌区:新品牌玻璃 Mark + 字标(Figma Brand Identity) */}
      <View style={st.brand}>
        <Image source={require('../assets/brand/mark.png')} style={st.brandMark} />
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 14 },
  brandMark: { width: 30, height: 32 },
  brandName: { color: C.text, fontSize: 22, fontWeight: '800' },
  brandSlogan: { color: C.text3, fontSize: 12 },
  cardRow: { flexDirection: 'row', gap: 18, alignSelf: 'center', maxWidth: 780, width: '100%', maxHeight: 330, minHeight: 250, overflow: 'hidden' },
  card: {
    flex: 1, borderRadius: 18, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', padding: 16, gap: 9, overflow: 'hidden' },
  cardPrimary: { borderWidth: 1.5, borderColor: C.brand + '66' },
  cardFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 18 },
  cardIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  cardIconPrimary: { backgroundColor: C.brand },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden' },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  cardTag: { backgroundColor: C.brandDim, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  cardTagPrimary: { backgroundColor: C.brandDim },
  cardTagText: { color: C.brand, fontSize: 11, fontWeight: '700' },
  cardTagTextPrimary: { color: C.brand },
  cardDesc: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  cardBtn: {
    marginTop: 4, height: 42, borderRadius: 13, borderWidth: 1.5, borderColor: '#4A4A4A',
    paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBtnPrimary: { backgroundColor: C.brand, borderColor: C.brand },
  cardBtnText: { color: C.text, fontSize: 13, fontWeight: '700' },
  cardBtnTextPrimary: { color: C.onBrand },
  footHint: { color: C.text3, fontSize: 11, textAlign: 'center', marginTop: 14 },
});
