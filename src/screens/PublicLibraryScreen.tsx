// PublicLibraryScreen —— 公共曲库(LEO v2.2 规格④ · App 侧)
// [老板 1010 17:00 全面重设计] 维度 tabs 退役——参照「为我推荐/探索」分区纵排流式:
// ①库头横幅(LibBanner:库名+统计行 N首·N专辑·N歌手·总大小,scan 聚合,缺数不渲染不造假)+②动作行(播放全部/随机来点)
// ③随机来点 rail(换一批) ④专辑 rail(12 张)→「查看全部」展开 DiscCard 墙(分页 LoadMore)
// ⑤歌手区(≤8 行列表 / 多则圆头像 rail+「查看全部」展开 useGridBasis 圆墙) ⑥歌曲区(本地搜索+SongRow,首屏渲染上限 50 逐档加载)
// 404 铁律:任何内容端点 404 → 入口移除+清缓存(onPub404)+本页退场空态;播放走 lib=public 现有 custom 路径
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Animated, Image, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { HDTouch } from '../hd/HDTouch';
import { focus } from '../hd/hdstyle';
import { Icon } from '../theme/Icon';
import { C, CARD, FS, FW, SP } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { toast } from '../components/Dialog';
import { LibraryHome, HomeSection, RailCard } from '../components/LibraryHome'; // [老板 1011 15:55] HomeRail→GridWall 网格化
import { GridWall } from '../components/GridWall'; // ①②段骨架+分区头/横滑轨
import { useGridBasis } from '../components/GridBasis'; // ⑤歌手展开圆墙列基自适应(15/18/23/31/48% 档位表);1028 全墙页同接(自适应令)
import { usePlayer } from '../state/PlayerProvider';
import { coverUrl, setActiveLib, type LibSong, type LibAlbum, type LibArtist } from '../services/myLibrary';
import { pubLib, pubCheck, pubToSongItem, pubSourceName, usePubEntry } from '../services/publicLibrary';
import { DiscCard } from './MyLibraryScreen';
import { SongRow } from '../components/SongRow'; // [批次1·P1-1] 通用件直引(局部版已退役)
import { ArtistRow } from '../components/ArtistRow'; // [批次1] 歌手行统一件(替本页自造 rowCard 行)
import { useHoverCard } from '../hd/hdweb';
import { gradOf } from '../theme/grads'; // [老板 1011 15:39] 渐变唯一源 // [老板 1011 12:34] 卡片彩色弥散阴影+hover

/** 字节数人类可读(统计行「总大小」;≤0/非数返回空串不渲染) */
function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '';
  const gb = n / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
}

const ABS: { position: 'absolute'; left: number; right: number; top: number; bottom: number } = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };

// 骨架脉冲(与我的曲库 SkelGrid 同族)
function usePulse() {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(op, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [op]);
  return op;
}

// ── 浏览页 ──
export function PublicLibraryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const entry = usePubEntry();
  const summary = entry.summary;
  const scan = summary?.scan;
  const PAGE = IS_HD ? 100 : 50; // ④分页 50/100
  // ⑤歌手展开圆墙已移入 PublicLibWallRoute(老板 1011:查看全部改路由跳转)

  // 进页即强校验(缓存过期→404 即时退场);播放域切 public(流/封面 lib=public)
  useEffect(() => {
    pubCheck(true);
    setActiveLib('public');
    return () => setActiveLib(undefined);
  }, []);

  // 扫描中:轻轮询 summary 至完成(自动转正内容)
  useEffect(() => {
    if (!scan?.running) return;
    const t = setInterval(() => pubCheck(true), 8000);
    return () => clearInterval(t);
  }, [scan?.running]);

  const [albums, setAlbums] = useState<LibAlbum[] | null>(null);
  const [albumsTotal, setAlbumsTotal] = useState(0);
  const [albumsBusy, setAlbumsBusy] = useState(false);
  const [artists, setArtists] = useState<LibArtist[] | null>(null);
  const [artistsTotal, setArtistsTotal] = useState(0);
  const [artistsBusy, setArtistsBusy] = useState(false);
  const [songs, setSongs] = useState<LibSong[] | null>(null);
  const [songSize, setSongSize] = useState(PAGE); // 契约 songs 无 offset:recent top-N 逐档扩(size≤200)
  const [songsBusy, setSongsBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // ③随机 rail / ⑥搜索+渲染上限 / ④⑤展开态
  const [randSongs, setRandSongs] = useState<LibSong[] | null>(null);
  const [railBusy, setRailBusy] = useState(false);
  const [randBusy, setRandBusy] = useState(false); // 动作行「随机来点」
  const [q, setQ] = useState('');
  const [songShown, setSongShown] = useState(30); // ⑥首屏渲染上限 30(老板 1011:拥挤),「显示更多」逐档 +30(禁止 200 首全量一次渲染)

  // 分页追加去重(offset 窗口在数据变动时可能交叠)
  function dedup<T extends { id: string }>(prev: T[] | null, add: T[], reset: boolean): T[] {
    if (reset || !prev) return add;
    const seen = new Set(prev.map(x => x.id));
    return prev.concat(add.filter(x => !seen.has(x.id)));
  }

  const loadAlbums = useCallback((reset = false) => {
    if (albumsBusy) return;
    const offset = reset ? 0 : albums?.length || 0;
    setAlbumsBusy(true); setErr(null);
    pubLib.albums('newest', PAGE, offset)
      .then(r => { setAlbums(p => dedup(p, r.albums, offset === 0)); setAlbumsTotal(r.total); })
      .catch(e => { setErr((e as Error).message || '加载失败'); if (albums === null) setAlbums([]); })
      .finally(() => setAlbumsBusy(false));
  }, [albums, albumsBusy, PAGE]);

  const loadArtists = useCallback((reset = false) => {
    if (artistsBusy) return;
    const offset = reset ? 0 : artists?.length || 0;
    setArtistsBusy(true); setErr(null);
    pubLib.artists(offset, PAGE)
      .then(r => { setArtists(p => dedup(p, r.artists, offset === 0)); setArtistsTotal(r.total); })
      .catch(e => { setErr((e as Error).message || '加载失败'); if (artists === null) setArtists([]); })
      .finally(() => setArtistsBusy(false));
  }, [artists, artistsBusy, PAGE]);

  const loadSongs = useCallback((size: number) => {
    if (songsBusy) return;
    setSongsBusy(true); setErr(null);
    pubLib.songs('recent', size)
      .then(r => setSongs(r.songs))
      .catch(e => { setErr((e as Error).message || '加载失败'); if (songs === null) setSongs([]); })
      .finally(() => setSongsBusy(false));
  }, [songs, songsBusy]);

  // ③随机来点 rail:首拉 12 首,「换一批」重拉(失败静默保旧批;首拉失败不渲染该区——真实铁律)
  const loadRandRail = useCallback(() => {
    if (railBusy) return;
    setRailBusy(true);
    pubLib.songs('random', 12)
      .then(r => setRandSongs(r.songs))
      .catch(() => {})
      .finally(() => setRailBusy(false));
  }, [railBusy]);

  // 首次进页整页加载(授权+非扫描中;各段 null 守卫,失败段隐藏)
  useEffect(() => {
    if (!entry.authorized || scan?.running) return;
    if (albums === null && !albumsBusy) loadAlbums(true);
    if (artists === null && !artistsBusy) loadArtists(true);
    if (songs === null && !songsBusy) loadSongs(PAGE);
    if (randSongs === null && !railBusy) loadRandRail();
  }, [entry.authorized, scan?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (list: LibSong[] | null | undefined, idx: number) => {
    if (!list?.length) return;
    const items = list.map(pubToSongItem);
    await playSong(items[Math.min(idx, items.length - 1)], items);
  };

  const doRefresh = () => {
    pubCheck(true);
    loadAlbums(true);
    loadArtists(true);
    setSongSize(PAGE); loadSongs(PAGE);
    setSongShown(50);
    loadRandRail();
  };

  const WEEK = 7 * 24 * 3600 * 1000;
  const isNewSong = (s: LibSong) => !!s.mtime && Date.now() - s.mtime < WEEK; // ⑤-B6:7 天内 NEW 标

  const playRandom = () => {
    if (randBusy) return;
    setRandBusy(true);
    pubLib.songs('random', 50)
      .then(r => {
        const items = r.songs.map(pubToSongItem);
        if (items.length) void playSong(items[Math.floor(Math.random() * items.length)], items);
        else toast('库内还没有歌曲');
      })
      .catch(() => toast('随机播放失败，稍后再试'))
      .finally(() => setRandBusy(false));
  };

  // ②动作行「播放全部」:当前已加载可见列表整队播放(songs 契约 recent top-N≤200)
  const playAll = () => {
    if (!songs?.length) { toast('库内还没有歌曲'); return; }
    void play(songs, 0);
  };

  const enterAlbum = (a: LibAlbum) => nav.navigate('PublicLibAlbum', { id: a.id, name: a.name, cover: a.coverFile });
  const enterArtist = (a: LibArtist) => nav.navigate('PublicLibArtist', { id: a.id, name: a.name });

  // ── ①头部统计行数据(scan 聚合;缺数不渲染不造假) ──
  const srcEntries = Object.entries(summary?.sources || {});
  const srcTotal = srcEntries.length;
  const srcOk = scan?.lastError ? Math.max(0, srcTotal - 1) : srcTotal; // v1 近似:无逐源健康端点,scan 错误=减一
  const agoText = scan?.syncedAt ? (() => { const m = Math.floor((Date.now() - scan.syncedAt) / 60000); if (m < 60) return `${m || 1} 分钟前`; const h = Math.floor(m / 60); if (h < 24) return `${h} 小时前`; return `${Math.floor(h / 24)} 天前`; })() : '';
  const weekNew = songs ? songs.filter(s => s.mtime && Date.now() - s.mtime < 7 * 86400000).length : 0;
  const sizeText = scan && typeof scan.totalBytes === 'number' ? fmtBytes(scan.totalBytes) : '';
  const statsLine = scan && typeof scan.songs === 'number'
    ? `${scan.songs.toLocaleString()} 首 · ${scan.albums ?? 0} 专辑 · ${scan.artists ?? 0} 歌手${sizeText ? ` · ${sizeText}` : ''}`
    : undefined;
  const bannerSub = [weekNew > 0 ? `本周新增 ${weekNew} 首` : null, srcTotal > 0 ? `${srcOk}/${srcTotal} 源正常` : null, agoText ? `最近更新 ${agoText}` : null].filter(Boolean).join(' · ') || undefined;
  const bannerStatus = !scan ? null : scan.lastError ? ('warn' as const) : ('ok' as const);

  // ── ⑥本地搜索(已加载范围内过滤:名/歌手/专辑/源名) ──
  const kw = q.trim().toLowerCase();
  const filtered = kw
    ? (songs || []).filter(s => [s.name, s.singer, s.album, pubSourceName(s, summary)].some(x => !!x && x.toLowerCase().includes(kw)))
    : (songs || []);
  const shownSongs = filtered.slice(0, songShown);

  const albRailN = 12; // ④默认 rail 展示约 12 张
  const artFew = (artistsTotal || artists?.length || 0) <= 8; // ⑤数据量自动:≤8 行列表,多则圆墙 rail

  const body = () => {
    // 404 铁律联动:授权被撤/库停用 → 入口已移除,本页退场
    if (!entry.authorized) {
      return (
        <View style={d.emptyWrap}>
          <Icon name="shield" size={30} color={C.text3} />
          <Text style={d.emptyT1}>公共曲库不可用</Text>
          <Text style={d.emptyT2}>管理员未授权或库已停用，入口已自动移除；获得授权后会重新出现</Text>
          <TouchableOpacity style={d.retryBtn} onPress={() => nav.goBack()}><Text style={d.retryText}>返回</Text></TouchableOpacity>
        </View>
      );
    }
    // 换目录/扫描中:「管理员更新中」骨架屏占位
    if (scan?.running) {
      return (
        <View style={{ flex: 1 }}>
          <View style={d.scanBar}>
            <ActivityIndicator size="small" color={C.brand} />
            <Text style={d.scanT}>管理员更新中 · 完成后自动展示</Text>
          </View>
          <SkelWall />
        </View>
      );
    }
    if (err) {
      return (
        <View style={d.errRow}>
          <Text style={d.errT} numberOfLines={1}>{err}</Text>
          <TouchableOpacity style={d.retryBtn} onPress={doRefresh}><Text style={d.retryText}>重试</Text></TouchableOpacity>
        </View>
      );
    }
    // 全空库(三段都加载完且皆空):单一空态,不逐段渲染
    if (albums !== null && artists !== null && songs !== null && !albums.length && !artists.length && !songs.length) {
      return (
        <View style={{ paddingVertical: 48 }}>
          <EmptyState icon="library" title="库内还没有内容" sub="管理员共享的曲库暂无歌曲，扫描完成后会自动出现" />
        </View>
      );
    }
    return (
      <LibraryHome kind="public" name={summary?.name || '公共曲库'} stats={statsLine} sub={bannerSub} status={bannerStatus}
        actions={[
          { icon: 'play', label: '播放全部', primary: true, onPress: playAll, disabled: !songs?.length },
          { icon: 'shuffle', label: '随机来点', onPress: playRandom, disabled: randBusy },
        ]}>
        {/* ③ 随机来点 rail(首拉失败/空库不渲染;tap=以本批为队列播放) */}
        {randSongs && randSongs.length ? (
          <HomeSection title="随机来点" actionLabel={railBusy ? '换一批…' : '换一批'} onAction={loadRandRail}>
            <GridWall>
              {randSongs.map((s, i) => (
                <RandCard key={s.id} song={s} onPress={() => play(randSongs, i)} />
              ))}
            </GridWall>
          </HomeSection>
        ) : null}

        {/* ④ 专辑区:rail(RailCard 与为我推荐同规格);「查看全部」路由跳全墙页(老板 1011:原地展开样式突变,卡片突然变大) */}
        {albums === null ? <SkelRail /> : albums.length ? (
          <HomeSection title="专辑" count={albumsTotal || albums.length} actionLabel="查看全部" onAction={() => nav.navigate('PublicLibWall', { kind: 'albums' })}>
            <GridWall>
              {albums.slice(0, albRailN).map(a => (
                <RailCard fill key={a.id} cover={a.coverFile ? coverUrl(a.coverFile, 'public') : null} name={a.name}
                  sub={`${a.artist || '未知'} · ${a.songCount} 首`} onPress={() => enterAlbum(a)} />
              ))}
            </GridWall>
          </HomeSection>
        ) : null}

        {/* ⑤ 歌手区:≤8 行列表;多则圆头像 rail;「查看全部」路由跳全墙页 */}
        {artists === null ? <SkelRail round /> : artists.length ? (
          artFew ? (
            <HomeSection title="歌手" count={artistsTotal || artists.length}>
              <View style={d.rows}>
                {artists.map(a => (
                  <ArtistRow key={a.id} cover={a.coverFile ? coverUrl(a.coverFile, 'public') : undefined}
                    name={a.name} sub={`${a.albumCount} 专辑 · ${a.songCount} 首`} onPress={() => enterArtist(a)} />
                ))}
              </View>
            </HomeSection>
          ) : (
            <HomeSection title="歌手" count={artistsTotal || artists.length} actionLabel="查看全部" onAction={() => nav.navigate('PublicLibWall', { kind: 'artists' })}>
              <GridWall>
                {artists.slice(0, 24).map(a => (
                  <ArtistCircle fill key={a.id} a={a} onPress={() => enterArtist(a)} />
                ))}
              </GridWall>
            </HomeSection>
          )
        ) : null}

        {/* ⑥ 歌曲区:本地搜索+SongRow 列表(首屏 50 首,显示更多+50;数据档位至 200) */}
        {songs === null ? <SkelList /> : songs.length ? (
          <HomeSection title="歌曲" count={typeof scan?.songs === 'number' ? scan.songs : songs.length}>
            <View style={[d.searchBox, IS_HD && d.searchBoxHD]}>
              <Icon name="search" size={18} color={C.text2} />
              <TextInput
                style={d.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="搜索歌曲、歌手、专辑"
                placeholderTextColor={C.text3}
                returnKeyType="search"
              />
              {q ? (
                <TouchableOpacity style={d.searchClear} onPress={() => setQ('')} hitSlop={6}>
                  <Icon name="close" size={14} color={C.text3} />
                </TouchableOpacity>
              ) : null}
            </View>
            {shownSongs.map((s, i) => (
              <SongRow key={s.id} song={s} idx={i} lib="public" sourceName={pubSourceName(s, summary)} isNew={isNewSong(s)}
                onPress={() => play(filtered, i)} />
            ))}
            {songsBusy ? (
              <View style={d.moreWrap}><ActivityIndicator color={C.brand} /></View>
            ) : filtered.length > songShown ? (
              <TouchableOpacity style={d.moreBtn} activeOpacity={0.8} onPress={() => setSongShown(n => n + 30)}>
                <Text style={d.moreT}>显示更多 · {songShown}/{filtered.length}</Text>
              </TouchableOpacity>
            ) : songs.length >= songSize && songSize < 200 ? (
              <TouchableOpacity style={d.moreBtn} activeOpacity={0.8}
                onPress={() => { const n = Math.min(songSize + PAGE, 200); setSongSize(n); loadSongs(n); }}>
                <Text style={d.moreT}>加载更多</Text>
              </TouchableOpacity>
            ) : (
              <Text style={d.endT}>{filtered.length ? `${filtered.length} 首` : '没有匹配的歌曲'}</Text>
            )}
          </HomeSection>
        ) : null}
      </LibraryHome>
    );
  };

  return (
    <View style={[d.screen, { paddingTop: insets.top }]}>
      {IS_HD ? (
        <View style={d.hdHead}>
          <HDTouch style={d.hdBack} onPress={() => nav.goBack()} focusStyle={d.focusRing} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <Text style={d.hdTitle}>公共曲库</Text>
          <HDTouch style={d.hdBack} onPress={doRefresh} focusStyle={d.focusRing}>
            <Icon name="refresh" size={16} color={C.text2} />
          </HDTouch>
        </View>
      ) : (
        <View style={d.head}>
          <TouchableOpacity style={d.headBtn} onPress={() => nav.goBack()}><Icon name="back" size={16} color={C.text2} /></TouchableOpacity>
          <Text style={d.headTitle}>公共曲库</Text>
          <TouchableOpacity style={d.headBtn} onPress={doRefresh}>
            <Icon name="refresh" size={15} color={C.text2} />
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {body()}
      </ScrollView>
    </View>
  );
}

// ③随机 rail 小卡:封面直链 coverHttp → 嵌入图 coverUrl → 渐变兜底(名哈希);tap=以本批为队列
function RandCard({ song, onPress }: { song: LibSong; onPress: () => void }) {
  const size = IS_HD ? 96 : 78; // 非网格场景备用;GridWall 内走 fill 结构
  const ext = song as LibSong & { coverHttp?: string };
  const cover = ext.coverHttp || (song.hasCover ? coverUrl(song.filename, 'public') : null);
  const [g1] = gradOf(song.album || song.singer);
  const { elRef, onHoverIn, onHoverOut, cardStyle } = useHoverCard(song.name); // [老板 1011 12:34] nm-card 同款
  return (
    <TouchableOpacity ref={elRef as never}
      style={[{ width: '100%', backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' }, cardStyle as never]}
      activeOpacity={0.85} onPress={onPress}
      {...(Platform.OS === 'web' ? { onHoverIn, onHoverOut } : {}) as Record<string, unknown>}>
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: C.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {cover ? (
          <Image source={{ uri: cover }} style={ABS} resizeMode="cover" />
        ) : (
          <View style={[ABS, { backgroundColor: g1, opacity: 0.55 }]} />
        )}
      </View>
      <View style={{ padding: 6, gap: SP.xs }}>
        <Text style={d.randName} numberOfLines={1}>{song.name}</Text>
        <Text style={d.randSub} numberOfLines={1}>{song.singer}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ⑤歌手圆头像(参考 MediaLibsScreen PvCard round 用法:封面圆图,无封面 artTint2 底+首字母 artistInitial)
// fill=true=展开格内自适应宽(100%+aspectRatio);否则 rail 固定 px
function ArtistCircle({ a, fill, onPress }: { a: LibArtist; fill?: boolean; onPress: () => void }) {
  const { elRef, onHoverIn, onHoverOut, cardStyle } = useHoverCard(a.name); // [老板 1011 12:34] nm-card 同款投影
  const wStyle = fill ? { width: '100%' } : { width: IS_HD ? 96 : 76 }; // [LEO 1011 统一令] 72→76 与搜索页歌手圆卡同规格
  return (
    <TouchableOpacity ref={elRef as never} style={[wStyle, { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' }, cardStyle as never]} activeOpacity={0.85} onPress={onPress}
      {...(Platform.OS === 'web' ? { onHoverIn, onHoverOut } : {}) as Record<string, unknown>}>
      <View style={{ padding: SP.sm }}>
        <View style={[fill ? { width: '100%' } : { width: (IS_HD ? 96 : 76) - SP.sm * 2 }, { aspectRatio: 1, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, !a.coverFile && { backgroundColor: C.artTint2 }]}>
          {a.coverFile ? (
            <Image source={{ uri: coverUrl(a.coverFile, 'public') }} style={ABS} resizeMode="cover" />
          ) : (
            <Text style={[d.artInit, fill && d.artInitBig]}>{a.name.slice(0, 1)}</Text>
          )}
        </View>
      </View>
      <View style={{ paddingHorizontal: SP.md, paddingBottom: SP.md, alignItems: 'center' }}>
        <Text style={d.acName} numberOfLines={1}>{a.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ⑤歌手行列表(≤8 位)→ [批次1] 统一件 src/components/ArtistRow(本页局部版退役)

// 分页尾:加载更多/已全部
function LoadMore({ busy, shown, total, onMore, unit }: { busy: boolean; shown: number; total: number; onMore: () => void; unit: string }) {
  if (busy) return <View style={d.moreWrap}><ActivityIndicator color={C.brand} /></View>;
  if (shown >= total) return shown ? <Text style={d.endT}>共 {total} {unit}</Text> : <Text style={d.endT}>库内还没有内容</Text>;
  return (
    <TouchableOpacity style={d.moreBtn} onPress={onMore} activeOpacity={0.8}>
      <Text style={d.moreT}>加载更多</Text>
    </TouchableOpacity>
  );
}

// 骨架脉冲墙(扫描中占位,与我的曲库 SkelGrid 同族)
function SkelWall() {
  const op = usePulse();
  return (
    <ScrollView>
      <View style={d.skelWall}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={{ width: '31%' } as never}>
            <Animated.View style={[d.skel, { opacity: op }]} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// 分区 rail 加载占位(round=歌手圆)
function SkelRail({ round }: { round?: boolean }) {
  const op = usePulse();
  return (
    <View style={{ flexDirection: 'row', gap: SP.lg }}>
      {[0, 1, 2, 3, 4].map(i => (
        <Animated.View key={i} style={{ width: IS_HD ? 96 : 78, aspectRatio: 1, borderRadius: round ? 999 : 10, backgroundColor: 'rgba(255,255,255,.055)', opacity: op }} />
      ))}
    </View>
  );
}

// 歌曲区加载占位
function SkelList() {
  const op = usePulse();
  return (
    <View style={{ gap: SP.lg }}>
      {[44, 56, 44, 44, 62].map((h, i) => (
        <Animated.View key={i} style={{ height: h, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.055)', opacity: op }} />
      ))}
    </View>
  );
}

// 404/错态退场卡(详情页共用)
function ErrBack({ err }: { err: string }) {
  const nav = useNavigation() as { goBack: () => void };
  return (
    <View style={d.emptyWrap}>
      <Icon name="shield" size={28} color={C.text3} />
      <Text style={d.emptyT1}>{err}</Text>
      <Text style={d.emptyT2}>入口已自动移除，获得授权后会重新出现</Text>
      <TouchableOpacity style={d.retryBtn} onPress={() => nav.goBack()}><Text style={d.retryText}>返回</Text></TouchableOpacity>
    </View>
  );
}

// ── 专辑详情 ──
// [老板 1011 11:20] 全墙路由页:「查看全部」与其他页同模式(路由跳转)——原第④⑤段原地展开 rail 小卡突变墙大卡=「样式突变卡片变大」根因;排版与其他页对齐
export function PublicLibWallRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { kind: 'albums' | 'artists' } } }).route;
  const kind = route.params.kind === 'artists' ? 'artists' : 'albums';
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const wallBasis = IS_HD ? '18%' : '23%'; // 1028 回稳:useGridBasis 的 onLayout setState 重排触发 React removeChild 崩(老板 07:01 报错实证)——回写死百分比,自适应走纯 CSS
  const [items, setItems] = useState<(LibAlbum | LibArtist)[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [werr, setWerr] = useState<string | null>(null); // [老板 1011 11:57] 首帧 null 崩溃修复配套:加载失败显错误不空白
  useEffect(() => { setActiveLib('public'); return () => setActiveLib(undefined); }, []);
  const PAGE_W = IS_HD ? 100 : 50; // 与主页同档分页
  const load = (reset = false) => {
    if (busy) return;
    setWerr(null);
    const offset = reset ? 0 : items?.length || 0;
    setBusy(true);
    const req = kind === 'albums'
      ? pubLib.albums('newest', PAGE_W, offset).then(r => ({ list: r.albums as (LibAlbum | LibArtist)[], total: r.total }))
      : pubLib.artists(offset, PAGE_W).then(r => ({ list: r.artists as (LibAlbum | LibArtist)[], total: r.total }));
    req.then(({ list, total }) => {
      setItems(p => offset === 0 ? list : [...(p || []), ...list.filter(x => !(p || []).some(y => y.id === x.id))]);
      setTotal(total);
    }).catch(e => setWerr((e as Error).message || '加载失败')).finally(() => setBusy(false));
  };
  useEffect(() => { load(); /* mount 首载 */ }, []);
  const enterAlbumW = (a: LibAlbum) => nav.navigate('PublicLibAlbum', { id: a.id, name: a.name, cover: a.coverFile });
  const enterArtistW = (a: LibArtist) => nav.navigate('PublicLibArtist', { id: a.id, name: a.name });
  return (
    <View style={d.screen}>
      <PageHeader title={kind === 'albums' ? '全部专辑' : '全部歌手'} />
      {/* [老板 1011 11:57] 首帧守卫:items==null 一律 spinner/错误(原 null&&busy 首帧走内容分支→null.map 崩溃→导航被吞=「点击无反应」根因) */}
      {items == null ? (
        werr ? <ErrBack err={werr} /> : <View style={{ padding: 24 }}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          {kind === 'albums' ? (
            <View style={[d.wallSec, IS_HD && d.wallSecHD, { marginHorizontal: 16 }]}>
              {(items as LibAlbum[]).map(a => (
                <DiscCard key={a.id} name={a.name} count={a.songCount}
                  sub={a.artist} cover={a.coverFile ? coverUrl(a.coverFile, 'public') : null}
                  unknown={!a.coverFile} onPress={() => enterAlbumW(a)} />
              ))}
            </View>
          ) : (
            <View style={[d.cwall, { marginHorizontal: 16 }]}>
              {(items as LibArtist[]).map(a => (
                <View key={a.id} style={{ width: wallBasis }}>
                  <ArtistCircle a={a} fill onPress={() => enterArtistW(a)} />
                </View>
              ))}
            </View>
          )}
          <LoadMore busy={busy} shown={items?.length || 0} total={total} onMore={() => load()} unit={kind === 'albums' ? '张专辑' : '位歌手'} />
        </ScrollView>
      )}
    </View>
  );
}

export function PublicLibAlbumRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { id: string; name: string; cover?: string | null } } }).route;
  const { id, name, cover } = route.params;
  const { playSong } = usePlayer();
  const entry = usePubEntry();
  const [album, setAlbum] = useState<LibAlbum | null>(null);
  const [songs, setSongs] = useState<LibSong[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setActiveLib('public'); return () => setActiveLib(undefined); }, []);
  useEffect(() => {
    setSongs(null); setErr(null);
    pubLib.album(id).then(r => { setAlbum(r.album); setSongs(r.songs); }).catch(e => setErr((e as Error).message));
  }, [id]);
  const play = async (i: number) => {
    if (!songs?.length) return;
    const items = songs.map(pubToSongItem);
    await playSong(items[i], items);
  };
  return (
    <View style={d.screen}>
      <PageHeader title={name || '专辑'} />
      {err ? <ErrBack err={err} /> : !songs ? (
        <View style={{ padding: 24 }}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          <View style={d.albHead}>
            <DiscCard name={name} cover={cover ? coverUrl(cover, 'public') : null} unknown={!cover} onPress={undefined} fixedWidth={IS_HD ? CARD.rail.hd : CARD.rail.phone} />
            <View style={{ flex: 1, minWidth: 0 } as never}>
              <Text style={d.albName} numberOfLines={2}>{name}</Text>
              <Text style={d.albSub} numberOfLines={1}>{album?.artist}{album?.byDir ? ' · 文件夹分组' : ''} · {songs.length} 首 · 公共曲库</Text>
              {songs.length ? <TouchableOpacity style={d.playAll} onPress={() => play(0)}><Icon name="play" size={12} color="#04120a" /><Text style={d.playAllT}>播放全部</Text></TouchableOpacity> : null}
            </View>
          </View>
          {songs.map((s, i) => (
            <SongRow key={s.id} song={s} idx={i} lib="public" sourceName={pubSourceName(s, entry.summary)} onPress={() => play(i)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── 歌手详情 ──
export function PublicLibArtistRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { id: string; name: string } } }).route;
  const { id, name } = route.params;
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const entry = usePubEntry();
  const [data, setData] = useState<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setActiveLib('public'); return () => setActiveLib(undefined); }, []);
  useEffect(() => {
    setData(null); setErr(null);
    pubLib.artist(id).then(r => setData(r)).catch(e => setErr((e as Error).message));
  }, [id]);
  const play = async (i: number) => {
    if (!data?.songs.length) return;
    const items = data.songs.map(pubToSongItem);
    await playSong(items[i], items);
  };
  return (
    <View style={d.screen}>
      <PageHeader title={name || '歌手'} />
      {err ? <ErrBack err={err} /> : !data ? (
        <View style={{ padding: 24 }}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          <View style={d.albHead}>
            <DiscCard name={name} round cover={data.artist.coverFile ? coverUrl(data.artist.coverFile, 'public') : null} unknown={!data.artist.coverFile} onPress={undefined} fixedWidth={IS_HD ? CARD.rail.hd : CARD.rail.phone} />
            <View style={{ flex: 1, minWidth: 0 } as never}>
              <Text style={d.albName} numberOfLines={2}>{name}</Text>
              <Text style={d.albSub} numberOfLines={1}>{data.songs.length} 首 · {data.albums.length} 专辑 · 公共曲库</Text>
              {data.songs.length ? <TouchableOpacity style={d.playAll} onPress={() => play(0)}><Icon name="play" size={12} color="#04120a" /><Text style={d.playAllT}>播放全部</Text></TouchableOpacity> : null}
            </View>
          </View>
          {data.albums.length > 1 && (
            <>
              <Text style={d.grp}>专辑</Text>
              <View style={d.wall}>
                {data.albums.map(a => (
                  <DiscCard key={a.id} name={a.name} count={a.songCount} cover={a.coverFile ? coverUrl(a.coverFile, 'public') : null} unknown={!a.coverFile}
                    sub={a.byDir ? '文件夹分组' : a.artist}
                    onPress={() => nav.navigate('PublicLibAlbum', { id: a.id, name: a.name, cover: a.coverFile })} />
                ))}
              </View>
            </>
          )}
          <Text style={d.grp}>歌曲</Text>
          {data.songs.map((s, i) => (
            <SongRow key={s.id} song={s} idx={i} lib="public" sourceName={pubSourceName(s, entry.summary)} onPress={() => play(i)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── 样式(C token;与我的曲库同族) ──
const d = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, paddingVertical: 10, paddingHorizontal: 16 },
  headBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, color: C.text, fontSize: FS.headline, fontWeight: FW.heavy },
  hdHead: { flexDirection: 'row', alignItems: 'center', gap: SP.xl, paddingHorizontal: 20, paddingVertical: 12 },
  hdBack: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  hdTitle: { flex: 1, color: C.text, fontSize: FS.h1, fontWeight: FW.heavy },
  focusRing: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 12 },
  // 扫描中横幅
  scanBar: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface2 },
  scanT: { color: C.text2, fontSize: FS.body },
  // 空态/错态
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP.md, paddingHorizontal: 40, paddingVertical: 60 },
  emptyT1: { color: C.text, fontSize: FS.lg, fontWeight: FW.bold, marginTop: 4 },
  emptyT2: { color: C.text3, fontSize: FS.body, lineHeight: 17, textAlign: 'center', maxWidth: 230 },
  retryBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7, marginTop: 8 },
  retryText: { color: C.text2, fontSize: FS.md, fontWeight: FW.bold },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.lg, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface2 },
  errT: { flex: 1, color: C.danger, fontSize: FS.body },
  // ④专辑展开墙(在 LibraryHome wrap 内,免水平 padding;DiscCard 自带列基分档)
  wallSec: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl, paddingTop: 2, paddingBottom: 8 },
  wallSecHD: { gap: SP.wide },
  // ⑤歌手展开圆墙(useGridBasis 列基)
  cwall: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl, paddingTop: 2, paddingBottom: 8 },
  // ⑤歌手行列表(≤8)→ [批次1] 统一件 ArtistRow(样式随局部版退役)
  rows: { gap: SP.md },
  artInit: { color: C.brandText, fontSize: FS.headline, fontWeight: FW.bold },
  randName: { color: C.text, fontSize: FS.sm, lineHeight: 14, fontWeight: FW.semibold },
  acName: { color: C.text, fontSize: FS.body, lineHeight: 16, fontWeight: FW.semibold, textAlign: 'center', maxWidth: '100%' },
  randSub: { color: C.text3, fontSize: FS.xs, lineHeight: 12 }, // 参考 MediaLibsScreen st.artistInitial
  artInitBig: { fontSize: FS.display },
  // rail 卡文字
  railNameT: { color: C.text, fontSize: FS.body, lineHeight: 16, fontWeight: FW.semibold, maxWidth: IS_HD ? 96 : 78 },
  railSubT: { color: C.text3, fontSize: FS.xs, lineHeight: 13, maxWidth: IS_HD ? 96 : 78 },
  // ⑥搜索框(探索页 searchBox 同族)
  searchBox: { height: 44, borderRadius: 22, backgroundColor: C.searchPill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: SP.lg },
  searchBoxHD: { backgroundColor: C.surface2 },
  searchInput: { flex: 1, color: C.text, fontSize: FS.md, padding: 0 },
  searchClear: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  // 分页/加载
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 8, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: C.stroke },
  moreT: { color: C.text2, fontSize: FS.md, fontWeight: FW.bold },
  moreWrap: { padding: 18, alignItems: 'center' },
  endT: { color: C.text3, fontSize: FS.sm, textAlign: 'center', paddingVertical: 14 },
  // 骨架
  skelWall: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl, padding: 16, paddingBottom: 24 },
  skel: { aspectRatio: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.055)' },
  // 详情(路由页沿用,双区退役不影响)
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl, padding: 16, paddingBottom: 24 },
  albHead: { flexDirection: 'row', gap: SP.wide, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  albName: { color: C.text, fontSize: FS.headline, fontWeight: FW.heavy, lineHeight: 23 },
  albSub: { color: C.text3, fontSize: FS.body, marginTop: 4 },
  grp: { color: C.text3, fontSize: FS.sm, letterSpacing: 1, marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
  playAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.sm, backgroundColor: C.brand, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 10, alignSelf: 'flex-start' as never },
  playAllT: { color: C.onBrand, fontSize: FS.md, fontWeight: FW.bold },
});
