import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { usePlayer } from '../state/PlayerProvider';
import { api } from '../services/server';
import { lxapi } from '../services/lxapi';
import { createMMKV } from 'react-native-mmkv';
import { useApp } from '../state/AppState';
import { toast } from '../components/Dialog';

// 本地评论（按歌存储，不依赖平台账号）
const localKv = createMMKV({ id: 'nextmusic-local-comments' });
function loadLocal(songKey: string): CommentItem[] {
  try { return JSON.parse(localKv.getString(songKey) || '[]'); } catch { return []; }
}
function saveLocal(songKey: string, list: CommentItem[]) {
  localKv.set(songKey, JSON.stringify(list.slice(0, 100)));
}

interface CommentItem {
  id: string;
  text: string;
  timeStr?: string;
  userName?: string;
  avatar?: string | null;
  likedCount?: number;
  images?: unknown[];
}

// Figma 14·评论: back header, song + count + hot/new pills, comment cards
export function CommentsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { current } = usePlayer();
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const { username } = useApp();
  const songKey = current ? `${current.source}_${current.songmid}` : '';
  const [mine, setMine] = useState<CommentItem[]>([]);

  useEffect(() => {
    if (!current) return;
    let dead = false;
    setComments(null); setPage(1);
    setMine(loadLocal(songKey));
    (async () => {
      const r = await lxapi.comment(current, sort, 1, 20);
      if (dead) return;
      setComments((r.comments as CommentItem[]) || []);
      setTotal(r.total || r.comments?.length || 0);
    })();
    return () => { dead = true; };
  }, [current?.songmid, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const text = draft.trim();
    if (!text || !current) return;
    const cm: CommentItem = {
      id: `local-${Date.now()}`,
      text,
      userName: username || '我',
      timeStr: '刚刚',
      likedCount: 0,
    };
    const next = [cm, ...mine];
    setMine(next);
    saveLocal(songKey, next);
    setDraft('');
    toast('已发布（本机）');
  };

  const loadMore = async () => {
    if (!current || busy || !comments || comments.length >= total) return;
    setBusy(true);
    const r = await lxapi.comment(current, sort, page + 1, 20);
    const more = ((r.comments as CommentItem[]) || []);
    if (more.length) {
      setComments(prev => [...(prev || []), ...more]);
      setPage(p => p + 1);
    }
    setBusy(false);
  };

  if (!current) {
    return (
      <View style={[st.screen, { paddingTop: insets.top + 60, alignItems: 'center' }]}>
        <Text style={{ color: C.text2, fontSize: 13 }}>没有正在播放的歌曲</Text>
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={st.hBtn} onPress={() => nav.goBack()} hitSlop={4}>
          <Icon name="back" size={24} />
        </TouchableOpacity>
        <Text style={st.hTitle}>评论</Text>
        <View style={st.hBtn} />
      </View>

      <View style={st.songRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.songName} numberOfLines={1}>{current.name}</Text>
          <Text style={st.commentCount}>{total ? total.toLocaleString() + ' 条评论' : '加载中…'}</Text>
        </View>
        <View style={st.sortPills}>
          <TouchableOpacity onPress={() => setSort('hot')}>
            <View style={[st.pill, sort === 'hot' && st.pillOn]}>
              <Text style={[st.pillText, sort === 'hot' && st.pillTextOn]}>热门</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSort('new')}>
            <View style={[st.pill, sort === 'new' && st.pillOn]}>
              <Text style={[st.pillText, sort === 'new' && st.pillTextOn]}>最新</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }} onScroll={({ nativeEvent }) => {
        if (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height > nativeEvent.contentSize.height - 200) loadMore();
      }} scrollEventThrottle={200}>
        {comments == null ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : (
          <>
          {mine.length ? (
            <>
              <Text style={st.localLabel}>我的评论（本机）</Text>
              {mine.map(cm => (
                <View key={cm.id} style={[st.card, st.cardMine]}>
                  <View style={[st.avatar, st.avatarFallback]}><Text style={st.avatarInitial}>{(cm.userName || '我')[0]}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={st.cardTop}>
                      <Text style={st.userName}>{cm.userName || '我'}</Text>
                      <TouchableOpacity hitSlop={6} onPress={() => {
                        const next = mine.filter(x => x.id !== cm.id);
                        setMine(next); saveLocal(songKey, next);
                      }}>
                        <Text style={st.delText}>删除</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={st.cmText}>{cm.text}</Text>
                    <Text style={st.cmTime}>{cm.timeStr || ''}</Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}
          {comments.length === 0 && !mine.length ? (
            <Text style={st.empty}>暂无评论，来抢沙发</Text>
          ) : null}
          {comments.map(cm => (
          <View key={cm.id} style={st.card}>
            {cm.avatar ? (
              <Image source={{ uri: cm.avatar }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, st.avatarFallback]}>
                <Text style={st.avatarInitial}>{(cm.userName || '匿')[0]}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={st.cardTop}>
                <Text style={st.userName}>{cm.userName || '匿名用户'}</Text>
                <View style={st.likeRow}>
                  <Icon name="heart" size={14} color={C.text3} />
                  <Text style={st.likeCount}>{cm.likedCount ?? 0}</Text>
                </View>
              </View>
              <Text style={st.cmText}>{(cm.text || '').trim()}</Text>
              <Text style={st.cmTime}>{cm.timeStr || ''}</Text>
            </View>
          </View>
          ))}
          </>
        )}
        {busy ? <View style={st.center}><ActivityIndicator color={C.brand} /></View> : null}
      </ScrollView>

      <View style={[st.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={st.input}>
          <TextInput
            style={st.inputText}
            placeholder="随乐而起，有感而发"
            placeholderTextColor={C.text3}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
        </View>
        <TouchableOpacity style={st.sendBtn} onPress={send} disabled={!draft.trim()}>
          <Text style={st.sendText}>发送</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, color: C.text, fontSize: 16, lineHeight: 19, fontWeight: '500' }, // lx166 居左
  songRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12, marginBottom: 12 },
  songName: { color: C.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  commentCount: { color: C.text2, fontSize: 11, lineHeight: 16 },
  sortPills: { flexDirection: 'row', gap: 6 },
  pill: { height: 28, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: C.inset },
  pillOn: { backgroundColor: C.brand },
  pillText: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  pillTextOn: { color: C.onBrand },
  center: { paddingVertical: 40, alignItems: 'center' },
  localLabel: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 10, marginBottom: 4 },
  cardMine: { borderColor: C.brandDim, borderWidth: StyleSheet.hairlineWidth },
  delText: { color: C.text3, fontSize: 11 },
  empty: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  card: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: C.text2, fontSize: 15, fontWeight: '700' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userName: { color: C.brandText, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { color: C.text3, fontSize: 10, lineHeight: 13 },
  cmText: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cmTime: { color: C.text3, fontSize: 10, lineHeight: 13, marginTop: 6 },
  inputBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10,
    backgroundColor: C.inputBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint,
  },
  input: { flex: 1, height: 40, borderRadius: 20, backgroundColor: C.surface2, paddingHorizontal: 16, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  sendBtn: { height: 40, borderRadius: 20, backgroundColor: C.brand, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: C.onBrand, fontSize: 13, fontWeight: '500' },
});
