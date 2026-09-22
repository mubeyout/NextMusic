// 第三方媒体库：Emby / Jellyfin / Subsonic(Navidrome·道理鱼) / WebDAV / 听风
// 管理页：账号卡片列表（v3.31 重设计：克制卡+行尾 ⋯ 菜单，去长按暗门）；浏览页（2026-09-17 老板指令·参考 Amcfy 主页）：
// 连接后是【一个综合页面】——分区纵排（随机来点/专辑/艺术家/歌单 或 听风 我的/推荐/排行/新歌），不再 tab 切换
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, ScrollView, TouchableOpacity, Image, ActivityIndicator, Dimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { Platform } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { SongRow } from '../components/SongRow';
import { toast, dialog } from '../components/Dialog';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { GUTTER, focus, pageBottom } from '../hd/hdstyle'; // v3.28:统一栅格/焦点环/播放条让位
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload, downloads as dlStore } from '../services/downloads';
import {
  providers, providerApi, PROVIDER_META,
  type ProviderAcct, type ProviderType, type PvArtist, type PvAlbum, type PvPlaylist,
} from '../services/providers';
import type { SongItem } from '../services/server';

// 有品牌 logo 的类型用 BrandIcon，其余回退语义图标
// v3: 媒体库 icon 一律 BrandIcon(品牌图标一一对应)

function AcctGlyph({ type, size = 20 }: { type: ProviderType; size?: number }) {
  // v3(老板):媒体库 icon 一律 BrandIcon(五类型品牌图标一一对应;TYPE_ICON 死分支删除)
  return <BrandIcon name={type as never} size={size} />;
}

// 触点抽象:HD 用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; onLongPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
  const { style, onPress, onLongPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} onLongPress={onLongPress} disabled={disabled}
      focusStyle={focus(12)} {...(rest as object)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} onLongPress={onLongPress} disabled={disabled} activeOpacity={0.7} {...(rest as object)}>
      {children}
    </TouchableOpacity>
  );
}

const IS_WEB = Platform.OS === 'web';


// 封面渐变库(无封面 fallback,App 端同款 6 组): 按名字 hash 选色
const COVER_GRADS: [string, string][] = [
  ['#1F8061', '#6B2973'], ['#6B2980', '#1F578A'], ['#8C401F', '#217A5C'],
  ['#2B4F9E', '#6B2973'], ['#1F578A', '#1F8061'], ['#217A5C', '#8C401F'],
];
function coverGrad(name?: string) {
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (name || '').charCodeAt(i) + ((h << 5) - h);
  const g = COVER_GRADS[Math.abs(h) % COVER_GRADS.length];
  return { background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }; // v3.28:去 as const
}

export function MediaLibsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const [accts, setAccts] = useState<ProviderAcct[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null); // web hover 门控（原生无 hover 常驻）
  const [testId, setTestId] = useState<string | null>(null);

  const refresh = useCallback(() => setAccts(providers.all()), []);
  useEffect(refresh, []);
  // 从 ProviderEdit 保存/删除返回时刷新列表（屏幕停留挂载不会重走 mount）
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // 按钮入口：Figma NM-REMOTE-SELECT-001 选择类型页（ProviderEditScreen 内部先选类型再连接）
  const addMenu = () => nav.navigate('ProviderEdit', {});

  // v3.31 重设计：行尾 ⋯ 菜单收操作（测试连接/编辑/删除），去「长按编辑」暗门
  const testConn = (a: ProviderAcct) => {
    setTestId(a.id);
    providerApi.connect(a)
      .then(upd => { providers.save(upd); refresh(); toast(`「${a.name || PROVIDER_META[a.type].label}」连接正常`); })
      .catch(e => dialog.alert('连接失败', (e as Error).message))
      .finally(() => setTestId(null));
  };
  const openMenu = (a: ProviderAcct) => {
    dialog.menu(a.name || PROVIDER_META[a.type].label, [
      { label: '测试连接', onPress: () => testConn(a) },
      { label: '编辑', onPress: () => nav.navigate('ProviderEdit', { acctId: a.id }) },
      { label: '删除', danger: true, onPress: () => dialog.confirm('删除媒体库', `确定删除「${a.name || PROVIDER_META[a.type].label}」吗？已导入的歌单不受影响。`, () => { providers.remove(a.id); refresh(); }) },
    ]);
  };

  return (
    <View style={st.screen}>
      {IS_HD ? (
        /* HD:自绘头部(HDTouch 返回/添加,遥控可达) */
        <View style={[hd.head, { paddingTop: Math.max(Math.min(insets.top, 20), 14) }]}>
          <HDTouch style={hd.backBtn} onPress={() => nav.goBack()} focusStyle={focus(10)} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={hd.title}>媒体库</Text>
          <HDTouch style={hd.addBtn} onPress={addMenu} focusStyle={focus(10)}>
            <Icon name="add" size={20} color={C.brand} />
          </HDTouch>
        </View>
      ) : (
        <PageHeader
          title="媒体库"
          right={(
            <TouchableOpacity onPress={addMenu} hitSlop={6}>
              <Icon name="add" size={22} />
            </TouchableOpacity>
          )}
        />
      )}
      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingBottom: insets.bottom + 24 }, IS_HD && { paddingTop: 8 }]}
      >
        <Text style={[st.intro, IS_HD && hd.intro]}>接入 Emby、Jellyfin、Navidrome、道理鱼（Subsonic 兼容）或 WebDAV，把私有音乐库变成曲库。</Text>
        {accts.length === 0 ? (
          <EmptyState icon="server" title="还没有添加媒体库" sub="点右上角 ＋ 接入 Plex / 飞牛 / 群晖 / Emby / Navidrome / WebDAV / 听风 等 11 种平台" />
        ) : (
          /* v3.31 重设计：克制卡片——深色底+细描边+微投影，品牌 icon 左置，类型徽标+名称+地址三级；web hover 浮出 ⋯（原生常驻） */
          <View style={[ml.group, IS_WEB && ml.groupWeb]}>
            {accts.map(a => {
              const label = PROVIDER_META[a.type].label;
              return (
                <PressCard
                  key={a.id}
                  style={[ml.card, IS_HD && ml.cardHD]}
                  hoverStyle={ml.cardHover}
                  onPress={() => nav.navigate('ProviderBrowse', { acctId: a.id })}
                  onLongPress={IS_WEB ? undefined : () => openMenu(a)}
                  onHoverIn={IS_WEB ? () => setHoverId(a.id) : undefined}
                  onHoverOut={IS_WEB ? () => setHoverId(null) : undefined}
                >
                  <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><AcctGlyph type={a.type} size={IS_HD ? 34 : 28} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={ml.titleRow}>
                      <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>{a.name || label}</Text>
                      <View style={ml.typeChip}><Text style={ml.typeChipText}>{label}</Text></View>
                    </View>
                    <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>{a.base}</Text>
                  </View>
                  {testId === a.id ? <ActivityIndicator size="small" color={C.brand} style={ml.spin} /> : null}
                  {(!IS_WEB || hoverId === a.id) ? (
                    <T style={[ml.menuBtn, IS_HD && ml.menuBtnHD]} hitSlop={6} onPress={() => openMenu(a)}>
                      <Icon name="more" size={IS_HD ? 20 : 17} color={C.text2} />
                    </T>
                  ) : null}
                  <Icon name="chevronright" size={IS_HD ? 22 : 18} color={C.text3} />
                </PressCard>
              );
            })}
          </View>
        )}
        <Text style={st.tip}>点击卡片浏览曲库 · ⋯ 可测试连接 / 编辑 / 删除</Text>
      </ScrollView>
    </View>
  );
}

// v3.31:按压反馈基线 opacity .72 + scale .985（useNativeDriver 平台门控）；hover 态样式由 hoverStyle 注入
function PressCard(props: {
  style?: unknown; hoverStyle?: ViewStyle; onPress?: () => void; onLongPress?: () => void;
  onHoverIn?: () => void; onHoverOut?: () => void; disabled?: boolean; tvFocus?: boolean; children?: React.ReactNode;
}) {
  const { style, hoverStyle, onPress, onLongPress, onHoverIn, onHoverOut, disabled, tvFocus, children } = props;
  const [hov, setHov] = useState(false);
  const p = React.useRef(new Animated.Value(1)).current;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} onLongPress={onLongPress} disabled={disabled}
      focusStyle={tvFocus ? dv.rowFocusTv : focus(14)}
      focusBg={tvFocus ? C.hover : undefined}>
      {children}
    </HDTouch>
  );
  return (
    <AnimatedTO
      style={[style as never, hoverStyle && hov && hoverStyle, {
        opacity: p.interpolate({ inputRange: [0.985, 1], outputRange: [0.72, 1] }),
        transform: [{ scale: p }],
      }] as never}
      onPress={onPress} onLongPress={onLongPress} disabled={disabled} activeOpacity={1}
      {...(IS_WEB ? {
        onHoverIn: () => { setHov(true); onHoverIn?.(); },
        onHoverOut: () => { setHov(false); onHoverOut?.(); },
      } as Record<string, unknown> : {})}
      onPressIn={() => Animated.timing(p, { toValue: 0.985, duration: 90, useNativeDriver: Platform.OS !== 'web' }).start()}
      onPressOut={() => Animated.timing(p, { toValue: 1, duration: 120, useNativeDriver: Platform.OS !== 'web' }).start()}
    >
      {children}
    </AnimatedTO>
  );
}
const AnimatedTO = Animated.createAnimatedComponent(TouchableOpacity);

// ---------- 浏览页（专辑/艺术家/歌曲/歌单 · WebDAV 保持目录浏览） ----------
// 单段数据缓存：null=未加载
interface SegState<T> { data: T | null; err: string | null; busy: boolean; }

export function ProviderBrowseScreen({ route }: { route: { params: { acctId: string } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong, current } = usePlayer();
  const [actSong, setActSong] = useState<SongItem | null>(null); // 歌曲行 ⋯ 菜单（下载/收藏，老板 09-18:媒体库歌曲也少不了）
  const [collect, setCollect] = useState(false);

  // 账号可就地切换（amcfy 式一键切服务器），不重进页面
  const [acctId, setAcctId] = useState(route.params.acctId);
  const acct = providers.get(acctId);
  const isDav = acct?.type === 'webdav';

  // web 宽窗跟踪（≥900px 桌面双区：左行式列表 + 右操作栏；窄窗单列）
  // RNW 的 Dimensions change 在桌面壳 zoom/resize 下不可靠，web 直接监听 window resize
  const [winW, setWinW] = useState(() => IS_WEB ? (globalThis as { innerWidth?: number }).innerWidth || Dimensions.get('window').width : Dimensions.get('window').width);
  useEffect(() => {
    if (!IS_WEB) return;
    const h = () => setWinW((globalThis as { innerWidth?: number }).innerWidth || 0);
    globalThis.addEventListener?.('resize', h);
    return () => { globalThis.removeEventListener?.('resize', h); };
  }, []);
  const davWide = IS_WEB && winW >= 900; // 预留：宽窗下可用于后续密度调节（当前满幅单列）

  // 综合页分区展开态（默认收起只出横滑预览，点「全部」原地展开）
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [albums, setAlbums] = useState<SegState<PvAlbum[]>>({ data: null, err: null, busy: false });
  const [artists, setArtists] = useState<SegState<PvArtist[]>>({ data: null, err: null, busy: false });
  const [songs, setSongs] = useState<SegState<SongItem[]>>({ data: null, err: null, busy: false });
  const [lists, setLists] = useState<SegState<PvPlaylist[]>>({ data: null, err: null, busy: false });
  const [swSheet, setSwSheet] = useState(false);

  // webdav 状态（沿用目录浏览）
  const [davDir, setDavDir] = useState('/');
  const [davDirs, setDavDirs] = useState<{ name: string; path: string }[]>([]);
  const [davSongs, setDavSongs] = useState<SongItem[]>([]);
  const [davBusy, setDavBusy] = useState(true);
  const [davErr, setDavErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // v3.31(2026-09-21 重设计):选择模式显式化——常态点击=播放(对齐全 app 习惯),选择/批量逆编辑模式
  const [davSelMode, setDavSelMode] = useState(false);

  const resetAll = () => {
    setAlbums({ data: null, err: null, busy: false });
    setArtists({ data: null, err: null, busy: false });
    setSongs({ data: null, err: null, busy: false });
    setLists({ data: null, err: null, busy: false });
  };

  // 分段数据加载器（懒加载与重试共用；不能只重置 state 依赖 effect 重跑——deps 不含 state）
  const loadAlbums = (a: ProviderAcct) => {
    setAlbums(s => (s.data || s.busy ? s : { ...s, busy: true }));
    providerApi.albums(a)
      .then(d => setAlbums({ data: d, err: null, busy: false }))
      .catch(e => setAlbums({ data: null, err: (e as Error).message, busy: false }));
  };
  const loadArtists = (a: ProviderAcct) => {
    setArtists(s => (s.data || s.busy ? s : { ...s, busy: true }));
    providerApi.artists(a)
      .then(d => setArtists({ data: d, err: null, busy: false }))
      .catch(e => setArtists({ data: null, err: (e as Error).message, busy: false }));
  };
  const loadSongs = (a: ProviderAcct) => {
    setSongs({ data: null, err: null, busy: true }); // 随机段每次全量拉
    providerApi.randomSongs(a, 100)
      .then(d => setSongs({ data: d, err: null, busy: false }))
      .catch(e => setSongs({ data: null, err: (e as Error).message, busy: false }));
  };
  const loadLists = (a: ProviderAcct) => {
    setLists(s => (s.data || s.busy ? s : { ...s, busy: true }));
    providerApi.playlists(a)
      .then(d => setLists({ data: d, err: null, busy: false }))
      .catch(e => setLists({ data: null, err: (e as Error).message, busy: false }));
  };

  // 听风无专辑/艺术家概念：歌曲=新歌速递；歌单数组含 liked:/recent:/mine:/pl:/top: 五类
  const isTf = acct?.type === 'tingfeng';

  // 综合页：进入即并行加载全部分区（loadXxx 自带缓存短路；各分区独立错误处理）
  useEffect(() => {
    if (!acct || isDav) return;
    if (!isTf) { loadAlbums(acct); loadArtists(acct); }
    loadSongs(acct); loadLists(acct);
  }, [acctId, isDav]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebDAV 目录加载
  const davLoad = useCallback(async () => {
    if (!acct) return;
    setDavBusy(true); setDavErr(null);
    try {
      const r = await providerApi.webdavList(acct, davDir);
      setDavDirs(r.dirs); setDavSongs(r.songs); setSel(new Set());
    } catch (e) {
      setDavErr((e as Error).message);
    } finally { setDavBusy(false); }
  }, [acctId, davDir]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isDav) davLoad(); }, [isDav, davLoad]);

  const switchAcct = (id: string) => {
    if (id === acctId) return;
    setAcctId(id);
    setDavDir('/'); setDavDirs([]); setDavSongs([]); setDavBusy(true);
    resetAll();
    setExpanded({});
  };

  const refreshSongs = () => { if (acct) loadSongs(acct); };

  const importDav = (name: string, ss: SongItem[]) => {
    if (!ss.length) return;
    libraryImport(name, ss);
  };
  const libraryImport = (name: string, ss: SongItem[], dl = false) => {
    if (!acct) return;
    library.create(name, ss, { desc: `来自 ${acct.name}`, providerType: acct.type, providerName: acct.name, providerId: acct.id });
    if (dl) {
      const n = enqueueDownload(ss);
      toast(`已导入「${name}」· ${ss.length} 首，${n} 首开始下载`);
    } else {
      toast(`已导入「${name}」· ${ss.length} 首`);
    }
  };

  const toggleSel = (u: string) => {
    const n = new Set(sel);
    if (n.has(u)) n.delete(u); else n.add(u);
    setSel(n);
  };
  const selSongs = davSongs.filter(s => sel.has(s.songmid));

  // TV：目录级操作收进 ⋯ 菜单（D-pad OK 弹 dialog.menu，遥控可达）
  const davDirName = () => `WebDAV ${davDir === '/' ? '根目录' : davDir.split('/').filter(Boolean).pop() || ''}`;
  const davMenu = () => {
    const items: { label: string; onPress: () => void; danger?: boolean }[] = [];
    if (davSongs.length) {
      items.push({ label: '播放全部', onPress: () => playSong(davSongs[0], davSongs) });
      items.push({ label: '选择歌曲', onPress: () => setDavSelMode(true) });
      items.push({ label: `整个目录加入歌单 (${davSongs.length} 首)`, onPress: () => importDav(davDirName(), davSongs) });
      items.push({ label: '下载全部', onPress: () => { const n = enqueueDownload(davSongs); toast(`${n} 首加入下载队列`); } });
    }
    if (davDir !== '/') {
      const up = davDir.replace(/\/+$/, '').replace(/\/+[^/]*$/, '') || '/';
      items.push({ label: '返回上一级', onPress: () => setDavDir(up) });
    }
    items.push({ label: '刷新目录', onPress: () => davLoad() });
    dialog.menu(davDirName(), items);
  };

  if (!acct) return (
    <View style={st.screen}>
      <PageHeader title="媒体库" />
      <Text style={st.empty}>账号不存在，可能已被删除</Text>
    </View>
  );

  // ---------- render ----------
  const allAccts = providers.all();

  return (
    <View style={st.screen}>
      {/* 自定义头部：返回 + [logo+账号名 ▾] 一键切换 + 添加 */}
      {/* v3.28(老板:第三方媒体库统一风格):HD/桌面走 HDTouch 大触点头部,与媒体库列表页同款;手机保持原样 */}
      {IS_HD ? (
        <View style={[hd.head, { paddingTop: Math.max(Math.min(insets.top, 20), 14) }]}>
          <HDTouch style={hd.backBtn} onPress={() => nav.goBack()} focusStyle={focus(10)} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <HDTouch style={bv.acctPill} onPress={() => setSwSheet(true)} focusStyle={focus(999)}>
            <AcctGlyph type={acct.type} size={18} />
            <Text style={bv.acctName} numberOfLines={1}>{acct.name || PROVIDER_META[acct.type].label}</Text>
            <Icon name="chevronright" size={13} color={C.text3} />
          </HDTouch>
          <HDTouch style={hd.addBtn} onPress={() => nav.navigate('ProviderEdit', {})} focusStyle={focus(10)}>
            <Icon name="add" size={20} color={C.brand} />
          </HDTouch>
        </View>
      ) : (
        <View style={[st.hWrap, { paddingTop: insets.top + 20 }]}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={st.hSide}>
            <Icon name="back" size={22} />
          </TouchableOpacity>
          <TouchableOpacity style={st.acctBtn} activeOpacity={0.7} onPress={() => setSwSheet(true)}>
            <AcctGlyph type={acct.type} size={18} />
            <Text style={st.acctName} numberOfLines={1}>{acct.name || PROVIDER_META[acct.type].label}</Text>
            <View style={st.acctCaret}><Icon name="chevronright" size={13} color={C.text3} /></View>
          </TouchableOpacity>
          <TouchableOpacity style={st.hSide} hitSlop={6} onPress={() => nav.navigate('ProviderEdit', {})}>
            <Icon name="add" size={22} />
          </TouchableOpacity>
        </View>
      )}

      {isDav ? (
        /* ---------- WebDAV 目录浏览 v3.31 行式 + 0922 三端适配：TV 焦点放大行 / 桌面≥900 双区（左列表+右操作栏）/ 窄窗单列 ---------- */
        <ScrollView contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : (IS_WEB ? Math.min(Math.max(winW * 0.02, 16), 40) : 20), paddingTop: 4, paddingBottom: ((current ? 100 : 0) + insets.bottom + 24) + (IS_HD ? 24 : 0) }}>
          {davBusy ? (
            <View style={[dv.listWrap, davWide && dv.listWrapWeb]}>
              {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={[dv.rowSkel, IS_HD && dv.rowSkelHD]} />)}
            </View>
          ) : davErr ? (
            <View style={st.center}>
              <Text style={st.empty}>{davErr}</Text>
              <T style={st.retryBtn} onPress={davLoad} focusStyle={focus(18)}>
                <Icon name="refresh" size={16} color={C.onBrand} />
                <Text style={st.retryText}>重试</Text>
              </T>
            </View>
          ) : (
            <>
              {/* 顶栏：左面包屑目录层级(flex:1 可横向滚动) + 右侧页面右端常驻动作组(不折叠不收纳，不入滚动区) */}
              <View style={dv.topRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[dv.crumbWrap, { flex: 1, minWidth: 0 }]} contentContainerStyle={{ gap: IS_HD ? 6 : 4, alignItems: 'center' }}>
                {(() => {
                  const segs = davDir.split('/').filter(Boolean);
                  const crumbs = [{ label: '根目录', path: '/' }];
                  let acc2 = '';
                  segs.forEach(s => { acc2 += '/' + s; crumbs.push({ label: s, path: acc2 }); });
                  return crumbs.map((c, ci) => {
                    const last = ci === crumbs.length - 1;
                    return (
                      <React.Fragment key={c.path}>
                        {ci > 0 ? <Icon name="chevronright" size={IS_HD ? 13 : 11} color={C.text3} /> : null}
                        {last ? (
                          <View style={[dv.crumbCur, IS_HD && dv.crumbCurHD]}><Text style={[dv.crumbCurText, IS_HD && dv.crumbCurTextHD]} numberOfLines={1}>{c.label}</Text></View>
                        ) : (
                          <T style={[dv.crumbItem, IS_HD && dv.crumbItemHD]} focusStyle={focus(999)} onPress={() => setDavDir(c.path)}>
                            <Text style={[dv.crumbItemText, IS_HD && dv.crumbItemTextHD]} numberOfLines={1}>{c.label}</Text>
                          </T>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </ScrollView>
              {/* —— 页面右端常驻动作组（固定可见，随选择模式切换内容） —— */}
              <View style={dv.actRow}>
                {/* 展开常驻：web（含 HD flavor 的 docker/桌面浏览器）一律全展开；仅原生 TV 用 ⋯ 菜单（老板 0922：不折叠全开放右边） */}
                {IS_HD && !IS_WEB ? (
                  davSongs.length || davDirs.length ? (
                    <T style={[dv.actBtn]} focusStyle={focus(999)} onLongPress={() => davMenu()} onPress={() => davMenu()}>
                      <Icon name="more" size={16} color={C.text2} />
                    </T>
                  ) : null
                ) : davSelMode ? (
                  <>
                    <T style={[dv.actBtn]} focusStyle={focus(999)} onPress={() => setSel(sel.size === davSongs.length ? new Set() : new Set(davSongs.map(s => s.songmid)))}>
                      <Text style={dv.actBtnText}>{sel.size === davSongs.length ? '取消全选' : '全选'}</Text>
                    </T>
                    <T style={[dv.actBtn, dv.actBtnMain]} focusStyle={focus(999)} disabled={!selSongs.length}
                      onPress={() => { const name = `WebDAV ${davDir === '/' ? '根目录' : davDir.split('/').filter(Boolean).pop() || ''}`; importDav(name, selSongs); }}>
                      <Text style={[dv.actBtnText, dv.actBtnTextMain]}>加入歌单{selSongs.length ? ` ${selSongs.length}` : ''}</Text>
                    </T>
                    <T style={[dv.actBtn, dv.actBtnMain]} focusStyle={focus(999)} disabled={!selSongs.length}
                      onPress={() => { const n = enqueueDownload(selSongs); toast(`${n} 首加入下载队列`); }}>
                      <Text style={[dv.actBtnText, dv.actBtnTextMain]}>下载</Text>
                    </T>
                    <T style={[dv.actBtn]} focusStyle={focus(999)} onPress={() => { setDavSelMode(false); setSel(new Set()); }}>
                      <Text style={dv.actBtnText}>完成</Text>
                    </T>
                  </>
                ) : davSongs.length ? (
                  <>
                    <T style={[dv.actBtn]} focusStyle={focus(999)} onPress={() => setDavSelMode(true)}>
                      <Text style={dv.actBtnText}>选择</Text>
                    </T>
                    <T style={[dv.actBtn, dv.actBtnMain]} focusStyle={focus(999)} onPress={() => playSong(davSongs[0], davSongs)}>
                      <Icon name="play" size={12} color={C.onBrand} />
                      <Text style={[dv.actBtnText, dv.actBtnTextMain]}>播放全部</Text>
                    </T>
                  </>
                ) : null}
              </View>
              </View>

              {/* 列表满幅：一行占满整行；头栏只留统计信息 */}
              <View style={[dv.listWrap]}>
                <View style={dv.headBar}>
                  <Text style={[dv.stats, IS_HD && dv.statsHD]} numberOfLines={1}>
                    {davDirs.length ? `${davDirs.length} 个文件夹` : ''}{davDirs.length && davSongs.length ? ' · ' : ''}{davSongs.length ? `${davSongs.length} 首` : ''}
                    {!davDirs.length && !davSongs.length ? '空目录' : ''}
                  </Text>
                </View>

                {/* 上一级 */}
                {davDir !== '/' ? (
                  <PressCard style={[dv.folderRow, IS_HD && dv.folderRowHD]} hoverStyle={dv.rowHover} tvFocus
                    onPress={() => setDavDir(davDir.replace(/\/+$/, '').replace(/\/+[^/]*$/, '') || '/')}>
                    <View style={[dv.folderIcon, IS_HD && dv.folderIconHD]}><Icon name="back" size={IS_HD ? 17 : 15} color={C.text3} /></View>
                    <Text style={[dv.folderName, IS_HD && dv.textHD]}>上一级</Text>
                  </PressCard>
                ) : null}

                {/* 文件夹行：icon 左文右，点击进入 */}
                {davDirs.map((d, i) => (
                  <PressCard key={d.path} style={[dv.folderRow, (davDir !== '/' || i > 0) && dv.rowDivide, IS_HD && dv.folderRowHD]} hoverStyle={dv.rowHover} tvFocus
                    onLongPress={IS_HD ? () => davMenu() : undefined}
                    onPress={() => setDavDir(d.path)}>
                    <View style={[dv.folderIcon, IS_HD && dv.folderIconHD]}><Icon name="folder" size={IS_HD ? 20 : 17} color={C.brandText} /></View>
                    <Text style={[dv.folderName, IS_HD && dv.textHD]} numberOfLines={1}>{d.name}</Text>
                    <Icon name="chevronright" size={IS_HD ? 18 : 15} color={C.text3} />
                  </PressCard>
                ))}

                {/* 歌曲行：点击=播放；长按 ⋯（下载/收藏）；选择模式下点选 */}
                {davSongs.map((s, si) => {
                  const on = sel.has(s.songmid);
                  const isCur = current?.songmid === s.songmid;
                  return (
                    <PressCard key={s.songmid} style={[dv.songRow, (davDir !== '/' || davDirs.length > 0) && dv.rowDivide, on && dv.songRowOn, IS_HD && dv.songRowHD]}
                      hoverStyle={dv.rowHover} tvFocus
                      onLongPress={() => setActSong(s)}
                      onPress={() => (davSelMode ? toggleSel(s.songmid) : playSong(s, davSongs))}>
                      {davSelMode ? (
                        <View style={[st.checkBox, on && st.checkBoxOn]}>
                          {on ? <Icon name="check" size={14} color={C.onBrand} /> : null}
                        </View>
                      ) : isCur ? (
                        <View style={dv.eq}><View style={[dv.eqBar, { height: 5 }]} /><View style={[dv.eqBar, { height: 10 }]} /><View style={[dv.eqBar, { height: 7 }]} /></View>
                      ) : (
                        <Text style={[dv.idx, IS_HD && dv.idxHD]}>{si + 1}</Text>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[dv.title, IS_HD && dv.textHD, isCur && { color: C.brandText }]} numberOfLines={1}>{s.name}</Text>
                        <Text style={[dv.sub, IS_HD && dv.subHD]} numberOfLines={1}>{s.singer}{s.albumName ? ` · ${s.albumName}` : ''} · {s._types?.flac ? 'FLAC' : 'MP3'}</Text>
                      </View>
                      {!davSelMode ? <Text style={[dv.dur, IS_HD && dv.idxHD]} numberOfLines={1}>{s.interval || ''}</Text> : null}
                    </PressCard>
                  );
                })}

                {!davDirs.length && !davSongs.length ? (
                  <EmptyState icon="music" title="这个文件夹还没有音乐" sub="支持 FLAC / MP3 / APE / WAV / OGG 等常见音频格式" />
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        /* ---------- 综合浏览页：分区纵排（2026-09-17 老板：一个综合页面，不做 tab） ---------- */
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingBottom: IS_HD ? pageBottom(32) : (current ? 116 : 32), gap: IS_HD ? 22 : 16 }}
        >
          {isTf ? (() => {
            // 听风：providers.playlists 返回五类（liked:/recent:/mine:/pl:/top: 前缀），拆成分区
            const all = lists.data || [];
            const tfLiked = all.find(x => x.id === 'liked:');
            const tfRecent = all.find(x => x.id === 'recent:');
            const mine = all.filter(x => x.id.startsWith('mine:'));
            const recs = all.filter(x => x.id.startsWith('pl:'));
            const tops = all.filter(x => x.id.startsWith('top:'));
            const toDetail = (pl: PvPlaylist) => nav.navigate('ProviderDetail', {
              acctId: acct.id, kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover,
              sub: pl.songCount ? `${pl.songCount} 首` : undefined,
            });
            return (
              <>
                {/* 我的音乐：继续收听 / 我喜欢的 双入口卡 */}
                <View>
                  <SectionHead title="我的音乐" />
                  <View style={sec.dualRow}>
                    {[tfRecent, tfLiked].filter(Boolean as unknown as (v: PvPlaylist | undefined) => v is PvPlaylist).map(pl => (
                      <T key={pl.id} style={sec.dualCard} activeOpacity={0.85} focusStyle={focus(14)} onPress={() => toDetail(pl)}>
                        <View style={[sec.dualCover, coverGrad(pl.name) as ViewStyle]}>
                          <Icon name={pl.id === 'liked:' ? 'heart' : 'play'} size={20} color="#ffffffcc" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={sec.dualTitle} numberOfLines={1}>{pl.name}</Text>
                          <Text style={sec.dualMeta} numberOfLines={1}>{pl.songCount ? `${pl.songCount} 首` : '—'}</Text>
                        </View>
                        <Icon name="chevronright" size={16} color={C.text3} />
                      </T>
                    ))}
                  </View>
                </View>

                {/* 我的歌单 */}
                {mine.length ? (
                  <View>
                    <SectionHead title="我的歌单" count={mine.length} actionLabel={expanded.tfMine ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfMine: !e.tfMine }))} />
                    {expanded.tfMine ? (
                      <View style={st.albumGrid}>
                        {mine.map(pl => (
                          <T key={pl.id} style={[st.albumCell, IS_WEB && st.albumCellWeb]} activeOpacity={0.85} focusStyle={focus(10)} onPress={() => toDetail(pl)}>
                            {pl.cover ? <Image source={{ uri: pl.cover }} style={st.albumCover} />
                              : <View style={[st.albumCover, { alignItems: 'center', justifyContent: 'center' }, coverGrad(pl.name) as ViewStyle]}><Text style={[st.albumGlyph, { color: '#ffffffb3' }]}>♫</Text></View>}
                            <Text style={[st.albumName, IS_HD && bv.albumName]} numberOfLines={1}>{pl.name}</Text>
                            <Text style={[st.albumMeta, IS_HD && bv.albumMeta]} numberOfLines={1}>{pl.songCount ? `${pl.songCount}首` : ''}</Text>
                          </T>
                        ))}
                      </View>
                    ) : (
                      <Rail>{mine.map(pl => <PvCard key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />)}</Rail>
                    )}
                  </View>
                ) : null}

                {/* 推荐歌单 */}
                {recs.length ? (
                  <View>
                    <SectionHead title="推荐歌单" count={recs.length} actionLabel={expanded.tfRecs ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfRecs: !e.tfRecs }))} />
                    {expanded.tfRecs ? (
                      <View style={st.albumGrid}>
                        {recs.map(pl => (
                          <T key={pl.id} style={[st.albumCell, IS_WEB && st.albumCellWeb]} activeOpacity={0.85} focusStyle={focus(10)} onPress={() => toDetail(pl)}>
                            {pl.cover ? <Image source={{ uri: pl.cover }} style={st.albumCover} />
                              : <View style={[st.albumCover, { alignItems: 'center', justifyContent: 'center' }, coverGrad(pl.name) as ViewStyle]}><Text style={[st.albumGlyph, { color: '#ffffffb3' }]}>♫</Text></View>}
                            <Text style={[st.albumName, IS_HD && bv.albumName]} numberOfLines={1}>{pl.name}</Text>
                          </T>
                        ))}
                      </View>
                    ) : (
                      <Rail>{recs.map(pl => <PvCard key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />)}</Rail>
                    )}
                  </View>
                ) : null}

                {/* 排行榜 */}
                {tops.length ? (
                  <View>
                    <SectionHead title="排行榜" count={tops.length} actionLabel={expanded.tfTops ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfTops: !e.tfTops }))} />
                    {expanded.tfTops ? (
                      <View style={st.albumGrid}>
                        {tops.map(pl => (
                          <T key={pl.id} style={[st.albumCell, IS_WEB && st.albumCellWeb]} activeOpacity={0.85} focusStyle={focus(10)} onPress={() => toDetail(pl)}>
                            {pl.cover ? <Image source={{ uri: pl.cover }} style={st.albumCover} />
                              : <View style={[st.albumCover, { alignItems: 'center', justifyContent: 'center' }, coverGrad(pl.name) as ViewStyle]}><Text style={[st.albumGlyph, { color: '#ffffffb3' }]}>♫</Text></View>}
                            <Text style={[st.albumName, IS_HD && bv.albumName]} numberOfLines={1}>{pl.name}</Text>
                          </T>
                        ))}
                      </View>
                    ) : (
                      <Rail>{tops.map(pl => <PvCard key={pl.id} cover={pl.cover} name={pl.name} onPress={() => toDetail(pl)} />)}</Rail>
                    )}
                  </View>
                ) : null}

                {/* 新歌速递 */}
                <View>
                  <SectionHead title="新歌速递" actionLabel="换一批" onAction={refreshSongs} />
                  <SegBody state={songs} onRetry={refreshSongs}>
                    <View style={sec.songsBar}>
                      <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                        onPress={() => { if (songs.data?.length) playSong(songs.data[0], songs.data); }}>
                        <Icon name="play" size={14} color={C.onBrand} />
                        <Text style={st.shuffleBtnText}>播放全部</Text>
                      </T>
                      {(songs.data?.length || 0) > 8 && !expanded.tfSongs ? <Text style={sec.previewHint}>前 8 首</Text> : null}
                    </View>
                    {(expanded.tfSongs ? songs.data || [] : (songs.data || []).slice(0, 8)).map((s, i) => (
                      <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} onMore={() => setActSong(s)} />
                    ))}
                    {(songs.data?.length || 0) > 8 ? (
                      <T style={sec.moreRow} focusStyle={focus(10)} onPress={() => setExpanded(e => ({ ...e, tfSongs: !e.tfSongs }))}>
                        <Text style={sec.moreText}>{expanded.tfSongs ? '收起' : `展开全部 ${songs.data!.length} 首`}</Text>
                        <Icon name="chevronright" size={13} color={C.text2} />
                      </T>
                    ) : null}
                  </SegBody>
                </View>
              </>
            );
          })() : (
            <>
              {/* 随机来点 */}
              <View>
                <SectionHead title="随机来点" actionLabel="换一批" onAction={refreshSongs} />
                <SegBody state={songs} onRetry={refreshSongs}>
                  <View style={sec.songsBar}>
                    <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                      onPress={() => { if (songs.data?.length) playSong(songs.data[0], songs.data); }}>
                      <Icon name="play" size={14} color={C.onBrand} />
                      <Text style={st.shuffleBtnText}>播放全部</Text>
                    </T>
                    {(songs.data?.length || 0) > 8 && !expanded.songs ? <Text style={sec.previewHint}>前 8 首</Text> : null}
                  </View>
                  {(expanded.songs ? songs.data || [] : (songs.data || []).slice(0, 8)).map((s, i) => (
                    <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} onMore={() => setActSong(s)} />
                  ))}
                  {(songs.data?.length || 0) > 8 ? (
                    <T style={sec.moreRow} focusStyle={focus(10)} onPress={() => setExpanded(e => ({ ...e, songs: !e.songs }))}>
                      <Text style={sec.moreText}>{expanded.songs ? '收起' : `展开全部 ${songs.data!.length} 首`}</Text>
                      <Icon name="chevronright" size={13} color={C.text2} />
                    </T>
                  ) : null}
                </SegBody>
              </View>

              {/* 专辑 */}
              <View>
                <SectionHead title="专辑" count={albums.data?.length} actionLabel={expanded.albums ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, albums: !e.albums }))} />
                <SegBody state={albums} onRetry={() => { setAlbums({ data: null, err: null, busy: false }); if (acct) loadAlbums(acct); }}>
                  {albums.data && albums.data.length === 0 ? <EmptyState icon="music" title="服务器上没有专辑" sub="先在媒体服务器里添加音乐库" /> : null}
                  {expanded.albums ? (
                    <View style={st.albumGrid}>
                      {(albums.data || []).map(al => (
                        <T key={al.id} style={[st.albumCell, IS_WEB && st.albumCellWeb]} activeOpacity={0.85} focusStyle={focus(10)}
                          onPress={() => nav.navigate('ProviderDetail', {
                            acctId: acct.id, kind: 'album', id: al.id, name: al.name, cover: al.cover,
                            sub: [al.artist, al.songCount ? `${al.songCount}首` : null].filter(Boolean).join(' · ') || undefined,
                          })}>
                          {al.cover ? <Image source={{ uri: al.cover }} style={st.albumCover} />
                            : <View style={[st.albumCover, { alignItems: 'center', justifyContent: 'center' }, coverGrad(al.name) as ViewStyle]}><Text style={[st.albumGlyph, { color: '#ffffffb3' }]}>♫</Text></View>}
                          <Text style={[st.albumName, IS_HD && bv.albumName]} numberOfLines={1}>{al.name}</Text>
                          <Text style={[st.albumMeta, IS_HD && bv.albumMeta]} numberOfLines={1}>{al.artist || ''}{al.songCount ? ` · ${al.songCount}首` : ''}</Text>
                        </T>
                      ))}
                    </View>
                  ) : (
                    <Rail>
                      {(albums.data || []).slice(0, 10).map(al => (
                        <PvCard key={al.id} cover={al.cover} name={al.name} meta={al.artist || (al.songCount ? `${al.songCount} 首` : '')}
                          onPress={() => nav.navigate('ProviderDetail', {
                            acctId: acct.id, kind: 'album', id: al.id, name: al.name, cover: al.cover,
                            sub: [al.artist, al.songCount ? `${al.songCount}首` : null].filter(Boolean).join(' · ') || undefined,
                          })} />
                      ))}
                    </Rail>
                  )}
                </SegBody>
              </View>

              {/* 艺术家 */}
              <View>
                <SectionHead title="艺术家" count={artists.data?.length} actionLabel={expanded.artists ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, artists: !e.artists }))} />
                <SegBody state={artists} onRetry={() => { setArtists({ data: null, err: null, busy: false }); if (acct) loadArtists(acct); }}>
                  {artists.data && artists.data.length === 0 ? <EmptyState icon="music" title="没有找到艺术家" /> : null}
                  {expanded.artists ? (
                    <>
                      {(artists.data || []).map(ar => (
                        <T key={ar.id} style={[st.artistRow, IS_HD && bv.row]} activeOpacity={0.75} focusStyle={focus(12)}
                          onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'artist', id: ar.id, name: ar.name, sub: ar.albumCount ? `${ar.albumCount} 张专辑` : undefined })}>
                          {ar.cover ? <Image source={{ uri: ar.cover }} style={[st.artistArt, IS_HD && bv.art]} />
                            : <View style={[st.artistArt, IS_HD && bv.art, st.artistFallback]}><Text style={st.artistInitial}>{ar.name.slice(0, 1)}</Text></View>}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[st.artistName, IS_HD && bv.rowTitle]} numberOfLines={1}>{ar.name}</Text>
                            <Text style={[st.artistMeta, IS_HD && bv.rowSub]} numberOfLines={1}>{ar.albumCount ? `${ar.albumCount} 张专辑` : PROVIDER_META[acct.type].label}</Text>
                          </View>
                          <Icon name="chevronright" size={18} color={C.text3} />
                        </T>
                      ))}
                    </>
                  ) : (
                    <Rail>
                      {(artists.data || []).slice(0, 10).map(ar => (
                        <PvCard key={ar.id} round cover={ar.cover} name={ar.name} meta={ar.albumCount ? `${ar.albumCount} 张专辑` : ''}
                          onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'artist', id: ar.id, name: ar.name, sub: ar.albumCount ? `${ar.albumCount} 张专辑` : undefined })} />
                      ))}
                    </Rail>
                  )}
                </SegBody>
              </View>

              {/* 歌单 */}
              <View>
                <SectionHead title="歌单" count={lists.data?.length} actionLabel={expanded.lists ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, lists: !e.lists }))} />
                <SegBody state={lists} onRetry={() => { setLists({ data: null, err: null, busy: false }); if (acct) loadLists(acct); }}>
                  {lists.data && lists.data.length === 0 ? <EmptyState icon="music" title="服务器上没有歌单" sub="在媒体服务器或 amcfy 等客户端里创建" /> : null}
                  {(expanded.lists ? lists.data || [] : (lists.data || []).slice(0, 6)).map(pl => (
                    <T key={pl.id} style={[st.plRow, IS_HD && bv.row]} activeOpacity={0.75} focusStyle={focus(12)}
                      onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover, sub: pl.songCount ? `${pl.songCount} 首` : undefined })}>
                      {pl.cover ? <Image source={{ uri: pl.cover }} style={[st.artistArt, IS_HD && bv.art]} />
                        : <View style={[st.artistArt, IS_HD && bv.art, { alignItems: 'center', justifyContent: 'center' }, coverGrad(pl.name) as ViewStyle]}><Text style={[st.albumGlyph, { color: '#ffffffb3' }]}>♫</Text></View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[st.artistName, IS_HD && bv.rowTitle]} numberOfLines={1}>{pl.name}</Text>
                        <Text style={[st.artistMeta, IS_HD && bv.rowSub]} numberOfLines={1}>{pl.songCount ? `${pl.songCount} 首` : ''}</Text>
                      </View>
                      <Icon name="chevronright" size={18} color={C.text3} />
                    </T>
                  ))}
                  {(lists.data?.length || 0) > 6 ? (
                    <T style={sec.moreRow} focusStyle={focus(10)} onPress={() => setExpanded(e => ({ ...e, lists: !e.lists }))}>
                      <Text style={sec.moreText}>{expanded.lists ? '收起' : `展开全部 ${lists.data!.length} 个歌单`}</Text>
                      <Icon name="chevronright" size={13} color={C.text2} />
                    </T>
                  ) : null}
                </SegBody>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* 一键切换账号（amcfy 式）：当前账号打点 + 添加入口 */}
      <ActionSheet
        visible={!!actSong} onClose={() => setActSong(null)}
        title={actSong ? `${actSong.name} · ${actSong.singer}` : ''}
        items={actSong ? [
          dlStore.isDownloaded(actSong)
            ? { label: '已下载 ✓', onPress: () => {} }
            : { label: '下载到本地', onPress: () => { const n = enqueueDownload([actSong]); toast(n ? `已加入下载队列 · ${actSong.name}` : '该歌曲已在下载队列'); } },
          { label: '收藏到歌单', onPress: () => setCollect(true) },
        ] : []}
      />
      <CollectSheet song={actSong} visible={collect} onClose={() => { setCollect(false); setActSong(null); }} />
      <ActionSheet
        visible={swSheet} onClose={() => setSwSheet(false)}
        title="切换媒体库"
        items={[
          ...allAccts.map(a => ({
            label: a.name || PROVIDER_META[a.type].label,
            sub: `${PROVIDER_META[a.type].label} · ${a.base}`,
            selected: a.id === acctId,
            onPress: () => switchAcct(a.id),
          })),
          { label: '＋ 添加媒体库', onPress: () => nav.navigate('ProviderEdit', {}) },
          { label: '管理列表', onPress: () => nav.navigate('MediaLibs', {}) },
        ]}
      />

    </View>
  );
}

// 分段内容壳：加载中/错误重试/正常渲染
function SegBody<T>({ state, onRetry, children }: {
  state: SegState<T>; onRetry: () => void; children: React.ReactNode;
}) {
  if (state.busy && !state.data) return <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>;
  if (state.err && !state.data) return (
    <View style={st.center}>
      <Text style={st.empty}>{state.err}</Text>
      <T style={st.retryBtn} onPress={onRetry} focusStyle={focus(18)}>
        <Icon name="refresh" size={16} color={C.onBrand} />
        <Text style={st.retryText}>重试</Text>
      </T>
    </View>
  );
  return <>{children}</>;
}

// ---------- 综合页零件：分区头 / 横滑卡轨 / 通用卡 ----------
function SectionHead({ title, count, actionLabel, onAction }: {
  title: string; count?: number; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={sec.head}>
      <Text style={[sec.title, IS_HD && sec.titleHD]}>{title}</Text>
      {typeof count === 'number' && count > 0 ? <Text style={sec.count}>{count}</Text> : null}
      {actionLabel && onAction ? (
        <T style={sec.moreBtn} onPress={onAction} focusStyle={focus(14)}>
          <Text style={sec.moreText}>{actionLabel}</Text>
          <Icon name="chevronright" size={13} color={C.text2} />
        </T>
      ) : null}
    </View>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: IS_HD ? 14 : 12 }}>
      {children}
    </ScrollView>
  );
}

function PvCard({ cover, name, meta, round, onPress }: {
  cover?: string; name: string; meta?: string; round?: boolean; onPress: () => void;
}) {
  const size = IS_HD ? 148 : (IS_WEB ? 132 : 112);
  return (
    <T style={{ width: size, gap: 5 }} activeOpacity={0.85} onPress={onPress} focusStyle={focus(10)}>
      {cover ? (
        <Image source={{ uri: cover }} style={{ width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: C.surface2 }} />
      ) : (
        <View style={[
          { width: size, height: size, borderRadius: round ? size / 2 : 10, alignItems: 'center', justifyContent: 'center' },
          round ? { backgroundColor: C.artTint2 } : coverGrad(name) as ViewStyle,
        ]}>
          <Text style={round ? st.artistInitial : [st.albumGlyph, { color: '#ffffffb3' }]}>{round ? name.slice(0, 1) : '♫'}</Text>
        </View>
      )}
      <Text style={[st.albumName, IS_HD && bv.albumName]} numberOfLines={1}>{name}</Text>
      {meta ? <Text style={[st.albumMeta, IS_HD && bv.albumMeta]} numberOfLines={1}>{meta}</Text> : null}
    </T>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  intro: { color: C.text2, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 },
  retryText: { color: C.onBrand, fontSize: 13, fontWeight: '600' },
  tip: { color: C.text3, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  // 浏览页头部
  hWrap: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  hSide: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  acctBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 4 },
  acctName: { color: C.text, fontSize: 18, lineHeight: 25, fontWeight: '700', maxWidth: 200 },
  acctCaret: { transform: [{ rotate: '90deg' }], marginTop: 2 },
  // 专辑网格
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  albumCell: { width: '31%', gap: 4 },
  albumCellWeb: { width: '15.5%' }, // web 6 列(0.75 zoom 下 31%=2列过大,加密 4 倍)
  albumCover: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.surface2 },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumGlyph: { color: C.text2, fontSize: 24, fontWeight: '700' },
  albumName: { color: C.text, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  albumMeta: { color: C.text2, fontSize: 9, lineHeight: 12 },
  // 艺术家/歌单行
  artistRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  plRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  artistArt: { width: 44, height: 44, borderRadius: 22 },
  artistFallback: { borderRadius: 22, backgroundColor: C.artTint2, alignItems: 'center', justifyContent: 'center' },
  artistInitial: { color: C.brandText, fontSize: 17, fontWeight: '700' },
  artistName: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  artistMeta: { color: C.text2, fontSize: 11, lineHeight: 15 },
  // 随机歌曲段
  songsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  songsHint: { color: C.text2, fontSize: 12 },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  shuffleBtnText: { color: C.onBrand, fontSize: 12, fontWeight: '600' },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { borderColor: C.brand, backgroundColor: C.brand },
});

// v3.31 列表页重设计样式（老板 0921：克制卡——深色底/细描边/微投影/品牌 icon 左置/类型徽标）
const ml = StyleSheet.create({
  group: { gap: 10 },
  groupWeb: { alignSelf: 'flex-start', width: '100%', maxWidth: 720 }, // v3.28 约定:列表容器与页头同左
  card: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, elevation: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardHD: { minHeight: 86, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16 },
  cardHover: { borderColor: C.strokeStrong, backgroundColor: C.surface2 }, // hover 细描边提亮,克制不加投影
  iconWrap: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  iconWrapHD: { width: 56, height: 56, borderRadius: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: C.text, fontSize: 14.5, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  titleHD: { fontSize: 16.5, lineHeight: 23 },
  typeChip: { backgroundColor: C.inset2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5, flexShrink: 0 },
  typeChipText: { color: C.text2, fontSize: 9.5, fontWeight: '600', letterSpacing: 0.5 },
  sub: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 2 },
  subHD: { fontSize: 12.5, lineHeight: 17 },
  menuBtn: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  menuBtnHD: { width: 40, height: 40 },
  spin: { marginRight: 2 },
});

// v3.31 WebDAV 目录浏览样式（行式 68h 基准,替唱片墙）
const dv = StyleSheet.create({
  crumbWrap: { flexGrow: 0, marginBottom: 10 },
  crumbItem: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 8 },
  crumbItemText: { color: C.text2, fontSize: 12 },
  crumbCur: { backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  crumbCurText: { color: C.onBrand, fontSize: 11.5, fontWeight: '700' },
  crumbRefresh: { width: 26, height: 26, borderRadius: 999, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  listWrap: { borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 6, paddingVertical: 4 },
  listWrapWeb: { alignSelf: 'flex-start', width: '100%', maxWidth: 860 }, // 信息密度优先:限宽 860 行式列表
  headBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  stats: { flex: 1, color: C.text3, fontSize: 11.5 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.surface2 },
  actBtnMain: { backgroundColor: C.brand },
  // 顶栏:左面包屑(flex:1)+右端常驻动作组(固定可见,不入滚动区)
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  actBtnText: { color: C.text2, fontSize: 11.5, fontWeight: '600' },
  actBtnTextMain: { color: C.onBrand },
  rowSkel: { height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.05)', marginVertical: 5 },
  rowSkelHD: { height: 78 },
  rowHover: { backgroundColor: C.surface2 },
  // 0922 TV 行焦点：清晰 2.5px 环 + 轻微放大（行高无需 1.05 级，7b 行内禁大 zoom），双保险高亮背景由 focusBg 提供
  rowFocusTv: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 10, transform: [{ scale: 1.02 }] } as ViewStyle,
  folderRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  folderRowHD: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, gap: 14 },
  folderIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  folderIconHD: { width: 42, height: 42, borderRadius: 12 },
  folderName: { flex: 1, color: C.text, fontSize: 13.5, lineHeight: 19, fontWeight: '500' },
  textHD: { fontSize: 16.5, lineHeight: 23 }, // TV 10ft 观看：主文字 16.5
  songRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  songRowHD: { minHeight: 80, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, gap: 14 },
  songRowOn: { backgroundColor: C.selTint },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint, borderRadius: 0 },
  idx: { width: 26, textAlign: 'center', color: C.text3, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  idxHD: { width: 34, fontSize: 13 },
  title: { color: C.text, fontSize: 13.5, lineHeight: 19, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 10.5, lineHeight: 14, marginTop: 1 },
  subHD: { fontSize: 12.5, lineHeight: 17 },
  dur: { color: C.text3, fontSize: 11, fontVariant: ['tabular-nums'] },
  statsHD: { fontSize: 13 },
  crumbItemHD: { paddingVertical: 5, paddingHorizontal: 8 },
  crumbItemTextHD: { fontSize: 14 },
  crumbCurHD: { paddingVertical: 6, paddingHorizontal: 13 },
  crumbCurTextHD: { fontSize: 13.5 },
  crumbRefreshHD: { width: 34, height: 34 },
  // 桌面≥900 双区容器：左列表 flex1 + 右操作栏 260 固定（对齐 860 列表右缘）
  davCols: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, maxWidth: 1140, alignSelf: 'stretch' },
  sidePanel: { width: 260, flexShrink: 0, gap: 8, position: 'relative', top: 40, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface2 },
  sideBtnMain: { color: C.onBrand, fontSize: 12.5, fontWeight: '700' },
  sideBtnText: { color: C.text2, fontSize: 12.5, fontWeight: '600' },
  sideHint: { color: C.text3, fontSize: 10.5, lineHeight: 14, marginTop: 4 },
  eq: { width: 26, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 12 },
  eqBar: { width: 3, borderRadius: 1.5, backgroundColor: C.brand },
});

// HD(车机/TV)覆盖样式:限宽居中 + 大触点/大字号(老板:媒体库列表需遥控光标+大屏排版)
const hd = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontSize: 20, fontWeight: '800' }, // lx166 居左
  intro: { fontSize: 13, lineHeight: 19 },
});

// v3.28(老板:第三方媒体库统一风格):浏览页 HD 尺寸——行高/封面/字号与我的收藏·歌单详情同档
const bv = StyleSheet.create({
  row: { minHeight: 68 },
  rowTitle: { fontSize: 15 },
  rowSub: { fontSize: 12 },
  art: { width: 52, height: 52, borderRadius: 26 },
  albumName: { fontSize: 13, lineHeight: 17 },
  albumMeta: { fontSize: 10.5, lineHeight: 14 },
  acctPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 38, marginHorizontal: 4 },
  acctName: { color: C.text, fontSize: 17, fontWeight: '800', maxWidth: 320 },
});

// 综合页分区样式（2026-09-17：一个综合页面）
const sec = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { color: C.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  titleHD: { fontSize: 18, lineHeight: 25 },
  count: { color: C.text3, fontSize: 12 },
  moreBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4 },
  moreText: { color: C.text2, fontSize: 12, fontWeight: '500' },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  previewHint: { color: C.text3, fontSize: 11, marginLeft: 'auto' },
  songsBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  dualRow: { gap: 10 },
  dualCard: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: C.surface, borderRadius: 14, padding: 12 },
  dualCover: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dualTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  dualMeta: { color: C.text2, fontSize: 11, lineHeight: 15, marginTop: 2 },
});

// navigation 注册用包装（native-stack 组件类型兼容）
export function ProviderBrowseRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { acctId: string } } }).route;
  return <ProviderBrowseScreen route={route} />;
}
