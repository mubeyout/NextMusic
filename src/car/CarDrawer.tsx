// CarDrawer.tsx —— [车机 搜索/队列右抽屉 1105] LEO 规格§5: 420 宽右侧覆盖层(#00000080 scrim),搜索实时过滤/队列列表
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Pressable } from 'react-native';
import { CAR } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer } from '../state/PlayerProvider';
import { fixCoverUrl } from '../utils/cover';
import type { SongItem } from '../services/server';

export function CarDrawer({ mode, onClose, onOpenPlaylist }: {
  mode: 'search' | 'queue' | null;
  onClose: () => void;
  onOpenPlaylist?: (pl: import('./CarPlaylist').CarPlRef) => void;
}) {
  const player = usePlayer();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SongItem[]>([]);

  if (!mode) return null;
  return (
    <Pressable style={st.scrim} onPress={onClose}>
      <Pressable style={st.panel}>
        <View style={st.head}>
          <Text style={st.title}>{mode === 'search' ? '搜索' : `播放队列 · ${player.queue.length}`}</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}><Icon name="close" size={18} color={C.text2} /></TouchableOpacity>
        </View>

        {mode === 'search' ? (
          <>
            <TextInput style={st.input} placeholder="歌曲 / 歌手 / 专辑" placeholderTextColor={C.text3}
              value={q} onChangeText={setQ} onSubmitEditing={() => {
                if (!q.trim()) return;
                import('../services/lxapi').then(({ lxapi }) => lxapi.search(q.trim()).then(setHits).catch(() => {}));
              }} />
            <FlatList data={hits} keyExtractor={(s, i) => `${i}${s.songmid}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={st.hitRow} onPress={() => void player.playSong(item, hits)}>
                  <Text style={st.hitName} numberOfLines={1}>{item.name}</Text>
                  <Text style={st.hitSub} numberOfLines={1}>{item.singer}</Text>
                </TouchableOpacity>
              )} />
          </>
        ) : (
          <FlatList data={player.queue} keyExtractor={(s, i) => `${i}${s.songmid}`}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={st.hitRow} onPress={() => void player.playSong(item, player.queue)}>
                <Text style={[st.hitName, player.current?.songmid === item.songmid && { color: C.brand }]} numberOfLines={1}>{item.name}</Text>
                <Text style={st.hitSub} numberOfLines={1}>{item.singer}</Text>
              </TouchableOpacity>
            )} />
        )}
      </Pressable>
    </Pressable>
  );
}

const st = {
  scrim: { position: 'absolute' as const, left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#00000080', justifyContent: 'flex-end' as const, flexDirection: 'row' as const },
  panel: { width: 420, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.border, paddingTop: 24, paddingHorizontal: 22 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 18 },
  title: { color: C.text, fontSize: 20, fontWeight: '700' as const, flex: 1 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  input: { color: C.text, fontSize: 16, backgroundColor: C.surface2, borderRadius: 12, height: 52, paddingHorizontal: 16, marginBottom: 14 },
  hitRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 3 },
  hitName: { color: C.text, fontSize: 15, fontWeight: '600' as const },
  hitSub: { color: C.text3, fontSize: 13 },
};
