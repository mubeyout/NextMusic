// ServerLocalLibraryScreen —— Web 本地曲库全新页(服务器目录绑定/导入/浏览;升级稿 library-web-upgrade-v1 §二 T1-T4)
// 语义:浏览器无设备文件——「本地」=服务器主机目录;绑定=起名+绑目录(管理授权,同服务器 customMusicDir 管理台口径),
//      扫描=听风同款递归目录扫描(服务端 sharedLib 机制,零新增接口),浏览=⑦ 模板 web 版,播放=custom 流(?lib=)。
// 双模式:无 libId=管理视图(T1 绑定表单+库列表);有 libId=浏览视图(T3 横幅+三视图+字母索引条;T4 ⋯ 菜单)。
// 三架构位:扫描可暂停(①)/断点续扫 cursor(②)/增量分批 SCAN_BATCH=50(③)——见 services/serverLocalLibrary.ts。
// 双形态:HD(含 docker/桌面 web-hd)自绘头部+GUTTER;phone(PageHeader)。入口仅 web(MediaLibs 我的曲库组+HD rail)。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { GUTTER, focus } from '../hd/hdstyle';
import { HDTouch } from '../hd/HDTouch';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { SongRow } from '../components/SongRow';
import { toast, dialog } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { LibBanner, LibActions, ChipsRow, HomeSection } from '../components/LibraryHome';
import { AzIndex, azGroup, useAzJump } from '../components/AzIndex'; // T3 字母索引条(⑤-4 同款)
import { DiscCard } from './MyLibraryScreen';
import { req } from '../services/server';
import { myLib, toSongItem, setActiveLib, coverUrl, type LibSong, type LibAlbum, type LibArtist, type LibStats } from '../services/myLibrary';
import {
  slbAdmin, slbIsAdmin, slbVerifyAdmin, slbRefresh, useSlbEntries,
  startScan, clearScanJob, useScanJob, SCAN_BATCH,
  type ServerLibConfig, type ScanJobState, type ScanHandle,
} from '../services/serverLocalLibrary';

const IS_WEB = Platform.OS === 'web';
const SUPPORTED = 'FLAC / MP3 / M4A / OGG / WAV / APE';
const WEEK_MS = 7 * 24 * 3600 * 1000;

// 触点抽象:HD 用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
  const { style, onPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} disabled={disabled} focusStyle={focus(12)} {...(rest as object)}>{children}</HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} disabled={disabled} activeOpacity={0.72} {...(rest as object)}>{children}</TouchableOpacity>
  );
}

const fmtScanAt = (ms: number) => {
  if (!ms) return '未扫描';
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function ServerLocalLibraryScreen({ route }: { route?: { params?: { libId?: string; bind?: boolean } } }) {
  const libId = route?.params?.libId;
  return libId ? <BrowseView libId={libId} /> : <ManageView autoFocusBind={!!route?.params?.bind} />;
}

// ══════════════════════ 管理视图(T1 绑定 + 库列表) ══════════════════════
function ManageView({ autoFocusBind }: { autoFocusBind?: boolean }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const [adminOk, setAdminOk] = useState(() => slbIsAdmin());
  const [pwd, setPwd] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkRes, setCheckRes] = useState<{ ok: boolean; message: string; path?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [libs, setLibs] = useState<ServerLibConfig[] | null>(null);
  const entries = useSlbEntries().filter(e => !e.locked); // 非管理视角:共享可见行

  const refresh = useCallback(() => {
    slbRefresh();
    if (slbIsAdmin()) slbAdmin.list().then(setLibs).catch(() => setLibs([]));
    else setLibs(null);
  }, []);
  useEffect(refresh, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const verify = async () => {
    if (!pwd.trim() || verifying) return;
    setVerifying(true);
    try {
      const ok = await slbVerifyAdmin(pwd.trim());
      if (ok) { setAdminOk(true); toast('管理授权已确认'); setPwd(''); refresh(); }
      else toast('授权码不正确');
    } finally { setVerifying(false); }
  };

  const doCheck = async () => {
    const p = dir.trim();
    if (!p || checking) return;
    setChecking(true); setCheckRes(null);
    try { setCheckRes(await slbAdmin.checkDir(p)); } finally { setChecking(false); }
  };

  // T1 步3「绑定并扫描」:校验→建库→开扫(进度/结果卡在浏览页承接)→绿 toast
  const doBind = async () => {
    const d = dir.trim();
    if (!name.trim() || !d || creating) return;
    if (!slbIsAdmin()) { toast('请先确认管理授权'); return; }
    setCreating(true);
    try {
      let res = checkRes && checkRes.ok && (checkRes.path === d || dir === d) ? checkRes : null;
      if (!res) { res = await slbAdmin.checkDir(d); setCheckRes(res); }
      if (!res.ok) { toast(res.message || '路径校验未通过'); return; }
      const cfg = await slbAdmin.create(name.trim(), res.path || d);
      startScan(cfg);
      toast(`已绑定 ${res.path || d}`);
      setName(''); setDir(''); setCheckRes(null);
      nav.navigate('ServerLocalLib', { libId: cfg.id });
    } catch (e) {
      toast((e as Error).message || '绑定失败');
    } finally { setCreating(false); }
  };

  const libMenu = (l: ServerLibConfig) => dialog.menu(l.name, [
    { label: '重新扫描', onPress: () => { startScan(l); nav.navigate('ServerLocalLib', { libId: l.id }); } },
    { label: '换绑目录', onPress: () => dialog.prompt('换绑目录', { placeholder: '服务器绝对路径', defaultValue: l.dir, onSubmit: v => {
      const p = v.trim();
      if (!p || p === l.dir) return;
      void slbAdmin.checkDir(p).then(r => {
        if (!r.ok) { toast(r.message || '路径校验未通过'); return; }
        void slbAdmin.rebind(l.id, r.path || p).then(() => { toast('已换绑,建议重新扫描'); refresh(); }).catch(e => toast((e as Error).message));
      });
    } }) },
    { label: '解绑', danger: true, onPress: () => dialog.confirm('解绑本地曲库', `确定解绑「${l.name}」吗？仅断开关联，不删除服务器上的音乐文件；重新绑定同目录即可恢复。`, () => {
      void slbAdmin.remove(l.id).then(() => { toast('已解绑'); refresh(); }).catch(e => toast((e as Error).message));
    }) },
  ]);

  const rows: { id: string; name: string; sub: string; cfg?: ServerLibConfig }[] = adminOk && libs
    ? libs.map(l => ({ id: l.id, name: l.name, sub: `${l.dir || '未绑定目录'} · ${l.trackCount ? `${l.trackCount} 首 · ` : ''}${fmtScanAt(l.lastScanAt)}`, cfg: l }))
    : entries.map(e => ({ id: e.id, name: e.name, sub: `${e.trackCount ? `${e.trackCount} 首 · ` : ''}${fmtScanAt(e.lastScanAt)}` }));

  return (
    <View style={st.screen}>
      {IS_HD ? (
        <View style={[st.hdHead, { paddingTop: Math.max(Math.min(insets.top, 20), 14) }]}>
          <HDTouch style={st.hdBack} onPress={() => nav.goBack()} focusStyle={focus(10)} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={st.hdTitle}>本地曲库</Text>
          <View style={st.hdBack} />
        </View>
      ) : (
        <PageHeader title="本地曲库" />
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingTop: IS_HD ? 8 : 4, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {/* T1 卡点消除:绑定≠上传——文件保留在原位,NextMusic 只读取 */}
        <View style={st.noteCard}>
          <Icon name="folder-music" size={18} color={C.brandText} />
          <Text style={st.noteText}>Web 本地曲库绑定的是<Text style={st.noteStrong}>服务器上的目录</Text>——文件保留在原位，NextMusic 只读取；解绑也不删文件。</Text>
        </View>

        {/* 管理授权门(x-frontend-auth;与服务器 customMusicDir 管理台同口径) */}
        {!adminOk ? (
          <View style={st.card}>
            <Text style={st.cardTitle}>绑定需要管理授权</Text>
            <Text style={st.cardSub}>绑定/扫描服务器目录需服务器管理授权码（与后台「服务器设置」同码）。普通账号可浏览已绑定的库。</Text>
            <View style={st.inputRow}>
              <TextInput
                style={st.input} value={pwd} onChangeText={setPwd} secureTextEntry
                placeholder="管理授权码" placeholderTextColor={C.text3}
                onSubmitEditing={verify}
              />
              <T style={[st.btnGhost, verifying && { opacity: 0.6 }]} disabled={verifying} onPress={verify}>
                {verifying ? <ActivityIndicator size="small" color={C.brand} /> : <Text style={st.btnGhostT}>验证</Text>}
              </T>
            </View>
            {rows.length ? (
              <>
                <Text style={[st.secHead, { marginTop: 10 }]}>可浏览的本地曲库</Text>
                {rows.map(r => (
                  <T key={r.id} style={st.libRow} onPress={() => nav.navigate('ServerLocalLib', { libId: r.id })}>
                    <Icon name="folder-music" size={22} color={C.brandText} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.libName} numberOfLines={1}>{r.name}</Text>
                      <Text style={st.libSub} numberOfLines={1}>{r.sub}</Text>
                    </View>
                    <Icon name="chevronright" size={17} color={C.text3} />
                  </T>
                ))}
              </>
            ) : null}
          </View>
        ) : (
          <>
            {/* T1 绑定表单(无库=三步引导卡:1 绑定目录→2 扫描→3 开听) */}
            <View style={st.card}>
              <Text style={st.cardTitle}>{rows.length ? '添加本地曲库' : '绑定服务器目录'}</Text>
              {!rows.length ? (
                <View style={st.guideRow}>
                  {[['1', '绑定目录'], ['2', '扫描入库'], ['3', '开始听歌']].map(([n, t], i) => (
                    <React.Fragment key={n}>
                      {i > 0 ? <Icon name="chevronright" size={13} color={C.text3} /> : null}
                      <View style={st.guideStep}><Text style={st.guideN}>{n}</Text><Text style={st.guideT}>{t}</Text></View>
                    </React.Fragment>
                  ))}
                </View>
              ) : null}
              <Text style={st.fieldLabel}>库名</Text>
              <TextInput
                style={st.inputFull} value={name} onChangeText={v => { setName(v); }}
                placeholder="我的本地曲库" placeholderTextColor={C.text3}
              />
              <Text style={st.fieldLabel}>服务器目录（绝对路径）</Text>
              <View style={st.inputRow}>
                <TextInput
                  style={[st.input, { flex: 1 }]} value={dir} onChangeText={v => { setDir(v); setCheckRes(null); }}
                  placeholder="/server/music" placeholderTextColor={C.text3}
                  autoCapitalize="none" autoCorrect={false}
                  onSubmitEditing={doCheck}
                />
                <T style={[st.btnGhost, checking && { opacity: 0.6 }]} disabled={checking} onPress={doCheck}>
                  {checking ? <ActivityIndicator size="small" color={C.brand} /> : <Text style={st.btnGhostT}>检测</Text>}
                </T>
              </View>
              {/* T1 状态位:校验中=行内 loading(按钮态);无效路径=行内错误;成功=绿行内确认 */}
              {checkRes ? (
                <Text style={[st.checkLine, { color: checkRes.ok ? C.brandText : '#E06C5A' }]} numberOfLines={1}>
                  {checkRes.ok ? `目录可用 · ${checkRes.path || dir}` : checkRes.message || '路径不存在'}
                </Text>
              ) : null}
              <T
                style={[st.btnPrimary, (!name.trim() || !dir.trim() || creating) && { opacity: 0.55 }]}
                disabled={!name.trim() || !dir.trim() || creating} onPress={doBind}
              >
                {creating ? <ActivityIndicator size="small" color={C.onBrand} /> : <><Icon name="play" size={13} color={C.onBrand} /><Text style={st.btnPrimaryT}>绑定并扫描</Text></>}
              </T>
            </View>

            {/* 库列表(管理台全量:含目录/扫描态) */}
            {rows.length ? (
              <View>
                <Text style={st.secHead}>已绑定的库 · {rows.length}</Text>
                {rows.map(r => (
                  <T key={r.id} style={st.libRow} onPress={() => nav.navigate('ServerLocalLib', { libId: r.id })}
                    onLongPress={IS_WEB ? undefined : () => r.cfg && libMenu(r.cfg)}>
                    <Icon name="folder-music" size={22} color={C.brandText} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.libName} numberOfLines={1}>{r.name}</Text>
                      <Text style={st.libSub} numberOfLines={1}>{r.sub}</Text>
                    </View>
                    {r.cfg ? (
                      <T style={st.miniBtn} onPress={() => libMenu(r.cfg!)}>
                        <Icon name="more" size={17} color={C.text2} />
                      </T>
                    ) : <View style={[st.miniChipWrap]}><Text style={st.miniChip}>共享</Text></View>}
                    <Icon name="chevronright" size={17} color={C.text3} />
                  </T>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ══════════════════════ 浏览视图(T2 扫描态 + T3 浏览 + T4 菜单) ══════════════════════
type LibView = 'songs' | 'albums' | 'artists';
const VIEWS: { key: LibView; label: string }[] = [
  { key: 'songs', label: '全部歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'artists', label: '歌手' },
];

interface HomeData { stats: LibStats; albums: LibAlbum[]; artists: LibArtist[]; recent: LibSong[]; songs: LibSong[] }

function BrowseView({ libId }: { libId: string }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong, current, playNextUp, appendQueue } = usePlayer();
  const job = useScanJob(libId);
  const handle = useRef<ScanHandle | null>(null);
  const entries = useSlbEntries();
  const [cfg, setCfg] = useState<ServerLibConfig | null>(null);
  const [data, setData] = useState<HomeData | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<LibView>('songs');
  const [resultSeen, setResultSeen] = useState(false);
  const az = useAzJump(6); // 字母条跳转接线(reg 登记 y/jump 滚动;同 SearchScreen 先例)
  const [bar] = useState(new Animated.Value(0));

  const libName = cfg?.name || entries.find(e => e.id === libId)?.name || '本地曲库';
  const isAdmin = slbIsAdmin();

  // 播放域:活跃库=当前 lib(流地址 ?lib= 随歌携带 _lib,双保险)
  useEffect(() => {
    setActiveLib(libId);
    return () => setActiveLib(undefined);
  }, [libId]);

  const load = useCallback((silent = false) => {
    if (!silent) { setBusy(true); setErr(null); }
    Promise.all([
      myLib.home(libId),
      req(`/api/music/library/songs?type=recent&size=2000&lib=${encodeURIComponent(libId)}`) as Promise<{ songs?: LibSong[] }>,
    ])
      .then(([h, s]) => setData({ ...h, songs: (s as { songs?: LibSong[] })?.songs || h.recent || [] }))
      .catch(e => setErr((e as Error).message || '加载失败'))
      .finally(() => setBusy(false));
  }, [libId]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { slbRefresh(); if (slbIsAdmin()) slbAdmin.list().then(l => setCfg(l.find(x => x.id === libId) || null)).catch(() => {}); }, [libId]));

  // T2 扫描态:进度条动画
  useEffect(() => {
    if (job?.phase !== 'scanning') return;
    Animated.loop(Animated.timing(bar, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false })).start();
    return () => { bar.stopAnimation(); bar.setValue(0); };
  }, [job?.phase, bar]);
  // 扫描完成:自动刷新数据(结果卡数据源)
  useEffect(() => {
    if (job?.phase === 'done') { setResultSeen(false); load(true); }
  }, [job?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // T3 播放进队列(反馈三件:底部播放条滑入由 MiniPlayer 承接+toast+队列角标)
  const play = (list: LibSong[], idx = 0) => {
    if (!list.length) return;
    const items = list.map(l => toSongItem(l, libId));
    void playSong(items[Math.min(idx, items.length - 1)], items);
    toast(`已加入队列 · ${items.length} 首`);
  };
  const playAll = () => data && play(data.songs);
  const shuffle = () => {
    if (!data?.songs.length) return;
    const d = data.songs;
    play(d, Math.floor(Math.random() * d.length));
  };

  // T4 设置菜单:重新扫描(增量默认/全量留位)/换绑/解绑
  const openMenu = () => {
    if (!isAdmin) { toast('绑定与扫描由服务器管理员操作'); return; }
    dialog.menu(libName, [
      { label: '重新扫描（增量）', onPress: () => { handle.current = startScan({ id: libId }); } },
      { label: '全量重扫（下一版开放）', onPress: () => toast('全量重扫留位下一版；增量扫描已自动跳过未变更文件') },
      ...(cfg ? [{ label: '换绑目录', onPress: () => dialog.prompt('换绑目录', { placeholder: '服务器绝对路径', defaultValue: cfg.dir, onSubmit: v => {
        const p = v.trim(); if (!p || p === cfg.dir) return;
        void slbAdmin.checkDir(p).then(r => {
          if (!r.ok) { toast(r.message || '路径校验未通过'); return; }
          void slbAdmin.rebind(libId, r.path || p).then(() => { toast('已换绑，建议重新扫描'); if (slbIsAdmin()) slbAdmin.list().then(l => setCfg(l.find(x => x.id === libId) || null)).catch(() => {}); }).catch(e => toast((e as Error).message));
        });
      } }) }] : []),
      { label: '解绑（仅断关联，不删文件）', danger: true, onPress: () => dialog.confirm('解绑本地曲库', `确定解绑「${libName}」吗？仅断开关联，不删除服务器上的音乐文件；重新绑定同目录即可恢复。`, () => {
        void slbAdmin.remove(libId).then(() => { clearScanJob(libId); toast('已解绑'); nav.goBack(); }).catch(e => toast((e as Error).message));
      }) },
    ]);
  };

  // T3 字母索引条数据:按歌手首字母分桶(azGroup 拼音近似;'#'收尾)
  const grouped = useMemo(() => azGroup(data?.songs || [], s => s.singer || '#'), [data]);

  const songs = data?.songs || [];
  const curHash = current?.hash;

  // ---------- T2 扫描态卡(全页级,浏览内容其下照常) ----------
  const scanCard = (() => {
    if (!job || resultSeen && job.phase === 'done') return null;
    if (job.phase === 'scanning') return (
      <View style={st.scanCard}>
        <View style={st.scanHead}>
          <ActivityIndicator size="small" color={C.brand} />
          <Text style={st.scanT}>正在扫描服务器目录…</Text>
        </View>
        <View style={st.barTrack}><Animated.View style={[st.barFill, {
          width: bar.interpolate({ inputRange: [0, 1], outputRange: ['12%', '100%'] }),
          opacity: bar.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.45, 0.9] }),
        }]} /></View>
        <View style={st.scanRow}>
          <Text style={st.scanMeta}>已入库 {job.found} 首{job.cursor > 0 ? ` · 断点第 ${job.cursor} 批` : ''}（每 ${SCAN_BATCH} 首一批）</Text>
          <T style={st.btnGhost} onPress={() => handle.current?.pause()}><Text style={st.btnGhostT}>暂停扫描</Text></T>
        </View>
      </View>
    );
    if (job.phase === 'paused') return (
      <View style={st.scanCard}>
        <Text style={st.scanT}>扫描已暂停</Text>
        <Text style={st.scanMeta}>已入库 {job.found} 首保留在库中——继续时从断点续扫，已入库歌曲不会重复。</Text>
        <View style={st.scanRow}>
          <T style={st.btnGhost} onPress={() => nav.goBack()}><Text style={st.btnGhostT}>稍后再扫</Text></T>
          <T style={[st.btnPrimary, { flex: 1 }]} onPress={() => { handle.current = startScan({ id: libId }); }}><Icon name="play" size={13} color={C.onBrand} /><Text style={st.btnPrimaryT}>继续扫描</Text></T>
        </View>
      </View>
    );
    if (job.phase === 'error') return (
      <View style={st.scanCard}>
        <Text style={st.scanT}>扫描中断</Text>
        <Text style={st.scanMeta} numberOfLines={2}>{job.error || '网络错误'}——已入库歌曲保留，续扫不会重复。</Text>
        <T style={[st.btnPrimary, { alignSelf: 'stretch' }]} onPress={() => { handle.current = startScan({ id: libId }); }}><Icon name="refresh" size={13} color={C.onBrand} /><Text style={st.btnPrimaryT}>断点续扫</Text></T>
      </View>
    );
    // done
    const sm = job.summary;
    if (!sm) return null;
    if (!sm.songs) return (
      <View style={st.scanCard}>
        <Text style={st.scanT}>这个目录里没有音乐文件</Text>
        <Text style={st.scanMeta}>支持 {SUPPORTED}；换个目录再试。</Text>
        <T style={[st.btnPrimary, { alignSelf: 'stretch' }]} onPress={() => nav.navigate('ServerLocalLib', { bind: true })}><Text style={st.btnPrimaryT}>换目录</Text></T>
      </View>
    );
    return (
      <View style={st.scanCard}>
        <Text style={st.scanT}>扫描完成</Text>
        <Text style={st.scanMeta}>专辑 {sm.albums} · 歌手 {sm.artists} · 歌曲 {sm.songs}</Text>
        <T style={[st.btnPrimary, { alignSelf: 'stretch' }]} onPress={() => { setResultSeen(true); playAll(); }}><Icon name="play" size={13} color={C.onBrand} /><Text style={st.btnPrimaryT}>开始听歌</Text></T>
      </View>
    );
  })();

  return (
    <View style={st.screen}>
      {IS_HD ? (
        <View style={[st.hdHead, { paddingTop: Math.max(Math.min(insets.top, 20), 14) }]}>
          <HDTouch style={st.hdBack} onPress={() => nav.goBack()} focusStyle={focus(10)} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={st.hdTitle} numberOfLines={1}>{libName}</Text>
          <HDTouch style={st.hdBack} onPress={openMenu} focusStyle={focus(10)}>
            <Icon name="more" size={19} color={C.text2} />
          </HDTouch>
        </View>
      ) : (
        <PageHeader
          title={libName}
          right={<TouchableOpacity onPress={openMenu} hitSlop={6}><Icon name="more" size={21} /></TouchableOpacity>}
        />
      )}
      <ScrollView
        ref={az.scrollRef}
        contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingTop: IS_HD ? 8 : 4, paddingBottom: insets.bottom + 120, gap: IS_HD ? 20 : 14 }}
      >
        {/* ⑦ 模板 web 版:库头横幅(本机系类型色)+快捷动作 */}
        <LibBanner
          kind="local" name={libName}
          stats={data ? `${data.stats.songs.toLocaleString()} 首 · 专辑 ${data.stats.albums} · 歌手 ${data.stats.artists}` : '读取中…'}
          sub={cfg?.dir || undefined}
          status={err ? 'bad' : busy || job?.phase === 'scanning' ? 'warn' : 'ok'}
        />
        <LibActions actions={[
          { icon: 'play', label: '播放全部', primary: true, disabled: !songs.length, onPress: playAll },
          { icon: 'shuffle', label: '随机播放', disabled: !songs.length, onPress: shuffle },
          { icon: 'refresh', label: '重新扫描', onPress: () => { if (isAdmin) handle.current = startScan({ id: libId }); else toast('扫描由服务器管理员操作'); } },
        ]} />

        {scanCard}

        {/* 数据态:加载=骨架(横幅统计已出「读取中」)/错误=整页卡重试/空=空态卡 */}
        {err ? (
          <View style={st.center}>
            <Text style={st.emptyT2}>{err}</Text>
            <T style={st.btnGhost} onPress={() => load()}><Icon name="refresh" size={14} color={C.brand} /><Text style={st.btnGhostT}>重试</Text></T>
          </View>
        ) : busy && !data ? (
          <View>{[0, 1, 2, 3, 4].map(i => <View key={i} style={st.skelRow} />)}</View>
        ) : !data?.stats.songs ? (
          scanCard ? null : (
            <EmptyState
              icon="folder-music"
              title={isAdmin ? '还没有歌曲——先扫描目录' : '管理员还没有扫描此目录'}
              sub={isAdmin ? `支持 ${SUPPORTED}` : '内容就绪后这里会展示专辑与歌曲'}
            />
          )
        ) : (
          <>
            {/* T3 视图切换 chips */}
            <ChipsRow chips={VIEWS} active={view} onChange={k => setView(k as LibView)} />

            {view === 'songs' ? (
              <View>
                {grouped.chunks.map(sec => (
                  <View key={sec.letter} onLayout={az.reg('slb:' + sec.letter)}>
                    <Text style={st.letterHead}>{sec.letter}</Text>
                    {sec.items.map((s, i) => {
                      const it = toSongItem(s, libId);
                      return (
                        <SongRow
                          key={`${s.id}-${i}`} song={it}
                          playing={curHash === it.hash}
                          isNew={s.mtime ? Date.now() - s.mtime < WEEK_MS : false}
                          onPress={() => play(songs, songs.indexOf(s))}
                          onMore={() => dialog.menu(`${s.name} · ${s.singer}`, [
                            { label: '播放', onPress: () => play(songs, songs.indexOf(s)) },
                            { label: '下一首播放', onPress: () => { playNextUp(it); toast('已下一首播放'); } },
                            { label: '加入队列', onPress: () => { appendQueue([it]); toast('已加入队列'); } },
                          ])}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : view === 'albums' ? (
              <HomeSection title="专辑" count={data.albums.length}>
                <View style={st.grid}>
                  {data.albums.map(a => (
                    <DiscCard
                      key={a.id} name={a.name} sub={`${a.songCount} 首`}
                      cover={a.coverFile ? coverUrl(a.coverFile, libId) : undefined}
                      onPress={() => nav.navigate('MyLibAlbum', { id: a.id, name: a.name, cover: a.coverFile, lib: libId })}
                    />
                  ))}
                </View>
              </HomeSection>
            ) : (
              <HomeSection title="歌手" count={data.artists.length}>
                <View style={st.grid}>
                  {data.artists.map(a => (
                    <DiscCard
                      key={a.id} name={a.name} round sub={`${a.songCount} 首`}
                      onPress={() => nav.navigate('MyLibArtist', { id: a.id, name: a.name, lib: libId })}
                    />
                  ))}
                </View>
              </HomeSection>
            )}
          </>
        )}
      </ScrollView>
      {/* T3 字母索引条(web=右缘可点字母列拖动连续跳;HD=D-pad 可聚焦)——同 SearchScreen/⑤-4 先例 */}
      {view === 'songs' && grouped.letters.length > 1 ? (
        <AzIndex letters={grouped.letters} onPick={l => az.jump('slb:' + l)} style={{ top: (IS_HD ? 62 : 54) + insets.top, bottom: 130 }} />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hdHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, height: 52, gap: 10 },
  hdBack: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  hdTitle: { flex: 1, minWidth: 0, textAlign: 'center', color: C.text, fontSize: 16, fontWeight: '700' },
  noteCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  noteText: { flex: 1, color: C.text2, fontSize: 12.5, lineHeight: 18 },
  noteStrong: { color: C.text, fontWeight: '600' },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: C.line },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  cardSub: { color: C.text2, fontSize: 12.5, lineHeight: 18 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guideN: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.brand, color: C.onBrand, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 18, overflow: 'hidden' },
  guideT: { color: C.text2, fontSize: 12.5 },
  fieldLabel: { color: C.text3, fontSize: 12, marginTop: 2 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.surface2, borderRadius: 10, height: 42, paddingHorizontal: 12, color: C.text, fontSize: 14 },
  inputFull: { backgroundColor: C.surface2, borderRadius: 10, height: 42, paddingHorizontal: 12, color: C.text, fontSize: 14 },
  checkLine: { fontSize: 12.5, lineHeight: 17 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.surface2, minWidth: 64 },
  btnGhostT: { color: C.brandText, fontSize: 13, fontWeight: '600' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, backgroundColor: C.brand, marginTop: 2 },
  btnPrimaryT: { color: C.onBrand, fontSize: 14, fontWeight: '700' },
  secHead: { color: C.text2, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  libRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  libName: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  libSub: { color: C.text3, fontSize: 12, marginTop: 2 },
  miniBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  miniChipWrap: { backgroundColor: C.surface2, borderRadius: 999, paddingHorizontal: 8, height: 22, alignItems: 'center', justifyContent: 'center' },
  miniChip: { color: C.text2, fontSize: 11 },
  // T2 扫描卡
  scanCard: { backgroundColor: C.surface, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: C.line },
  scanHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanT: { color: C.text, fontSize: 15, fontWeight: '700' },
  scanMeta: { color: C.text2, fontSize: 12.5, lineHeight: 18, flex: 1 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.brand },
  // 浏览
  center: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyT2: { color: C.text2, fontSize: 13, textAlign: 'center' },
  skelRow: { height: 58, borderRadius: 12, backgroundColor: C.surface2, marginBottom: 8, opacity: 0.7 },
  letterHead: { color: C.text3, fontSize: 12, fontWeight: '800', paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: IS_HD ? 16 : 12 },
});
