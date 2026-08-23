import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { usePlayer } from '../state/PlayerProvider';

// Figma 03·播放队列: header + now playing card + two sections
export function QueueScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { queue, current, playSong, position, duration } = usePlayer();

  const upcoming = current ? queue.filter(t => t.songmid !== current.songmid) : queue;
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <LinearGradient colors={[C.bgGradientTop, C.bg, C.bg]} locations={[0, 0.55, 1]} style={st.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 28, paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={st.backBtn}>
            <Icon name="back" size={22} />
          </TouchableOpacity>
          <Text style={st.title}>播放队列</Text>
          <TouchableOpacity hitSlop={6}><Icon name="more" size={22} /></TouchableOpacity>
        </View>

        {current && (
          <View style={st.nowCard}>
            <View style={st.nowRow}>
              <View style={st.nowArtWrap}>
                {current.img ? <Image source={{ uri: current.img }} style={st.nowArt} /> : <View style={[st.nowArt, { backgroundColor: '#2A2A2A' }]} />}
              </View>
              <View style={st.nowMeta}>
                <Text style={st.nowTitle} numberOfLines={1}>{current.name}</Text>
                <Text style={st.nowArtist} numberOfLines={1}>{current.singer}</Text>
                <View style={st.nowBar}>
                  <View style={[st.nowBarValue, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
              </View>
              <TouchableOpacity hitSlop={6}><Icon name="more" size={20} /></TouchableOpacity>
            </View>
          </View>
        )}

        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>当前列表</Text>
          <Text style={st.sectionMeta}>{queue.length} 首 · 点击切歌</Text>
        </View>
        {upcoming.map((t, i) => (
          <SongRow key={t.uid || i} song={t} onPress={() => playSong(t, queue)} />
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 22, height: 22 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700' },
  nowCard: { borderRadius: 12, backgroundColor: '#1C1C1C', padding: 12, marginTop: 8 },
  nowRow: { flexDirection: 'row', gap: 10 },
  nowArtWrap: { width: 60, height: 60, borderRadius: 7, overflow: 'hidden' },
  nowArt: { width: 60, height: 60 },
  nowMeta: { flex: 1, gap: 2 },
  nowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  nowArtist: { color: C.text2, fontSize: 11, lineHeight: 16 },
  nowBar: { height: 4, borderRadius: 2, backgroundColor: '#242424', marginTop: 8, overflow: 'hidden' },
  nowBarValue: { height: 4, borderRadius: 2, backgroundColor: C.brand },
  sectionRow: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700' },
  sectionMeta: { color: C.text2, fontSize: 11, lineHeight: 16 },
});
