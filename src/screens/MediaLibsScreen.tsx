// 第三方媒体库：Emby / Jellyfin / Subsonic(Navidrome·道理鱼) / WebDAV
// 管理页：账号列表（长按编辑）；浏览页（amcfy 式）：专辑/艺术家/歌曲/歌单 四段浏览 + 头部一键切账号
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { Platform } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { PillTabs } from '../components/PillTabs';
import { ActionSheet } from '../components/ActionSheet';
import { SongRow } from '../components/SongRow';
import { toast } from '../components/Dialog';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { MiniPlayer } from '../components/MiniPlayer';
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload } from '../services/downloads';
import {
  providers, providerApi, PROVIDER_META,
  type ProviderAcct, type ProviderType, type PvArtist, type PvAlbum, type PvPlaylist,
} from '../services/providers';
import type { SongItem } from '../services/server';

// 有品牌 logo 的类型用 BrandIcon，其余回退语义图标
const BRAND_ICON_TYPES: Set<ProviderType> = new Set(['emby', 'jellyfin', 'navidrome', 'subsonic', 'webdav']);
const TYPE_ICON: Record<ProviderType, string> = { subsonic: 'music', navidrome: 'music', daoliyu: 'music', emby: 'tv', jellyfin: 'tv', webdav: 'cloud' };

function AcctGlyph({ type, size = 20 }: { type: ProviderType; size?: number }) {
  return BRAND_ICON_TYPES.has(type)
    ? <BrandIcon name={type as never} size={size} />
    : <Icon name={TYPE_ICON[type] as never} size={size} color={C.text} />;
}

// 触点抽象:HD 用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; onLongPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
  const { style, onPress, onLongPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} onLongPress={onLongPress} disabled={disabled}
      focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} {...(rest as object)}>
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
        contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }, IS_HD && { maxWidth: 900, alignSelf: 'center', width: '100%', paddingTop: 8 }]}
      >
        <Text style={[st.intro, IS_HD && hd.intro]}>接入 Emby、Jellyfin、Navidrome、道理鱼（Subsonic 兼容）或 WebDAV，把私有音乐库变成曲库。</Text>
        {accts.length === 0 ? (
          <EmptyState icon="server" title="还没有添加媒体库" sub="点右上角 ＋ 接入 Emby / Jellyfin / Navidrome / WebDAV" />
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
type Seg = 0 | 1 | 2 | 3; // 专辑/艺术家/歌曲/歌单

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

  const [seg, setSeg] = useState<Seg>(0);
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

  // 分段懒加载：进入某段且未加载时才拉
  useEffect(() => {
    if (!acct || isDav) return;
    if (seg === 0 && !albums.data && !albums.busy && !albums.err) loadAlbums(acct);
    if (seg === 1 && !artists.data && !artists.busy && !artists.err) loadArtists(acct);
    if (seg === 2 && !songs.data && !songs.busy && !songs.err) loadSongs(acct);
    if (seg === 3 && !lists.data && !lists.busy && !lists.err) loadLists(acct);
  }, [seg, acctId, isDav]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {isDav ? (
        /* ---------- WebDAV 目录浏览（原交互保留） ---------- */
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: (current ? 100 : 0) + insets.bottom + 24 }}>
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
                <TouchableOpacity style={st.dirRow} onPress={() => setDavDir(davDir.replace(/[^/]*\/$/, '') || '/')}>
                  <Icon name="back" size={18} color={C.text2} />
                  <Text style={st.dirText}>上一级</Text>
                </TouchableOpacity>
              ) : null}
              {davDirs.map(d => (
                <TouchableOpacity key={d.path} style={st.dirRow} onPress={() => setDavDir(d.path)}>
                  <Icon name="folder" size={18} color={C.brandText} />
                  <Text style={st.dirText}>{d.name}</Text>
                  <Icon name="chevronright" size={16} color={C.text3} />
                </TouchableOpacity>
              ))}
              {davSongs.map(s => {
                const on = sel.has(s.songmid);
                return (
                  <TouchableOpacity key={s.songmid} style={[st.davSong, on && st.davSongOn]} onPress={() => toggleSel(s.songmid)} onLongPress={() => playSong(s, davSongs)}>
                    <View style={[st.checkBox, on && st.checkBoxOn]}>
                      {on ? <Icon name="check" size={14} color={C.onBrand} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.davTitle} numberOfLines={1}>{s.name}</Text>
                      <Text style={st.davSub} numberOfLines={1}>{s.singer}</Text>
                    </View>
                    <TouchableOpacity hitSlop={8} onPress={() => playSong(s, davSongs)}>
                      <Icon name="play" size={18} color={C.text2} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {!davDirs.length && !davSongs.length ? <Text style={st.empty}>此目录为空</Text> : null}
              {davSongs.length ? (
                <View style={st.davActions}>
                  <TouchableOpacity style={st.davBtn} onPress={() => setSel(new Set(davSongs.map(s => s.songmid)))}>
                    <Text style={st.davBtnText}>全选</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.davBtn, st.davBtnMain]}
                    disabled={!selSongs.length}
                    onPress={() => {
                      const name = `WebDAV ${davDir === '/' ? '根目录' : davDir.split('/').filter(Boolean).pop() || ''}`;
                      importDav(name, selSongs);
                    }}
                  >
                    <Text style={[st.davBtnText, { color: C.onBrand }]}>加入歌单{selSongs.length ? ` (${selSongs.length})` : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.davBtn, st.davBtnMain]}
                    disabled={!selSongs.length}
                    onPress={() => { const n = enqueueDownload(selSongs); toast(`${n} 首加入下载队列`); }}
                  >
                    <Text style={[st.davBtnText, { color: C.onBrand }]}>下载</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <Text style={st.tip}>点击选择 · 长按直接播放</Text>
            </>
          )}
        </ScrollView>
      ) : (
        /* ---------- 四段曲库浏览 ---------- */
        <>
          <PillTabs tabs={['专辑', '艺术家', '歌曲', '歌单']} active={seg} onChange={(i) => setSeg(i as Seg)} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: (current ? 116 : 32), gap: 8 }}>
            {seg === 0 && (
              <SegBody state={albums} onRetry={() => { setAlbums({ data: null, err: null, busy: false }); if (acct) loadAlbums(acct); }}>
                {albums.data && albums.data.length === 0 ? <EmptyState icon="music" title="服务器上没有专辑" sub="先在媒体服务器里添加音乐库" /> : null}
                <View style={st.albumGrid}>
                  {(albums.data || []).map(al => (
                    <TouchableOpacity
                      key={al.id} style={[st.albumCell, IS_WEB && st.albumCellWeb]} activeOpacity={0.85}
                      onPress={() => nav.navigate('ProviderDetail', {
                        acctId: acct.id, kind: 'album', id: al.id, name: al.name, cover: al.cover,
                        sub: [al.artist, al.songCount ? `${al.songCount}首` : null].filter(Boolean).join(' · ') || undefined,
                      })}
                    >
                      {al.cover ? <Image source={{ uri: al.cover }} style={st.albumCover} />
                        : <View style={[st.albumCover, st.albumFallback]}><Text style={st.albumGlyph}>♫</Text></View>}
                      <Text style={st.albumName} numberOfLines={1}>{al.name}</Text>
                      <Text style={st.albumMeta} numberOfLines={1}>{al.artist || ''}{al.songCount ? ` · ${al.songCount}首` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </SegBody>
            )}

            {seg === 1 && (
              <SegBody state={artists} onRetry={() => { setArtists({ data: null, err: null, busy: false }); if (acct) loadArtists(acct); }}>
                {artists.data && artists.data.length === 0 ? <EmptyState icon="music" title="没有找到艺术家" /> : null}
                {(artists.data || []).map(ar => (
                  <TouchableOpacity
                    key={ar.id} style={st.artistRow} activeOpacity={0.75}
                    onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'artist', id: ar.id, name: ar.name, sub: ar.albumCount ? `${ar.albumCount} 张专辑` : undefined })}
                  >
                    {ar.cover ? <Image source={{ uri: ar.cover }} style={st.artistArt} />
                      : <View style={[st.artistArt, st.artistFallback]}><Text style={st.artistInitial}>{ar.name.slice(0, 1)}</Text></View>}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.artistName} numberOfLines={1}>{ar.name}</Text>
                      <Text style={st.artistMeta} numberOfLines={1}>{ar.albumCount ? `${ar.albumCount} 张专辑` : PROVIDER_META[acct.type].label}</Text>
                    </View>
                    <Icon name="chevronright" size={18} color={C.text3} />
                  </TouchableOpacity>
                ))}
              </SegBody>
            )}

            {seg === 2 && (
              <SegBody state={songs} onRetry={refreshSongs}>
                <View style={st.songsBar}>
                  <Text style={st.songsHint}>随机 100 首</Text>
                  <TouchableOpacity style={st.shuffleBtn} activeOpacity={0.7} onPress={refreshSongs} disabled={songs.busy}>
                    <Icon name="refresh" size={14} color={C.onBrand} />
                    <Text style={st.shuffleBtnText}>换一批</Text>
                  </TouchableOpacity>
                </View>
                {(songs.data || []).map((s, i) => (
                  <SongRow
                    key={`${s.songmid}-${i}`}
                    song={s}
                    playing={current?.songmid === s.songmid}
                    onPress={() => playSong(s, songs.data || [])}
                  />
                ))}
              </SegBody>
            )}

            {seg === 3 && (
              <SegBody state={lists} onRetry={() => { setLists({ data: null, err: null, busy: false }); if (acct) loadLists(acct); }}>
                {lists.data && lists.data.length === 0 ? <EmptyState icon="music" title="服务器上没有歌单" sub="在媒体服务器或 amcfy 等客户端里创建" /> : null}
                {(lists.data || []).map(pl => (
                  <TouchableOpacity
                    key={pl.id} style={st.plRow} activeOpacity={0.75}
                    onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover, sub: pl.songCount ? `${pl.songCount} 首` : undefined })}
                  >
                    {pl.cover ? <Image source={{ uri: pl.cover }} style={st.artistArt} />
                      : <View style={[st.artistArt, st.albumFallback]}><Text style={st.albumGlyph}>♫</Text></View>}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.artistName} numberOfLines={1}>{pl.name}</Text>
                      <Text style={st.artistMeta} numberOfLines={1}>{pl.songCount ? `${pl.songCount} 首` : ''}</Text>
                    </View>
                    <Icon name="chevronright" size={18} color={C.text3} />
                  </TouchableOpacity>
                ))}
              </SegBody>
            )}
          </ScrollView>
        </>
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
      <View style={st.miniDock} pointerEvents="box-none">
        <MiniPlayer />
      </View>
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
      <TouchableOpacity style={st.retryBtn} onPress={onRetry}>
        <Icon name="refresh" size={16} color={C.onBrand} />
        <Text style={st.retryText}>重试</Text>
      </TouchableOpacity>
    </View>
  );
  return <>{children}</>;
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
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#4A4A4A', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { borderColor: C.brand, backgroundColor: C.brand },
  davTitle: { color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  davSub: { color: C.text2, fontSize: 10, lineHeight: 14 },
  davActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  davBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  davBtnMain: { backgroundColor: C.brand },
  davBtnText: { color: C.text, fontSize: 12, fontWeight: '600' },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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

// navigation 注册用包装（native-stack 组件类型兼容）
export function ProviderBrowseRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { acctId: string } } }).route;
  return <ProviderBrowseScreen route={route} />;
}
