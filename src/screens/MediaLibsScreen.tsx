// 第三方媒体库：Emby / Jellyfin / Subsonic(Navidrome·道理鱼) / WebDAV / 听风
// 管理页：账号卡片列表（v3.31 重设计：克制卡+行尾 ⋯ 菜单，去长按暗门）；浏览页：连接后是【一个综合页面】——
// [老板 1010·按源定制] 拒绝同一个模板：emby/jf=媒体服务器富布局(英雄卡+最新入库+专辑墙/艺人圆墙)·
// subsonic 系=导航式精简(专辑墙/歌曲前置+3 真实能力芯片)·听风=网易云风(搜索+推荐歌单横滑墙+新歌速递+排行榜入口行)；WebDAV 目录浏览不变
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, type ViewStyle, ScrollView, TouchableOpacity, Image, ActivityIndicator, Dimensions, Animated, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C, CARD, FS, FW, SP } from '../theme/tokens';
import { Platform } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { CloudLibCard } from './CloudLibraryScreen'; // spec③:云曲库入口卡(登录后渲染)
import { useApp } from '../state/AppState';
import { pubCheck, usePubEntry } from '../services/publicLibrary'; // ④公共曲库系统库置顶条目
import { ActionSheet } from '../components/ActionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { SongRow } from '../components/SongRow';
import { ArtistRow } from '../components/ArtistRow'; // [批次1] 歌手行统一件(替 st.artistRow/bv.row 自造行)
import { PlaylistRow } from '../components/PlaylistRow'; // [批次1] 歌单行统一件(替 st.plRow 自造行)
import { toast, dialog } from '../components/Dialog';
import { dropdownMenu, isDropdownPlatform, type MenuAnchor } from '../components/DropdownMenu';
import { PageHeader, EmptyState } from '../components/PageChrome';
import { LibBanner, LibActions, HeroPair, type LibHero, type HeroGrad } from '../components/LibraryHome'; // ⑦.3-v2 壳统一 + [v5.6 1010] HeroPair 英雄卡对(第三方页源身份卡+duo 入口行)
import { GUTTER, focus, pageBottom } from '../hd/hdstyle'; // v3.28:统一栅格/焦点环/播放条让位
import { usePlayer } from '../state/PlayerProvider';
import { library } from '../state/library';
import { enqueueDownload, downloads as dlStore } from '../services/downloads';
import {
  providers, providerApi, PROVIDER_META, PROTOCOL, embyAlbumArtFill,
  type ProviderAcct, type ProviderType, type PvArtist, type PvAlbum, type PvPlaylist,
} from '../services/providers';
import { localLib, checkLocalLib, type LocalLibConfig } from '../services/localLibrary';
import { useSlbEntries, slbRefresh } from '../services/serverLocalLibrary'; // [web]本地曲库(服务器侧目录,升级稿 §二)
import type { SongItem } from '../services/server';
import { useHoverCard } from '../hd/hdweb';
import { GridWall } from '../components/GridWall';
import { DiscCard } from './MyLibraryScreen'; // [老板 1011 15:49] 专辑卡统一件
import { PvCard } from '../components/PvCard'; // [老板 1011 16:15] 歌单卡统一件(共享化)

// 有品牌 logo 的类型用 BrandIcon，其余回退语义图标
// v3: 媒体库 icon 一律 BrandIcon(品牌图标一一对应)

function AcctGlyph({ type, size = 20 }: { type: ProviderType; size?: number }) {
  // v3(老板):媒体库 icon 一律 BrandIcon(五类型品牌图标一一对应;TYPE_ICON 死分支删除)
  return <BrandIcon name={type as never} size={size} />;
}

// 触点抽象:HD 用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: (e?: unknown) => void; onLongPress?: () => void; disabled?: boolean; children?: React.ReactNode } & Record<string, unknown>) {
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

export function MediaLibsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string, p?: object) => void };
  const { token } = useApp(); // spec③:云曲库入口登录后才渲染(connected+token 同 SourcesAccountScreens 登录态口径)
  const [accts, setAccts] = useState<ProviderAcct[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null); // web hover 门控（原生无 hover 常驻）
  const [testId, setTestId] = useState<string | null>(null);

  const refresh = useCallback(() => setAccts(providers.all()), []);
  // ②本机曲库行(含失效态 v3 A5:灰置+danger 状态点+副文案+行内重新选择)
  const [locLibs, setLocLibs] = useState<LocalLibConfig[]>([]);
  const [locBad, setLocBad] = useState<Record<string, boolean>>({});
  // [web]本地曲库行(服务器侧目录;有库才显示行,同 APK 模式——共享库 unlocked 即可浏览)
  const serverLibs = useSlbEntries().filter(e => !e.locked);
  // ④公共曲库系统库置顶条目(官方徽标·不可删;未授权/开关关→完全不渲染)
  const pub = usePubEntry();
  const pubVisible = pub.authorized && pub.showEntry;
  const refreshLocals = useCallback(() => {
    const list = localLib.all();
    setLocLibs(list);
    list.forEach(l => {
      checkLocalLib(l).then(ok => setLocBad(b => (b[l.id] === !ok ? b : { ...b, [l.id]: !ok })));
    });
  }, []);
  useEffect(refresh, []);
  // 从 ProviderEdit 保存/删除返回时刷新列表（屏幕停留挂载不会重走 mount）
  useFocusEffect(useCallback(() => { refresh(); refreshLocals(); pubCheck(); slbRefresh(); }, [refresh, refreshLocals]));

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
  const menuItems = (a: ProviderAcct) => [
    { label: '测试连接', onPress: () => testConn(a) },
    { label: '编辑', onPress: () => nav.navigate('ProviderEdit', { acctId: a.id }) },
    { label: '删除', danger: true, onPress: () => dialog.confirm('删除媒体库', `确定删除「${a.name || PROVIDER_META[a.type].label}」吗？已导入的歌单不受影响。`, () => { providers.remove(a.id); refresh(); }) },
  ];
  const openMenu = (a: ProviderAcct) => {
    dialog.menu(a.name || PROVIDER_META[a.type].label, menuItems(a));
  };
  // lx169:web/桌面 ⋯ 改锚定下拉(需传入按钮位置);phone 维持底部 ActionSheet,HD 维持居中弹窗
  const openMenuFor = (a: ProviderAcct, anchor?: MenuAnchor) => {
    if (anchor && isDropdownPlatform()) { dropdownMenu(anchor, menuItems(a)); return; }
    openMenu(a);
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
        {/* v3.2(老板 0927):三段式分组重设计——我的曲库(本机+云)/公共曲库/第三方媒体库;原「我的曲库」入口卡与云曲库指向同一服务器空间,撤并 */}
        <Text style={[ml.sectionHead, IS_HD && ml.sectionHeadHD, { marginTop: 4 }]}>我的曲库</Text>
        <View style={[ml.group, IS_WEB && ml.groupWeb]}>
        {/* ②本机曲库行:与第三方媒体库同卡同流程;失效=灰置+denger 点+重新选择(点击整卡进编辑恢复) */}
            {locLibs.map(l => {
              const bad = !!locBad[l.id];
              const locMenu = () => dialog.menu(l.name, [
                { label: '编辑配置', onPress: () => nav.navigate('LocalLibEdit', { libId: l.id }) },
                { label: '删除库', danger: true, onPress: () => dialog.confirm('删除本机曲库', `确定删除「${l.name}」吗？仅移除扫描记录，不删除设备上的音乐文件。`, () => { localLib.remove(l.id); refreshLocals(); }) },
              ]);
              return (
                <PressCard
                  key={l.id}
                  style={[ml.card, IS_HD && ml.cardHD, bad && { opacity: 0.55 }]}
                  hoverStyle={ml.cardHover}
                  onPress={() => bad ? nav.navigate('LocalLibEdit', { libId: l.id }) : nav.navigate('LocalLibBrowse', { libId: l.id })}
                  onLongPress={IS_WEB ? undefined : locMenu}
                >
                  <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><Icon name="folder-music" size={IS_HD ? 32 : 26} color={C.brandText} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={ml.titleRow}>
                      <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>{l.name}</Text>
                      <View style={ml.typeChip}><Text style={ml.typeChipText}>本机</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: bad ? C.text3 : C.brand }} />
                      <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>
                        {bad ? '目录不可用（SD 卡拔出/目录被移除）' : `正常 · ${l.rootLabel || '本机目录'}${l.trackCount ? ` · ${l.trackCount} 首` : ' · 未扫描'}`}
                      </Text>
                    </View>
                  </View>
                  {bad ? (
                    <T style={ml.repickBtn} hitSlop={6} onPress={() => nav.navigate('LocalLibEdit', { libId: l.id })}>
                      <Text style={ml.repickText}>重新选择</Text>
                    </T>
                  ) : (
                    <T style={[ml.menuBtn, IS_HD && ml.menuBtnHD]} hitSlop={6} onPress={locMenu}>
                      <Icon name="more" size={IS_HD ? 20 : 17} color={C.text2} />
                    </T>
                  )}
                  <Icon name="chevronright" size={IS_HD ? 22 : 18} color={C.text3} />
                </PressCard>
              );
            })}
            {/* [web] 本地曲库行(服务器侧目录;有库才显示行,同 APK 模式)——浏览/播放走 lib 路由,管理进 ServerLocalLib */}
            {IS_WEB ? serverLibs.map(l => (
              <PressCard
                key={'slb-' + l.id}
                style={[ml.card, IS_HD && ml.cardHD]}
                hoverStyle={ml.cardHover} tvFocus
                onPress={() => nav.navigate('ServerLocalLib', { libId: l.id })}
              >
                <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><Icon name="folder-music" size={IS_HD ? 32 : 26} color={C.brandText} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={ml.titleRow}>
                    <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>{l.name}</Text>
                    <View style={ml.typeChip}><Text style={ml.typeChipText}>服务器</Text></View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.trackCount ? C.brand : C.text3 }} />
                    <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>
                      {l.trackCount ? `就绪 · ${l.trackCount.toLocaleString()} 首 · 服务器目录` : '未扫描 · 服务器目录'}
                    </Text>
                  </View>
                </View>
                <Icon name="chevronright" size={IS_HD ? 22 : 18} color={C.text3} />
              </PressCard>
            )) : null}
            {/* [web] T1 入口卡:空态「绑定服务器目录」三步引导(升级稿 §二 T1 步1) */}
            {IS_WEB && !serverLibs.length ? (
              <PressCard
                style={[ml.card, IS_HD && ml.cardHD]}
                hoverStyle={ml.cardHover} tvFocus
                onPress={() => nav.navigate('ServerLocalLib', {})}
              >
                <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><Icon name="folder-music" size={IS_HD ? 32 : 26} color={C.brandText} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={ml.titleRow}>
                    <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>绑定服务器目录</Text>
                  </View>
                  <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>本地曲库 · 绑定目录 → 扫描入库 → 开始听歌</Text>
                </View>
                <Icon name="add" size={IS_HD ? 20 : 17} color={C.brand} />
              </PressCard>
            ) : null}
          {/* spec③:云曲库入口卡(登录后渲染)——我的曲库组第二成员 */}
          {token ? <CloudLibCard onEnter={() => nav.navigate('CloudLibrary', {})} /> : null}
          {!locLibs.length && !serverLibs.length && !token && !IS_WEB ? (
            <Text style={[st.intro, IS_HD && hd.intro]}>登录后可开启云曲库，或点右上角 ＋ 添加本机曲库。</Text>
          ) : null}
        </View>
        {/* ④公共曲库行(官方徽标 shield·不可删无⋯菜单;未授权不渲染) */}
        {pubVisible ? (
          <>
          <Text style={[ml.sectionHead, IS_HD && ml.sectionHeadHD]}>公共曲库</Text>
          <View style={[ml.group, IS_WEB && ml.groupWeb]}>
          <PressCard style={[ml.card, IS_HD && ml.cardHD]} hoverStyle={ml.cardHover} tvFocus
            onPress={() => nav.navigate('PublicLibrary', {})}>
            <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><Icon name="library" size={IS_HD ? 32 : 26} color={C.brandText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={ml.titleRow}>
                <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>{pub.summary?.name || '公共曲库'}</Text>
                <View style={[ml.typeChip, { flexDirection: 'row', alignItems: 'center', gap: SP.xs }]}>
                  <Icon name="shield" size={9} color={C.brandText} />
                  <Text style={ml.typeChipText}>官方</Text>
                </View>
              </View>
              <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>
                {pub.summary?.scan?.running ? '管理员更新中 · 完成后自动展示' : pub.summary?.scan && typeof pub.summary.scan.songs === 'number' ? `${pub.summary.scan.songs.toLocaleString()} 首 · 管理员共享` : '管理员共享的公共曲库'}
              </Text>
            </View>
            <Icon name="chevronright" size={IS_HD ? 22 : 18} color={C.text3} />
          </PressCard>
          </View>
          </>
        ) : null}
        {/* 第三方媒体库组 */}
        <Text style={[ml.sectionHead, IS_HD && ml.sectionHeadHD]}>第三方媒体库</Text>
        {accts.length === 0 ? (
          <EmptyState icon="server" title="还没有第三方媒体库" sub="点右上角 ＋ 接入 Plex / 飞牛 / 群晖 / Emby / Navidrome / WebDAV / 听风 等 11 种平台" />
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
                  onHoverOut={IS_WEB ? () => setHoverId(null) : undefined}                >
                  <View style={[ml.iconWrap, IS_HD && ml.iconWrapHD]}><AcctGlyph type={a.type} size={IS_HD ? 32 : 26} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={ml.titleRow}>
                      <Text style={[ml.title, IS_HD && ml.titleHD]} numberOfLines={1}>{a.name || label}</Text>
                      <View style={ml.typeChip}><Text style={ml.typeChipText}>{label}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.brand }} />
                      <Text style={[ml.sub, IS_HD && ml.subHD]} numberOfLines={1}>已连接 · {a.base}</Text>
                    </View>
                  </View>
                  {testId === a.id ? <ActivityIndicator size="small" color={C.brand} style={ml.spin} /> : null}
                  {/* lx167:⋯ 菜单常驻——原先 web 靠 hover 浮出,HD/桌面/触屏无 hover 等于没有管理入口 */}
                  <T style={[ml.menuBtn, IS_HD && ml.menuBtnHD]} hitSlop={6} onPress={e => {
                    // lx169:web/桌面锚定下拉;phone/HD 走原 dialog.menu
                    const ne = (e as unknown as { nativeEvent?: { pageX?: number; pageY?: number } })?.nativeEvent;
                    if (IS_WEB && ne && typeof ne.pageX === 'number' && typeof ne.pageY === 'number') {
                      openMenuFor(a, { x: ne.pageX - 32, y: ne.pageY - 16, w: 32, h: 32 });
                    } else {
                      openMenu(a);
                    }
                  }}>
                    <Icon name="more" size={IS_HD ? 20 : 17} color={C.text2} />
                  </T>
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

// ---------- [v5.6 1010·LEO 基准稿v5.6] 第三方单源页 v5 静态能力表 ----------
// 从 providers.ts / providers-v2.ts 各引擎实际接线推导(streamFor/streamOf·transcodeFor·scrobble·playlists·Items/Latest):
// 批5a:相似电台(similarFor)+收藏打星(favorite)已接 subsonic系+emby/jf(听风/WebDAV/v2 族无对应 API 恒 dim);进度同步=ABS 专有且 v1 未接(dim);最新入库=emby/jf Items/Latest 原生
interface PvCaps {
  link: boolean;      // 万能取链(streamFor/streamOf 已接)
  transcode: boolean; // 服务端转码(transcodeFor:emby/jf 转码流·subsonic 系限码率)
  radio: boolean;     // 相似电台
  star: boolean;      // 收藏打星
  scrobble: boolean;  // 播放上报(scrobble?id= / PlayedItems+Sessions)
  playlist: boolean;  // 歌单同步(playlists() 已接)
  progress: boolean;  // 进度同步(ABS 专有,v1 未接)
  latest: boolean;    // 最新入库端点(Items/Latest)
  albums: boolean; artists: boolean; // 维度 tabs 显隐
}
type DimKey = 'songs' | 'albums' | 'artists' | 'lists'; // [老板 1010] 只留真实维度键;收藏/文件夹/电台无端点恒死,死键直接删
// [老板 1010·按源定制] 分源布局:PROTOCOL 映射分流,不改路由结构——
// media=emby/jf 媒体服务器富布局 · lean=subsonic 系导航式精简 · netease=听风网易云风 · generic=v2 族保持通用维度 tabs(daoliyu/plex 等后续批)
type PvLayout = 'media' | 'lean' | 'netease' | 'generic';
function pvLayoutOf(t: ProviderType): PvLayout {
  const p = PROTOCOL[t];
  if (p === 'emby' || p === 'jellyfin') return 'media';
  if (p === 'subsonic') return 'lean';
  if (p === 'tingfeng') return 'netease';
  return 'generic';
}
const PV_CAPS: Record<ProviderType, PvCaps> = {
  // 六已接源(增量批1)
  emby:     { link: true, transcode: true,  radio: true,  star: true,  scrobble: true,  playlist: true,  progress: false, latest: true,  albums: true,  artists: true },
  jellyfin: { link: true, transcode: true,  radio: true,  star: true,  scrobble: true,  playlist: true,  progress: false, latest: true,  albums: true,  artists: true },
  subsonic: { link: true, transcode: true,  radio: true,  star: true,  scrobble: true,  playlist: true,  progress: false, latest: false, albums: true,  artists: true },
  navidrome:{ link: true, transcode: true,  radio: true,  star: true,  scrobble: true,  playlist: true,  progress: false, latest: false, albums: true,  artists: true },
  webdav:   { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: false, progress: false, latest: false, albums: false, artists: false },
  tingfeng: { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: true,  progress: false, latest: false, albums: false, artists: false },
  // 后续批(Songloft/群晖/飞牛/道理鱼/ABS 等;接线以 providers-v2 现状为准,待后续批拉齐)
  plex:           { link: true, transcode: false, radio: false, star: false, scrobble: true,  playlist: true, progress: false, latest: false, albums: true, artists: true },
  audiobookshelf: { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: true, progress: false, latest: false, albums: true, artists: true },
  audiostation:   { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: true, progress: false, latest: false, albums: true, artists: true },
  mstream:        { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: true, progress: false, latest: false, albums: true, artists: true },
  songloft:       { link: true, transcode: false, radio: false, star: false, scrobble: true,  playlist: true, progress: false, latest: false, albums: true, artists: true },
  feiniu:         { link: true, transcode: false, radio: false, star: false, scrobble: false, playlist: true, progress: false, latest: false, albums: true, artists: true },
  daoliyu:        { link: true, transcode: false, radio: false, star: false, scrobble: true,  playlist: true, progress: false, latest: false, albums: true, artists: true },
};
// [老板 1010·按源定制] 能力芯片键序(渲染按布局分流,见组件内 chips):
// lean 只留真实接线位(相似电台/收藏打星/转码限码率,删不 dim)·media 全量但转码 dim(直流用户无感)+进度芯片删(ABS 专属)·
// netease 不渲染芯片条(网易云风无能力条)·generic 只渲染已接芯片(死芯片不显示)
const CAP_KEYS: { key: 'link' | 'transcode' | 'radio' | 'star' | 'scrobble' | 'playlist'; label: string }[] = [
  { key: 'link', label: '万能取链' },
  { key: 'transcode', label: '服务端转码' },
  { key: 'radio', label: '相似电台' },
  { key: 'star', label: '收藏打星' },
  { key: 'scrobble', label: '播放上报' },
  { key: 'playlist', label: '歌单同步' },
];
// [批5a] 音质档按钮组(基准稿 qrow):v=kbps 传引擎限码率(subsonic maxBitRate / emby·jf audioBitRate);末档=无损(原始流直出)
// 仅服务端转码能力源(caps.transcode:emby/jf/subsonic系)渲染——WebDAV/听风/v2 族无端点不显,不亮不造假
const PV_QUALITIES: { label: string; v?: number }[] = [
  { label: '128', v: 128 },
  { label: '192', v: 192 },
  { label: '256', v: 256 },
  { label: '320', v: 320 },
  { label: '无损' },
];
// 品牌渐变映射(HERO_GRADS 已扩品牌档;plex=金复用 gold;未映射源回退 blue)
const BRAND_HERO_GRAD: Partial<Record<ProviderType, HeroGrad>> = {
  emby: 'emby', jellyfin: 'jellyfin', navidrome: 'navidrome', subsonic: 'subsonic',
  webdav: 'webdav', tingfeng: 'tingfeng', plex: 'gold',
};
// 源健康点配色(同 LibStatus 三态:正常 brand/延迟 warn/断连 danger)
const PV_STATUS_COLOR: Record<string, string> = { ok: C.brand, warn: '#E8B33D', bad: '#D94D45' };

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
  // [v5.6 1010] 维度 tabs 当前项(songs/albums/artists/lists;收藏/文件夹/电台=后续批能力,本批恒灰)
  const [dimTab, setDimTab] = useState<DimKey>('albums');
  // [v5.6 1010] 最新入库(Items/Latest):仅 emby/jf 引擎有此端点(能力表驱动);拉不到不渲染副卡,不造假数据
  const [latest, setLatest] = useState<SegState<PvAlbum[]>>({ data: null, err: null, busy: false });
  // [批5a] 账号级音质档重渲染钟摆(档位真身存 ProviderAcct.quality,qrow 点选落盘后 setQSel 触发重读 acct)
  const [, setQSel] = useState<number | undefined>(undefined);
  // [老板 1010·听风重规划] 源内搜索(netease 布局专属·真端点 netease/search):关键词/结果/最近一次搜索词
  const [tfKw, setTfKw] = useState('');
  const [tfLastKw, setTfLastKw] = useState('');
  const [tfRes, setTfRes] = useState<SegState<SongItem[]>>({ data: null, err: null, busy: false });

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
    setLatest({ data: null, err: null, busy: false });
    setTfKw(''); setTfLastKw(''); setTfRes({ data: null, err: null, busy: false });
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
  // [v5.6 1010] 最新入库:Items/Latest(JF 谱系原生端点;能力表 latest=true 才拉);失败静默(副卡不渲染),旧数据保留
  const loadLatest = (a: ProviderAcct, force = false) => {
    if (!PV_CAPS[a.type].latest) return;
    setLatest(s => (s.data || s.busy ? (force ? { ...s, busy: true } : s) : { ...s, busy: true }));
    const root = a.root || (a.type === 'emby' ? `${a.base.trim().replace(/\/+$/, '')}/emby` : a.base.trim().replace(/\/+$/, ''));
    const q = a.token ? `&api_key=${encodeURIComponent(a.token)}` : ''; // query token:web 端 <img> 带不了 header,同既有封面 URL 先例
    fetch(`${root}/Users/${a.userId}/Items/Latest?IncludeItemTypes=MusicAlbum&Limit=12${q}`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(async (d: unknown) => {
        const items = (Array.isArray(d) ? d : ((d as { Items?: Record<string, unknown>[] }).Items || [])) as Record<string, unknown>[];
        const list: PvAlbum[] = items.filter(it => !/\.(mp4|mkv|avi|ts|mov|flv|webm|m2ts|wmv)$/i.test(String(it.Name || ''))).map(it => ({ // [老板 1011 15:57] 视频伪专辑过滤
            id: String(it.Id), name: String(it.Name || ''),
            artist: it.AlbumArtist ? String(it.AlbumArtist)
              : (Array.isArray(it.Artists) && (it.Artists as unknown[]).length ? String((it.Artists as unknown[])[0]) : undefined),
            songCount: it.ChildCount ? Number(it.ChildCount) : undefined,
            year: it.ProductionYear ? Number(it.ProductionYear) : undefined,
            cover: (it.ImageTags as Record<string, string> | undefined)?.Primary
              ? `${root}/Items/${it.Id}/Images/Primary?maxWidth=300${q}` : undefined,
        }));
        await embyAlbumArtFill(a, list); // [老板 1011 11:35] 缺封面→专辑内首曲嵌入图兜底
        setLatest({ data: list, err: null, busy: false });
      })
      .catch(e => setLatest(s => (s.data ? s : { data: null, err: (e as Error).message, busy: false })));
  };

  // 听风无专辑/艺术家概念：歌曲=新歌速递；歌单数组含 liked:/recent:/mine:/pl:/top: 五类
  const isTf = acct?.type === 'tingfeng';

  // 综合页：进入即并行加载全部分区（loadXxx 自带缓存短路；各分区独立错误处理）
  useEffect(() => {
    if (!acct || isDav) return;
    if (!isTf) { loadAlbums(acct); loadArtists(acct); }
    loadSongs(acct); loadLists(acct); loadLatest(acct);
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
    setQSel(undefined); // [批5a] 音质档随账号切换重读(acct.quality 渲染时取真值)
    resetAll();
    setExpanded({});
  };

  const refreshSongs = () => { if (acct) loadSongs(acct); };

  // [老板 1010·听风重规划] 源内搜索:真端点 netease/search(只跟听风引擎);清空即收起结果
  const runTfSearch = () => {
    const kw = tfKw.trim();
    if (!kw || !acct) return;
    setTfLastKw(kw);
    setTfRes({ data: null, err: null, busy: true });
    providerApi.search(acct, kw)
      .then(d => setTfRes({ data: d, err: null, busy: false }))
      .catch(e => setTfRes({ data: null, err: (e as Error).message, busy: false }));
  };
  const clearTfSearch = () => { setTfKw(''); setTfLastKw(''); setTfRes({ data: null, err: null, busy: false }); };

  // ⑦.3-v2:整库刷新(重置分区缓存后重拉)+源健康状态点(全部分区失败=断连/部分失败=延迟/正常)
  const refreshAll = () => {
    if (!acct) return;
    if (!isTf) { setAlbums({ data: null, err: null, busy: false }); setArtists({ data: null, err: null, busy: false }); loadAlbums(acct); loadArtists(acct); }
    setLists({ data: null, err: null, busy: false }); loadLists(acct); loadSongs(acct);
    setLatest({ data: null, err: null, busy: false }); loadLatest(acct, true);
  };
  const pvStatus = (albums.err && artists.err && songs.err) || (isTf && songs.err && lists.err) ? 'bad'
    : albums.err || artists.err || songs.err || lists.err ? 'warn' : 'ok';

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

  // ---------- [v5.6 1010] 第三方页 v5 头区派生值:能力表/品牌渐变/英雄卡对/维度 tabs(统计=既有 SegState 真值) ----------
  const caps = PV_CAPS[acct.type];
  const brandLabel = PROVIDER_META[acct.type].label;
  const heroGrad: HeroGrad = BRAND_HERO_GRAD[acct.type] || 'blue';
  const statusWord = pvStatus === 'ok' ? '连接正常' : pvStatus === 'warn' ? '连接波动' : '连接异常';

  // duo 双入口真播放(songs 队列:播放全部原序/随机播放洗牌)——仅第三方页保留入口行(v5.6 老板令)
  const playProviderAll = () => {
    const d = songs.data || [];
    if (!d.length) { toast('库里还没有歌曲'); return; }
    playSong(d[0], d);
  };
  const playProviderShuffle = () => {
    const d = songs.data || [];
    if (!d.length) { toast('库里还没有歌曲'); return; }
    const sh = [...d];
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    playSong(sh[0], sh);
  };

  // [批5a] 相似电台:长按专辑卡/艺人行/最新入库卡 或歌曲菜单「相似电台」——引擎 similarFor
  // (subsonic getSimilarSongs2·getTopSongs 回退 / emby·jf InstantMix·Artists/Similar 回退)→playSong 队列;失败 toast 不造假
  const playRadio = (id: string, name: string, kind: 'song' | 'album' | 'artist', artistName?: string) => {
    if (!acct || !caps.radio || !id) return;
    toast(`正在生成「${name}」相似电台…`);
    providerApi.similarFor(acct, id, { kind, artistName })
      .then(q => { if (q.length) { playSong(q[0], q); toast(`相似电台已开播 · ${q.length} 首`); } else toast('服务器没有返回相似歌曲'); })
      .catch(e => toast(`相似电台失败：${(e as Error).message}`));
  };
  // [批5a] 源侧收藏打星:subsonic star/unstar · emby/jf FavoriteItems;songmid=pid:itemId 解析回源账号;成功 toast
  const pvFavToggle = (s: SongItem) => {
    const [spid, iid] = String(s.songmid ?? '').split(':');
    if (!acct || !iid) return;
    const ta = providers.get(spid) || acct;
    if (!PV_CAPS[ta.type].star) return;
    const on = (s as { pvFav?: boolean }).pvFav !== true; // 已收藏→取消
    providerApi.favorite(ta, iid, on)
      .then(() => { toast(on ? `已收藏到「${ta.name || PROVIDER_META[ta.type].label}」` : '已取消收藏'); setActSong(null); })
      .catch(e => toast(`收藏失败：${(e as Error).message}`));
  };

  // 主卡统计(真实数据:emby/jf 列表端点上限 300、subsonic 系 200,贴满显 + 不吹总数)
  const songTotal = (albums.data || []).reduce((n, al) => n + (al.songCount || 0), 0);
  const listCap = acct.type === 'emby' || acct.type === 'jellyfin' ? 300 : 200;
  const fmtCap = (n: number, cap: number) => (n >= cap ? `${n}+` : String(n));
  const heroStats: React.ReactNode = isTf
    ? (lists.data ? `歌单 ${lists.data.length} · 新歌 ${songs.data?.length ?? 0} 首` : '统计读取中…')
    : albums.data != null || artists.data != null
      ? (<>{songTotal > 0 ? <><Text style={pv.heroStB}>{songTotal.toLocaleString()} 首</Text>{' · '}</> : null}{`专辑 ${fmtCap(albums.data?.length || 0, listCap)} · 艺人 ${fmtCap(artists.data?.length || 0, listCap)}`}</>)
      : (albums.err && artists.err ? '统计暂不可用' : '统计读取中…');

  // 英雄卡对:主卡=源身份卡(品牌渐变+真实统计+连接 mini+播放钮,点击=播放全部);副卡=violet 最新入库(有 Latest 数据才渲染)
  const heroes: LibHero[] = [{
    grad: heroGrad,
    big: acct.name && acct.name !== brandLabel ? `${brandLabel} · ${acct.name}` : brandLabel,
    st: heroStats,
    mini: `${statusWord}${acct.user ? ` · ${acct.user}` : ''} · ${acct.base}`,
    icon: 'play',
    onPress: playProviderAll,
    disabled: !songs.data?.length,
  }];
  if (latest.data?.length) {
    heroes.push({
      grad: 'violet', big: '最新入库', icon: 'play',
      st: <>最近入库 <Text style={pv.heroStB}>{latest.data.length} 张专辑</Text></>,
      mini: latest.data[0]?.name ? `新到《${latest.data[0].name}》 · Items/Latest 端点` : 'Items/Latest 端点 · 实时',
      onPress: () => {
        const first = latest.data?.[0];
        if (!first) return;
        providerApi.albumSongs(acct, first.id)
          .then(ss => { if (ss.length) playSong(ss[0], ss); else toast('这张专辑还没有歌曲'); })
          .catch(e => toast(`取歌失败：${(e as Error).message}`));
      },
    });
  }

  const pvLayout = pvLayoutOf(acct.type); // [老板 1010·按源定制] 布局分流:media/lean/netease/generic
  // 维度 tabs(按源能力;count=SegState 真值) [老板 1010] 死键(收藏/文件夹/电台=恒灰)删除不渲染;
  // lean(subsonic 系)导航式精简=高频前置(专辑墙/歌曲在先);netease(听风)不渲染 tabs——网易云风分区纵排
  const dimDefs: { key: DimKey; label: string; on: boolean; count?: string }[] = pvLayout === 'lean' ? [
    { key: 'albums', label: '专辑', on: caps.albums, count: albums.data ? fmtCap(albums.data.length, listCap) : undefined },
    { key: 'songs', label: '歌曲', on: true, count: songs.data ? String(songs.data.length) : undefined },
    { key: 'artists', label: '艺人', on: caps.artists, count: artists.data ? fmtCap(artists.data.length, listCap) : undefined },
    { key: 'lists', label: '歌单', on: caps.playlist, count: lists.data ? String(lists.data.length) : undefined },
  ] : [
    { key: 'songs', label: isTf ? '新歌' : '歌曲', on: true, count: songs.data ? String(songs.data.length) : undefined },
    { key: 'albums', label: '专辑', on: caps.albums, count: albums.data ? fmtCap(albums.data.length, listCap) : undefined },
    { key: 'artists', label: '艺人', on: caps.artists, count: artists.data ? fmtCap(artists.data.length, listCap) : undefined },
    { key: 'lists', label: '歌单', on: caps.playlist, count: lists.data ? String(lists.data.length) : undefined },
  ];
  const dimOk = (k: DimKey) => (k === 'songs' ? true : k === 'albums' ? caps.albums : k === 'artists' ? caps.artists : k === 'lists' ? caps.playlist : false);
  const dim = dimOk(dimTab) ? dimTab : (caps.albums ? 'albums' : 'lists'); // 切账号后当前维度不可用时回退默认

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
          {/* ⑦.3-v2 壳统一:品牌 logo 横幅+连接状态点+快捷动作(内容=目录型 B 层能力:文件夹为主,不硬造热门/流派) */}
          <View style={{ gap: SP.xl, marginBottom: 8 }}>
            <LibBanner kind="provider" name={acct.name || 'WebDAV'} sub={acct.base}
              status={davErr ? 'bad' : davBusy ? 'warn' : 'ok'}
              stats={davBusy ? '读取中' : davErr ? '连接失败' : `${davDirs.length} 个文件夹 · ${davSongs.length} 首`}
              brand={<AcctGlyph type={acct.type} size={IS_HD ? 30 : 22} />} />
            <LibActions actions={[
              { icon: 'refresh', label: '刷新', onPress: () => void davLoad(), disabled: davBusy },
              { icon: 'settings', label: '连接设置', onPress: () => nav.navigate('ProviderEdit', { acctId: acct.id }) },
              ...(davSongs.length && !davSelMode ? [{ icon: 'play' as const, label: '播放全部', primary: true, onPress: () => playSong(davSongs[0], davSongs) }] : []),
            ]} />
          </View>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[dv.crumbWrap, { flex: 1, minWidth: 0 }]} contentContainerStyle={{ gap: IS_HD ? SP.sm : SP.xs, alignItems: 'center' }}>
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
          contentContainerStyle={{ paddingHorizontal: IS_HD ? GUTTER : 20, paddingBottom: IS_HD ? pageBottom(32) : (current ? 116 : 32), gap: SP.section }} // [老板 1011 12:44] 段距统一 18(为我推荐基准;原 HD24/phone20)
        >
          {/* [v5.6 1010·LEO 基准稿] phead:品牌标+源名+账号@地址 sub+连接状态点(辉光)+右上 刷新/连接设置 */}
          <View style={pv.phead}>
            <View style={[pv.pheadLogo, IS_HD && pv.pheadLogoHD]}><AcctGlyph type={acct.type} size={IS_HD ? 30 : 24} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={pv.pheadNameRow}>
                <Text style={[pv.pheadName, IS_HD && pv.pheadNameHD]} numberOfLines={1}>{acct.name || PROVIDER_META[acct.type].label}</Text>
                <View style={[pv.dot, { backgroundColor: PV_STATUS_COLOR[pvStatus], shadowColor: PV_STATUS_COLOR[pvStatus] }]} />
              </View>
              <Text style={pv.pheadSub} numberOfLines={1}>
                {PROVIDER_META[acct.type].label}{acct.user ? ` · ${acct.user}` : ''} · {acct.base}
              </Text>
            </View>
            <T style={[pv.pheadBtn, IS_HD && pv.pheadBtnHD]} focusStyle={focus(12)} onPress={refreshAll}>
              <Icon name="refresh" size={IS_HD ? 19 : 16} color={C.text2} />
            </T>
            <T style={[pv.pheadBtn, IS_HD && pv.pheadBtnHD]} focusStyle={focus(12)} onPress={() => nav.navigate('ProviderEdit', { acctId: acct.id })}>
              <Icon name="settings" size={IS_HD ? 19 : 16} color={C.text2} />
            </T>
          </View>

          {/* 英雄卡对(仅第三方页保留 duo 入口行——英雄卡=源身份卡非动作卡):主卡=品牌渐变身份卡(真实统计+连接 mini+播放钮);副卡=violet 最新入库(有 Latest 数据才渲染) */}
          <HeroPair heroes={heroes} duo={{ playAll: playProviderAll, shuffle: playProviderShuffle, disabled: !songs.data?.length }} />

          {/* [老板 1010·听风重规划] 源内搜索框(netease 布局专属·真端点 netease/search):网易云风顶部搜索位,回车搜/×清空收起 */}
          {pvLayout === 'netease' || pvLayout === 'media' ? (
            <View style={[pv.tfSearchBar, IS_HD && pv.tfSearchBarHD]}>
              <Icon name="search" size={20} color={C.text2} />
              <TextInput
                style={pv.tfSearchInput}
                placeholder={pvLayout === 'netease' ? '搜索听风：歌名 / 歌手' : '搜索曲库：歌名 / 歌手'}
                placeholderTextColor={C.text3}
                value={tfKw}
                onChangeText={setTfKw}
                onSubmitEditing={runTfSearch}
                returnKeyType="search"
              />
              {tfKw ? (
                <T focusStyle={focus(10)} onPress={clearTfSearch} hitSlop={6}>
                  <Icon name="close" size={14} color={C.text3} />
                </T>
              ) : null}
            </View>
          ) : null}

          {/* 能力芯片 caps [老板 1010·按源定制]:netease(听风)不渲染能力条;lean(subsonic系)只留真实接线位(相似电台/收藏打星/服务端转码);media/generic 只亮已接芯片(死芯片不显示·拒绝造假) */}
          {pvLayout !== 'netease' ? (
            <View style={pv.caps}>
              {CAP_KEYS.filter(cd => (pvLayout === 'lean' ? ['radio', 'star', 'transcode'].includes(cd.key) : true) && caps[cd.key]).map(cd => (
                <View key={cd.key} style={pv.cap}>
                  <View style={[pv.capDot, { backgroundColor: C.brand }]} />
                  <Text style={[pv.capT, pv.capTOn]}>{cd.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* [批5a] 音质档 qrow(基准稿):仅服务端转码能力源显(emby/jf/subsonic系)——128/192/256/320/无损;当前档高亮,点选持久化到账号(ProviderAcct.quality),取链时引擎读取 */}
          {caps.transcode ? (
            <View style={pv.qrow}>
              <Text style={pv.qLabel}>音质档</Text>
              {PV_QUALITIES.map(t => {
                const on = acct.quality === t.v; // 缺省(undefined)=无损档
                return (
                  <T key={t.label} style={[pv.qBtn, on && pv.qBtnOn]} focusStyle={focus(10)}
                    onPress={() => { providers.save({ ...acct, quality: t.v }); setQSel(t.v); toast(t.v ? `音质档已设为 ${t.v}k · 账号级，下次取链生效` : '音质档已设为无损 · 原始流直出'); }}>
                    <Text style={[pv.qBtnT, on && pv.qBtnTOn]}>{t.label}</Text>
                  </T>
                );
              })}
            </View>
          ) : null}

          {/* 维度 tabs(按源能力;灰=该源无此维度) [老板 1010] netease(听风)不渲染——网易云风分区纵排 */}
          {pvLayout !== 'netease' && !tfLastKw ? <View style={pv.dimtabs}>
            {dimDefs.map(t => t.on ? (
              <T key={t.key} style={[pv.dimtab, IS_HD && pv.dimtabHD, dim === t.key && pv.dimtabOn]} focusStyle={focus(999)} onPress={() => setDimTab(t.key)}>
                <Text style={[pv.dimtabT, dim === t.key && pv.dimtabTOn]}>{t.label}</Text>
                {t.count ? <Text style={[pv.dimtabCnt, dim === t.key && pv.dimtabCntOn]}>{t.count}</Text> : null}
              </T>
            ) : (
              <View key={t.key} style={[pv.dimtab, IS_HD && pv.dimtabHD, pv.dimtabOff]}>
                <Text style={pv.dimtabTOff}>{t.label}</Text>
              </View>
            ))}
          </View> : null}
          {/* [老板 1011 11:49] media(emby/jf)搜索结果态:与 netease 同款,替换维度内容 */}
          {pvLayout === 'media' && tfLastKw ? (
            <View>
              <SectionHead title={`搜索「${tfLastKw}」`} actionLabel="清除返回" onAction={clearTfSearch} />
              <SegBody state={tfRes} onRetry={runTfSearch}>
                <View style={sec.songsBar}>
                  {tfRes.data?.length ? (<>
                    <Text style={sec.previewHint}>共 {tfRes.data.length} 首</Text>
                    <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                      onPress={() => { if (tfRes.data?.length) playSong(tfRes.data[0], tfRes.data); }}>
                      <Icon name="play" size={14} color={C.onBrand} />
                      <Text style={st.shuffleBtnText}>播放全部</Text>
                    </T>
                  </>) : null}
                </View>
                {(tfRes.data || []).map((s, i) => (
                  <SongRow key={`pvs-${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, tfRes.data || [])} onMore={() => setActSong(s)} />
                ))}
              </SegBody>
            </View>
          ) : isTf ? (() => {
            // 听风：providers.playlists 返回六类（liked:/recent:/dl:/mine:/pl:/top: 前缀），拆成分区
            const all = lists.data || [];
            const tfLiked = all.find(x => x.id === 'liked:');
            const tfRecent = all.find(x => x.id === 'recent:');
            const tfDl = all.find(x => x.id === 'dl:'); // [老板 1011 11:27] NAS 曲库(听风自动落库曲)
            const mine = all.filter(x => x.id.startsWith('mine:'));
            const recs = all.filter(x => x.id.startsWith('pl:'));
            const tops = all.filter(x => x.id.startsWith('top:'));
            const toDetail = (pl: PvPlaylist) => nav.navigate('ProviderDetail', {
              acctId: acct.id, kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover,
              sub: pl.songCount ? `${pl.songCount} 首` : undefined,
            });
            // [老板 1010·听风重规划] 搜索结果态:tfLastKw 非空时整页切结果区(清空返回正常分区)
            if (tfLastKw) {
              return (
                <View>
                  <SectionHead title={`搜索「${tfLastKw}」`} actionLabel="清除返回" onAction={clearTfSearch} />
                  <SegBody state={tfRes} onRetry={runTfSearch}>
                    <View style={sec.songsBar}>
                      {tfRes.data?.length ? (<>
                        <Text style={sec.previewHint}>共 {tfRes.data.length} 首</Text>
                        <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                          onPress={() => { if (tfRes.data?.length) playSong(tfRes.data[0], tfRes.data); }}>
                          <Icon name="play" size={14} color={C.onBrand} />
                          <Text style={st.shuffleBtnText}>播放全部</Text>
                        </T>
                      </>) : null}
                    </View>
                    {(tfRes.data || []).map((s, i) => (
                      <SongRow key={`tfs-${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, tfRes.data || [])} onMore={() => setActSong(s)} />
                    ))}
                  </SegBody>
                </View>
              );
            }
            return (
              <>
                {/* [v5.6] 歌单维度 tab:我的音乐/我的歌单/推荐/排行(原分区纵排收进 tab);[老板 1010] netease 布局恒显(网易云风纵排无 tabs) */}
                {(pvLayout === 'netease' || dim === 'lists') ? (<>
                {/* [老板 1011 11:57] 我的音乐:PvCard 标准规格(与推荐歌单 rail 同款卡同 gap;修间距大卡片小不统一) */}
                <View>
                  <SectionHead title="我的音乐" />
                  <GridWall>
                    {tfDl ? <PvCard fill name="NAS 曲库" cover={tfDl.cover} meta={tfDl.songCount ? `${tfDl.songCount} 首 · 自动落库` : '暂无落库歌曲'} onPress={() => toDetail(tfDl)} /> : null}
                    {tfRecent ? <PvCard fill name="最近播放" cover={tfRecent.cover} meta={tfRecent.songCount ? `${tfRecent.songCount} 首` : '—'} onPress={() => toDetail(tfRecent)} /> : null}
                    {tfLiked ? <PvCard fill name="我喜欢的音乐" cover={tfLiked.cover} meta={tfLiked.songCount ? `${tfLiked.songCount} 首` : '—'} onPress={() => toDetail(tfLiked)} /> : null}
                  </GridWall>
                </View>

                {/* 我的歌单 */}
                {mine.length ? (
                  <View>
                    <SectionHead title="我的歌单" count={mine.length} actionLabel={expanded.tfMine ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfMine: !e.tfMine }))} />
                    {expanded.tfMine ? (
                      <GridWall>
                        {mine.map(pl => (
  <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />
))}
                      </GridWall>
                    ) : (
                      <GridWall>{mine.map(pl => <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />)}</GridWall>
                    )}
                  </View>
                ) : null}

                {/* 推荐歌单 */}
                {recs.length ? (
                  <View>
                    <SectionHead title="推荐歌单" count={recs.length} actionLabel={expanded.tfRecs ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfRecs: !e.tfRecs }))} />
                    {expanded.tfRecs ? (
                      <GridWall>
                        {recs.map(pl => (
  <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />
))}
                      </GridWall>
                    ) : (
                      <GridWall>{recs.map(pl => <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} meta={pl.songCount ? `${pl.songCount} 首` : ''} onPress={() => toDetail(pl)} />)}</GridWall>
                    )}
                  </View>
                ) : null}

                {/* 排行榜 */}
                {tops.length ? (
                  <View>
                    <SectionHead title="排行榜" count={tops.length} actionLabel={expanded.tfTops ? '收起' : '全部'} onAction={() => setExpanded(e => ({ ...e, tfTops: !e.tfTops }))} />
                    {expanded.tfTops ? (
                      <GridWall>
                        {tops.map(pl => (
  <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} onPress={() => toDetail(pl)} />
))}
                      </GridWall>
                    ) : (
                      <GridWall>{tops.map(pl => <PvCard fill key={pl.id} cover={pl.cover} name={pl.name} onPress={() => toDetail(pl)} />)}</GridWall>
                    )}
                  </View>
                ) : null}
                </>) : null}

                {/* 新歌速递([v5.6] 歌曲维度 tab);[老板 1010] netease 布局恒显 */}
                {(pvLayout === 'netease' || dim === 'songs') ? (
                <View>
                  <SectionHead title="新歌速递" actionLabel="换一批" onAction={refreshSongs} />
                  <SegBody state={songs} onRetry={refreshSongs}>
                    <View style={sec.songsBar}>
                      <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                        onPress={() => { if (songs.data?.length) playSong(songs.data[0], songs.data); }}>
                        <Icon name="play" size={14} color={C.onBrand} />
                        <Text style={st.shuffleBtnText}>播放全部</Text>
                      </T>
                      {songs.data?.length ? <Text style={sec.previewHint}>共 {songs.data.length} 首</Text> : null}
                    </View>
                    {(songs.data || []).map((s, i) => (
                      <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} onMore={() => setActSong(s)} />
                    ))}
                  </SegBody>
                </View>
                ) : null}
              </>
            );
          })() : (
            <>
              {/* 歌曲([v5.6] 维度 tab):随机来点全量列表+换一批 */}
              {dim === 'songs' ? (
              <View>
                <SectionHead title="随机来点" actionLabel="换一批" onAction={refreshSongs} />
                <SegBody state={songs} onRetry={refreshSongs}>
                  <View style={sec.songsBar}>
                    <T style={st.shuffleBtn} activeOpacity={0.7} focusStyle={focus(16)}
                      onPress={() => { if (songs.data?.length) playSong(songs.data[0], songs.data); }}>
                      <Icon name="play" size={14} color={C.onBrand} />
                      <Text style={st.shuffleBtnText}>播放全部</Text>
                    </T>
                    {songs.data?.length ? <Text style={sec.previewHint}>共 {songs.data.length} 首</Text> : null}
                  </View>
                  {(songs.data || []).map((s, i) => (
                    <SongRow key={`${s.songmid}-${i}`} song={s} playing={current?.songmid === s.songmid} onPress={() => playSong(s, songs.data || [])} onMore={() => setActSong(s)} />
                  ))}
                </SegBody>
              </View>
              ) : null}

              {/* 专辑([v5.6] 维度 tab):最近入库横滑(Items/Latest 真数据,仅 emby/jf)+全量专辑墙(百分比定宽自然换行) */}
              {dim === 'albums' ? (
              <View>
                {latest.data?.length ? (
                  <View style={{ marginBottom: 4 }}>
                    <SectionHead title="最近入库" count={latest.data.length} actionLabel="换一批" onAction={() => { if (acct) loadLatest(acct, true); }} />
                    <GridWall>
                      {latest.data.map(al => (
                        <DiscCard fill key={al.id} cover={al.cover} name={al.name} count={al.songCount}
                          sub={[al.artist, al.year ? String(al.year) : null].filter(Boolean).join(' · ') || undefined}
                          unknown={!al.cover}
                          onPress={() => nav.navigate('ProviderDetail', {
                            acctId: acct.id, kind: 'album', id: al.id, name: al.name, cover: al.cover,
                            sub: [al.artist, al.songCount ? `${al.songCount}首` : null].filter(Boolean).join(' · ') || undefined,
                          })} />
                      ))}
                    </GridWall>
                  </View>
                ) : null}
                <SectionHead title="专辑" count={albums.data?.length} />
                <SegBody state={albums} onRetry={() => { setAlbums({ data: null, err: null, busy: false }); if (acct) loadAlbums(acct); }}>
                  {albums.data && albums.data.length === 0 ? <EmptyState icon="music" title="服务器上没有专辑" sub="先在媒体服务器里添加音乐库" /> : null}
                  <GridWall>
                    {(albums.data || []).map(al => (
                      <DiscCard fill key={al.id} cover={al.cover} name={al.name} count={al.songCount}
                        sub={al.artist || undefined} unknown={!al.cover}
                        onLongPress={caps.radio ? () => playRadio(al.id, al.name, 'album', al.artist) : undefined}
                        onPress={() => nav.navigate('ProviderDetail', {
                          acctId: acct.id, kind: 'album', id: al.id, name: al.name, cover: al.cover,
                          sub: [al.artist, al.songCount ? `${al.songCount}首` : null].filter(Boolean).join(' · ') || undefined,
                        })} />
                    ))}
                  </GridWall>
                </SegBody>
              </View>
              ) : null}

              {/* 艺术家([v5.6] 维度 tab):全量行式列表 */}
              {dim === 'artists' ? (
              <View>
                <SectionHead title="艺术家" count={artists.data?.length} />
                <SegBody state={artists} onRetry={() => { setArtists({ data: null, err: null, busy: false }); if (acct) loadArtists(acct); }}>
                  {artists.data && artists.data.length === 0 ? <EmptyState icon="music" title="没有找到艺术家" /> : null}
                  {/* [老板 1010·按源定制] media(emby/jf)艺人=圆头像墙(媒体服务器富布局);lean/generic 保持行列表(导航式精简) */}
                  {pvLayout === 'media' ? (
                    <GridWall>
                      {(artists.data || []).map(ar => (
                        <PvCard fill key={ar.id} round cover={ar.cover} name={ar.name} meta={ar.albumCount ? `${ar.albumCount} 张专辑` : undefined}
                          onLongPress={caps.radio ? () => playRadio(ar.id, ar.name, 'artist', ar.name) : undefined}
                          onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'artist', id: ar.id, name: ar.name, sub: ar.albumCount ? `${ar.albumCount} 张专辑` : undefined })} />
                      ))}
                    </GridWall>
                  ) : (
                  (artists.data || []).map(ar => (
                    <ArtistRow key={ar.id} cover={ar.cover} name={ar.name}
                      sub={ar.albumCount ? `${ar.albumCount} 张专辑` : PROVIDER_META[acct.type].label}
                      onLongPress={caps.radio ? () => playRadio(ar.id, ar.name, 'artist', ar.name) : undefined}
                      onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'artist', id: ar.id, name: ar.name, sub: ar.albumCount ? `${ar.albumCount} 张专辑` : undefined })} />
                  ))
                  )}
                </SegBody>
              </View>
              ) : null}

              {/* 歌单([v5.6] 维度 tab):全量行式列表 */}
              {dim === 'lists' ? (
              <View>
                <SectionHead title="歌单" count={lists.data?.length} />
                <SegBody state={lists} onRetry={() => { setLists({ data: null, err: null, busy: false }); if (acct) loadLists(acct); }}>
                  {lists.data && lists.data.length === 0 ? <EmptyState icon="music" title="服务器上没有歌单" sub="在媒体服务器或 amcfy 等客户端里创建" /> : null}
                  {(lists.data || []).map(pl => (
                    <PlaylistRow key={pl.id} cover={pl.cover} name={pl.name} gradKey={pl.name}
                      sub={pl.songCount ? `${pl.songCount} 首` : undefined}
                      onPress={() => nav.navigate('ProviderDetail', { acctId: acct.id, kind: 'playlist', id: pl.id, name: pl.name, cover: pl.cover, sub: pl.songCount ? `${pl.songCount} 首` : undefined })} />
                  ))}
                </SegBody>
              </View>
              ) : null}
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
          ...(() => { // [批5a] 源侧真实能力项:收藏打星+相似电台(仅已接线源;songmid=pid:itemId 解析回源账号,无能力不显项)
            const [spid, iid] = String(actSong.songmid ?? '').split(':');
            const ta = acct && acct.type !== 'webdav' ? (providers.get(spid) || acct) : undefined;
            if (!ta || !iid) return [];
            const tc = PV_CAPS[ta.type];
            const starred = (actSong as { pvFav?: boolean }).pvFav === true;
            return [
              ...(tc.star ? [{ label: starred ? '取消源收藏' : '收藏到源 · 打星', onPress: () => pvFavToggle(actSong) }] : []),
              ...(tc.radio ? [{ label: '相似电台', onPress: () => playRadio(iid, actSong.name, 'song', actSong.singer) }] : []),
            ];
          })(),
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



const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  intro: { color: C.text2, fontSize: FS.body, lineHeight: 18, marginBottom: 14 },
  empty: { color: C.text2, fontSize: FS.body, lineHeight: 18, textAlign: 'center', paddingVertical: 40 },
  center: { paddingVertical: 60, alignItems: 'center', gap: SP.xl },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.brand, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 },
  retryText: { color: C.onBrand, fontSize: FS.md, fontWeight: FW.semibold },
  tip: { color: C.text3, fontSize: FS.sm, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  // 浏览页头部
  hWrap: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  hSide: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  acctBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.md, marginHorizontal: 4 },
  acctName: { color: C.text, fontSize: FS.h2, lineHeight: 25, fontWeight: FW.bold, maxWidth: 200 },
  acctCaret: { transform: [{ rotate: '90deg' }], marginTop: 2 },
  // 专辑网格
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xl }, // phone 三列(HD/web 走 GridWall→HDGrid)
  albumCellWeb: { width: '15.5%' }, // web 6 列(0.75 zoom 下 31%=2列过大,加密 4 倍)
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumGlyph: { color: C.text2, fontSize: FS.display, fontWeight: FW.bold },
  albumName: { color: C.text, fontSize: FS.body, lineHeight: 15, fontWeight: FW.semibold },
  albumMeta: { color: C.text2, fontSize: FS.xs, lineHeight: 12 },
  // [批次1] 艺术家/歌单自造行(artistRow/plRow/artistArt/artistFallback/artistName/artistMeta)退役→统一件 ArtistRow/PlaylistRow(artistInitial 留给 PvCard 圆卡兑底)
  artistInitial: { color: C.brandText, fontSize: FS.headline, fontWeight: FW.bold },
  // 随机歌曲段
  songsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  songsHint: { color: C.text2, fontSize: FS.body },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  shuffleBtnText: { color: C.onBrand, fontSize: FS.body, fontWeight: FW.semibold },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { borderColor: C.brand, backgroundColor: C.brand },
});

// v3.31 列表页重设计样式（老板 0921：克制卡——深色底/细描边/微投影/品牌 icon 左置/类型徽标）
const ml = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.lg }, // [老板拍板 10-09] hub 网格卡片风:flexWrap 换行,卡宽 flexBasis 48%=两列
  sectionHead: { color: C.text3, fontSize: FS.body, fontWeight: FW.bold, letterSpacing: 1.2, marginTop: 26, marginBottom: 10 },
  sectionHeadHD: { fontSize: FS.lg, letterSpacing: 1.6, marginTop: 30 },
  groupWeb: { width: '100%' }, // [老板 1010] 占满整屏(去 maxWidth 860/1160)——定宽卡 375px 自然铺排;列表区 dv.listWrapWeb 维持 860 可读性不动
  card: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SP.xl, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, elevation: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, flexBasis: '48%' }, // [老板反馈] 删flexGrow——单卡不拉伸,保持48%宽居左对齐
  cardHD: { minHeight: 86, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, flexBasis: 375 }, // [老板 1010] HD/web 定宽卡 375px+自然换行——卡不随卡数缩水,孤卡同宽不拉伸;phone 维持 48% 两列
  cardHover: { borderColor: C.strokeStrong, backgroundColor: C.surface2 }, // hover 细描边提亮,克制不加投影
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, // [库族重设计v1 B4] 46→44 对齐 LibBanner kindIcon 现值(规格统一表)
  iconWrapHD: { width: 52, height: 52, borderRadius: 14 }, // [B4] 56→52 同源对齐
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  title: { color: C.text, fontSize: FS.xl, lineHeight: 20, fontWeight: FW.semibold, flexShrink: 1 },
  titleHD: { fontSize: FS.headline, lineHeight: 23 },
  typeChip: { backgroundColor: C.inset2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5, flexShrink: 0 },
  typeChipText: { color: C.text2, fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: 0.5 },
  sub: { color: C.text3, fontSize: FS.sm, lineHeight: 15, marginTop: 2 },
  subHD: { fontSize: FS.md, lineHeight: 17 },
  menuBtn: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  menuBtnHD: { width: 40, height: 40 },
  repickBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.stroke },
  repickText: { color: C.brandText, fontSize: FS.body, fontWeight: FW.semibold },
  spin: { marginRight: 2 },
});

// v3.31 WebDAV 目录浏览样式（行式 68h 基准,替唱片墙）
const dv = StyleSheet.create({
  crumbWrap: { flexGrow: 0, marginBottom: 10 },
  crumbItem: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 8 },
  crumbItemText: { color: C.text2, fontSize: FS.body },
  crumbCur: { backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  crumbCurText: { color: C.onBrand, fontSize: FS.body, fontWeight: FW.bold },
  crumbRefresh: { width: 26, height: 26, borderRadius: 999, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  listWrap: { borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 6, paddingVertical: 4 },
  listWrapWeb: { alignSelf: 'flex-start', width: '100%', maxWidth: 860 }, // 信息密度优先:限宽 860 行式列表
  headBar: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint },
  stats: { flex: 1, color: C.text3, fontSize: FS.body },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: SP.xs, height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.surface2 },
  actBtnMain: { backgroundColor: C.brand },
  // 顶栏:左面包屑(flex:1)+右端常驻动作组(固定可见,不入滚动区)
  topRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: 10 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, flexShrink: 0 },
  actBtnText: { color: C.text2, fontSize: FS.body, fontWeight: FW.semibold },
  actBtnTextMain: { color: C.onBrand },
  rowSkel: { height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.05)', marginVertical: 5 },
  rowSkelHD: { height: 78 },
  rowHover: { backgroundColor: C.surface2 },
  // 0922 TV 行焦点：清晰 2.5px 环 + 轻微放大（行高无需 1.05 级，7b 行内禁大 zoom），双保险高亮背景由 focusBg 提供
  rowFocusTv: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 10, transform: [{ scale: 1.02 }] } as ViewStyle,
  folderRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SP.xl, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  folderRowHD: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, gap: SP.xxl },
  folderIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  folderIconHD: { width: 42, height: 42, borderRadius: 12 },
  folderName: { flex: 1, color: C.text, fontSize: FS.lg, lineHeight: 19, fontWeight: FW.medium },
  textHD: { fontSize: FS.headline, lineHeight: 23 }, // TV 10ft 观看：主文字 16.5→FS.headline(17)
  songRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: SP.xl, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  songRowHD: { minHeight: 80, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, gap: SP.xxl },
  songRowOn: { backgroundColor: C.selTint },
  rowDivide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.strokeFaint, borderRadius: 0 },
  idx: { width: 26, textAlign: 'center', color: C.text3, fontSize: FS.body, fontVariant: ['tabular-nums'] },
  idxHD: { width: 34, fontSize: FS.md },
  title: { color: C.text, fontSize: FS.lg, lineHeight: 19, fontWeight: FW.medium },
  sub: { color: C.text2, fontSize: FS.sm, lineHeight: 14, marginTop: 1 },
  subHD: { fontSize: FS.md, lineHeight: 17 },
  dur: { color: C.text3, fontSize: FS.sm, fontVariant: ['tabular-nums'] },
  statsHD: { fontSize: FS.md },
  crumbItemHD: { paddingVertical: 5, paddingHorizontal: 8 },
  crumbItemTextHD: { fontSize: FS.lg },
  crumbCurHD: { paddingVertical: 6, paddingHorizontal: 13 },
  crumbCurTextHD: { fontSize: FS.lg },
  crumbRefreshHD: { width: 34, height: 34 },
  // 桌面≥900 双区容器：左列表 flex1 + 右操作栏 260 固定（对齐 860 列表右缘）
  davCols: { flexDirection: 'row', alignItems: 'flex-start', gap: SP.big, maxWidth: 1140, alignSelf: 'stretch' },
  sidePanel: { width: 260, flexShrink: 0, gap: SP.md, position: 'relative', top: 40, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: SP.md, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface2 },
  sideBtnMain: { color: C.onBrand, fontSize: FS.md, fontWeight: FW.bold },
  sideBtnText: { color: C.text2, fontSize: FS.md, fontWeight: FW.semibold },
  sideHint: { color: C.text3, fontSize: FS.sm, lineHeight: 14, marginTop: 4 },
  eq: { width: 26, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: SP.xs, height: 12 },
  eqBar: { width: 3, borderRadius: 1.5, backgroundColor: C.brand },
});

// HD(车机/TV)覆盖样式:限宽居中 + 大触点/大字号(老板:媒体库列表需遥控光标+大屏排版)
const hd = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, paddingHorizontal: 20, marginBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontSize: FS.h1, fontWeight: FW.heavy }, // lx166 居左
  intro: { fontSize: FS.md, lineHeight: 19 },
});

// v3.28(老板:第三方媒体库统一风格):浏览页 HD 尺寸——行高/封面/字号与我的收藏·歌单详情同档
const bv = StyleSheet.create({
  // [批次1] 行覆盖(row/rowTitle/rowSub/art)随自造行退役→统一件内建 HD 规格
  albumName: { fontSize: FS.md, lineHeight: 17 },
  albumMeta: { fontSize: FS.sm, lineHeight: 14 },
  acctPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.md, height: 38, marginHorizontal: 4 },
  acctName: { color: C.text, fontSize: FS.headline, fontWeight: FW.heavy, maxWidth: 320 },
});

// 综合页分区样式（2026-09-17：一个综合页面）
const sec = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: 10 },
  title: { color: C.text, fontSize: FS.title, lineHeight: 22, fontWeight: FW.bold },
  titleHD: { fontSize: FS.h2, lineHeight: 25 },
  count: { color: C.text3, fontSize: FS.body },
  moreBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SP.xs, paddingHorizontal: 8, paddingVertical: 4 },
  moreText: { color: C.text2, fontSize: FS.body, fontWeight: FW.medium },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.xs, paddingVertical: 10 },
  previewHint: { color: C.text3, fontSize: FS.sm, marginLeft: 'auto' },
  songsBar: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, marginBottom: 4 },
  // [批次1] dualRow/dualCard 族死样式随 HeroPair 统一退役(v5.6 后无使用点)
});

// [v5.6 1010·LEO 基准稿] 第三方页 v5 样式:phead(品牌标+状态点辉光)/能力芯片/维度 tabs/英雄卡 st 内嵌粗体
const pv = StyleSheet.create({
  phead: { flexDirection: 'row', alignItems: 'center', gap: SP.lg },
  pheadLogo: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  pheadLogoHD: { width: 52, height: 52, borderRadius: 16 },
  pheadNameRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md },
  pheadName: { color: C.text, fontSize: FS.h1, lineHeight: 25, fontWeight: FW.heavy, flexShrink: 1 },
  pheadNameHD: { fontSize: FS.h1, lineHeight: 26 }, // [LEO 1011] 22 档外→h1(20)
  pheadSub: { color: C.text3, fontSize: FS.body, lineHeight: 16, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 }, // 状态点+辉光(shadowColor 随状态内联)
  pheadBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
  pheadBtnHD: { width: 42, height: 42, borderRadius: 12 },
  heroStB: { fontWeight: FW.heavy, color: C.white }, // 英雄卡 st 行内粗体(统计数,基准稿 <b> 同形)
  caps: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  cap: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
  capDim: { opacity: 0.45 },
  capDot: { width: 5, height: 5, borderRadius: 3 },
  capT: { color: C.text2, fontSize: FS.sm, fontWeight: FW.semibold },
  capTOn: { color: C.text },
  // [老板 1010·听风重规划] 源内搜索框(netease 布局专属)
  // [老板 1011 11:49] 搜索框统一(探索页/公共库 searchBox 同款 pill:44 高/22 圆角/searchPill 底,HD 灰底)
  tfSearchBar: { flexDirection: 'row', alignItems: 'center', gap: SP.lg, backgroundColor: C.searchPill, borderRadius: 22, paddingHorizontal: 12, height: 44, marginTop: 14 },
  tfSearchBarHD: { backgroundColor: C.surface2 },
  tfSearchInput: { flex: 1, color: C.text, fontSize: FS.md, paddingVertical: 0, minWidth: 0 },
  dimtabs: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md },
  dimtab: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, height: 32, paddingHorizontal: 13, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke },
  dimtabHD: { height: 40, paddingHorizontal: 16 },
  dimtabOn: { backgroundColor: C.brand, borderColor: C.brand },
  dimtabT: { color: C.text2, fontSize: FS.md, fontWeight: FW.semibold },
  dimtabTOn: { color: C.onBrand, fontWeight: FW.bold },
  dimtabCnt: { color: C.text3, fontSize: FS.sm, fontVariant: ['tabular-nums'] },
  dimtabCntOn: { color: C.onBrand },
  dimtabOff: { opacity: 0.4 },
  dimtabTOff: { color: C.text3, fontSize: FS.md, fontWeight: FW.semibold },
  // [批5a] 音质档 qrow(仅转码能力源):当前档品牌底高亮,选档持久化 ProviderAcct.quality 由引擎取链时读取
  qrow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SP.sm },
  qLabel: { color: C.text3, fontSize: FS.sm, fontWeight: FW.semibold, marginRight: 2 },
  qBtn: { height: 26, paddingHorizontal: 11, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
  qBtnOn: { backgroundColor: C.brand, borderColor: C.brand },
  qBtnT: { color: C.text2, fontSize: FS.sm, fontWeight: FW.semibold },
  qBtnTOn: { color: C.onBrand, fontWeight: FW.bold },
});

// navigation 注册用包装（native-stack 组件类型兼容）
export function ProviderBrowseRoute(props: Record<string, unknown>) {
  const route = (props as { route: { params: { acctId: string } } }).route;
  return <ProviderBrowseScreen route={route} />;
}
