import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, BrandIcon, type BrandIconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { api, type SongItem } from '../services/server';
import { lxapi } from '../services/lxapi';
import { activeSources } from '../services/customSource';
import { library } from '../state/library';
import { useApp } from '../state/AppState';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { SH } from '../hd/hdtokens';

// Figma NM-IMPORT-001 / 39 / 40 · 导入歌单三步流
// hasCircleBg: SVG 自带圆形/满底色 → 裸渲染；否则保留品牌色容器
const PLATFORMS = [
  { id: 'wy', name: '网易云音乐', color: '#C20C0C', icon: 'netease' as BrandIconName, hasCircleBg: true },
  { id: 'tx', name: 'QQ音乐', color: '#31C27C', icon: 'qqmusic' as BrandIconName, hasCircleBg: true },
  { id: 'kg', name: '酷狗音乐', color: '#0C8ED9', icon: 'kugou' as BrandIconName, hasCircleBg: true },
  { id: 'kw', name: '酷我音乐', color: '#FFA200', icon: 'kuwo' as BrandIconName, hasCircleBg: true },
  { id: 'mg', name: '咪咕音乐', color: '#00A0E9', icon: 'migu' as BrandIconName, hasCircleBg: true },
];

function extractId(link: string): string | null {
  const m = /[?&](?:id|playlistId)=(\d+)/.exec(link.trim());
  if (m) return m[1];
  if (/^\d+$/.test(link.trim())) return link.trim();
  return null;
}

export function ImportPlaylistScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const { connected } = useApp();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [platform, setPlatform] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; songs: SongItem[]; total: number; img?: string; id: string } | null>(null);

  const pick = (id: string) => { setPlatform(id); setStep(1); setErr(null); };

  const fetchPreview = async () => {
    if (!platform) return;
    const id = extractId(link);
    if (!id) { setErr('无法识别歌单链接或 ID'); return; }
    // 本地模式（未连接服务器）：走音源引擎直连平台，无需服务器账号
    const useServer = connected;
    if (!useServer && activeSources().length === 0) {
      setErr('本地模式需要音源：请到 设置 → 音源管理 启用一个音源'); return;
    }
    const fetcher = useServer ? api : lxapi;
    setLoading(true); setErr(null);
    try {
      const first = await fetcher.songListDetail(id, 1, platform);
      const songs = first.list || [];
      const total = first.info?.total || songs.length;
      // 拉剩余页（最多 10 页，每页约 30-100 首）
      let page = 1;
      while (songs.length < total && page < 10) {
        page++;
        const r = await fetcher.songListDetail(id, page, platform); // eslint-disable-line no-await-in-loop
        const more = r.list || [];
        if (!more.length) break;
        songs.push(...more);
      }
      if (!songs.length) { setErr(useServer ? '歌单为空或无法读取（检查链接是否公开）' : '歌单为空或无法读取（检查链接是否公开、音源是否可用）'); return; }
      setPreview({
        name: first.info?.name || `导入歌单 ${id}`,
        songs, total,
        img: first.info?.img, id,
      });
      setStep(2);
    } catch {
      setErr('拉取歌单失败，请检查网络与链接');
    } finally { setLoading(false); }
  };

  const save = () => {
    if (!preview || !platform) return;
    library.create(preview.name, preview.songs, {
      source: platform, remoteId: preview.id, cover: preview.img,
      desc: `从${PLATFORMS.find(p => p.id === platform)?.name || ''}导入`,
    });
    nav.goBack();
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => (step === 0 ? nav.goBack() : setStep(s => (s - 1) as 0 | 1))} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>导入歌单</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: IS_HD ? 44 : 20, paddingBottom: insets.bottom + 24, gap: IS_HD ? 18 : 14 }}>
        {/* steps indicator(仅手机版;HD 无步骤条,页面即进度) */}
        {!IS_HD && (
          <View style={st.stepsRow}>
            {['选择平台', '填写链接', '预览导入'].map((s, i) => (
              <View key={s} style={[st.stepPill, i <= step && st.stepPillOn]}>
                <Text style={[st.stepText, i <= step && st.stepTextOn]}>{i + 1}. {s}</Text>
              </View>
            ))}
          </View>
        )}

        {step === 0 && (
          <>
            <Text style={st.sectionTitle}>选择歌单所在平台</Text>
            {IS_HD ? (
              /* HD:五个平台一排排列(整卡可聚焦,对齐桌面版视觉) */
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {PLATFORMS.map(pf => (
                  <HDTouch key={pf.id} style={hdSt.pfCard} focusStyle={hdSt.pfFocus} focusBg={C.surface2} glow={SH.brand} onPress={() => pick(pf.id)}>
                    <View style={[hdSt.pfIcon, { backgroundColor: pf.color + '1E', borderColor: pf.color + '66' }]}>
                      <BrandIcon name={pf.icon} size={40} />
                    </View>
                    <Text style={hdSt.pfName}>{pf.name}</Text>
                    <Text style={hdSt.pfSub}>歌单链接或 ID</Text>
                  </HDTouch>
                ))}
              </View>
            ) : (
              <>
                {PLATFORMS.map(pf => (
                  <TouchableOpacity key={pf.id} style={st.platformRow} activeOpacity={0.7} onPress={() => pick(pf.id)}>
                    {pf.hasCircleBg ? (
                      <View style={st.platformIconBare}>
                        <BrandIcon name={pf.icon} size={28} />
                      </View>
                    ) : (
                      <View style={[st.platformIcon, { backgroundColor: pf.color + '26', borderColor: pf.color }]}>
                        <BrandIcon name={pf.icon} size={20} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={st.platformName}>{pf.name}</Text>
                      <Text style={st.platformSub}>支持歌单链接或歌单 ID</Text>
                    </View>
                    <Icon name="chevronright" size={20} color={C.text3} />
                  </TouchableOpacity>
                ))}
              </>
            )}
            {IS_HD ? (
              <HDTouch style={hdSt.ghostBtn} focusStyle={hdSt.ghostFocus} onPress={() => nav.goBack()}>
                <Text style={hdSt.ghostText}>暂不导入</Text>
              </HDTouch>
            ) : (
              <TouchableOpacity style={st.skipBtn} onPress={() => nav.goBack()}>
                <Text style={st.skipText}>暂不导入</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={st.sectionTitle}>
              粘贴 {PLATFORMS.find(p => p.id === platform)?.name} 歌单链接
            </Text>
            <View style={st.card}>
              <Text style={st.fieldLabel}>歌单链接或 ID</Text>
              <View style={st.input}>
                <TextInput
                  style={st.inputText}
                  placeholder="https://... 或纯数字 ID"
                  placeholderTextColor={C.text3}
                  value={link}
                  onChangeText={setLink}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {err ? <Text style={st.err}>{err}</Text> : null}
              <Text style={st.hint}>仅支持公开歌单；私密歌单请先设为公开</Text>
            </View>
            {IS_HD ? (
              <HDTouch style={hdSt.primaryBtn} focusStyle={hdSt.primaryFocus} onPress={fetchPreview} disabled={loading}>
                {loading ? <ActivityIndicator color={C.onBrand} size="large" /> : <Text style={hdSt.primaryText}>预览歌单</Text>}
              </HDTouch>
            ) : (
              <TouchableOpacity style={st.primaryBtn} onPress={fetchPreview} disabled={loading}>
                {loading ? <ActivityIndicator color={C.onBrand} /> : <Text style={st.primaryText}>预览歌单</Text>}
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 2 && preview && (
          <>
            <View style={st.previewCard}>
              <Text style={st.previewName} numberOfLines={2}>{preview.name}</Text>
              <Text style={st.previewMeta}>{preview.total} 首 · 将导入到「我的音乐」</Text>
            </View>
            <Text style={st.sectionTitle}>歌曲预览（前 20 首）</Text>
            {preview.songs.slice(0, 20).map((s, i) => (
              <View key={`${s.songmid}-${i}`} style={st.songLine}>
                <Text style={st.songName} numberOfLines={1}>{s.name}</Text>
                <Text style={st.songArtist} numberOfLines={1}>{s.singer}</Text>
              </View>
            ))}
            {preview.total > 20 ? <Text style={st.moreHint}>…以及另外 {preview.total - 20} 首</Text> : null}
            {IS_HD ? (
              <HDTouch style={hdSt.primaryBtn} focusStyle={hdSt.primaryFocus} onPress={save}>
                <Text style={hdSt.primaryText}>导入到我的音乐</Text>
              </HDTouch>
            ) : (
              <TouchableOpacity style={st.primaryBtn} onPress={save}>
                <Text style={st.primaryText}>导入到我的音乐</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { flex: 1, color: C.text, fontSize: 24, lineHeight: 35, fontWeight: '700', textAlign: 'center' },
  stepsRow: { flexDirection: 'row', gap: 6 },
  stepPill: { flex: 1, height: 26, borderRadius: 13, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepPillOn: { backgroundColor: C.selTint },
  stepText: { color: C.text3, fontSize: 10 },
  stepTextOn: { color: C.brandText },
  sectionTitle: { color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700' },
  platformRow: { minHeight: 60, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  platformIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  platformIconBare: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  platformIconText: { fontSize: 15, fontWeight: '700' },
  platformName: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  platformSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  skipBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  skipText: { color: C.text2, fontSize: 14, fontWeight: '500' },
  card: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 8 },
  fieldLabel: { color: C.text, fontSize: 12, lineHeight: 14, fontWeight: '500' },
  input: { height: 46, borderRadius: 12, backgroundColor: C.surface2, paddingHorizontal: 14, justifyContent: 'center' },
  inputText: { color: C.text, fontSize: 13, padding: 0 },
  err: { color: '#FF6B6B', fontSize: 12, lineHeight: 15 },
  hint: { color: C.text2, fontSize: 10, lineHeight: 12 },
  primaryBtn: { height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: C.onBrand, fontSize: 14, fontWeight: '600' },
  previewCard: { borderRadius: 14, backgroundColor: C.surface, padding: 16, gap: 6 },
  previewName: { color: C.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  previewMeta: { color: C.text2, fontSize: 11, lineHeight: 15 },
  songLine: { minHeight: 40, justifyContent: 'center', gap: 1 },
  songName: { color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  songArtist: { color: C.text2, fontSize: 10, lineHeight: 13 },
  moreHint: { color: C.text3, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});

// HD(车机/TV)样式:五平台一排大卡 + 大按钮,D-pad 可聚焦
const hdSt = StyleSheet.create({
  pfCard: {
    flex: 1, minHeight: 250, borderRadius: 18, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18,
    boxShadow: SH.card,
  },
  pfFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 18 },
  pfIcon: { width: 78, height: 78, borderRadius: 39, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pfName: { color: C.text, fontSize: 17, fontWeight: '700' },
  pfSub: { color: C.text3, fontSize: 12 },
  primaryBtn: { height: 58, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  primaryFocus: { borderWidth: 2.5, borderColor: C.text, borderRadius: 14 },
  primaryText: { color: C.onBrand, fontSize: 17, fontWeight: '700' },
  ghostBtn: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#4A4A4A', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ghostFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 14 },
  ghostText: { color: C.text2, fontSize: 15, fontWeight: '600' },
});
