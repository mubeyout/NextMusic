// CarSearch.tsx —— [A1 搜索车机形态·LEO v75 缺口包 1107·老板令 0927] 语音优先(88 麦克风+声波+五源同搜) + 精选词/历史大热区 + 键盘降级「乘客使用」
// 语音:App 无 ASR 引擎——按钮保留设计形态,点击诚实降级 toast(精选词/乘客键盘可用);接系统语音留待真车联调
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { CAR, CAR_FS } from './cartokens';
import { CarSongRow } from './cards';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { usePlayer } from '../state/PlayerProvider';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';

const kv = createMMKV({ id: 'nm-car-search' });
function loadHist(): string[] { try { return JSON.parse(kv.getString('hist') || '[]'); } catch { return []; } }
function saveHist(list: string[]) { kv.set('hist', JSON.stringify(list)); }

const CURATED = ['周杰伦', '晚安电台', '郭德纲相声', '华语经典', '白噪音', '80年代'];

export function CarSearch({ onBack }: { onBack: () => void }) {
  const player = usePlayer();
  const [q, setQ] = useState('');
  const [kbOpen, setKbOpen] = useState(false);
  const [hits, setHits] = useState<SongItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<string[]>([]);

  useEffect(() => { setHist(loadHist()); }, []);

  const doSearch = (word: string) => {
    const w = word.trim();
    if (!w || busy) return;
    const next = [w, ...loadHist().filter(h => h !== w)].slice(0, 8);
    saveHist(next); setHist(next);
    setBusy(true); setHits(null);
    import('../services/lxapi').then(({ lxapi }) => lxapi.search(w))
      .then(r => setHits(r))
      .catch(() => { setHits([]); toast('搜索失败，稍后再试'); })
      .finally(() => setBusy(false));
  };

  const del = (w: string) => { const next = loadHist().filter(h => h !== w); saveHist(next); setHist(next); };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      {/* 页头: 返回 + 标题 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <TouchableOpacity style={st.backBtn} onPress={onBack}><Icon name="back" size={20} color={C.text2} /></TouchableOpacity>
        <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800' }}>搜索</Text>
      </View>

      {/* 语音优先 hero */}
      <View style={st.voiceCard}>
        <TouchableOpacity style={st.micBtn} activeOpacity={0.85} onPress={() => toast('语音搜索待车机系统语音接入——先用精选词或乘客键盘')}>
          <Icon name="wave" size={38} active color={C.onBrand} />
        </TouchableOpacity>
        {/* 5 条声波(静态 V1——动效待 B 批) */}
        <View style={st.waves} pointerEvents="none">
          {[18, 34, 46, 34, 18].map((h, i) => <View key={i} style={[st.waveBar, { height: h }]} />)}
        </View>
        <View style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <Text style={st.voiceTitle}>说出歌名 · 歌手 · 歌词片段</Text>
          <Text style={st.voiceSub}>五源同搜 · kw / kg / wy / tx / mg</Text>
        </View>
      </View>

      {/* 精选词 pills(44 热区) */}
      <Text style={st.secLabel}>精选词</Text>
      <View style={st.pills}>
        {CURATED.map(w => (
          <TouchableOpacity key={w} style={st.pill} onPress={() => doSearch(w)}>
            <Text style={st.pillText} numberOfLines={1}>{w}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 最近搜索 */}
      {hist.length ? (
        <>
          <Text style={st.secLabel}>最近搜索</Text>
          {hist.map(w => (
            <View key={w} style={st.histRow}>
              <TouchableOpacity style={{ flex: 1, height: '100%', justifyContent: 'center' }} onPress={() => doSearch(w)}>
                <Text style={st.histText} numberOfLines={1}>{w}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.histDel} onPress={() => del(w)}><Icon name="close" size={16} color={C.text3} /></TouchableOpacity>
            </View>
          ))}
        </>
      ) : null}

      {/* 键盘降级(乘客) */}
      {kbOpen ? (
        <View style={st.kbRow}>
          <TextInput style={st.kbInput} placeholder="歌曲 / 歌手 / 专辑" placeholderTextColor={C.text3}
            value={q} onChangeText={setQ} autoFocus returnKeyType="search"
            onSubmitEditing={() => doSearch(q)} />
          <TouchableOpacity style={st.kbGo} onPress={() => doSearch(q)}><Text style={st.kbGoText}>搜</Text></TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={st.kbDegrade} onPress={() => setKbOpen(true)}>
          <Text style={st.kbDegradeText}>⌨  手动输入（乘客使用）</Text>
        </TouchableOpacity>
      )}

      {/* 结果 */}
      {busy ? <Text style={st.hint}>五源搜索中…</Text> : null}
      {hits !== null && !busy ? (
        hits.length ? (
          <>
            <Text style={st.secLabel}>结果 · {hits.length}</Text>
            {hits.map((s, i) => <CarSongRow key={`${i}${s.songmid}`} song={s} dense onPress={() => void player.playSong(s, hits)} />)}
          </>
        ) : <Text style={st.hint}>没有找到——换个词试试</Text>
      ) : null}
    </ScrollView>
  );
}

const st = {
  backBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  voiceCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 26, backgroundColor: C.surface, borderRadius: 17, borderWidth: 1, borderColor: C.border, padding: 26, marginBottom: 26 },
  micBtn: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  waves: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  waveBar: { width: 5, borderRadius: 3, backgroundColor: C.brand },
  voiceTitle: { color: C.text, fontSize: CAR_FS.title, fontWeight: '700' as const },
  voiceSub: { color: C.text3, fontSize: CAR_FS.sub },
  secLabel: { color: C.text3, fontSize: CAR_FS.mini, letterSpacing: 2, marginTop: 22, marginBottom: 12 },
  pills: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  pill: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  pillText: { color: C.text, fontSize: CAR_FS.sub, fontWeight: '600' as const },
  histRow: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 44, borderBottomWidth: 1, borderBottomColor: C.border },
  histText: { color: C.text2, fontSize: CAR_FS.sub },
  histDel: { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const },
  kbDegrade: { marginTop: 26, height: 52, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: C.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  kbDegradeText: { color: C.text3, fontSize: CAR_FS.sub },
  kbRow: { marginTop: 26, flexDirection: 'row' as const, gap: 12 },
  kbInput: { flex: 1, height: 52, borderRadius: 13, backgroundColor: C.surface2, paddingHorizontal: 18, color: C.text, fontSize: CAR_FS.body },
  kbGo: { width: 52, height: 52, borderRadius: 13, backgroundColor: C.brand, alignItems: 'center' as const, justifyContent: 'center' as const },
  kbGoText: { color: C.onBrand, fontSize: CAR_FS.title, fontWeight: '800' as const },
  hint: { color: C.text3, fontSize: CAR_FS.sub, marginTop: 18, textAlign: 'center' as const },
};
