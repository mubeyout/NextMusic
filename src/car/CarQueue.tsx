// CarQueue.tsx —— [A2 队列页·LEO v75 缺口包 1107·老板令 0927] 当前队列/播放历史 pills 合并视图;正在播 brandDim 高亮;排队行 ≡ 把手视觉;播放全部/清空
import { CarTouch } from './CarTouch';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { CAR, CAR_FS } from './cartokens';
import { CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer } from '../state/PlayerProvider';
import { getRecents } from '../state/recent';
import { toast } from '../components/Dialog';

export function CarQueue({ onBack }: { onBack: () => void }) {
  const player = usePlayer();
  const [tab, setTab] = useState<'queue' | 'hist'>('queue');
  const recents = getRecents().slice(0, 50);
  const list = tab === 'queue' ? player.queue : recents;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <CarTouch style={st.backBtn} onPress={onBack}><Icon name="back" size={20} color={C.text2} /></CarTouch>
        <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800', flex: 1 }}>播放队列</Text>
        {tab === 'queue' && player.queue.length ? (
          <CarTouch style={st.actBtn} onPress={() => { player.clearQueue(); toast('队列已清空'); }}>
            <Text style={st.actDanger}>清空</Text>
          </CarTouch>
        ) : null}
        {tab === 'queue' && player.queue.length > 1 ? (
          <CarTouch style={st.actBtn} onPress={() => void player.playSong(player.queue[0], player.queue)}>
            <Text style={st.actText}>播放全部</Text>
          </CarTouch>
        ) : null}
      </View>

      {/* 合并视图 pills */}
      <View style={st.tabs}>
        <CarTouch style={[st.tab, tab === 'queue' && st.tabOn]} onPress={() => setTab('queue')}>
          <Text style={[st.tabText, tab === 'queue' && { color: C.brand }]}>当前队列 · {player.queue.length}</Text>
        </CarTouch>
        <CarTouch style={[st.tab, tab === 'hist' && st.tabOn]} onPress={() => setTab('hist')}>
          <Text style={[st.tabText, tab === 'hist' && { color: C.brand }]}>播放历史 · {recents.length}</Text>
        </CarTouch>
      </View>

      {list.length ? list.map((s, i) => {
        const now = tab === 'queue' && player.current && player.current.songmid === s.songmid && i === player.queue.findIndex(x => x.songmid === player.current?.songmid);
        return (
          <View key={`${i}${s.songmid}`} style={now ? st.rowNow : null}>
            {now ? <View style={st.nowTag}><Text style={st.nowTagText}>正在播放</Text></View> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <CarSongRow song={s} dense onPress={() => void player.playSong(s, list)} />
              </View>
              {tab === 'queue' && !now ? <Text style={st.handle}>≡</Text> : null}
            </View>
          </View>
        );
      }) : (
        <Text style={st.empty}>{tab === 'queue' ? '队列为空——去「为我推荐」或搜索点歌' : '暂无播放记录'}</Text>
      )}
    </ScrollView>
  );
}

const st = {
  backBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  actBtn: { height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  actText: { color: C.text, fontSize: CAR_FS.sub, fontWeight: '600' as const },
  actDanger: { color: C.danger, fontSize: CAR_FS.sub, fontWeight: '600' as const },
  tabs: { flexDirection: 'row' as const, gap: 12, marginBottom: 18 },
  tab: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  tabOn: { backgroundColor: C.brandDim },
  tabText: { color: C.text2, fontSize: CAR_FS.sub, fontWeight: '600' as const },
  rowNow: { backgroundColor: C.brandDim, borderRadius: 13, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  nowTag: { alignSelf: 'flex-start' as const, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, backgroundColor: C.brand },
  nowTagText: { color: C.onBrand, fontSize: CAR_FS.tiny, fontWeight: '700' as const },
  handle: { width: 44, textAlign: 'center' as const, color: C.text3, fontSize: 22 },
  empty: { color: C.text3, fontSize: CAR_FS.sub, textAlign: 'center' as const, marginTop: 40 },
};
