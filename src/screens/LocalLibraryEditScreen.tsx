// LocalLibraryEditScreen —— 本机曲库配置页(模块② v3 A1-A3/A6)
// 流程:库命名(默认「我的本机曲库」) → 选目录(Android SAF 授权引导含永久权限提示 / Web FSAPI 原生提示 /
// 桌面 nmDesktop 原生对话框接入口) → 扫描选项(格式 chips / 子目录开关 / <30s 过滤开关,折叠默认) → 开始扫描。
// 首扫:页内进度卡「已发现 N · 已识别 M」+ 不定量进度条 + 常驻取消(保留已识别部分);完成自动进浏览页。
// 编辑态:重新扫描(增量 mtime 对比)+ 删除库。HD/车机不设入口(ProviderEdit 不渲染本卡)。
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { dialog, toast } from '../components/Dialog';
import {
  localLib, pickDirectory, bindFsapiHandle, scanLocalLibrary, rescanLocalLibrary,
  ALL_FORMATS, DEFAULT_LIB_NAME,
  type LocalLibConfig, type ScanProgress, type ScanSummary, type CancelToken,
} from '../services/localLibrary';

const IS_ANDROID = Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';
const FORMAT_LABELS: Record<string, string> = { flac: 'FLAC', mp3: 'MP3', wav: 'WAV', ape: 'APE', ogg: 'OGG', m4a: 'M4A' };

// 简易开关(surface2 轨 + brand 滑块;与设置页开关同语义自绘)
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity hitSlop={8} onPress={() => onChange(!on)} activeOpacity={0.8}>
      <View style={[tg.track, on && tg.trackOn]}>
        <Animated.View style={[tg.thumb, on && tg.thumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

export function LocalLibraryEditScreen({ route }: { route?: { params?: { libId?: string } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void; replace: (s: string, p?: object) => void };
  const existing = route?.params?.libId ? localLib.get(route.params.libId) : undefined;

  const [cfg, setCfg] = useState<LocalLibConfig>(existing || localLib.newDraft());
  const [showGuide, setShowGuide] = useState(true); // SAF 首次授权引导层(v3 A1)
  const [optsOpen, setOptsOpen] = useState(false); // 扫描选项折叠默认
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const token = useRef<CancelToken>({ cancelled: false });
  const bar = useRef(new Animated.Value(0)).current; // 不定量进度条

  useEffect(() => {
    if (!scanning) return;
    Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false })).start();
    return () => { bar.stopAnimation(); bar.setValue(0); };
  }, [!!scanning, bar]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<LocalLibConfig>) => setCfg(c => ({ ...c, ...p }));
  const toggleFormat = (f: string) => setCfg(c => {
    const has = c.formats.includes(f);
    const next = has ? c.formats.filter(x => x !== f) : [...c.formats, f];
    return { ...c, formats: next.length ? next : c.formats }; // 至少留一个
  });

  // ---------- 目录选择 ----------
  const doPick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const r = await pickDirectory();
      if (!r) { setPicking(false); return; } // 用户取消
      if (r.platform === 'fsapi') {
        // FSAPI:句柄直接绑定到本库配置(复用本次拾取,不二次弹窗)
        const draft = { ...cfg, platform: 'fsapi' as const, rootUri: '', rootLabel: r.rootLabel };
        localLib.save(draft);
        const ok = await bindFsapiHandle(draft.id, r.handle);
        if (!ok) { localLib.remove(draft.id); toast('未选择目录'); setPicking(false); return; }
        setCfg(localLib.get(draft.id) || draft);
      } else {
        set({ platform: r.platform, rootUri: r.rootUri, rootLabel: r.rootLabel });
      }
      setShowGuide(false);
      setSummary(null);
    } catch (e) {
      dialog.alert('无法访问该目录', (e as Error).message || '请重新选择并允许 NextMusic 访问');
    } finally { setPicking(false); }
  };

  // ---------- 扫描 ----------
  const startScan = async (delta: boolean) => {
    if (scanning || !cfg.rootLabel) return;
    if (!cfg.formats.length) { toast('至少选择一种音频格式'); return; }
    const saved: LocalLibConfig = { ...cfg, name: cfg.name.trim() || DEFAULT_LIB_NAME };
    localLib.save(saved);
    setCfg(saved);
    token.current = { cancelled: false };
    setScanning({ found: 0, recognized: 0, phase: delta ? 'delta' : 'full' });
    setSummary(null);
    try {
      const run = delta ? rescanLocalLibrary : scanLocalLibrary;
      const r = await run(saved, p => setScanning(p), token.current);
      setSummary(r);
      if (r.cancelled) {
        toast(`已保留 ${r.kept} 首`); // v3 A2:取消=保留已识别部分
      } else if (delta) {
        toast(`增量扫描完成 · 新增 ${r.added} · 移除 ${r.removed}`); // v3 A6
        nav.replace('LocalLibBrowse', { libId: saved.id });
      } else {
        toast(`共 ${r.kept} 首${r.dups ? ` · 重复 ${r.dups} 首已跳过` : ''}`); // v3 A2
        nav.replace('LocalLibBrowse', { libId: saved.id });
      }
    } catch (e) {
      dialog.alert('扫描失败', (e as Error).message);
    } finally { setScanning(null); }
  };

  const doDelete = () => {
    dialog.confirm('删除本机曲库', `确定删除「${cfg.name || DEFAULT_LIB_NAME}」吗？仅移除扫描记录，不会删除设备上的音乐文件。`, () => {
      localLib.remove(cfg.id);
      nav.goBack();
    });
  };

  const hasRoot = !!cfg.rootLabel;

  return (
    <View style={st.screen}>
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 26 }}>
          <Icon name="back" size={20} />
        </TouchableOpacity>
        <Text style={st.title}>{existing ? '编辑本机曲库' : '连接本机曲库'}</Text>
        {existing ? (
          <TouchableOpacity onPress={doDelete} hitSlop={6} style={{ width: 26, alignItems: 'flex-end' }}>
            <Icon name="trash" size={20} color="#FF6B6B" />
          </TouchableOpacity>
        ) : <View style={{ width: 26 }} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 10 }} keyboardShouldPersistTaps="handled">
        {/* ① 库命名(v3 A1:默认「我的本机曲库」,可跳过) */}
        <View style={st.inputCard}>
          <Text style={st.inputLabel}>库命名</Text>
          <TextInput
            style={st.inputValue}
            value={cfg.name}
            placeholder={DEFAULT_LIB_NAME}
            placeholderTextColor={C.text3}
            onChangeText={v => set({ name: v })}
          />
        </View>

        {/* ② 目录选择(必填) */}
        {!hasRoot ? (
          IS_ANDROID && showGuide ? (
            /* SAF 首次授权引导层:半屏说明卡 + 去授权 primary(v3 A1) */
            <View style={st.guideCard}>
              <Icon name="shield" size={32} color={C.brandText} />
              <Text style={st.guideText}>授权后可离线扫描该目录，选择「永久授权」避免每次重扫重新授权</Text>
              <TouchableOpacity style={st.primaryBtn} onPress={doPick} disabled={picking} activeOpacity={0.75}>
                {picking ? <ActivityIndicator size="small" color={C.onBrand} /> : <Text style={st.primaryBtnText}>去授权</Text>}
              </TouchableOpacity>
              <TouchableOpacity hitSlop={6} onPress={() => setShowGuide(false)}>
                <Text style={st.guideSkip}>我已了解，直接选择</Text>
              </TouchableOpacity>
            </View>
          ) : IS_WEB ? (
            /* Web FSAPI:浏览器原生授权提示,不加自定义层(v3 A1) */
            <View style={st.pickCard}>
              <View style={{ flex: 1 }}>
                <Text style={st.pickTitle}>选择本机音乐文件夹</Text>
                <Text style={st.pickSub}>点击后浏览器会弹出授权提示，允许即可离线扫描</Text>
              </View>
              <TouchableOpacity style={st.primaryBtn} onPress={doPick} disabled={picking} activeOpacity={0.75}>
                {picking ? <ActivityIndicator size="small" color={C.onBrand} /> : <Text style={st.primaryBtnText}>选择目录</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.pickCard}>
              <View style={{ flex: 1 }}>
                <Text style={st.pickTitle}>当前平台暂不支持目录扫描</Text>
                <Text style={st.pickSub}>iOS 端即将接入</Text>
              </View>
            </View>
          )
        ) : (
          /* 展示行:folder icon + 路径(13/text2 单行截断) + 重新选择 */
          <View style={st.rootRow}>
            <Icon name="folder-music" size={20} color={C.brandText} />
            <Text style={st.rootPath} numberOfLines={1}>{cfg.rootLabel}</Text>
            <TouchableOpacity hitSlop={6} onPress={doPick} disabled={picking}>
              <Text style={st.repick}>{picking ? '选择中…' : '重新选择'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ③ 扫描选项(折叠默认) */}
        <TouchableOpacity style={st.optsHead} onPress={() => setOptsOpen(v => !v)} activeOpacity={0.75}>
          <Text style={st.optsTitle}>扫描选项</Text>
          <Text style={st.optsHint}>{cfg.formats.length} 种格式 · {cfg.scanSubdirs ? '含子目录' : '仅顶层'} · {cfg.filterShort ? '过滤短音频' : '不过滤'}</Text>
          <Icon name={optsOpen ? 'chevronright' : 'chevronright'} size={14} color={C.text3} />
        </TouchableOpacity>
        {optsOpen ? (
          <View style={st.optsCard}>
            <Text style={st.optsLabel}>音频格式</Text>
            <View style={st.chips}>
              {ALL_FORMATS.map(f => {
                const on = cfg.formats.includes(f);
                return (
                  <TouchableOpacity key={f} style={[st.chip, on && st.chipOn]} onPress={() => toggleFormat(f)} activeOpacity={0.75}>
                    <Text style={[st.chipText, on && st.chipTextOn]}>{FORMAT_LABELS[f]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={st.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.optTitle}>扫描子目录</Text>
                <Text style={st.optSub}>递归扫描所选目录下的文件夹</Text>
              </View>
              <Toggle on={cfg.scanSubdirs} onChange={v => set({ scanSubdirs: v })} />
            </View>
            <View style={st.optRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.optTitle}>过滤 30 秒以下音频</Text>
                <Text style={st.optSub}>跳过铃声/提示音等短文件；时长未知不过滤</Text>
              </View>
              <Toggle on={cfg.filterShort} onChange={v => set({ filterShort: v })} />
            </View>
          </View>
        ) : null}

        {/* ④ 扫描执行区 */}
        {scanning ? (
          /* 首扫反馈(v3 A2):双计数 + 不定量进度条 + 常驻取消 */
          <View style={st.progCard}>
            <View style={st.progRow}>
              <Text style={st.progText}>
                {scanning.phase === 'delta' ? '增量扫描 · ' : ''}
                已发现 <Text style={st.progNum}>{scanning.found}</Text> 首 · 已识别 <Text style={st.progNum}>{scanning.recognized}</Text> 首
              </Text>
              <TouchableOpacity hitSlop={8} onPress={() => { token.current.cancelled = true; }}>
                <Text style={st.cancelText}>取消</Text>
              </TouchableOpacity>
            </View>
            <View style={st.progTrack}>
              <Animated.View style={[st.progFill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['12%', '100%'] }) }]} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            {existing && existing.trackCount > 0 ? (
              <>
                <TouchableOpacity style={[st.ghostBtn, !hasRoot && st.btnOff]} onPress={() => startScan(false)} disabled={!hasRoot} activeOpacity={0.75}>
                  <Text style={st.ghostBtnText}>全部重扫</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.primaryBtn, { flex: 1.4, marginTop: 0 }, !hasRoot && st.btnOff]} onPress={() => startScan(true)} disabled={!hasRoot} activeOpacity={0.75}>
                  <Text style={st.primaryBtnText}>重新扫描（增量）</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[st.primaryBtn, { flex: 1, marginTop: 0 }, !hasRoot && st.btnOff]} onPress={() => startScan(false)} disabled={!hasRoot} activeOpacity={0.75}>
                <Text style={st.primaryBtnText}>开始扫描</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {summary ? (
          <Text style={st.summaryText}>
            {summary.cancelled
              ? `已取消：保留 ${summary.kept} 首 · 重复 ${summary.dups} 首跳过`
              : `共 ${summary.kept} 首${summary.dups ? ` · 重复 ${summary.dups} 首已跳过` : ''}${summary.filteredShort ? ` · 短音频 ${summary.filteredShort} 首已过滤` : ''}`}
          </Text>
        ) : null}

        {/* 识别规则呈现(v3 A3)+ 重扫口径(A6) */}
        <Text style={st.ruleText}>识别规则：优先读取标签（ID3 / Vorbis / FLAC）→ 文件名「歌手 - 标题」→ 归入未分类（不丢弃）。目录内内容相同（hash 去重）只保留一首。重扫为增量（对比修改时间），无自动后台扫描。</Text>
      </ScrollView>
    </View>
  );
}

const tg = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.surface2, padding: 3 },
  trackOn: { backgroundColor: C.brand },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.text2 },
  thumbOn: { backgroundColor: C.onBrand },
});

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '700', flex: 1 },
  inputCard: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4, alignItems: 'center' },
  inputLabel: { color: C.text2, fontSize: 11 },
  inputValue: { color: C.text, fontSize: 14, paddingVertical: 4, textAlign: 'center', width: '100%' },
  // SAF 引导卡
  guideCard: { backgroundColor: C.surface2, borderRadius: 14, padding: 20, alignItems: 'center', gap: 12 },
  guideText: { color: C.text2, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  guideSkip: { color: C.text3, fontSize: 11 },
  // Web/iOS 选目录卡
  pickCard: { backgroundColor: C.surface2, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  pickSub: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 3 },
  // 已选目录展示行
  rootRow: { backgroundColor: C.surface2, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rootPath: { flex: 1, color: C.text2, fontSize: 13, minWidth: 0 },
  repick: { color: C.brandText, fontSize: 12, fontWeight: '600' },
  // 扫描选项
  optsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
  optsTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
  optsHint: { flex: 1, color: C.text3, fontSize: 11, textAlign: 'right' },
  optsCard: { backgroundColor: C.surface2, borderRadius: 14, padding: 14, gap: 14 },
  optsLabel: { color: C.text2, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.inset2, borderWidth: 1, borderColor: 'transparent' },
  chipOn: { borderColor: C.brand, backgroundColor: 'transparent' },
  chipText: { color: C.text3, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.brandText },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optTitle: { color: C.text, fontSize: 13, fontWeight: '500' },
  optSub: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 2 },
  // 按钮
  primaryBtn: { flexDirection: 'row', height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  primaryBtnText: { color: C.onBrand, fontSize: 14, fontWeight: '600' },
  ghostBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ghostBtnText: { color: C.text, fontSize: 14, fontWeight: '500' },
  btnOff: { opacity: 0.4 },
  // 进度卡(v3 A2)
  progCard: { backgroundColor: C.surface2, borderRadius: 14, padding: 16, gap: 12, marginTop: 6 },
  progRow: { flexDirection: 'row', alignItems: 'center' },
  progText: { flex: 1, color: C.text2, fontSize: 13 },
  progNum: { color: C.text, fontSize: 14, fontWeight: '700' },
  cancelText: { color: C.brandText, fontSize: 13, fontWeight: '600' },
  progTrack: { height: 4, borderRadius: 2, backgroundColor: C.inset2, overflow: 'hidden' },
  progFill: { height: 4, borderRadius: 2, backgroundColor: C.brand },
  summaryText: { color: C.text3, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 4 },
  ruleText: { color: C.text3, fontSize: 11, lineHeight: 16, marginTop: 10 },
});
