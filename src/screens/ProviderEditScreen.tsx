// 连接第三方媒体库 —— 按 Figma NM-REMOTE-SELECT-001 / NM-REMOTE-SUBSONIC-001 整页重做
// 选择类型页：Bold 22 标题 + 说明 + 5 张类型卡（#2B2B2B r12 h64，Medium 14 + 推荐/说明 11）
// 连接页：说明 + Tab 容器(#1C1C1C r12 p4) + 输入卡(#2B2B2B r12: label 11 灰 + 值 14 白 + hint 10) + 测试连接/保存并开始索引 h46 r12
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator , Image, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon, BrandIcon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { SH } from '../hd/hdtokens';
import { providers, providerApi, PROVIDER_META, providerIdentityId, type ProviderAcct, type ProviderType } from '../services/providers';
import { library } from '../state/library';
import { dialog, toast } from '../components/Dialog';
import { plexBeginPin, plexPollPin, plexFinish } from '../services/providers-v2';

// 类型卡数据；注：核心后台 LX Server 属于「使用方式与账号」的连接服务器流程，不是第三方媒体库，不在此列
// icon:HD 卡片用；logo:真品牌 logo 资产（v2 对齐 Amcfy 12 平台；飞牛/听风 2026-09-18 补）
const TYPE_CARDS: { type: ProviderType; title: string; sub: string; icon: 'music' | 'tv' | 'wave' | 'cloud'; logo?: any }[] = [
  { type: 'navidrome', title: 'Navidrome / Subsonic', sub: 'Subsonic / OpenSubsonic 兼容协议', icon: 'music', logo: require('../assets/brands/navidrome.png') },
  { type: 'emby', title: 'Emby / Jellyfin', sub: '账号登录，直放或服务端转码', icon: 'tv', logo: require('../assets/brands/emby.png') },
  { type: 'plex', title: 'Plex', sub: '网页授权自动发现 / Token 直连', icon: 'tv', logo: require('../assets/brands/plex.png') },
  { type: 'audiostation', title: '群晖 Audio Station', sub: 'DSM 内置音乐服务，SYNO API', icon: 'wave', logo: require('../assets/brands/audiostation.png') },
  { type: 'feiniu', title: '飞牛音乐', sub: 'fnOS 内置音乐服务，应用账号', icon: 'cloud', logo: require('../assets/brands/feiniu.png') },
  { type: 'daoliyu', title: '道理鱼音乐', sub: '官方服务器协议，邮箱/用户名登录', icon: 'wave', logo: require('../assets/brands/daoliyu.png') },
  { type: 'audiobookshelf', title: 'Audiobookshelf', sub: '自托管有声书 / 播客', icon: 'wave', logo: require('../assets/brands/audiobookshelf.png') },
  { type: 'mstream', title: 'mStream', sub: 'JWT 登录 / 无用户公开模式', icon: 'cloud', logo: require('../assets/brands/mstream.png') },
  { type: 'songloft', title: 'Songloft', sub: 'Go 自托管，歌手专辑聚合', icon: 'music', logo: require('../assets/brands/songloft.png') },
  { type: 'webdav', title: 'WebDAV 音乐目录', sub: '直接读取远程音频文件', icon: 'cloud', logo: require('../assets/brands/webdav.png') },
  { type: 'tingfeng', title: '听风音乐', sub: 'RoCeOS / iStoreOS 内置网易云', icon: 'wave', logo: require('../assets/brands/tingfeng.png') },
];

// 08:21 重设计原型三选(真机实拍给老板选):PROTO 由构建时切换
let PROTO: 'A' | 'B' | 'C' = 'B';
const SHORT_NAME: Partial<Record<ProviderType, string>> = {
  navidrome: 'Navidrome', emby: 'Emby', plex: 'Plex', audiostation: '群晖', feiniu: '飞牛', daoliyu: '道理鱼',
  audiobookshelf: 'Audobook', mstream: 'mStream', songloft: 'Songloft', webdav: 'WebDAV', tingfeng: '听风',
};
const TYPE_GROUPS: { label: string; items: typeof TYPE_CARDS }[] = [
  { label: '路由器内置', items: TYPE_CARDS.filter(c => c.type === 'tingfeng') },
  { label: '音乐服务器', items: TYPE_CARDS.filter(c => ['navidrome', 'emby', 'plex', 'daoliyu', 'songloft', 'mstream', 'audiostation', 'feiniu'].includes(c.type)) },
  { label: '文件 · 有声书', items: TYPE_CARDS.filter(c => ['webdav', 'audiobookshelf'].includes(c.type)) },
];
// 数学居中:onLayout 量容器与内容,translateY 平移——不依赖 flex 引擎任何脾气(vc155 教训)
function Center({ children }: { children: React.ReactNode }) {
  const [box, setBox] = useState({ H: 0, h: 0 });
  const off = box.H > 0 && box.h > 0 ? Math.max(0, (box.H - box.h) / 2) : 0;
  // 等值守卫:高度抖动 <0.5px 时返回原对象让 React bail out——否则 onLayout↔setState 反馈环会 Max update depth 崩溃(真机实测)
  const gH = (v: number) => Math.round(v);
  return (
    <View style={{ flex: 1 }} onLayout={e => { const H = gH(e.nativeEvent.layout.height); setBox(b => b.H === H ? b : { ...b, H }); }}>
      <View onLayout={e => { const h = gH(e.nativeEvent.layout.height); setBox(b => b.h === h ? b : { ...b, h }); }} style={{ transform: [{ translateY: off }] }}>
        {children}
      </View>
    </View>
  );
}

// 连接页说明 / 输入 hint（对齐 Figma NM-REMOTE-SUBSONIC-001）
interface ConnectCopy { desc: string; baseHint?: string; passHint?: string; badge?: string }
const CONNECT_COPY: Record<string, ConnectCopy> = {
  navidrome: { desc: '通过 Subsonic 1.16.1 / OpenSubsonic 连接远程曲库。', baseHint: '自动补全 /rest；测试 ping 与 OpenSubsonic 扩展', passHint: '凭证保存到系统安全存储', badge: '1.16.1' },
  emby: { desc: '通过 Emby / Jellyfin API 登录并选择音乐库。', passHint: '凭证保存到系统安全存储' },
  jellyfin: { desc: '通过 Emby / Jellyfin API 登录并选择音乐库。', passHint: '凭证保存到系统安全存储' },
  daoliyu: { desc: '道理鱼官方服务器（daoliyu-music-server）应用协议；邮箱或用户名 + 密码登录。', baseHint: '默认端口 4000；官方服务器不允许网页跨域访问——手机 / HD / 桌面端直连可用，网页版需与道理鱼同源部署（官方限制）' },
  webdav: { desc: '通过 PROPFIND / GET / Range 直接读取远程音频文件。', passHint: '凭证保存到系统安全存储' },
  subsonic: { desc: '通过 Subsonic 1.16.1 / OpenSubsonic 连接远程曲库。', baseHint: '自动补全 /rest；测试 ping 与 OpenSubsonic 扩展', passHint: '凭证保存到系统安全存储' },
  feiniu: { desc: '连接飞牛 fnOS 内置音乐服务；应用内账号登录（fnOS 桌面 → 音乐应用里创建的账号）。', baseHint: 'fnOS 桌面同地址同端口；仅支持 http(s)://IP:端口 或域名（FN ID 中继后续支持）', passHint: '密码 SHA-256 后传输' },
};

export function ProviderEditScreen({ route }: { route?: { params?: { acctId?: string; type?: ProviderType } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const existing = route?.params?.acctId ? providers.get(route.params.acctId) : undefined;

  const [picked, setPicked] = useState<ProviderType | null>(existing?.type ?? route?.params?.type ?? null);
  const [protoPage, setProtoPage] = useState(0);
  // subsonic 系有 密码/Token 两种认证方式（Tab 容器）；emby/webdav 只有账号密码
  const [authTab, setAuthTab] = useState(0);
  const [a, setA] = useState<ProviderAcct>(existing ?? { id: `pv-${Date.now()}`, type: 'navidrome', name: '', base: '', user: '', pass: '' });
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [tested, setTested] = useState(false);

  const set = (p: Partial<ProviderAcct>) => setA(prev => ({ ...prev, ...p }));
  const subsonicFamily = picked === 'navidrome' || picked === 'subsonic';
  const copy: ConnectCopy = picked ? CONNECT_COPY[picked] ?? { desc: '' } : { desc: '' };

  const pickType = (t: ProviderType) => {
    setPicked(t);
    setA(prev => ({ ...prev, type: t }));
    setTested(false);
  };

  // ---------- 类型选择页横滑行(web):滚轮转横向 + 鼠标拖拽 + 箭头钮(老板 09-18 四改:web 无法滚动) ----------
  const rowNode = () => (typeof document !== 'undefined' ? document.getElementById('nm-type-row') as HTMLDivElement | null : null);
  const scrollRowBy = (dir: 1 | -1) => {
    const n = rowNode(); if (!n) return;
    n.scrollBy({ left: dir * Math.max(300, n.clientWidth * 0.7), behavior: 'smooth' });
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || picked) return;
    const n = rowNode(); if (!n) return;
    // 垂直滚轮→横向滚动（浏览器不给横滑容器滚轮支持，老板实锤「无法滚动」）
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); n.scrollLeft += e.deltaY + e.deltaX; }
    };
    // 鼠标拖拽滑动；拖动超过 6px 后吞掉 click，避免拖完误入连接页
    let sx = 0, sl = 0, moved = 0, down = false, suppress = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = true; moved = 0; sx = e.clientX; sl = n.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) n.scrollLeft = sl - dx;
    };
    const onUp = () => {
      if (moved > 6) { suppress = true; setTimeout(() => (suppress = false), 120); }
      down = false;
    };
    const onClick = (e: Event) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } };
    n.addEventListener('wheel', onWheel, { passive: false });
    n.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    n.addEventListener('click', onClick, true);
    return () => {
      n.removeEventListener('wheel', onWheel);
      n.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      n.removeEventListener('click', onClick, true);
    };
  }, [picked]);

  // Plex 网页授权（PIN 轮询）：打开 app.plex.tv → 轮询 pins → 选服务器 + 音乐库 → 保存
  const plexWebAuth = async () => {
    if (busy) return;
    setBusy('save');
    try {
      const clientId = providers.plexClientId();
      const { pinId, url } = await plexBeginPin(clientId);
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener');
      } else {
        await Linking.openURL(url);
      }
      toast('已打开 Plex 授权页，确认后自动完成连接');
      let authToken: string | null = null;
      for (let i = 0; i < 70 && !authToken; i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 3000 : 2000));
        try { authToken = await plexPollPin(clientId, pinId); } catch { /* 网络抖动继续轮询 */ }
      }
      if (!authToken) throw new Error('授权超时：2 分钟内未在 Plex 页面确认');
      const fin = await plexFinish(authToken);
      const id = existing?.id ?? providerIdentityId('plex', fin.base, fin.token.slice(0, 12));
      providers.save({ ...a, id, type: 'plex', base: fin.base, token: fin.token, root: fin.root, clientId, user: '', pass: '', name: a.name.trim() || fin.name });
      nav.goBack();
    } catch (e) {
      dialog.alert('Plex 授权失败', (e as Error).message);
    } finally { setBusy(null); }
  };

  // 测试连接：只验证，不保存
  const testConn = async () => {
    if (picked === 'plex' && !a.token) { plexWebAuth(); return; }
    if (!a.base.trim()) { toast('请填写服务器地址'); return; }
    setBusy('test');
    try {
      await providerApi.connect({ ...a, base: a.base.trim() });
      setTested(true);
      toast('连接测试通过');
    } catch (e) {
      dialog.alert('连接失败', (e as Error).message + '\n\n请检查地址、账号密码，以及服务器是否已在同一网络');
    } finally { setBusy(null); }
  };

  // 保存并开始索引（= 连接并保存，成功后返回）
  const save = async () => {
    if (picked === 'plex' && !a.token) { plexWebAuth(); return; }
    if (!a.base.trim()) { toast('请填写服务器地址'); return; }
    setBusy('save');
    try {
      const base = a.base.trim();
      // 新建用稳定身份 id（同服务器+账号重连得到相同 id）：删了重连，已导入歌曲自动复活；编辑已有连接则保留旧 id 不破坏既有歌
      const id = existing?.id ?? providerIdentityId(a.type, base, a.user);
      const dup = !existing && providers.get(id); // 同服务器同账号已存在 → save 会 upsert 覆盖（去重语义）
      const connected = await providerApi.connect({ ...a, id, base, name: a.name.trim() || PROVIDER_META[a.type].label.split(' / ')[0] });
      providers.save(connected);
      if (dup) toast('已更新现有同账号连接');
      nav.goBack();
    } catch (e) {
      dialog.alert('连接失败', (e as Error).message + '\n\n请检查地址、账号密码，以及服务器是否已在同一网络');
    } finally { setBusy(null); }
  };

  // ---------- Step 1: 选择类型（对齐 NM-REMOTE-SELECT-001） ----------
  if (!picked) {
    return (
      <View style={[st.screen, { paddingTop: insets.top + 10 }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 26 }}>
            <Icon name="back" size={20} />
          </TouchableOpacity>
          <Text style={st.title}>添加远程音乐库</Text>
          <View style={{ width: 26 }} />
        </View>
        {/* ===== phone Step1 原型三选(老板 08:21 重新设计):A 图标矩阵 / B 分组列表 / C 大卡横滑翻页 ===== */}
        {!IS_HD ? (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {PROTO === 'A' ? (
            /* A: 图标矩阵——4 列 logo 瓦片,11 平台一屏全见,零横滑;onLayout 数学居中(不赌 flex 引擎) */
            <>
            <Center>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Text style={{ color: C.text, fontSize: 19, fontWeight: '800' }}>接入你的音乐库</Text>
                <Text style={{ color: C.text3, fontSize: 12.5 }}>选择平台 · 自动测试连通后保存</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 26, maxWidth: 400, alignSelf: 'center' }}>
                {TYPE_CARDS.map(c => (
                  <TouchableOpacity key={c.type} onPress={() => pickType(c.type)} activeOpacity={0.7} style={{ width: 80, alignItems: 'center', gap: 7 }}>
                    <View style={{ width: 74, height: 74, borderRadius: 18, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      {c.logo
                        ? <Image source={c.logo} style={{ width: 46, height: 46, borderRadius: 11 }} resizeMode="contain" />
                        : <Icon name={c.icon} size={30} color={C.brandText} />}
                    </View>
                    <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '500' }} numberOfLines={1}>{SHORT_NAME[c.type] ?? c.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Center>
            <Text style={[st.desc, { textAlign: 'center', paddingBottom: 14 + insets.bottom, opacity: 0.7 }]}>点选平台开始 · 共 {TYPE_CARDS.length} 种</Text>
            </>
          ) : PROTO === 'B' ? (
            /* B: 分组列表——按场景三组,行式条目(logo+标题+说明+箭头),一览无余 */
            <>
            <Center>
              <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
                {TYPE_GROUPS.map(g => (
                  <View key={g.label} style={{ marginBottom: 12 }}>
                    <Text style={{ color: C.text3, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, paddingLeft: 4 }}>{g.label}</Text>
                    {g.items.map(c => (
                      <TouchableOpacity key={c.type} onPress={() => pickType(c.type)} activeOpacity={0.75}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface2, borderRadius: 13, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 6 }}>
                        {c.logo
                          ? <Image source={c.logo} style={{ width: 30, height: 30, borderRadius: 7 }} resizeMode="contain" />
                          : <Icon name={c.icon} size={24} color={C.brandText} />}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{c.title}</Text>
                          <Text style={{ color: C.text3, fontSize: 11.5 }} numberOfLines={1}>{c.sub}</Text>
                        </View>
                        <Icon name="chevronright" size={16} color={C.text3} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            </Center>
            <Text style={[st.desc, { textAlign: 'center', paddingBottom: 14 + insets.bottom, opacity: 0.7 }]}>选择平台开始接入</Text>
            </>
          ) : (
            /* C: 大卡横滑 v3——更大卡+分页吸附+页点+计数(横滑概念终极版) */
            <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} pagingEnabled snapToInterval={218} decelerationRate="fast"
              contentContainerStyle={{ gap: 12, paddingHorizontal: 10, alignItems: 'center' }}
              onScroll={e => setProtoPage(Math.round(e.nativeEvent.contentOffset.x / 218))} scrollEventThrottle={64}>
              {TYPE_CARDS.map(c => (
                <TouchableOpacity key={c.type} style={[st.typeRowCard, { width: 206, height: 240 }]} activeOpacity={0.7} onPress={() => pickType(c.type)}>
                  {c.logo
                    ? <Image source={c.logo} style={{ width: 84, height: 84, borderRadius: 20 }} resizeMode="contain" />
                    : <Icon name={c.icon} size={52} color={C.brandText} />}
                  <Text style={st.typeRowTitle} numberOfLines={1} ellipsizeMode="tail">{c.title}</Text>
                  <Text style={st.typeRowSub} numberOfLines={1} ellipsizeMode="tail">{c.sub}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 10 + insets.bottom }}>
              {[0, 1, 2, 3, 4, 5].map(d => (
                <View key={d} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Math.floor(Math.min(protoPage, 10) / 2) === d ? C.brand : C.surface2 }} />
              ))}
            </View>
            </>
          )}
          </View>
        ) : (
          /* HD: ScrollView 让位 + 一行横滑卡带居中 + 箭头钮(四改:卡放大、箭头/滚轮/拖拽可滑、整组屏幕居中) */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[st.content, { flexGrow: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 40, paddingBottom: 30, paddingTop: 10 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.desc, hdSt.desc, { textAlign: 'center' }]}>选择服务器类型。NextMusic 会先测试能力，再保存凭证。</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
              <HDTouch style={hdSt.rowArrow} focusStyle={hdSt.rowArrowFocus} focusBg={C.surface} glow={SH.brand} onPress={() => scrollRowBy(-1)}>
                <Icon name="back" size={22} color={C.text2} />
              </HDTouch>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} nativeID="nm-type-row"
                style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', gap: 16, paddingVertical: 6 }}>
                {TYPE_CARDS.map(c => (
                  <HDTouch
                    key={c.type}
                    style={hdSt.typeCard}
                    focusStyle={hdSt.typeFocus}
                    focusBg={C.surface2}
                    glow={SH.brand}
                    onPress={() => pickType(c.type)}
                  >
                    <View style={hdSt.typeIcon}>
                      {c.logo
                        ? <Image source={c.logo} style={{ width: 84, height: 84, borderRadius: 20 }} resizeMode="contain" />
                        : <Icon name={c.icon} size={52} color={C.brandText} />}
                    </View>
                    <Text style={hdSt.typeTitle} numberOfLines={1} ellipsizeMode="tail">{c.title}</Text>
                    <Text style={hdSt.typeSub} numberOfLines={1} ellipsizeMode="tail">{c.sub}</Text>
                  </HDTouch>
                ))}
              </ScrollView>
              <HDTouch style={hdSt.rowArrow} focusStyle={hdSt.rowArrowFocus} focusBg={C.surface} glow={SH.brand} onPress={() => scrollRowBy(1)}>
                <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={22} color={C.text2} /></View>
              </HDTouch>
            </View>
            <Text style={[st.desc, hdSt.desc]}>服务器地址与账号由用户明确填写，也可以从历史连接中选择。</Text>
          </ScrollView>
        )}
      </View>
    );
  }

  // ---------- Step 2: 连接（对齐 NM-REMOTE-SUBSONIC-001） ----------
  return (
    <View style={[st.screen, { paddingTop: insets.top + 10 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => (existing ? nav.goBack() : setPicked(null))} hitSlop={6} style={{ width: 26 }}>
          <Icon name="back" size={20} />
        </TouchableOpacity>
        <Text style={st.title}>连接 {PROVIDER_META[picked].label.split(' / ')[0]}</Text>
        {existing ? (
          <TouchableOpacity onPress={() => {
            const nm = existing.name || PROVIDER_META[existing.type].label;
            const n = library.dependentSongCount(existing);
            const doRemove = () => { providers.remove(existing.id); nav.goBack(); };
            dialog.alert(
              '删除媒体库',
              n > 0
                ? `「${nm}」有 ${n} 首已导入歌曲依赖此连接。\n删除后这些歌暂时无法播放——重新添加同一服务器可自动恢复；已下载文件不受影响。`
                : `确定删除「${nm}」？`,
              [
                { text: '取消', style: 'cancel' },
                { text: n > 0 ? '仍要删除' : '删除', style: 'destructive', onPress: doRemove },
              ],
            );
          }} hitSlop={6} style={{ width: 26, alignItems: 'flex-end' }}>
            <Icon name="trash" size={20} color="#FF6B6B" />
          </TouchableOpacity>
        ) : <View style={{ width: 26 }} />}
      </View>
      <ScrollView
        contentContainerStyle={[st.content, IS_HD && { maxWidth: 860, alignSelf: 'center', width: '100%', gap: 14 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[st.desc, IS_HD && hdSt.desc, { textAlign: 'center' }]}>{copy.desc || PROVIDER_META[picked].hint}</Text>

        {/* v3.32(老板):支持从历史连接中选择——同类型已存连接一键填充 */}
        {(() => {
          const hist = providers.all().filter(p => p.id !== a.id && p.type === picked && p.base);
          return hist.length ? (
            <View style={{ width: '100%', gap: 6 }}>
              <Text style={[st.inputLabel, { textAlign: 'center' }]}>从历史连接中选择</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {hist.map(p => (
                  <TouchableOpacity key={p.id} style={st.histChip} activeOpacity={0.7}
                    onPress={() => { setA(prev => ({ ...prev, name: p.name, base: p.base, user: p.user, pass: p.pass })); setTested(false); toast('已填充历史连接，可直接测试或保存'); }}>
                    <Text style={st.histChipText} numberOfLines={1}>{p.name || PROVIDER_META[p.type].label.split(' / ')[0]} · {p.user || '匿名'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null;
        })()}

        {subsonicFamily ? (
          <View style={st.tabsWrap}>
            <View style={st.tabOn}><Text style={st.tabTextOn}>密码认证</Text></View>
            <View style={st.tabOff} onTouchStart={() => toast('Token 认证即将支持')}><Text style={st.tabText}>Token</Text></View>
          </View>
        ) : null}

        <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
          <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>备注名</Text>
          <TextInput
            style={[st.inputValue, IS_HD && hdSt.inputValue]}
            value={a.name}
            placeholder={PROVIDER_META[picked].label.split(' / ')[0]}
            placeholderTextColor={C.text3}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={v => set({ name: v })}
          />
        </View>

        <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
          <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>服务器地址</Text>
          <TextInput
            style={[st.inputValue, IS_HD && hdSt.inputValue]}
            value={a.base}
            placeholder={PROVIDER_META[picked].placeholder}
            placeholderTextColor={C.text3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={v => { set({ base: v }); setTested(false); }}
          />
          {copy.baseHint ? <Text style={st.inputHint}>{copy.baseHint}</Text> : null}
        </View>

        {picked !== 'plex' ? (
          <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
            <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>{a.type === 'webdav' ? '账号（可选）' : '用户名'}</Text>
            <TextInput
              style={[st.inputValue, IS_HD && hdSt.inputValue]}
              value={a.user}
              placeholder={a.type === 'webdav' ? '匿名可留空' : a.type === 'audiostation' ? 'DSM 账号' : a.type === 'feiniu' ? '飞牛音乐账号' : 'music_user'}
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={v => { set({ user: v }); setTested(false); }}
            />
          </View>
        ) : null}

        <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
          <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>{picked === 'plex' ? 'X-Plex-Token（可选）' : '密码'}</Text>
          <TextInput
            style={[st.inputValue, IS_HD && hdSt.inputValue]}
            value={picked === 'plex' ? (a.token || '') : a.pass}
            placeholder={picked === 'plex' ? '网页授权可留空；手动直连填 Token' : '••••••••'}
            placeholderTextColor={C.text3}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={picked !== 'plex'}
            onChangeText={v => { set(picked === 'plex' ? { token: v.trim() } : { pass: v }); setTested(false); }}
          />
          {copy.passHint ? <Text style={st.inputHint}>{copy.passHint}</Text> : null}
        </View>

        {picked === 'feiniu' ? (
          <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
            <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>安全码（可选）</Text>
            <TextInput
              style={[st.inputValue, IS_HD && hdSt.inputValue]}
              value={a.root || ''}
              placeholder="fnOS 开启了设备安全码时填写"
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={v => { set({ root: v.trim() }); setTested(false); }}
            />
          </View>
        ) : null}

        {tested ? (
          <View style={st.infoCard}>
            <View style={st.typeCardHead}>
              <Text style={st.infoTitle}>连接测试通过</Text>
              {copy.badge ? <Text style={st.badge}>{copy.badge}</Text> : null}
            </View>
            <Text style={st.typeCardSub}>可浏览 / 播放 / 导入歌单 / 下载</Text>
          </View>
        ) : null}

        {picked === 'plex' && !a.token ? (
          <View style={[st.btnRow, IS_HD && { marginTop: 8 }]}>
            {IS_HD ? (
              <HDTouch style={[hdSt.btnPrimary, { flex: 2.4 }]} focusStyle={hdSt.btnPrimaryFocus} onPress={plexWebAuth} disabled={!!busy}>
                {busy === 'save' ? <ActivityIndicator color={C.onBrand} size="large" /> : <Text style={hdSt.btnPrimaryText}>打开 Plex 网页授权</Text>}
              </HDTouch>
            ) : (
              <TouchableOpacity style={[st.btnPrimary, busy && st.btnBusy]} activeOpacity={0.7} onPress={plexWebAuth} disabled={!!busy}>
                {busy === 'save' ? <ActivityIndicator color={C.onBrand} size="small" /> : <Text style={st.btnPrimaryText}>打开 Plex 网页授权</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : (
        <View style={[st.btnRow, IS_HD && { marginTop: 8 }]}>
          {IS_HD ? (
            <>
              <HDTouch style={hdSt.btnGhost} focusStyle={hdSt.btnGhostFocus} focusBg={C.surface2} onPress={testConn} disabled={!!busy}>
                {busy === 'test' ? <ActivityIndicator color={C.text} size="large" /> : <Text style={hdSt.btnGhostText}>测试连接</Text>}
              </HDTouch>
              <HDTouch style={hdSt.btnPrimary} focusStyle={hdSt.btnPrimaryFocus} onPress={save} disabled={!!busy}>
                {busy === 'save' ? <ActivityIndicator color={C.onBrand} size="large" /> : <Text style={hdSt.btnPrimaryText}>保存并开始索引</Text>}
              </HDTouch>
            </>
          ) : (
            <>
              <TouchableOpacity style={[st.btnGhost, busy && st.btnBusy]} activeOpacity={0.7} onPress={testConn} disabled={!!busy}>
                {busy === 'test' ? <ActivityIndicator color={C.text} size="small" /> : <Text style={st.btnGhostText}>测试连接</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnPrimary, busy && st.btnBusy]} activeOpacity={0.7} onPress={save} disabled={!!busy}>
                {busy === 'save' ? <ActivityIndicator color={C.onBrand} size="small" /> : <Text style={st.btnPrimaryText}>保存并开始索引</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: '700', flex: 1 }, // lx166 居左
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  desc: { color: C.text2, fontSize: 11, lineHeight: 16, textAlign: 'center' }, // v3.32b(老板):描述文字全端居中(Step1/Step2 通用)

  // 类型卡（Figma: #2B2B2B r12 p12×14 h64）
  typeCard: { backgroundColor: C.surface2, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 4, alignItems: 'center', textAlign: 'center' },

  // 类型选择网格（老板 09-18:整页重排版——3 列等高卡，logo 居中，单行截断）
  typeRowCard: { width: 190, height: 210, backgroundColor: C.surface2, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 8 },
  typeRowTitle: { color: C.text, fontSize: 15.5, fontWeight: '600', textAlign: 'center', width: '100%' },
  typeRowSub: { color: C.text3, fontSize: 12, textAlign: 'center', width: '100%' },
  typeCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeCardTitle: { color: C.text, fontSize: 14, fontWeight: '500' },
  typeCardSub: { color: C.text2, fontSize: 11 },
  badge: { color: C.brandSoft, fontSize: 11, fontWeight: '500' },

  // Tab 容器（Figma: #1C1C1C r12 p4，选中页签 #2B2B2B r9 h36）
  tabsWrap: { flexDirection: 'row', backgroundColor: C.elev, borderRadius: 12, padding: 4, gap: 4, height: 44 },
  tabOn: { flex: 1, height: 36, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  tabOff: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabTextOn: { color: C.text, fontSize: 12, fontWeight: '500' },
  tabText: { color: C.text2, fontSize: 12 },

  // 输入卡（Figma: #2B2B2B r12 p10×12）
  inputCard: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4, alignItems: 'center' }, // v3.32(老板):表单居中对齐
  inputLabel: { color: C.text2, fontSize: 11, textAlign: 'center' },
  inputValue: { color: C.text, fontSize: 14, paddingVertical: 4, textAlign: 'center', width: '100%' },
  histChip: { backgroundColor: C.surface2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border }, // v3.32:历史连接胶囊
  histChipText: { color: C.text2, fontSize: 12 },
  inputHint: { color: C.text2, fontSize: 10 },

  // 测试通过信息卡
  infoCard: { backgroundColor: C.surface2, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  infoTitle: { color: C.text, fontSize: 14, fontWeight: '500' },

  // 按钮（Figma: h46 r12；测试 #2B2B2B 白字 / 保存 C.brand 深字）
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnBusy: { opacity: 0.6 },
  btnGhost: { flex: 1, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: C.text, fontSize: 14, fontWeight: '500' },
  btnPrimary: { flex: 1.4, height: 46, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: C.onBrand, fontSize: 14, fontWeight: '500' },
});

// HD(车机/TV)样式:一排四张竖版类型卡 + 大表单 + D-pad 可聚焦按钮
const hdSt = StyleSheet.create({
  typeCard: {
    width: 300, height: 312, borderRadius: 24, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16,
  },
  typeFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 24 },
  typeIcon: { width: 124, height: 124, borderRadius: 36, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  typeTitle: { color: C.text, fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  typeSub: { color: C.text3, fontSize: 14.5, textAlign: 'center', lineHeight: 20 },
  rowArrow: { width: 52, height: 76, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  rowArrowFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 16 },
  desc: { color: C.text2, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  inputCard: { backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, gap: 6, alignItems: 'center' }, // v3.32(老板):表单居中对齐
  inputLabel: { color: C.text2, fontSize: 13, textAlign: 'center' },
  inputValue: { color: C.text, fontSize: 16, paddingVertical: 6, textAlign: 'center', width: '100%' },
  btnGhost: { flex: 1, height: 58, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  btnGhostFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 14 },
  btnGhostText: { color: C.text, fontSize: 16, fontWeight: '600' },
  btnPrimary: { flex: 1.4, height: 58, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryFocus: { borderWidth: 2.5, borderColor: C.text, borderRadius: 14 },
  btnPrimaryText: { color: C.onBrand, fontSize: 16, fontWeight: '700' },
});
