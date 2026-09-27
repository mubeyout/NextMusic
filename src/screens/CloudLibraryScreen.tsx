// CloudLibraryScreen —— 云曲库(登录个人空间,LEO spec③)
// 结构:用量条(≥80% 警示黄/100% 红;quota=-1 不限) + 离线只读横幅(缓存骨架回退)
//      + 歌曲列表(按来源分组:我上传的/我下载的) + 管理多选 + 分级删除确认
// 登录后可见(入口在媒体库页,未登录不渲染);进行中上传=UploadQueue sheet 承接(spec⑪A)
// v3.0 定稿作废项移除:本页「上传」按钮/本机选歌器已删——上传唯一源=本机曲库(③3.0 原则2);
// 空态「去本机曲库」=纯跳转(不代开多选,尊重用户浏览节奏)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, ActivityIndicator } from 'react-native';
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
import { setCloudSongs, presenceOf } from '../services/cloudPresence';
import { downloads } from '../services/downloads';
import { useUploadSheet } from './UploadSheet';
import { localLib } from '../services/localLibrary';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';

const WARN_YELLOW = '#E8B34B'; // spec③ 用量条 ≥80% 警示黄
const DANGER_RED = '#E8618C';  // 100% 红 / 强警示(全站错误品红同源)

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
  const toggleSel = (s: LibSong) => setSel(prev => { const n = new Set(prev); if (n.has(keyOf(s))) n.delete(keyOf(s)); else n.add(keyOf(s)); return n; });
  const exitSel = () => { setSelMode(false); setSel(new Set()); };
  const selSongs = useMemo(() => (songs || []).filter(s => sel.has(keyOf(s))), [songs, sel]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── 用量条(spec③:≥80 黄/100 红;-1 不限) ──
  const quotaCard = quota ? (
    quota.quotaBytes < 0 ? (
      <View style={c.quotaCard}>
        <View style={c.quotaRow}>
          <Icon name="cloud" size={13} color={C.brand} />
          <Text style={c.quotaLabel}>云曲库空间</Text>
          <Text style={c.quotaVal}>不限容量 · 已用 {fmtBytes(quota.usedBytes)}</Text>
        </View>
      </View>
    ) : (() => {
      const p = Math.max(0, Math.min(100, quota.percent || 0));
      const col = p >= 100 ? DANGER_RED : p >= 80 ? WARN_YELLOW : C.brand;
      return (
        <View style={c.quotaCard}>
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
        </View>
      );
    })()
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
          ) : (
            <SongRow
              key={keyOf(s)}
              song={it}
              playing={current?.hash === s.filename}
              onPress={() => void play(idx, songs)}
              onMore={() => rowMenu(s)}
            />
          );
        })}
      </React.Fragment>
    ) : null;
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        {renderGroup('我上传的', groups.uploaded)}
        {renderGroup('我下载的', groups.downloaded)}
      </ScrollView>
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
        <Text style={c.headStats} numberOfLines={1}>{songs ? `${songs.length} 首` : ''}</Text>
        {logged ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {songs && songs.length && !offline ? (
              <TouchableOpacity style={c.headBtn} onPress={() => { selMode ? exitSel() : setSelMode(true); }} hitSlop={6}>
                <Text style={c.headBtnT}>{selMode ? '完成' : '管理'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
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
      {/* 多选动作条(全选/删除 N/退出;与队列批量条同款) */}
      {selMode && songs && songs.length ? (
        <View style={[c.selBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={c.selCount}>已选 {sel.size} 首</Text>
          <TouchableOpacity style={c.selBtn} onPress={() => setSel(sel.size >= songs.length ? new Set() : new Set(songs.map(keyOf)))}>
            <Text style={c.selBtnT}>{sel.size >= songs.length ? '全不选' : '全选'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[c.selDel, !sel.size && c.selDelOff]}
            disabled={!sel.size}
            onPress={() => setDelTargets(selSongs)}
          >
            <Icon name="trash" size={13} color={!sel.size ? C.text3 : '#fff'} />
            <Text style={[c.selDelT, !sel.size && { color: C.text3 }]}>删除{sel.size ? ` (${sel.size})` : ''}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {delTargets ? (
        <DeleteConfirm list={delTargets} busy={delBusy} onClose={() => { if (!delBusy) setDelTargets(null); }} onConfirm={() => void doDelete()} />
      ) : null}
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
  selCount: { color: C.text2, fontSize: 12, fontWeight: '600', marginRight: 'auto' },
  selBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  selBtnT: { color: C.text2, fontSize: 12, fontWeight: '600' },
  selDel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DANGER_RED, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  selDelOff: { backgroundColor: C.surface2 },
  selDelT: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
