// CarMediaLibs.tsx —— [老板 1110] 媒体库车机页: 大卡 provider 列表(56px 触点)+添加入口,不再直接跳 phone 竖屏页
import { CarTouch } from './CarTouch';
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { CAR, CAR_FS } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { providers } from '../services/providers';
import { useNavigation } from '@react-navigation/native';

const TYPE_META: Record<string, { icon: string; name: string; desc: string }> = {
  emby: { icon: 'server', name: 'Emby', desc: 'NAS 影音库' },
  jellyfin: { icon: 'server', name: 'Jellyfin', desc: '开源媒体库' },
  navidrome: { icon: 'server', name: 'Navidrome', desc: '音乐服务器' },
  daoliyu: { icon: 'cloud', name: '道理鱼', desc: 'Subsonic 协议' },
  subsonic: { icon: 'cloud', name: 'Subsonic', desc: '通用协议' },
  webdav: { icon: 'folder', name: 'WebDAV', desc: '网盘直挂' },
  plex: { icon: 'server', name: 'Plex', desc: 'Plex 媒体库' },
};

export function CarMediaLibs({ onBack, onFav }: { onBack: () => void; onFav: () => void }) {
  const nav = useNavigation() as { navigate: (s: string, params?: unknown) => void };
  const [list] = useState(() => providers.all());

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: CAR.gutter, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <CarTouch style={st.backBtn} onPress={onBack}><Icon name="back" size={20} color={C.text2} /></CarTouch>
        <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800', flex: 1 }}>媒体库</Text>
        <CarTouch style={st.addBtn} onPress={() => nav.navigate('MediaLibs')}>
          <Icon name="add" size={20} color={C.onBrand} />
          <Text style={st.addText}>添加</Text>
        </CarTouch>
      </View>

      {/* [LEO 1110] 收藏入口进乐库首行(顶栏 heart 图标撤) */}
      <CarTouch style={st.card} onPress={onFav}>
        <View style={st.iconWrap}><Icon name="heart" size={30} color={C.brand} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={st.cardTitle} numberOfLines={1}>我的收藏</Text>
          <Text style={st.cardSub} numberOfLines={1}>收藏的歌曲 · 点击查看</Text>
        </View>
        <Icon name="chevronright" size={22} color={C.text3} />
      </CarTouch>

      {list.length ? list.map(p => {
        const meta = TYPE_META[p.type] || { icon: 'server', name: p.type, desc: '' };
        return (
          <CarTouch key={p.id} style={st.card} onPress={() => nav.navigate('ProviderEdit', { id: p.id })}>
            <View style={st.iconWrap}><Icon name={meta.icon as never} size={30} color={C.brand} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={st.cardTitle} numberOfLines={1}>{p.name || meta.name}</Text>
              <Text style={st.cardSub} numberOfLines={1}>{meta.name}{meta.desc ? ` · ${meta.desc}` : ''} · 点击管理</Text>
            </View>
            <Icon name="chevronright" size={22} color={C.text3} />
          </CarTouch>
        );
      }) : (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 50 }}>
          <Icon name="server" size={44} color={C.text3} />
          <Text style={{ color: C.text3, fontSize: CAR_FS.sub }}>还没有媒体库连接</Text>
          <CarTouch style={st.addBtn} onPress={() => nav.navigate('MediaLibs')}>
            <Icon name="add" size={18} color={C.onBrand} />
            <Text style={st.addText}>添加第一个</Text>
          </CarTouch>
        </View>
      )}
    </ScrollView>
  );
}

const st = {
  backBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  addBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: C.brand },
  addText: { color: C.onBrand, fontSize: CAR_FS.sub, fontWeight: '700' as const },
  card: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 18, minHeight: 88, paddingHorizontal: 22, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  iconWrap: { width: 64, height: 64, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  cardTitle: { color: C.text, fontSize: CAR_FS.body, fontWeight: '700' as const },
  cardSub: { color: C.text3, fontSize: CAR_FS.mini },
};
