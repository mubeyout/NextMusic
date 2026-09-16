// 听风音乐（RoCeOS Tingfeng）— 2026-09-16 老板需求：输入 iStoreOS/RoCeOS 的 ip/域名:端口 + 账户密码接入
// 未连接=连接表单；已连接=推荐歌单/排行榜/新歌 三 tab + 搜索；歌单→PlaylistDetail 复用（播放/收藏/队列全套）
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { Icon } from '../theme/Icon';
import { SongRow } from '../components/SongRow';
import { toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { tingfeng, tfApi, tfToSongItem, type TfPlaylist, type TfSong } from '../services/tingfeng';
import type { SongItem } from '../services/server';

type Tab = 'rec' | 'top' | 'new';

function fmtCount(n?: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return Math.round(n / 1e4) + '万';
  return String(n);
}

export function TingfengScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const { playSong } = usePlayer();
  const [cfgVer, setCfgVer] = useState(0); // 连接/断开后强制重渲
  const connected = tingfeng.connected;

  if (!connected) return <ConnectForm onDone={() => setCfgVer(v => v + 1)} />;
  return <Browse key={cfgVer} nav={nav} playSong={playSong} onLogout={() => setCfgVer(v => v + 1)} />;
}

// ---------- 连接表单 ----------
function ConnectForm({ onDone }: { onDone: () => void }) {
  const [base, setBase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const connect = async () => {
    if (!base.trim() || !username.trim() || !password) { setErr('地址、账户、密码都要填'); return; }
    setBusy(true); setErr('');
    try {
      await tfApi.connect(base.trim(), username.trim(), password);
      toast('听风音乐已连接');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '连接失败');
    } finally { setBusy(false); }
  };

  return (
    <View style={st.screen}>
      <PageHeader title="听风音乐" />
      <ScrollView contentContainerStyle={st.formWrap} keyboardShouldPersistTaps="handled">
        <View style={st.heroRow}>
          <Icon name="wave" size={28} color={C.brand} />
          <Text style={st.heroText}>连接 RoCeOS / iStoreOS 的听风音乐服务</Text>
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="op.mubey.top:88（域名:端口）" placeholderTextColor={C.text2}
            value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="账户" placeholderTextColor={C.text2}
            value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={st.input}>
          <TextInput style={st.inputText} placeholder="密码" placeholderTextColor={C.text2}
            value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        {err ? <Text style={st.err}>{err}</Text> : null}
        <TouchableOpacity style={[st.btnPrimary, busy && { opacity: 0.6 }]} activeOpacity={0.85} disabled={busy} onPress={connect}>
          {busy ? <ActivityIndicator color={C.onBrand} /> : <Text style={st.btnPrimaryText}>连接</Text>}
        </TouchableOpacity>
        <Text style={st.hint}>账户密码为路由器后台（RoCeOS）登录账户。听风音乐需在路由器上开启。</Text>
      </ScrollView>
    </View>
  );
}

// ---------- 已连接浏览 ----------
function Browse({ nav, playSong, onLogout }: {
  nav: { navigate: (s: string, p?: object) => void };
  playSong: (s: SongItem, list?: SongItem[]) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('rec');
  const [rec, setRec] = useState<TfPlaylist[] | null>(null);
  const [tops, setTops] = useState<TfPlaylist[] | null>(null);
  const [news, setNews] = useState<TfSong[] | null>(null);
  const [kw, setKw] = useState('');
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const kwRef = useRef(kw);

  useEffect(() => { // 首屏三块并行拉（RoCeOS 无并发 500 问题，实测并行正常）
    let dead = false;
    tfApi.recommendPlaylists(12).then(d => { if (!dead) setRec(d); }).catch(() => { if (!dead) setRec([]); });
    tfApi.toplists().then(d => { if (!dead) setTops(d); }).catch(() => { if (!dead) setTops([]); });
    tfApi.newsongs().then(d => { if (!dead) setNews(d.songs || []); }).catch(() => { if (!dead) setNews([]); });
    return () => { dead = true; };
  }, []);

  const openList = useCallback(async (title: string, p: TfPlaylist) => {
    if (opening) return;
    setOpening(true);
    try {
      const d = 'playCount' in p && p.playCount != null
        ? await tfApi.playlistSongs(p.id)
        : await tfApi.toplistSongs(p.id);
      const songs = (d.songs || []).map(tfToSongItem);
      if (songs.length) {
        nav.navigate('PlaylistDetail', { title, songs, meta: `${songs.length} 首 · 听风`, cover: p.coverUrl });
      } else {
        toast('歌单为空或加载失败');
      }
    } catch (e) { toast(e instanceof Error ? e.message : '加载失败'); }
    finally { setOpening(false); }
  }, [nav, opening]);

  const doSearch = useCallback(async () => {
    const k = kw.trim();
    if (!k || searching) return;
    kwRef.current = k;
    setSearching(true);
    try {
      const d = await tfApi.search(k, 50);
      if (kwRef.current !== k) return;
      const songs = (d.songs || []).map(tfToSongItem);
      if (songs.length) nav.navigate('PlaylistDetail', { title: `听风 · ${k}`, songs, meta: `${songs.length} 首 · 搜索` });
      else toast('没有找到相关歌曲');
    } catch (e) { toast(e instanceof Error ? e.message : '搜索失败'); }
    finally { setSearching(false); }
  }, [kw, searching, nav]);

  const playNew = useCallback((s: TfSong) => {
    const list = (news || []).map(tfToSongItem);
    playSong(tfToSongItem(s), list);
  }, [news, playSong]);

  const cfg = tingfeng.config;

  return (
    <View style={st.screen}>
      <PageHeader title="听风音乐"
        right={(
          <TouchableOpacity style={st.acctChip} activeOpacity={0.8} onLongPress={() => { tingfeng.logout(); toast('已断开听风音乐'); onLogout(); }}>
            <Icon name="user" size={13} color={C.text2} />
            <Text style={st.acctText} numberOfLines={1}>{cfg?.nickname || cfg?.username || ''}</Text>
          </TouchableOpacity>
        )} />
      {/* 搜索 */}
      <View style={st.searchRow}>
        <View style={st.searchBox}>
          <Icon name="search" size={15} color={C.text2} />
          <TextInput style={st.searchInput} placeholder="搜歌曲 / 歌手" placeholderTextColor={C.text2}
            value={kw} onChangeText={setKw} onSubmitEditing={doSearch} returnKeyType="search" />
        </View>
        <TouchableOpacity style={st.searchBtn} activeOpacity={0.85} disabled={searching} onPress={doSearch}>
          {searching ? <ActivityIndicator size="small" color={C.onBrand} /> : <Text style={st.searchBtnText}>搜索</Text>}
        </TouchableOpacity>
      </View>
      {/* tab 条 */}
      <View style={st.tabRow}>
        {([['rec', '推荐歌单'], ['top', '排行榜'], ['new', '新歌']] as [Tab, string][]).map(([k, label]) => (
          <TouchableOpacity key={k} style={[st.tab, tab === k && st.tabOn]} activeOpacity={0.85} onPress={() => setTab(k)}>
            <Text style={[st.tabText, tab === k && st.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {opening ? <ActivityIndicator size="small" color={C.brand} /> : null}
      </View>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {tab === 'rec' ? (
          rec == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            : rec.length ? (
              <View style={st.grid}>
                {rec.map(p => (
                  <TouchableOpacity key={p.id} style={st.cell} activeOpacity={0.85} onPress={() => openList(p.name, p)}>
                    {p.coverUrl ? <Image source={{ uri: p.coverUrl }} style={st.cover} /> : <View style={[st.cover, st.coverPh]}><Icon name="music" size={22} color={C.text2} /></View>}
                    <View style={st.plMeta}>
                      <Text style={st.plName} numberOfLines={2}>{p.name}</Text>
                      <Text style={st.plSub}>{fmtCount(p.playCount)}次播放{p.trackCount ? ` · ${p.trackCount}首` : ''}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : <Text style={st.empty}>推荐歌单加载失败</Text>
        ) : null}
        {tab === 'top' ? (
          tops == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            : tops.length ? (
              <View style={st.topList}>
                {tops.map((p, i) => (
                  <TouchableOpacity key={p.id} style={st.topRow} activeOpacity={0.85} onPress={() => openList(p.name, p)}>
                    <View style={st.topRank}><Text style={[st.topRankText, i < 3 && st.topRankHot]}>{i + 1}</Text></View>
                    {p.coverUrl ? <Image source={{ uri: p.coverUrl }} style={st.topCover} /> : <View style={[st.topCover, st.coverPh]} />}
                    <View style={{ flex: 1 }}>
                      <Text style={st.plName} numberOfLines={1}>{p.name}</Text>
                      {p.updateTime ? <Text style={st.plSub}>更新于 {new Date(p.updateTime).toLocaleDateString('zh-CN')}</Text> : null}
                    </View>
                    <Icon name="chevronright" size={16} color={C.text2} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : <Text style={st.empty}>排行榜加载失败</Text>
        ) : null}
        {tab === 'new' ? (
          news == null ? <View style={st.center}><ActivityIndicator color={C.brand} /></View>
            : news.length ? (
              <View style={{ gap: 2 }}>
                {news.map((s, i) => (
                  <SongRow key={`${s.id}-${i}`} song={tfToSongItem(s)} onPress={() => playNew(s)} />
                ))}
              </View>
            ) : <Text style={st.empty}>新歌加载失败</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  // 表单
  formWrap: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  heroText: { color: C.text2, fontSize: 13, lineHeight: 18, flex: 1 },
  input: { height: 42, borderRadius: 11, backgroundColor: C.surface2, paddingHorizontal: 13, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  btnPrimary: { height: 42, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '500' },
  err: { color: '#FF6B6B', fontSize: 12, lineHeight: 15 },
  hint: { color: C.text2, fontSize: 11, lineHeight: 16, paddingTop: 8 },
  // 浏览
  acctChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: C.surface2 },
  acctText: { color: C.text2, fontSize: 12, maxWidth: 96 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  searchBox: { flex: 1, height: 36, borderRadius: 18, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13 },
  searchInput: { flex: 1, color: C.text, fontSize: 13, padding: 0 },
  searchBtn: { height: 36, borderRadius: 18, backgroundColor: C.brand, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { height: 30, borderRadius: 15, paddingHorizontal: 15, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.brand },
  tabText: { color: C.text2, fontSize: 12, lineHeight: 14, fontWeight: '600' },
  tabTextOn: { color: C.onBrand },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  center: { paddingVertical: 48, alignItems: 'center' },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  // 推荐歌单 grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '31.5%' },
  cover: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.surface2 },
  coverPh: { alignItems: 'center', justifyContent: 'center' },
  plMeta: { gap: 2, paddingTop: 6 },
  plName: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  plSub: { color: C.text2, fontSize: 10, lineHeight: 13 },
  // 排行榜
  topList: { gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10 },
  topRank: { width: 20, alignItems: 'center' },
  topRankText: { color: C.text2, fontSize: 14, fontWeight: '700' },
  topRankHot: { color: C.brand },
  topCover: { width: 44, height: 44, borderRadius: 9, backgroundColor: C.surface2 },
});
