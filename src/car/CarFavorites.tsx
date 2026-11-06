// CarFavorites.tsx —— [车机收藏页 1106] 我的收藏(loveList)+最近播放(recents) 统一车机页(老板令"完成所有"清 TODO)
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { CAR } from './cartokens';
import { CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer } from '../state/PlayerProvider';
import { sync, lxToApp } from '../services/sync';
import { getRecents } from '../state/recent';
import type { SongItem } from '../services/server';

function SecHead({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14, marginTop: 26 }}>
      <Text style={{ color: C.text, fontSize: CAR.secTitle, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: C.text3, fontSize: 13, paddingBottom: 2 }}>{count} 首</Text>
    </View>
  );
}

export function CarFavorites() {
  const player = usePlayer();
  const [loved, setLoved] = useState<SongItem[]>([]);
  const [recents, setRecents] = useState<SongItem[]>([]);

  const load = () => {
    const snap = sync.cachedLists();
    setLoved((snap?.loveList || []).map(lxToApp));
    setRecents(getRecents().slice(0, 30));
    sync.fetchLists().then(() => {
      const s2 = sync.cachedLists();
      if (s2?.loveList) setLoved(s2.loveList.map(lxToApp));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.text, fontSize: CAR.hero, fontWeight: '800' }}>我的收藏</Text>

      <SecHead title="最近播放" count={recents.length} />
      {recents.length ? recents.map((s, i) => (
        <CarSongRow key={`r${i}`} song={s} onPress={() => void player.playSong(s, recents)} />
      )) : <Text style={{ color: C.text3, fontSize: 14 }}>暂无播放记录</Text>}

      <SecHead title="我喜欢的" count={loved.length} />
      {loved.length ? loved.map((s, i) => (
        <CarSongRow key={`l${i}${s.songmid}`} song={s} onPress={() => void player.playSong(s, loved)} />
      )) : (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 30 }}>
          <Icon name="heart" size={36} color={C.text3} />
          <Text style={{ color: C.text3, fontSize: 14 }}>登录服务器后同步收藏</Text>
        </View>
      )}
    </ScrollView>
  );
}
