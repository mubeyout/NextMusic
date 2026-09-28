// CloudLibraryScreen —— 云曲库(登录个人空间,LEO spec③)
// 结构:用量条(≥80% 警示黄/100% 红;quota=-1 不限) + 离线只读横幅(缓存骨架回退)
//      + 歌曲列表(按来源分组:我上传的/我下载的) + 管理多选 + 分级删除确认
// 登录后可见(入口在媒体库页,未登录不渲染);进行中上传=UploadQueue sheet 承接(spec⑪A)
// v3.0 定稿作废项移除:本页「上传」按钮/本机选歌器已删——上传唯一源=本机曲库(③3.0 原则2);
// 空态「去本机曲库」=纯跳转(不代开多选,尊重用户浏览节奏)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast, dialog } from '../components/Dialog';
import { EmptyState } from '../components/PageChrome';
import { SongRow } from '../components/SongRow';
import { store as httpStore } from '../services/server';
import { myLib, toSongItem, libCache, type LibSong } from '../services/myLibrary';
import { cloudLib, fmtBytes, type QuotaInfo } from '../services/cloudLibrary';
import { setCloudSongs, presenceOf, subscribePresence } from '../services/cloudPresence';
import { downloads, enqueueDownload, downloadProgress, subscribeDownloads } from '../services/downloads';
import { useUploadSheet } from './UploadSheet';
import { localLib } from '../services/localLibrary';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { LibraryHome, HomeSection, ChipsRow } from '../components/LibraryHome'; // ⑤/⑦ 全库首页化骨架
import { AzIndex, azGroup, useAzJump } from '../components/AzIndex'; // ⑤-4 A-Z 字母索引条
import { IS_HD } from '../services/appversion'; // ⑥ HD 分支适配
import { HDTouch } from '../hd/HDTouch';
import { focus, GUTTER } from '../hd/hdstyle';
import { isFav, subscribeFav } from '../state/favorites';
import { library } from '../state/library';
import { sync, subscribeSync, lxNormKey } from '../services/sync';
import { getUploadStore, subscribeUpload } from '../state/UploadQueue';
import { deviceTracks } from '../services/devicelibrary';

const WARN_YELLOW = '#E8B34B'; // spec③ 用量条 ≥80% 警示黄
const DANGER_RED = '#E8618C';  // 100% 红 / 强警示(全站错误品红同源)
const WEEK_MS = 7 * 24 * 3600 * 1000; // ⑤-B6 NEW 标窗口(7 天内入库)

// ── 分级删除确认(LEO 裁决①) ─────────────────────────────────
// 双在=轻确认;含仅云端副本=强警示红字+3s 倒计时二次点击;批量按唯一副本数升级文案
function DeleteConfirm({ list, onClose, onConfirm, busy }: { list: LibSong[]; onClose: () => void; onConfirm: () => void; busy: boolean }) {
  const unique = useMemo(
    () => list.filter(s => presenceOf(toSongItem(s)) !== 'both').length, // 本机无副本=唯一副本
    [list],
  );
  const strong = unique > 0;
  // 强警示:第一次点击武装+3s 倒计时,倒计时结束才可二次点击确认
  const [armed, setArmed] = useState(false);
  const [count, setCount] = useState(3);
  useEffect(() => { setArmed(false); setCount(3); }, [list]);
  useEffect(() => {
    if (!armed || count <= 0) return;
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [armed, count]);
  const label = !strong ? '删除'
    : !armed ? '删除'
    : count > 0 ? `请稍候 (${count})`
    : '确认删除';
  return (
    <Modal transparent visible onRequestClose={onClose}>
      <Pressable style={c.backdrop} onPress={onClose}>
        <Pressable style={c.delCard} onPress={() => {}}>
          <View style={[c.delIcon, strong && c.delIconStrong]}>
            <Icon name="trash" size={22} color={strong ? DANGER_RED : C.text2} />
          </View>
          <Text style={c.delTitle}>删除云端文件</Text>
          <Text style={c.delMsg}>
            {strong
              ? `将删除 ${list.length} 个云端文件。其中 ${unique} 个在本机没有副本，删除后无法找回。`
              : `将删除 ${list.length} 个云端文件，本机副本保留。`}
          </Text>
          {strong ? <Text style={c.delWarn}>此操作不可撤销，请确认后再继续。</Text> : null}
          <View style={c.delBtns}>
            <TouchableOpacity style={c.delCancel} onPress={onClose} activeOpacity={0.75}>
              <Text style={c.delCancelT}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[c.delOk, strong && { backgroundColor: DANGER_RED }, (strong && (!armed || count > 0)) && c.delOkLock]}
              disabled={busy || (strong && (!armed || count > 0))}
              onPress={() => { if (!strong) { onConfirm(); return; } if (armed && count <= 0) onConfirm(); else setArmed(true); }}
              activeOpacity={0.75}
            >
              <Text style={c.delOkT}>{busy ? '删除中…' : label}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── ⑥ 管理三件套类型与常量(§8.1) ────────────────────────────
type PFilter = 'all' | 'cloudonly' | 'both' | 'fav'; // 筛选chips:全部/仅云端(数据安全清单)/双在/已收藏
type SortKey = 'recent' | 'size' | 'title';           // 排序:最近上传/文件大小↓(清理核心)/标题A-Z
const SORT_LABEL: Record<SortKey, string> = { recent: '最近上传', size: '文件大小', title: '标题 A-Z' };
const FILTER_TITLE: Record<PFilter, string> = { all: '全部', cloudonly: '仅云端副本', both: '已同步（本机与云端双在）', fav: '已收藏' };
const FILTER_CHIPS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'cloudonly', label: '仅云端' },
  { key: 'both', label: '双在' },
  { key: 'fav', label: '已收藏' },
];

// ⑥ HD 分支适配:TV/车机 D-pad 焦点可达(web 桌面自动退化 TouchableOpacity;同 Dialog.DTouch 模式)
function STouch(props: { style?: StyleProp<ViewStyle>; onPress?: () => void; disabled?: boolean; hitSlop?: number; pill?: number; children?: React.ReactNode }) {
  const { style, onPress, disabled, hitSlop, pill = 999, children } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={disabled ? undefined : onPress} focusStyle={focus(pill)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style} onPress={onPress} disabled={disabled} hitSlop={hitSlop} activeOpacity={0.78}>
      {children}
    </TouchableOpacity>
  );
}

// ── ⑥ 附透:存储明细半屏(quota 端点 + 本地计算) ──────────────
// 音频 N 首 X · 最大 10 首占 Y(清理核心大文件榜) · 上传队列暂存 Z(进行中批次待传体积)
function StorageSheet({ quota, songs, onClose }: { quota: QuotaInfo | null; songs: LibSong[] | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [upTick, bumpUp] = useState(0);
  useEffect(() => subscribeUpload(() => bumpUp(t => t + 1)), []);
  const audioBytes = useMemo(() => (songs || []).reduce((n, s) => n + (s.size || 0), 0), [songs]);
  const top10 = useMemo(() => (songs ? [...songs].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 10) : []), [songs]);
  const top10Bytes = useMemo(() => top10.reduce((n, s) => n + (s.size || 0), 0), [top10]);
  // 上传暂存:进行中批次按 uri 匹配设备曲目取体积(web 选文件无 uri 体积→未知项如实计数)
  const staging = useMemo(() => {
    const b = getUploadStore().batch;
    const pending = b ? b.items.filter(i => i.st === 'wait' || i.st === 'up') : [];
    let bytes = 0, unknown = 0;
    if (pending.length) {
      try {
        const byPath = new Map(deviceTracks().map(d => [d.path, d]));
        for (const it of pending) {
          const sz = byPath.get(it.uri)?.size || 0;
          if (sz) bytes += sz; else unknown++;
        }
      } catch { unknown = pending.length; }
    }
    return { count: pending.length, bytes, unknown };
  }, [upTick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={c2.back} onPress={onClose}>
        <Pressable style={[c2.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={c2.head}>
            <Text style={c2.title}>存储明细</Text>
            <STouch style={c2.close} onPress={onClose}>
              <Icon name="close" size={14} color={C.text2} />
            </STouch>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={c2.rowT}>总用量（配额端点）</Text>
            <Text style={c2.rowV}>{quota
              ? (quota.quotaBytes < 0
                ? `已用 ${fmtBytes(quota.usedBytes)} · 不限容量`
                : `已用 ${fmtBytes(quota.usedBytes)} / ${fmtBytes(quota.quotaBytes)}（${Math.max(0, Math.min(100, quota.percent || 0))}%）`)
              : '暂无配额数据'}</Text>
            <Text style={c2.rowT}>音频文件</Text>
            <Text style={c2.rowV}>{songs ? `${songs.length.toLocaleString()} 首 · ${fmtBytes(audioBytes)}` : '暂无列表数据'}</Text>
            {top10.length ? (
              <>
                <Text style={c2.rowT}>最大 {top10.length} 首 · 合计 {fmtBytes(top10Bytes)}</Text>
                {top10.map((s, i) => (
                  <View key={s.id || s.filename} style={c2.item}>
                    <Text style={c2.itemIdx}>{i + 1}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={c2.itemName} numberOfLines={1}>{s.name || s.filename}</Text>
                      {s.singer ? <Text style={c2.itemSub} numberOfLines={1}>{s.singer}</Text> : null}
                    </View>
                    <Text style={c2.itemSize}>{fmtBytes(s.size || 0)}</Text>
                  </View>
                ))}
              </>
            ) : null}
            <Text style={c2.rowT}>上传队列暂存</Text>
            <Text style={c2.rowV} numberOfLines={2}>
              {staging.count
                ? `${staging.count} 首 · ${fmtBytes(staging.bytes)}${staging.unknown ? `（另 ${staging.unknown} 首体积未知）` : ''}`
                : '暂无进行中上传'}
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const c2 = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%', backgroundColor: '#151517', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 18, paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { color: C.text, fontSize: 15.5, fontWeight: '800', flex: 1 },
  close: { width: 30, height: 30, borderRadius: 999, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  rowT: { color: C.text3, fontSize: 10.5, letterSpacing: 1, marginTop: 12, marginBottom: 3 },
  rowV: { color: C.text, fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.strokeFaint },
  itemIdx: { color: C.text3, fontSize: 11, width: 14, textAlign: 'center' },
  itemName: { color: C.text, fontSize: 12, fontWeight: '600' },
  itemSub: { color: C.text3, fontSize: 10, marginTop: 1 },
  itemSize: { color: C.text2, fontSize: 11.5, fontVariant: ['tabular-nums'] },
});

// ── 主屏 ─────────────────────────────────────────────────────
export function CloudLibraryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong, current, queue, skipNext, reorderQueue } = usePlayer();
  const { token } = useApp();
  const logged = !!token;

  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [songs, setSongs] = useState<LibSong[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [delTargets, setDelTargets] = useState<LibSong[] | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const UploadSheet = useUploadSheet(() => { void load(); });

  const load = useCallback(async () => {
    if (!httpStore.token) { setErr('NEED_LOGIN'); return; }
    setErr(null); setOffline(false);
    // SWR:上次缓存先行(离线只读骨架),网络刷新覆盖
    myLib.swr('cloudlib:songs', () => cloudLib.songs(), cached => {
      if (cached && cached.length) { setSongs(cached); setCloudSongs(cached); }
    }).then(list => { setSongs(list); setCloudSongs(list); })
      .catch(e => {
        const cached = libCache.get<LibSong[]>('cloudlib:songs');
        if (cached && cached.length) { setSongs(cached); setCloudSongs(cached); setOffline(true); }
        else setErr((e as Error).message || '加载失败');
      });
    cloudLib.quota().then(q => { setQuota(q); libCache.set('cloudlib:quota', q); })
      .catch(() => { const q = libCache.get<QuotaInfo>('cloudlib:quota'); if (q) setQuota(q); });
  }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── ⑥ 管理三件套状态与联动 ──
  const [sortBy, setSortBy] = useState<SortKey>('recent'); // 排序:最近上传/文件大小↓/标题A-Z
  const [storageOpen, setStorageOpen] = useState(false);   // 附透:用量条点击→存储明细半屏
  const [favTick, bumpFav] = useState(0);                  // 收藏三源变化→已收藏筛选重算
  const [, setDlTick] = useState(0);                       // 行内下载进度重渲
  const [presTick, bumpPres] = useState(0);                // 副本判定版本(下载完成→chips/筛选联动)
  useEffect(() => subscribeDownloads(() => setDlTick(t => t + 1)), []);
  useEffect(() => subscribePresence(() => bumpPres(t => t + 1)), []);
  useEffect(() => {
    const a = subscribeFav(() => bumpFav(t => t + 1));
    const b = subscribeSync(() => bumpFav(t => t + 1));
    const d = library.subscribe(() => bumpFav(t => t + 1));
    return () => { a(); b(); d(); };
  }, []);

  // 分组:我上传的(默认——v2.2 云端副本唯一来源=本机上传) / 我下载的(服务器缓存下载记录;P1「在线歌下载到云曲库」合入后转正)
  const groups = useMemo(() => {
    if (!songs) return null;
    let dlRecs: { hash?: string; name?: string }[] = [];
    try { dlRecs = downloads.all().filter(r => r.server).map(r => r.song); } catch { /* ignore */ }
    const g: { uploaded: LibSong[]; downloaded: LibSong[] } = { uploaded: [], downloaded: [] };
    for (const s of songs) {
      const isDl = dlRecs.some(r => (r.hash && r.hash === s.filename) || (r.name && r.name === s.name));
      (isDl ? g.downloaded : g.uploaded).push(s);
    }
    return g;
  }, [songs]);

  const keyOf = (s: LibSong) => s.id || s.filename;
  // ⑤/⑦ 首页化:筛选视图(已同步/仅云端)+最近添加+双在分区数据(cloudPresence 判定)
  const [pFilter, setPFilter] = useState<PFilter>('all'); // ⑥ chips 扩展:全部/仅云端/双在/已收藏
  const recentCloud = useMemo(() => songs ? [...songs].sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 4) : [], [songs]);
  const bothCount = useMemo(() => songs ? songs.filter(s => presenceOf(toSongItem(s)) === 'both').length : 0, [songs, presTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const cloudOnlyCount = useMemo(() => songs ? songs.filter(s => presenceOf(toSongItem(s)) === 'cloud').length : 0, [songs, presTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSel = (s: LibSong) => setSel(prev => { const n = new Set(prev); if (n.has(keyOf(s))) n.delete(keyOf(s)); else n.add(keyOf(s)); return n; });
  const exitSel = () => { setSelMode(false); setSel(new Set()); };
  const selSongs = useMemo(() => (songs || []).filter(s => sel.has(keyOf(s))), [songs, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── ⑥ 已收藏判定(useFav 同源三源:本机收藏/任意歌单收录/服务器 loveList+userList) ──
  const favKeySet = useMemo(() => {
    const s = new Set<string>();
    type K = Parameters<typeof lxNormKey>[0];
    try { for (const pl of library.all()) for (const x of (pl.songs || []) as K[]) { const k = lxNormKey(x); if (k) s.add(k); } } catch { /* ignore */ }
    try {
      const snap = sync.cachedLists();
      for (const x of snap?.loveList || []) { if (x?.id) s.add(String(x.id)); }
      for (const u of snap?.userList || []) for (const x of (u.list || []) as K[]) { const k = lxNormKey(x); if (k) s.add(k); }
    } catch { /* ignore */ }
    return s;
  }, [favTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const favCloud = useCallback((s: LibSong) => {
    const it = toSongItem(s);
    return favKeySet.has(`custom_${it.songmid}`) || isFav(it);
  }, [favKeySet]);
  // ⑥ 筛选(浏览/管理共用;副本态随下载完成联动) + 排序(仅管理模式)
  const filteredSongs = useMemo(() => {
    if (!songs) return [];
    if (pFilter === 'cloudonly') return songs.filter(s => presenceOf(toSongItem(s)) === 'cloud');
    if (pFilter === 'both') return songs.filter(s => presenceOf(toSongItem(s)) === 'both');
    if (pFilter === 'fav') return songs.filter(favCloud);
    return songs;
  }, [songs, pFilter, favCloud, presTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const mgmtSongs = useMemo(() => {
    const arr = [...filteredSongs];
    if (sortBy === 'recent') arr.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    else if (sortBy === 'size') arr.sort((a, b) => (b.size || 0) - (a.size || 0));
    else arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return arr;
  }, [filteredSongs, sortBy]);
  // ── ⑤-4 字母索引条:分组键=歌名首字母(localeCompare 近似拼音口径见 AzIndex;浏览/筛选/管理三态接线) ──
  const azName = (s: LibSong) => s.name || s.filename || '';
  const { scrollRef: azScroll, reg: azReg, jump: azJump } = useAzJump();
  const browseAll = useMemo(() => (groups ? [...groups.uploaded, ...groups.downloaded] : []), [groups]);
  const azBrowse = useMemo(() => azGroup(browseAll, azName, keyOf), [browseAll]);
  const azFilter = useMemo(() => azGroup(filteredSongs, azName, keyOf), [filteredSongs]);
  const azMgmt = useMemo(() => azGroup(mgmtSongs, azName, keyOf), [mgmtSongs]);
  // 字母首项行包 View 登记 onLayout y(仅首项包,≤27 处);非首项原样返回
  const azRow = (s: LibSong, prefix: string, firstIds: Map<string, string>, row: React.ReactNode) => {
    const L = firstIds.get(keyOf(s));
    return L ? <View key={keyOf(s)} onLayout={azReg(prefix + L)}>{row}</View> : row;
  };
  // ⑥ 批量「下载到本机」:选中项里的仅云端副本(enqueueDownload 自带去重;逐首进度=下载队列原生)
  const selCloudOnly = useMemo(() => selSongs.filter(s => presenceOf(toSongItem(s)) === 'cloud'), [selSongs, presTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const doDownload = () => {
    const list = selCloudOnly;
    if (!list.length) return;
    try {
      const n = enqueueDownload(list.map(s => toSongItem(s)));
      toast(n ? `已加入下载队列（${n} 首），逐首进度见下载管理` : '所选仅云端歌已在下载队列');
    } catch { toast('加入下载失败'); }
  };
  // ⑥ 排序 ActionSheet(dialog.menu 底部菜单;当前项文字标注,零 emoji)
  const openSort = () => dialog.menu('排序方式', (['recent', 'size', 'title'] as SortKey[]).map(k => ({
    label: k === sortBy ? `${SORT_LABEL[k]}（当前）` : SORT_LABEL[k],
    onPress: () => setSortBy(k),
  })));

  const play = async (i: number, list: LibSong[]) => {
    const items = list.map(x => toSongItem(x));
    await playSong(items[i], items);
  };
  // v3.0 空态「去本机曲库」=纯跳转(③3.0 原则2:不代开多选,尊重用户浏览节奏)
  const goLocalLib = () => {
    const libs = localLib.all();
    if (libs.length) nav.navigate('LocalLibBrowse', { libId: libs[0].id });
    else nav.navigate('MediaLibs', {});
  };
  const rowMenu = (s: LibSong) => dialog.menu(`${s.name} · ${s.singer}`, [
    { label: '删除', danger: true, onPress: () => setDelTargets([s]) },
  ]);

  const doDelete = async () => {
    if (!delTargets) return;
    setDelBusy(true);
    try {
      await cloudLib.remove(delTargets.map(s => s.filename)); // TODO(P1):服务端删除端点合入前恒失败
      // 定稿v3.0 细则4:删除云端歌→队列联动——正在播放的云端歌被删→先跳下一首(不中断播放),
      // 再降序移除队列匹配项(reorderQueue 自身保护正在播放曲目;skipNext 不变队列数组,索引稳定)
      try {
        const dead = new Set(delTargets.map(s => s.filename));
        if (current?.hash && dead.has(current.hash)) await skipNext();
        const idxs = queue.map((t, i) => (t.hash && dead.has(t.hash) ? i : -1)).filter(i => i >= 0).sort((a, b) => b - a);
        idxs.forEach(i => reorderQueue(i, -2));
      } catch { /* 队列联动失败不影响删除结果 */ }
      toast(`已删除 ${delTargets.length} 首`);
      setDelTargets(null); exitSel(); void load();
    } catch (e) {
      toast((e as Error).message || '删除失败');
      setDelBusy(false);
    }
  };

  // ── 用量条(spec③:≥80 黄/100 红;-1 不限;⑥ 点击→存储明细半屏) ──
  const quotaCard = quota ? (
    <STouch style={c.quotaCard} onPress={() => setStorageOpen(true)} pill={14}>
      {quota.quotaBytes < 0 ? (
        <View style={c.quotaRow}>
          <Icon name="cloud" size={13} color={C.brand} />
          <Text style={c.quotaLabel}>云曲库空间</Text>
          <Text style={c.quotaVal}>不限容量 · 已用 {fmtBytes(quota.usedBytes)}</Text>
        </View>
      ) : (() => {
        const p = Math.max(0, Math.min(100, quota.percent || 0));
        const col = p >= 100 ? DANGER_RED : p >= 80 ? WARN_YELLOW : C.brand;
        return (
          <>
            <View style={c.quotaRow}>
              <Icon name="cloud" size={13} color={C.brand} />
              <Text style={c.quotaLabel}>云曲库空间</Text>
              <Text style={[c.quotaVal, p >= 80 && { color: col }]}>
                {fmtBytes(quota.usedBytes)} / {fmtBytes(quota.quotaBytes)}
              </Text>
              <Text style={[c.quotaPct, p >= 80 && { color: col }]}>{p}%</Text>
            </View>
            <View style={c.quotaTrack}>
              <View style={[c.quotaFill, { width: `${p}%`, backgroundColor: col }]} />
            </View>
            {p >= 80 ? <Text style={[c.quotaWarn, { color: col }]}>{p >= 100 ? '空间已满，清理后才能继续上传' : '空间即将用完'}</Text> : null}
          </>
        );
      })()}
      <View style={c.quotaMore}>
        <Text style={c.quotaMoreT}>存储明细</Text>
        <Icon name="chevronright" size={11} color={C.text3} />
      </View>
    </STouch>
  ) : null;

  // ── 列表体 ──
  const body = () => {
    if (!logged) {
      return <EmptyState icon="cloud" title="登录后使用云曲库" sub="上传本机音乐到你的个人云端空间，全设备同步" />;
    }
    if (err === 'NEED_LOGIN') {
      return <EmptyState icon="cloud" title="登录后使用云曲库" sub="上传本机音乐到你的个人云端空间，全设备同步" />;
    }
    if (err) {
      return <EmptyState icon="cloud" title="云曲库加载失败" sub={err} />;
    }
    if (!songs || !groups) {
      return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>;
    }
    const isEmpty = !songs.length;
    if (isEmpty && !selMode) {
      // spec③3.1 空态(定稿v3.0):无上传按钮,「去本机曲库」纯跳转
      return (
        <View style={c.emptyWrap}>
          <Icon name="cloud" size={30} color={C.text3} />
          <Text style={c.emptyT1}>云端还是空的</Text>
          <Text style={c.emptyT2}>去本机曲库，长按或 ⋯ 多选后上传</Text>
          <TouchableOpacity style={c.emptyBtn} onPress={goLocalLib} activeOpacity={0.85}>
            <Text style={c.emptyBtnT}>去本机曲库</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // ⑥ 管理模式:筛选chips+排序平铺列表(批量动作条在屏底;浏览态不进此分支)
    if (selMode) {
      return (
        <View style={{ flex: 1 }}>
          <View style={[c.chipsWrap, IS_HD && c.chipsWrapHD]}>
            <ChipsRow chips={FILTER_CHIPS} active={pFilter} onChange={k => setPFilter(k as PFilter)} />
          </View>
          {/* key=排序/筛选:重排即重挂,字母首项 onLayout 偏移保鲜(⑤-4) */}
          <ScrollView key={`mgmt:${sortBy}:${pFilter}`} ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
            {mgmtSongs.map(s => {
              const it = toSongItem(s);
              const prog = downloadProgress(it); // 逐首进度(下载中行内细条)
              return azRow(s, 'mgmt:', azMgmt.firstIds, (
                <SongRow
                  key={keyOf(s)}
                  song={it}
                  onPress={() => toggleSel(s)}
                  leading={<View style={[c.chk, sel.has(keyOf(s)) && c.chkOn]}>{sel.has(keyOf(s)) ? <Icon name="check" size={12} color="#fff" /> : null}</View>}
                  extra={prog != null ? (
                    <View style={c.dlTrack}><View style={[c.dlFill, { width: `${Math.round(Math.max(0, Math.min(1, prog)) * 100)}%` }]} /></View>
                  ) : null}
                />
              ));
            })}
            {!mgmtSongs.length ? <Text style={c.emptyInline}>没有匹配的歌曲</Text> : null}
          </ScrollView>
          {azMgmt.letters.length > 1 ? <AzIndex letters={azMgmt.letters} onPick={l => azJump('mgmt:' + l)} /> : null}
        </View>
      );
    }
    // ⑤ 筛选视图(浏览态):已同步/仅云端/已收藏——分区卡或管理 chips 带入,清除回到分组列表
    if (pFilter !== 'all') {
      const filtered = filteredSongs;
      return (
        <View style={{ flex: 1 }}>
          {/* key 含长度:收藏/副本态变化致成员变动即重挂,偏移保鲜(⑤-4) */}
          <ScrollView key={`flt:${pFilter}:${filtered.length}`} ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
            <View style={c.filterBar}>
              <Text style={c.filterT} numberOfLines={1}>{FILTER_TITLE[pFilter]} · {filtered.length} 首</Text>
              <TouchableOpacity hitSlop={6} onPress={() => setPFilter('all')}><Text style={c.filterClear}>清除筛选</Text></TouchableOpacity>
            </View>
            {filtered.map((s, i) => {
              const it = toSongItem(s);
              return azRow(s, 'flt:', azFilter.firstIds, (
                <SongRow key={keyOf(s)} song={it} playing={current?.hash === s.filename}
                  isNew={!!s.mtime && Date.now() - s.mtime < WEEK_MS}
                  onPress={() => void play(i, filtered)} onMore={() => rowMenu(s)} />
              ));
            })}
            {!filtered.length ? <Text style={c.emptyInline}>没有匹配的歌曲</Text> : null}
          </ScrollView>
          {azFilter.letters.length > 1 ? <AzIndex letters={azFilter.letters} onPick={l => azJump('flt:' + l)} /> : null}
        </View>
      );
    }
    const renderGroup = (title: string, list: LibSong[]) => list.length ? (
      <React.Fragment key={title}>
        <Text style={c.grp}>{title} · {list.length}</Text>
        {list.map(s => {
          const it = toSongItem(s);
          const idx = songs.indexOf(s);
          return selMode ? (
            <SongRow
              key={keyOf(s)}
              song={it}
              onPress={() => toggleSel(s)}
              leading={<View style={[c.chk, sel.has(keyOf(s)) && c.chkOn]}>{sel.has(keyOf(s)) ? <Icon name="check" size={12} color="#fff" /> : null}</View>}
            />
          ) : azRow(s, 'browse:', azBrowse.firstIds, (
            <SongRow
              key={keyOf(s)}
              song={it}
              playing={current?.hash === s.filename}
              onPress={() => void play(idx, songs)}
              onMore={() => rowMenu(s)}
            />
          ));
        })}
      </React.Fragment>
    ) : null;
    return (
      <View style={{ flex: 1 }}>
        {/* key 含长度:删除/上传致成员变动即重挂,字母首项偏移保鲜(⑤-4) */}
        <ScrollView key={`browse:${songs.length}`} ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
          {renderGroup('我上传的', groups.uploaded)}
          {renderGroup('我下载的', groups.downloaded)}
        </ScrollView>
        {azBrowse.letters.length > 1 ? <AzIndex letters={azBrowse.letters} onPick={l => azJump('browse:' + l)} /> : null}
      </View>
    );
  };

  if (!logged && err !== 'NEED_LOGIN') {
    // 未登录不渲染内容(入口本身也只在登录后出现;此处兜底空屏)
  }

  return (
    <View style={[c.screen, { paddingTop: insets.top }]}>
      {/* 自绘头部(PageHeader 右槽固定 30px 装不下双按钮;同 MyLibraryScreen 头部模式) */}
      <View style={c.head}>
        <TouchableOpacity style={c.headBtn} onPress={() => nav.goBack()} hitSlop={6}>
          <Icon name="back" size={16} color={C.text2} />
        </TouchableOpacity>
        <Text style={c.headTitle}>云曲库</Text>
        <View style={{ flex: 1 }} />
        {logged ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {songs && songs.length && !offline ? (
              selMode ? (
                <>
                  {/* ⑥ 排序文字钮:ActionSheet 三选(当前项标注) */}
                  <STouch style={c.headBtn} onPress={openSort} hitSlop={6} pill={9}>
                    <Text style={c.headBtnT}>排序</Text>
                  </STouch>
                  <STouch style={c.headBtn} onPress={exitSel} hitSlop={6} pill={9}>
                    <Text style={c.headBtnT}>完成</Text>
                  </STouch>
                </>
              ) : (
                <STouch style={c.headBtn} onPress={() => setSelMode(true)} hitSlop={6} pill={9}>
                  <Text style={c.headBtnT}>管理</Text>
                </STouch>
              )
            ) : null}
          </View>
        ) : null}
      </View>
      {/* ⑤/⑦ 首页化:库头横幅+快捷动作+最近添加/已同步/仅云端分区(渐进色裹,分组列表与多选链路不动) */}
      {logged ? (
        <LibraryHome
          kind="cloud" name="云曲库" sub="个人空间"
          stats={songs ? `${songs.length.toLocaleString()} 首${quota && quota.quotaBytes >= 0 ? ` · 用量 ${Math.max(0, Math.min(100, quota.percent || 0))}%` : ''}` : undefined}
          actions={[
            {
              icon: 'shuffle', label: '随机播放', primary: true, disabled: !songs?.length || offline,
              onPress: () => { if (songs?.length) void play(Math.floor(Math.random() * songs.length), songs); },
            },
            {
              icon: 'edit', label: selMode ? '退出管理' : '管理', disabled: !songs?.length || offline,
              onPress: () => (selMode ? exitSel() : setSelMode(true)),
            },
            { icon: 'refresh', label: '刷新', onPress: () => { setPFilter('all'); void load(); } },
          ]}
        >
          {songs && songs.length && !selMode && !offline ? (
            <>
              {recentCloud.length ? (
                <HomeSection title="最近添加">
                  {recentCloud.map((s, i) => {
                    const it = toSongItem(s);
                    return (
                      <SongRow key={keyOf(s)} song={it} playing={current?.hash === s.filename}
                        isNew={!!s.mtime && Date.now() - s.mtime < WEEK_MS}
                        onPress={() => void play(i, recentCloud)} onMore={() => rowMenu(s)} />
                    );
                  })}
                </HomeSection>
              ) : null}
              {bothCount > 0 || cloudOnlyCount > 0 ? (
                <HomeSection title="同步状态">
                  <View style={c.syncRow}>
                    {bothCount > 0 ? (
                      <TouchableOpacity style={c.syncCard} activeOpacity={0.8} onPress={() => setPFilter('both')}>
                        <View style={c.syncIcon}><Icon name="cloud-check" size={17} color={C.brand} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={c.syncT}>已同步 {bothCount} 首</Text>
                          <Text style={c.syncSub} numberOfLines={1}>本机与云端双在 · 离线可播</Text>
                        </View>
                        <Icon name="chevronright" size={14} color={C.text3} />
                      </TouchableOpacity>
                    ) : null}
                    {cloudOnlyCount > 0 ? (
                      <TouchableOpacity style={c.syncCard} activeOpacity={0.8} onPress={() => setPFilter('cloudonly')}>
                        <View style={c.syncIcon}><Icon name="cloud" size={17} color={WARN_YELLOW} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={c.syncT}>仅云端 {cloudOnlyCount} 首</Text>
                          <Text style={c.syncSub} numberOfLines={1}>云端唯一副本 · 建议下载备份</Text>
                        </View>
                        <Icon name="chevronright" size={14} color={C.text3} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </HomeSection>
              ) : null}
            </>
          ) : null}
        </LibraryHome>
      ) : null}
      {logged ? (
        <View style={{ paddingHorizontal: 16 }}>
          {quotaCard}
          {offline ? (
            <View style={c.offBar}>
              <Icon name="wifi-off" size={13} color={WARN_YELLOW} />
              <Text style={c.offT}>离线只读 · 展示上次同步内容，恢复连接后自动刷新</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{body()}</View>
      {/* ⑥ 多选动作条:全选(随筛选可见集)/下载到本机(仅云端 N)/删除 N(分级确认链路不动) */}
      {selMode && songs && songs.length ? (
        <View style={[c.selBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={c.selCount} numberOfLines={1}>已选 {sel.size} 首</Text>
          <STouch style={c.selBtn} onPress={() => setSel(sel.size >= mgmtSongs.length && mgmtSongs.length ? new Set() : new Set(mgmtSongs.map(keyOf)))}>
            <Text style={c.selBtnT}>{sel.size >= mgmtSongs.length && mgmtSongs.length ? '全不选' : '全选'}</Text>
          </STouch>
          <STouch
            style={[c.selDl, !selCloudOnly.length && c.selDlOff]}
            disabled={!selCloudOnly.length}
            onPress={doDownload}
          >
            <Icon name="download" size={13} color={!selCloudOnly.length ? C.text3 : C.brandText} />
            <Text style={[c.selDlT, !selCloudOnly.length && { color: C.text3 }]}>下载到本机{selCloudOnly.length ? ` (${selCloudOnly.length})` : ''}</Text>
          </STouch>
          <STouch
            style={[c.selDel, !sel.size && c.selDelOff]}
            disabled={!sel.size}
            onPress={() => setDelTargets(selSongs)}
          >
            <Icon name="trash" size={13} color={!sel.size ? C.text3 : '#fff'} />
            <Text style={[c.selDelT, !sel.size && { color: C.text3 }]}>删除{sel.size ? ` (${sel.size})` : ''}</Text>
          </STouch>
        </View>
      ) : null}
      {delTargets ? (
        <DeleteConfirm list={delTargets} busy={delBusy} onClose={() => { if (!delBusy) setDelTargets(null); }} onConfirm={() => void doDelete()} />
      ) : null}
      {/* ⑥ 附透:用量条点击→存储明细半屏 */}
      {storageOpen ? <StorageSheet quota={quota} songs={songs} onClose={() => setStorageOpen(false)} /> : null}
      <UploadSheet.View />
    </View>
  );
}

// ── 媒体库页入口卡(登录后渲染,未登录不渲染——spec③ 登录个人空间) ──
export function CloudLibCard({ onEnter }: { onEnter: () => void }) {
  return (
    <TouchableOpacity style={c.entryCard} onPress={onEnter} activeOpacity={0.8}>
      <View style={c.entryIcon}><Icon name="cloud" size={20} color={C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={c.entryTitle}>云曲库</Text>
        <Text style={c.entrySub}>个人云端空间 · 用量 / 上传 / 文件管理</Text>
      </View>
      <Icon name="chevronright" size={13} color={C.text3} />
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  headTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  // ⑤ 同步状态分区卡与筛选视图
  syncRow: { flexDirection: 'row', gap: 10 },
  syncCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.strokeFaint, padding: 12 },
  syncIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  syncT: { color: C.text, fontSize: 13, fontWeight: '700' },
  syncSub: { color: C.text3, fontSize: 10.5, lineHeight: 14, marginTop: 1 },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surface2 },
  filterT: { flex: 1, color: C.text2, fontSize: 11.5 },
  filterClear: { color: C.brandText, fontSize: 12, fontWeight: '600' },
  emptyInline: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  headStats: { flex: 1, color: C.text3, fontSize: 10.5, textAlign: 'right', marginRight: 2 },
  headBtn: { height: 30, minWidth: 30, paddingHorizontal: 8, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  headBtnT: { color: C.text2, fontSize: 12, fontWeight: '600' },
  // 用量条
  quotaCard: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.strokeFaint, padding: 14, marginTop: 6 },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  quotaLabel: { color: C.text, fontSize: 12.5, fontWeight: '700', marginRight: 'auto' },
  quotaVal: { color: C.text2, fontSize: 11.5 },
  quotaPct: { color: C.text3, fontSize: 11.5, marginLeft: 8 },
  quotaTrack: { height: 5, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.08)', marginTop: 10, overflow: 'hidden' },
  quotaFill: { height: '100%', borderRadius: 5 },
  quotaWarn: { fontSize: 10.5, marginTop: 7 },
  // 离线横幅
  offBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(232,179,75,.08)', borderWidth: 1, borderColor: 'rgba(232,179,75,.22)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginTop: 8 },
  offT: { color: WARN_YELLOW, fontSize: 11, flex: 1 },
  // 分组与行
  grp: { color: C.text3, fontSize: 11, letterSpacing: 1, marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
  chk: { width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  chkOn: { backgroundColor: C.brand, borderColor: C.brand },
  // 空态
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingVertical: 60 },
  emptyT1: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptyT2: { color: C.text3, fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 240 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9, marginTop: 10 },
  emptyBtnT: { color: '#04120a', fontSize: 12.5, fontWeight: '800' },
  // 多选动作条
  selBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.strokeFaint },
  selCount: { color: C.text2, fontSize: 12, fontWeight: '600', marginRight: 'auto', flexShrink: 1 },
  selBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  selBtnT: { color: C.text2, fontSize: 12, fontWeight: '600' },
  selDel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DANGER_RED, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  selDelOff: { backgroundColor: C.surface2 },
  selDelT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // ⑥ 批量下载钮/chips/行内进度/明细入口
  selDl: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.brand, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  selDlOff: { borderColor: C.stroke, opacity: 0.55 },
  selDlT: { color: C.brandText, fontSize: 12, fontWeight: '700' },
  chipsWrap: { marginTop: 10, marginHorizontal: 16 },
  chipsWrapHD: { marginHorizontal: GUTTER },
  dlTrack: { width: 46, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' },
  dlFill: { height: '100%', borderRadius: 4, backgroundColor: C.brand },
  quotaMore: { flexDirection: 'row', alignItems: 'center', gap: 2, justifyContent: 'flex-end', marginTop: 8 },
  quotaMoreT: { color: C.text3, fontSize: 10.5 },
  // 删除确认
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', alignItems: 'center' },
  delCard: { width: '88%', maxWidth: 380, backgroundColor: '#151517', borderRadius: 18, borderWidth: 1, borderColor: C.stroke, padding: 20, alignItems: 'center' },
  delIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  delIconStrong: { backgroundColor: 'rgba(232,97,140,.08)', borderColor: 'rgba(232,97,140,.25)' },
  delTitle: { color: C.text, fontSize: 15.5, fontWeight: '800', textAlign: 'center' },
  delMsg: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  delWarn: { color: DANGER_RED, fontSize: 11, marginTop: 6, textAlign: 'center', fontWeight: '600' },
  delBtns: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  delCancel: { flex: 1, borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  delCancelT: { color: C.text2, fontSize: 13, fontWeight: '600' },
  delOk: { flex: 1, backgroundColor: C.brand, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  delOkLock: { opacity: 0.45 },
  delOkT: { color: '#04120a', fontSize: 13, fontWeight: '800' },
  // 入口卡
  entryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.strokeFaint, padding: 14, marginBottom: 14 },
  entryIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(30,215,96,.08)', borderWidth: 1, borderColor: 'rgba(30,215,96,.18)', alignItems: 'center', justifyContent: 'center' },
  entryTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  entrySub: { color: C.text3, fontSize: 10.5, marginTop: 2 },
});
