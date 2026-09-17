// 第三方媒体库：Emby / Jellyfin / Subsonic(Navidrome·道理鱼) / WebDAV / 听风
// 管理页：账号列表（长按编辑）；浏览页（2026-09-17 老板指令·参考 Amcfy 主页）：
// 连接后是【一个综合页面】——分区纵排（随机来点/专辑/艺术家/歌单 或 听风 我的/推荐/排行/新歌），不再 tab 切换
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, ScrollView, TouchableOpacity, Image, ActivityIndicator, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { Platform } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { ActionSheet } from '../components/ActionSheet';
import { SongRow } from '../components/SongRow';
import { toast } from '../components/Dialog';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { GUTTER, focus, pageBottom } from '../hd/hdstyle'; // v3.28:统一栅格/焦点环/播放条让位
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload } from '../services/downloads';
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

  const refresh = useCallback(() => setAccts(providers.all()), []);
  useEffect(refresh, []);
  // 从 ProviderEdit 保存/删除返回时刷新列表（屏幕停留挂载不会重走 mount）
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // 按钮入口：Figma NM-REMOTE-SELECT-001 选择类型页（ProviderEditScreen 内部先选类型再连接）
  const addMenu = () => nav.navigate('ProviderEdit', {});

  return (
    <View style={st.screen}>
      {IS_HD ? (
        /* HD:自绘头部(HDTouch 返回/添加,遥控可达) + 限宽居中 */
        <View style={[hd.head, { paddingTop: Math.max(Math.min(insets.top, 20), 14) }]}>
          <HDTouch style={hd.backBtn} onPress={() => nav.goBack()} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={hd.title}>媒体库</Text>
          <HDTouch style={hd.addBtn} onPress={addMenu} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 10 }}>
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
        contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }, IS_HD && { width: '100%', alignSelf: 'stretch', paddingTop: 8 }]}
      >
        <Text style={[st.intro, IS_HD && hd.intro]}>接入 Emby、Jellyfin、Navidrome、道理鱼（Subsonic 兼容）或 WebDAV，把私有音乐库变成曲库。</Text>
        {accts.length === 0 ? (
          <EmptyState icon="server" title="还没有添加媒体库" sub="点右上角 ＋ 接入 Emby / Jellyfin / Navidrome / WebDAV / 听风" />
        ) : (
          <View style={st.group}>
            {accts.map((a, i) => (
              <T
                key={a.id}
                style={[st.row, i > 0 && st.rowDivide, IS_HD && hd.row]}
                onPress={() => nav.navigate('ProviderBrowse', { acctId: a.id })}
                onLongPress={() => nav.navigate('ProviderEdit', { acctId: a.id })}
              >
                <View style={[st.rowIconWrap, IS_HD && hd.rowIconWrap]}><AcctGlyph type={a.type} size={IS_HD ? 24 : 20} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.rowTitle, IS_HD && hd.rowTitle]} numberOfLines={1}>{a.name || PROVIDER_META[a.type].label}</Text>
                  <Text style={[st.rowSub, IS_HD && hd.rowSub]} numberOfLines={1}>{a.base}</Text>
                </View>
                <Icon name="chevronright" size={IS_HD ? 24 : 20} color={C.text3} />
              </T>
            ))}
          </View>
        )}
        <Text style={st.tip}>点击浏览曲库 · 长按编辑；飞牛 fnOS 可通过 WebDAV 共享接入</Text>
      </ScrollView>
    </View>
  );
}


// ---------- 浏览页（专辑/艺术家/歌曲/歌单 · WebDAV 保持目录浏览） ----------
// 单段数据缓存：null=未加载
interface SegState<T> { data: T | null; err: string | null; busy: boolean; }

export function ProviderBrowseScreen({ route }: { route: { params: { acctId: string } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong, current } = usePlayer();

  // 账号可就地切换（amcfy 式一键切服务器），不重进页面
  const [acctId, setAcctId] = useState(route.params.acctId);
  const acct = providers.get(acctId);
  const isDav = acct?.type === 'webdav';

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
        /* ---------- WebDAV 目录浏览（原交互保留） ---------- */
        <ScrollView contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingBottom: ((current ? 100 : 0) + insets.bottom + 24) + (IS_HD ? 48 : 0) }}>
          {davBusy ? (
            <View style={st.center}><ActivityIndicator color={C.brand} size="large" /></View>
          ) : davErr ? (
            <View style={st.center}>
              <Text style={st.empty}>{davErr}</Text>
              <TouchableOpacity style={st.retryBtn} onPress={davLoad}>
                <Icon name="refresh" size={16} color={C.onBrand} />
                <Text style={st.retryText}>重试</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={st.crumb}>WebDAV · {davDir}</Text>
              {davDir !== '/' ? (
                <T style={st.dirRow} focusStyle={focus(10)} onPress={() => setDavDir(davDir.replace(/[^/]*\/$/, '') || '/')}>
                  <Icon name="back" size={18} color={C.text2} />
                  <Text style={st.dirText}>上一级</Text>
                </T>
              ) : null}
              {davDirs.map(d => (
                <T key={d.path} style={st.dirRow} focusStyle={focus(10)} onPress={() => setDavDir(d.path)}>
                  <Icon name="folder" size={18} color={C.brandText} />
                  <Text style={st.dirText}>{d.name}</Text>
                  <Icon name="chevronright" size={16} color={C.text3} />
                </T>
              ))}
              {davSongs.map(s => {
                const on = sel.has(s.songmid);
                return (
                  <T key={s.songmid} style={[st.davSong, on && st.davSongOn]} focusStyle={focus(10)} onPress={() => toggleSel(s.songmid)} onLongPress={() => playSong(s, davSongs)}>
                    <View style={[st.checkBox, on && st.checkBoxOn]}>
                      {on ? <Icon name="check" size={14} color={C.onBrand} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.davTitle} numberOfLines={1}>{s.name}</Text>
                      <Text style={st.davSub} numberOfLines={1}>{s.singer}</Text>
                    </View>
                    <T hitSlop={8} onPress={() => playSong(s, davSongs)} focusStyle={focus(999)}>
                      <Icon name="play" size={18} color={C.text2} />
                    </T>
                  </T>
                );
              })}
              {!davDirs.length && !davSongs.length ? <Text style={st.empty}>此目录为空</Text> : null}
              {davSongs.length ? (
                <View style={st.davActions}>
                  <T style={st.davBtn} focusStyle={focus(12)} onPress={() => setSel(new Set(davSongs.map(s => s.songmid)))}>
                    <Text style={st.davBtnText}>全选</Text>
                  </T>
                  <T
                    style={[st.davBtn, st.davBtnMain]}
                    focusStyle={focus(12)}
                    disabled={!selSongs.length}
                    onPress={() => {
                      const name = `WebDAV ${davDir === '/' ? '根目录' : davDir.split('/').filter(Boolean).pop() || ''}`;
                      importDav(name, selSongs);
                    }}
                  >
                    <Text style={[st.davBtnText, { color: C.onBrand }]}>加入歌单{selSongs.length ? ` (${selSongs.length})` : ''}</Text>
                  </T>
                  <T
                    style={[st.davBtn, st.davBtnMain]}
                    focusStyle={focus(12)}
                    disabled={!selSongs.length}
                    onPress={() => { const n = enqueueDownload(selSongs); toast(`${n} 首加入下载队列`); }}
                  >
                    <Text style={[st.davBtnText, { color: C.onBrand }]}>下载</Text>
                  </T>
                </View>
              ) : null}
              <Text style={st.tip}>点击选择 · 长按直接播放</Text>
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
                      <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} />
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
                    <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} />
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
  group: { borderRadius: 14, backgroundColor: C.surface, paddingHorizontal: 16 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint },
  rowIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rowSub: { color: C.text2, fontSize: 11, lineHeight: 15 },
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
  // webdav
  crumb: { color: C.text2, fontSize: 11, lineHeight: 15, marginBottom: 10 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint },
  dirText: { flex: 1, color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  davSong: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint },
  davSongOn: { backgroundColor: C.selTint, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.inset2, alignItems: 'center', justifyContent: 'center' }, // v3.28:硬编码色 token 化
  checkBoxOn: { borderColor: C.brand, backgroundColor: C.brand },
  davTitle: { color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  davSub: { color: C.text2, fontSize: 10, lineHeight: 14 },
  davActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  davBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  davBtnMain: { backgroundColor: C.brand },
  davBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },
});

// HD(车机/TV)覆盖样式:限宽居中 + 大触点/大字号(老板:媒体库列表需遥控光标+大屏排版)
const hd = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontSize: 20, fontWeight: '800' }, // lx166 居左
  intro: { fontSize: 13, lineHeight: 19 },
  row: { minHeight: 78, paddingVertical: 12 },
  rowIconWrap: { width: 46, height: 46, borderRadius: 13 },
  rowTitle: { fontSize: 16 },
  rowSub: { fontSize: 12 },
});

// v3.28(老板:第三方媒体库统一风格):浏览页 HD 尺寸——行高/封面/字号与我的收藏·歌单详情同档
const bv = StyleSheet.create({
  row: { minHeight: 68 },
  art: { width: 52, height: 52, borderRadius: 26 },
  rowTitle: { fontSize: 15 },
  rowSub: { fontSize: 12 },
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
