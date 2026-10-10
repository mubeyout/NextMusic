// PublicLibraryScreen —— 公共曲库(LEO v2.2 规格④ · App 侧)
// 浏览页:专辑/歌手/歌曲三视图(复用我的曲库墙/行组件 DiscCard/SongRow),分页 50(phone)/100(HD) 增量加载;
// 歌曲副行标源名(v2.2 多源:歌.sourceName → summary.sources 映射 → 留位不显);
// 扫描中(summary.scan.running)=「管理员更新中」骨架屏占位;
// 404 铁律:任何内容端点 404 → 入口移除+清缓存(onPub404)+本页退场空态;播放走 lib=public 现有 custom 路径
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, useWindowDimensions, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { HDTouch } from '../hd/HDTouch';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { PageHeader } from '../components/PageChrome';
import { toast } from '../components/Dialog';
import { HeroPair, HomeSection, RailCard, ChipsRow } from '../components/LibraryHome'; // ⑤/⑦ 全库首页化骨架
import { AzIndex, azGroup, useAzJump } from '../components/AzIndex'; // ⑤-4 A-Z 字母索引条
import { usePlayer } from '../state/PlayerProvider';
import { coverUrl, setActiveLib, type LibSong, type LibAlbum, type LibArtist } from '../services/myLibrary';
import { pubLib, pubCheck, pubToSongItem, pubSourceName, pubSrcName, usePubEntry } from '../services/publicLibrary';
import { DiscCard, SongRow } from './MyLibraryScreen';

const IS_WEB = Platform.OS === 'web';
// TV 判定(UA)与 HD flavor 分离:桌面 web=HD flavor 双区形态(spec③≥900),TV 顶部胶囊
const IS_TV = IS_WEB && typeof navigator !== 'undefined' && /Android TV|levision|SmartTV|WebOS|BRAVIA|AFT/i.test(navigator.userAgent);

type Tab = 'albums' | 'artists' | 'songs';
const TABS: { key: Tab; label: string; icon: 'music' | 'user' | 'wave' }[] = [
  { key: 'albums', label: '专辑', icon: 'music' },
  { key: 'artists', label: '歌手', icon: 'user' },
  { key: 'songs', label: '歌曲', icon: 'wave' },
];

// ── 浏览页 ──
export function PublicLibraryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { playSong } = usePlayer();
  const { width, height: winH } = useWindowDimensions();
  const entry = usePubEntry();
  const summary = entry.summary;
  const scan = summary?.scan;
  const davWide = IS_WEB && width >= 900 && !IS_TV;
  const recBasis = width >= 1100 ? '23.5%' : width >= 720 ? '31.5%' : '48.6%'; // [老板 1010 自适应] 封面网格列数随窗宽:宽4列/中3列/窄2列
  const row2Wide = width >= 900; // row2 双栏阈值(窄窗上下堆叠,不再按形态硬切)
  const PAGE = IS_HD ? 100 : 50; // ④分页 50/100

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

  const [tab, setTab] = useState<Tab>('albums');
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

  // ⑤-4 A-Z 字母索引条:专辑/歌手墙按首字母分块(分页数据分组;跳转覆盖已加载页,未加载字母不可达)
  const { scrollRef: azScroll, regH: azRegH, jumpSeq: azJumpSeq } = useAzJump();

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

  // 首次进 tab 懒加载(授权+非扫描中才拉)
  useEffect(() => {
    if (!entry.authorized || scan?.running) return;
    if (tab === 'albums' && albums === null && !albumsBusy) loadAlbums(true);
    if (tab === 'artists' && artists === null && !artistsBusy) loadArtists(true);
    if (tab === 'songs' && songs === null && !songsBusy) loadSongs(PAGE);
  }, [tab, entry.authorized, scan?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (list: LibSong[] | null | undefined, idx: number) => {
    if (!list?.length) return;
    const items = list.map(pubToSongItem);
    await playSong(items[Math.min(idx, items.length - 1)], items);
  };

  const doRefresh = () => {
    pubCheck(true);
    if (tab === 'albums') loadAlbums(true);
    if (tab === 'artists') loadArtists(true);
    if (tab === 'songs') { setSongSize(PAGE); loadSongs(PAGE); }
  };

  // ── ⑤/⑦ 全库首页化:库头横幅+快捷动作+最近添加横滑+分类入口(渐进色裹,列表逻辑不动) ──
  const [randBusy, setRandBusy] = useState(false);
  const [srcFilter, setSrcFilter] = useState('all'); // ⑤-A3 筛选 chips:多源时按源筛选(全部/源名)
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

  // [老板 1010 对齐 LEO 设计] 播放全部:当前源筛选下可见列表整队播放(与云曲库同款主动作)
  const playAll = () => {
    if (!songs?.length) { toast('库内还没有歌曲'); return; }
    const list = srcFilter === 'all' ? songs : songs.filter(s => (s as LibSong & { source?: string }).source === srcFilter);
    if (!list.length) { toast('当前筛选下没有歌曲'); return; }
    void play(list, 0);
  };

  const enterAlbum = (a: LibAlbum) => nav.navigate('PublicLibAlbum', { id: a.id, name: a.name, cover: a.coverFile });
  const enterArtist = (a: LibArtist) => nav.navigate('PublicLibArtist', { id: a.id, name: a.name });

  // ⑤/⑦ 首页化内容分区:最近添加横滑(albums newest 复用)+分类入口四宫格(专辑/歌手/歌曲/随机播放);
  // 热门 Top10 未做——服务端播放计数端点未暴露(pubLib 仅 recent/random,⑦.3-v2 不硬造)
  const recentAlbums = (albums || []).slice(0, IS_HD ? 12 : 10);
  // [二波①] 源数据:名字表(summary.sources id→name)+健康近似(scan 成功=全绿,lastError=暖)
  const srcEntries = Object.entries(summary?.sources || {});
  const srcTotal = srcEntries.length;
  const srcOk = scan?.lastError ? Math.max(0, srcTotal - 1) : srcTotal; // v1 近似:无逐源健康端点,scan 错误=减一,待服务端补字段
  const agoText = scan?.syncedAt ? (() => { const m = Math.floor((Date.now() - scan.syncedAt) / 60000); if (m < 60) return `${m || 1} 分钟前`; const h = Math.floor(m / 60); if (h < 24) return `${h} 小时前`; return `${Math.floor(h / 24)} 天前`; })() : '';
  const homeStats = scan && typeof scan.songs === 'number'
    ? `${scan.songs.toLocaleString()} 首 · ${scan.albums ?? 0} 专辑 · ${scan.artists ?? 0} 歌手${agoText ? ` ｜ 最近更新 ${agoText} · 官方共享` : ''}`
    : '管理员共享曲库';
  const songsCount = scan && typeof scan.songs === 'number' ? scan.songs.toLocaleString() : String(songs?.length || 0); // [1010] 宫格计数
  // [二波①] 源筛选复用既有 srcFilter(L134);组件级 srcChips 供页顶常驻行(songs 体内有局部同名表,作用域隔离)
  const srcChips = [{ key: 'all', label: '全部' }, ...srcEntries.map(([id, name]) => ({ key: id, label: `仅${pubSrcName(name, id)}` }))];
  const weekNew = songs ? songs.filter(s => s.mtime && Date.now() - s.mtime < 7 * 86400000).length : 0; // [三次对稿] phead sub=本周新增(基准稿)
  // [老板 1010 二次对稿] 首页内嵌歌曲列表:未加载时轻拉首页份量(songs tab 有独立分页加载;deps 在状态声明后求值安全)
  useEffect(() => {
    if (entry.authorized && !scan?.running && !err && songs === null) loadSongs(PAGE);
  }, [entry.authorized, scan?.running, err, songs]);
  const homeBlock = entry.authorized ? (
    <View style={{ gap: 12, marginBottom: 4 }}>
      <View style={[d.homeWrap, IS_HD && d.homeWrapHD]}>
        {/* [v5.5 1010] v3 双渐变英雄卡(统计在卡内)+双入口真播放;刷新收 duo.more;横幅+动作行退役 */}
        <HeroPair
          heroes={[
            {
              grad: 'blue', big: '播放全部', icon: 'play',
              st: scan && typeof scan.songs === 'number'
                ? <><Text style={{ fontWeight: '800' }}>{scan.songs.toLocaleString()} 首</Text>{` · 专辑 ${scan.albums ?? 0} · 歌手 ${scan.artists ?? 0}`}</>
                : '管理员共享曲库',
              mini: [srcTotal > 0 ? `${srcOk}/${srcTotal} 源正常` : null, agoText ? `最近更新 ${agoText}` : null].filter(Boolean).join(' · ') || undefined,
              onPress: playAll, disabled: !songs?.length || !!scan?.running,
            },
            {
              grad: 'sunset', big: '随机播放', icon: 'shuffle',
              st: <>整库随机 · <Text style={{ fontWeight: '800' }}>换个口味</Text></>,
              mini: scan && typeof scan.songs === 'number' ? `从 ${scan.songs.toLocaleString()} 首中发现遗珠` : undefined,
              onPress: playRandom, disabled: randBusy || !!scan?.running,
            },
          ]}
        />
      </View>
      {!scan?.running && !err ? (
        <View style={[d.homeWrap, IS_HD && d.homeWrapHD, { marginBottom: 0 }]}>
          {/* [老板 1010] v5.6 按稿:row2 双栏——左(最近更新网格+分类浏览) 右(最近更新榜侧卡);phone 堆叠 */}
          <View style={[d.row2, !row2Wide && { flexDirection: 'column' }]}>
          <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
          {recentAlbums.length ? (
            <HomeSection title="最近更新" actionLabel="全部专辑" onAction={() => setTab('albums')}>
              {songs && songs.length ? (
                <Text style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>
                  本周新增 {songs.filter(s => s.mtime && Date.now() - s.mtime < 7 * 86400000).length} 首
                </Text>
              ) : null}
              {/* [三次对稿] 基准稿 cgrid repeat(4,1fr):四列等分网格(HD/web)——卡=方形封面+名+歌手·首数;phone 两列 */}
              <View style={d.recGrid}>
                {recentAlbums.map(a => (
                  <View key={a.id} style={{ flexBasis: recBasis }}>
                    {IS_HD ? (
                      <HDTouch style={{ width: '100%' }} focusStyle={d.tabFocus} onPress={() => enterAlbum(a)}>
                        <RecAlbumCard a={a} />
                      </HDTouch>
                    ) : (
                      <TouchableOpacity style={{ width: '100%' }} activeOpacity={0.8} onPress={() => enterAlbum(a)}>
                        <RecAlbumCard a={a} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </HomeSection>
          ) : null}
          {/* [三次对稿] 基准稿歌曲区=表头+表行式(标题/专辑/时长列,小行高) */}
          <HomeSection title="歌曲" count={typeof scan?.songs === 'number' ? scan.songs : undefined} actionLabel="全部 ›" onAction={() => setTab('songs')}>
            {srcTotal > 1 ? (
              <View style={{ marginBottom: 8 }}>
                <ChipsRow chips={srcChips} active={srcFilter} onChange={k => setSrcFilter(k)} />
              </View>
            ) : null}
            <View style={d.lhead}><View style={{ width: 34 }} /><Text style={[d.lhT, { flex: 1 }]}>标题</Text><Text style={[d.lhT, { width: 110 }]}>专辑</Text><Text style={[d.lhT, d.lhR, { width: 40 }]}>时长</Text></View>
            {(srcFilter === 'all' ? songs || [] : (songs || []).filter(s => (s as LibSong & { source?: string }).source === srcFilter)).slice(0, 8).map((s, i) => (
              <TouchableOpacity key={s.id} style={d.lrow} activeOpacity={0.75} onPress={() => play(srcFilter === 'all' ? songs : (songs || []).filter(x => (x as LibSong & { source?: string }).source === srcFilter), i)}>
                <View style={[d.lcov, { backgroundColor: C.surface2 }]}><Icon name="music" size={13} color={C.text3} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={d.ln} numberOfLines={1}>{s.name}</Text>
                  <Text style={d.la2} numberOfLines={1}>{s.singer || '未知歌手'}</Text>
                </View>
                <Text style={d.lal} numberOfLines={1}>{s.album || '—'}</Text>
                <Text style={d.ldu}>{s.interval || ''}</Text>
              </TouchableOpacity>
            ))}
          </HomeSection>
          </View>
          {/* [LEO 裁定 1010] Top10 降级=最近更新榜:右侧栏(side5 形态,phone 整行) */}
          {songs && songs.length ? (() => {
            const topList = [...songs].filter(s => s.mtime).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 10);
            if (!topList.length) return null;
            return (
              <View style={[d.topCard, row2Wide && d.topCardSide]}>
                <Text style={d.topCardT}>最近更新榜</Text>
                {topList.map((s, i) => (
                  <TouchableOpacity key={s.id} style={d.topRow} activeOpacity={0.75} onPress={() => void play(topList, i)}>
                    <Text style={[d.topNo, i > 2 && d.topNoDim]}>{i + 1}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={d.topName} numberOfLines={1}>{s.name}</Text>
                      <Text style={d.topArtist} numberOfLines={1}>{s.singer || '未知歌手'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })() : null}
          </View>
        </View>
      ) : null}
    </View>
  ) : null;

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
    if (tab === 'albums') {
      if (albums === null) return <SkelWall />;
      const azA = azGroup(albums, a => a.name); // 分组键=专辑名首字母
      return (
        <View style={{ flex: 1 }}>
          <ScrollView ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
            {azA.chunks.map(ch => (
              <View key={ch.letter} onLayout={azRegH('alb:' + ch.letter)}>
                <Text style={d.azGrp}>{ch.letter} · {ch.items.length}</Text>
                <View style={[d.wall, IS_HD && d.wallHD, d.wallIn]}>
                  {ch.items.map(a => (
                    <DiscCard key={a.id} name={a.name} count={a.songCount}
                      sub={`${a.artist}${a.byDir ? ' · 文件夹分组' : ''}`}
                      cover={a.coverFile ? coverUrl(a.coverFile, 'public') : null}
                      unknown={!a.coverFile}
                      onPress={() => enterAlbum(a)} />
                  ))}
                </View>
              </View>
            ))}
            <LoadMore busy={albumsBusy} shown={albums.length} total={albumsTotal} onMore={() => loadAlbums()} unit="张专辑" />
          </ScrollView>
          {azA.letters.length > 1 ? <AzIndex letters={azA.letters} onPick={l => azJumpSeq(azA.letters.map(x => 'alb:' + x), 'alb:' + l)} /> : null}
        </View>
      );
    }
    if (tab === 'artists') {
      if (artists === null) return <SkelWall round />;
      const azR = azGroup(artists, a => a.name); // 分组键=歌手名首字母
      return (
        <View style={{ flex: 1 }}>
          <ScrollView ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
            {azR.chunks.map(ch => (
              <View key={ch.letter} onLayout={azRegH('art:' + ch.letter)}>
                <Text style={d.azGrp}>{ch.letter} · {ch.items.length}</Text>
                <View style={[d.wall4, IS_HD && d.wall4HD, d.wallIn]}>
                  {ch.items.map(a => (
                    <DiscCard key={a.id} name={a.name} round count={a.albumCount}
                      sub={`${a.songCount} 首`}
                      cover={a.coverFile ? coverUrl(a.coverFile, 'public') : null}
                      unknown={a.name === '未知歌手'}
                      onPress={() => enterArtist(a)} />
                  ))}
                </View>
              </View>
            ))}
            <LoadMore busy={artistsBusy} shown={artists.length} total={artistsTotal} onMore={() => loadArtists()} unit="位歌手" />
          </ScrollView>
          {azR.letters.length > 1 ? <AzIndex letters={azR.letters} onPick={l => azJumpSeq(azR.letters.map(x => 'art:' + x), 'art:' + l)} /> : null}
        </View>
      );
    }
    // songs(⑤:源筛选 chips+NEW 标;播放上下文=筛选后可见列表)
    if (songs === null) return <SkelWall />;
    const srcChips = [
      { key: 'all', label: '全部' },
      ...Object.entries(summary?.sources || {}).map(([k, v]) => ({ key: k, label: pubSrcName(v, k) })), // [1010 崩溃修复] v 可能是对象——pubSrcName 归一,回退 key
    ];
    const shownSongs = srcFilter === 'all' ? songs : songs.filter(s => (s as LibSong & { source?: string }).source === srcFilter);
    // [老板 1010 对齐设计] 全部歌曲 A-Z 索引:按歌名首字母分块(复用专辑/歌手同款 AzIndex+跳转)
    const azS = azGroup(shownSongs.map((s, i) => ({ s, i })), x => x.s.name);
    return (
      <View style={{ flex: 1 }}>
        <ScrollView ref={azScroll} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
            <ChipsRow chips={srcChips} active={srcFilter} onChange={setSrcFilter} />
          </View>
          {azS.chunks.map(ch => (
            <View key={ch.letter} onLayout={azRegH('sng:' + ch.letter)}>
              <Text style={d.azGrp}>{ch.letter} · {ch.items.length}</Text>
              {ch.items.map(({ s, i }) => (
                <SongRow key={s.id} song={s} idx={i + 1} lib="public" sourceName={pubSourceName(s, summary)} isNew={isNewSong(s)}
                  onPress={() => play(shownSongs, i)} />
              ))}
            </View>
          ))}
          {songs.length >= songSize && songSize < 200 ? (
            <TouchableOpacity style={d.moreBtn} activeOpacity={0.8}
              onPress={() => { const n = Math.min(songSize + PAGE, 200); setSongSize(n); loadSongs(n); }}>
              {songsBusy ? <ActivityIndicator size="small" color="#04120a" /> : <Text style={d.moreT}>加载更多</Text>}
            </TouchableOpacity>
          ) : (
            <Text style={d.endT}>{shownSongs.length ? `${shownSongs.length} 首` : '没有匹配的歌曲'}</Text>
          )}
        </ScrollView>
        {azS.letters.length > 1 ? <AzIndex letters={azS.letters} onPick={l => azJumpSeq(azS.letters.map(x => 'sng:' + x), 'sng:' + l)} /> : null}
      </View>
    );
  };

  const statsLine = scan && typeof scan.songs === 'number'
    ? `${scan.songs.toLocaleString()} 首 · ${scan.albums ?? 0} 专辑 · ${scan.artists ?? 0} 歌手`
    : entry.authorized ? '管理员共享曲库' : '';

  return (
    <View style={[d.screen, { paddingTop: insets.top }]}>
      {IS_HD ? (
        <View style={d.hdHead}>
          <HDTouch style={d.hdBack} onPress={() => nav.goBack()} focusStyle={d.focusRing} hasTVPreferredFocus>
            <Icon name="back" size={17} color={C.text2} />
          </HDTouch>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={d.hdTitle}>公共曲库</Text>
              <View style={[d.pheadDot, { backgroundColor: !scan ? C.text3 : scan.lastError ? '#E8B33D' : C.brand }]} />
              <Text style={d.pheadDotT}>{srcTotal > 0 ? `${srcOk}/${srcTotal} 源正常` : ''}</Text>
            </View>
            <Text style={d.pheadSub} numberOfLines={1}>{weekNew > 0 ? `本周新增 ${weekNew} 首 · ` : ''}官方共享</Text>
          </View>
          <HDTouch style={d.hdBack} onPress={doRefresh} focusStyle={d.focusRing}>
            <Icon name="refresh" size={16} color={C.text2} />
          </HDTouch>
        </View>
      ) : (
        <View style={d.head}>
          <TouchableOpacity style={d.headBtn} onPress={() => nav.goBack()}><Icon name="back" size={16} color={C.text2} /></TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={d.headTitle}>公共曲库</Text>
              <View style={[d.pheadDot, { backgroundColor: !scan ? C.text3 : scan.lastError ? '#E8B33D' : C.brand }]} />
              <Text style={d.pheadDotT}>{srcTotal > 0 ? `${srcOk}/${srcTotal} 源正常` : ''}</Text>
            </View>
            <Text style={d.pheadSub} numberOfLines={1}>{weekNew > 0 ? `本周新增 ${weekNew} 首 · ` : ''}官方共享</Text>
          </View>
          <TouchableOpacity style={d.headBtn} onPress={doRefresh}>
            <Icon name="refresh" size={15} color={C.text2} />
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} nestedScrollEnabled>
        {/* [老板 1010 16:25] 外层滚动修复:homeBlock 增高后 tab 区被挤出一屏外;tab 区限高保内滚(A-Z 跳转不坏) */}
        {homeBlock}
        {davWide ? (
        /* 桌面双区:左竖 tab+右内容(与我的曲库同构) */
        <View style={[d.wideCols, { height: Math.max(420, winH - 150) }]}>
          <View style={d.wideSide}>
            <Text style={d.sideCap}>{summary?.name || '公共曲库'}</Text>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} style={[d.wtab, tab === t.key && d.wtabOn]} onPress={() => setTab(t.key)}>
                <Icon name={t.icon} size={15} color={tab === t.key ? C.text : C.text2} />
                <Text style={[d.wtabT, tab === t.key && d.wtabTOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: 'auto' as never }}>
              <Text style={d.sideCap}>{statsLine}</Text>
            </View>
          </View>
          <View style={d.wideMain}>{body()}</View>
        </View>
      ) : (
        <>
          <View style={d.tabs}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: IS_HD ? 30 : 16, paddingVertical: 4 }}>
              {TABS.map(t => (
                IS_HD ? (
                  <HDTouch key={t.key} style={[d.tab, tab === t.key && d.tabOn]} focusStyle={d.tabFocus} onPress={() => setTab(t.key)}>
                    <Text style={[d.tabText, tab === t.key && d.tabTextOn]}>{t.label}</Text>
                  </HDTouch>
                ) : (
                  <TouchableOpacity key={t.key} style={[d.tab, tab === t.key && d.tabOn]} onPress={() => setTab(t.key)} activeOpacity={0.75}>
                    <Text style={[d.tabText, tab === t.key && d.tabTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                )
              ))}
            </ScrollView>
          </View>
          <View style={{ height: Math.max(420, winH - 170) }}>{body()}</View>
        </>
      )}
      </ScrollView>
    </View>
  );
}

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

// 骨架脉冲(与我的曲库 SkelGrid 同族)
function SkelWall({ round }: { round?: boolean }) {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(op, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <ScrollView>
      <View style={[d.wall, round && { gap: 14 }]}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={{ width: '31%' } as never}>
            <Animated.View style={[d.skel, round && { borderRadius: 999 }, { opacity: op }]} />
          </View>
        ))}
      </View>
    </ScrollView>
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
            <DiscCard name={name} cover={cover ? coverUrl(cover, 'public') : null} unknown={!cover} onPress={undefined} fixedWidth={IS_HD ? 150 : 116} />
            <View style={{ flex: 1, minWidth: 0 } as never}>
              <Text style={d.albName} numberOfLines={2}>{name}</Text>
              <Text style={d.albSub} numberOfLines={1}>{album?.artist}{album?.byDir ? ' · 文件夹分组' : ''} · {songs.length} 首 · 公共曲库</Text>
              {songs.length ? <TouchableOpacity style={d.playAll} onPress={() => play(0)}><Icon name="play" size={12} color="#04120a" /><Text style={d.playAllT}>播放全部</Text></TouchableOpacity> : null}
            </View>
          </View>
          {songs.map((s, i) => (
            <SongRow key={s.id} song={s} idx={i + 1} lib="public" sourceName={pubSourceName(s, entry.summary)} onPress={() => play(i)} />
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
            <DiscCard name={name} round cover={data.artist.coverFile ? coverUrl(data.artist.coverFile, 'public') : null} unknown={!data.artist.coverFile} onPress={undefined} fixedWidth={IS_HD ? 150 : 116} />
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
            <SongRow key={s.id} song={s} idx={i + 1} lib="public" sourceName={pubSourceName(s, entry.summary)} onPress={() => play(i)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── 样式(与我的曲库同族 token) ──
// [三次对稿] 基准稿 .cv 专辑卡:方形封面+名+歌手·首数(四列网格内,width 100% 填满单元格)
function RecAlbumCard({ a }: { a: LibAlbum }) {
  return (
    <View style={{ width: '100%' }}>
      {a.coverFile ? (
        <Image source={{ uri: coverUrl(a.coverFile, 'public') }} style={d.recArt} />
      ) : (
        <View style={[d.recArt, { backgroundColor: C.artTint2, alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name="music" size={22} color={C.text3} />
        </View>
      )}
      <Text style={d.recT} numberOfLines={1}>{a.name}</Text>
      <Text style={d.recS} numberOfLines={1}>{a.artist || '未知'} · {a.songCount} 首</Text>
    </View>
  );
}

const d = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  // ⑤/⑦ 首页化骨架容器与四宫格
  homeWrap: { marginHorizontal: 16, gap: 12 },
  homeWrapHD: { marginHorizontal: 30 },
  homeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  homeGridHD: { gap: 10 },
  homeCell: { width: '48.6%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  homeCellT: { color: C.text, fontSize: 12.5, fontWeight: '600' },
  // [LEO 裁定 1010] 最近更新榜侧卡(基准稿 side5 形态:金字号/歌名/歌手)
  row2: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  recGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  recCell: { flexBasis: '23.5%' }, // [三次对稿] 基准稿四列等分(repeat(4,1fr) 减 gap 余量)
  recCellP: { flexBasis: '48.6%' }, // phone 两列
  recArt: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.surface2 },
  recT: { color: C.text, fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  recS: { color: C.text3, fontSize: 10.5, marginTop: 2 },
  pheadDotT: { color: C.brand, fontSize: 11, fontWeight: '600' }, // [三次对稿] dot 旁文字(基准稿 .dot 带文字)
  topCardSide: { width: 250, flexShrink: 0 },
  topCard: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.stroke, padding: 16 },
  topCardT: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  topRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  topNo: { width: 16, fontSize: 12.5, fontWeight: '800', color: '#F0C75E', textAlign: 'center' },
  topNoDim: { color: C.text3, fontWeight: '700' },
  topName: { color: C.text, fontSize: 12.5, fontWeight: '600' },
  topArtist: { color: C.text3, fontSize: 10, marginTop: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  headBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  headStats: { flex: 1, color: C.text3, fontSize: 10.5, textAlign: 'right', marginRight: 2 },
  hdHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  pheadDot: { width: 8, height: 8, borderRadius: 4 }, // [老板 1010 二次对稿] v5.6 phead 源状态点(绿/暖/灰)
  pheadSub: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 1 },
  // [三次对稿] 表头+表行式歌曲列表(基准稿 listhead/srow)
  lhead: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 26, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.stroke },
  lhT: { color: C.text3, fontSize: 10.5, fontWeight: '600', letterSpacing: 1 },
  lhR: { textAlign: 'right' },
  lrow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  lcov: { width: 34, height: 34, borderRadius: 6, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  ln: { color: C.text, fontSize: 13, fontWeight: '600' },
  la2: { color: C.text3, fontSize: 10.5, marginTop: 1 },
  lal: { color: C.text3, fontSize: 11.5, width: 110 },
  ldu: { color: C.text3, fontSize: 11, width: 40, textAlign: 'right' },
  hdBack: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  hdTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  hdStats: { flex: 1, color: C.text3, fontSize: 11, textAlign: 'right', marginRight: 2 },
  focusRing: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 12 },
  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  tab: { borderRadius: 999, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'transparent' },
  tabOn: { backgroundColor: C.brand, borderColor: C.brand },
  tabText: { color: C.text2, fontSize: 12 },
  tabTextOn: { color: '#04120a', fontWeight: '700' },
  tabFocus: { borderColor: C.brand, borderWidth: 2 },
  // 桌面双区
  wideCols: { flex: 1, flexDirection: 'row' },
  wideSide: { width: 198, borderRightWidth: 1, borderRightColor: C.strokeFaint, padding: 16, gap: 2 },
  wtab: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  wtabOn: { backgroundColor: 'rgba(30,215,96,.11)' },
  wtabT: { color: C.text2, fontSize: 13 },
  wtabTOn: { color: C.text, fontWeight: '700' },
  sideCap: { color: C.text3, fontSize: 10.5, lineHeight: 16 },
  wideMain: { flex: 1, padding: 20 },
  // 墙
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, paddingBottom: 24 },
  wallHD: { gap: 18, padding: 30, paddingBottom: 30 },
  wall4: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 16, paddingBottom: 24 },
  wall4HD: { gap: 20, padding: 30, paddingBottom: 30 },
  // ⑤-4 字母分块墙:块内标题+紧凑纵向(块间节奏由块内 padding 承担)
  azGrp: { color: C.text3, fontSize: 11, letterSpacing: 1.2, marginHorizontal: 16, marginTop: 12 },
  wallIn: { paddingTop: 2, paddingBottom: 16 },
  skel: { aspectRatio: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.055)' },
  // 分页
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 10, marginBottom: 8, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: C.stroke },
  moreT: { color: C.text2, fontSize: 12.5, fontWeight: '700' },
  moreWrap: { padding: 18, alignItems: 'center' },
  endT: { color: C.text3, fontSize: 10.5, textAlign: 'center', paddingVertical: 14 },
  // 扫描中横幅
  scanBar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface2 },
  scanT: { color: C.text2, fontSize: 12 },
  // 空态/错态
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingVertical: 60 },
  emptyT1: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  emptyT2: { color: C.text3, fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 230 },
  retryBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7, marginTop: 8 },
  retryText: { color: C.text2, fontSize: 12.5, fontWeight: '700' },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface2 },
  errT: { flex: 1, color: '#E8618C', fontSize: 12 },
  // 详情
  albHead: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  albName: { color: C.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  albSub: { color: C.text3, fontSize: 11.5, marginTop: 4 },
  grp: { color: C.text3, fontSize: 11, letterSpacing: 1, marginHorizontal: 16, marginTop: 14, marginBottom: 6 },
  playAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.brand, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 10, alignSelf: 'flex-start' as never },
  playAllT: { color: '#04120a', fontSize: 12.5, fontWeight: '700' },
});
