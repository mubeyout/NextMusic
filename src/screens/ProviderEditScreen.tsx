// 连接第三方媒体库 —— 按 Figma NM-REMOTE-SELECT-001 / NM-REMOTE-SUBSONIC-001 整页重做
// 选择类型页：Bold 22 标题 + 说明 + 5 张类型卡（#2B2B2B r12 h64，Medium 14 + 推荐/说明 11）
// 连接页：说明 + Tab 容器(#1C1C1C r12 p4) + 输入卡(#2B2B2B r12: label 11 灰 + 值 14 白 + hint 10) + 测试连接/保存并开始索引 h46 r12
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator , Image } from 'react-native';
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

// 类型卡数据（对齐 Figma NM-REMOTE-SELECT-001）；注：核心后台 LX Server 属于「使用方式与账号」的连接服务器流程，不是第三方媒体库，不在此列
// icon:HD 卡片用
const TYPE_CARDS: { type: ProviderType; title: string; badge?: string; sub: string; icon: 'music' | 'tv' | 'wave' | 'cloud'; logo?: any }[] = [ // lx154:真品牌 logo 资产
  { type: 'navidrome', title: 'Navidrome / Subsonic', badge: '推荐', sub: '优先走 Subsonic 1.16.1 / OpenSubsonic 兼容协议', icon: 'music', logo: require('../assets/brands/navidrome.png') }, // Navidrome 品牌绿
  { type: 'emby', title: 'Emby / Jellyfin', sub: '用户登录、音乐库选择、直放或服务端转码', icon: 'tv', logo: require('../assets/brands/emby.png') }, // Emby 品牌绿
  { type: 'daoliyu', title: '道理鱼音乐', sub: '专有适配；可用时优先协商兼容协议', icon: 'wave', logo: { uri: 'data:image/webp;base64,UklGRipbAABXRUJQVlA4IB5bAABQNwOdASqrBqsGPj0ejkUiIaGQelwEIAPEtLd/IB6jjk8g7AH8ArOLM6+GeKB/t9a9qLtgLRDFDQ1Nq2b0NcA1cPbfLf4D+3fs//eP/l6alfusf2n9h/7X/6P8t6BOK/mH9P/NP9a/8P+B+XP+q+2b1q8v/0XnUeH/nP+a/uH7qf4L/////7mf6f1Bfxb/Ff8j+3/vf9AH8J/in+G/sP+J/1n9r/////+jb9qvcN/ef+96gf6F/bv+d/gv30+bX++/7v2Nf73/d+wB/av8z/3/z/+fH1CfQI/Z71df95/9P9f/zv///9fs7/Z7/0f7D/Zf/b/2/Yj/PP7j/yPz//9n0Af9b2rf4B/xv//7AHrD9QP7v/af2r7//7z/e/xz91fLP559oeSx55/beZn8Y+3n63+8e13+W/XnxF/I/5P/j+oF+H/y3/G/lb/gP3Z+k159y8++9AL2S+m/6X+7f4n9ludj5rPcB/ND1r7xT8f6gH9E/vn+++676WP5H/t/43/M/u57PvzL/C/+D/Qf6f5B/5L/Wf+Z/fv9F+1/zI/+z3Dftf/5fc1/Wz/7AefOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dHLchKAkb3SWQac2dwFFDrf1EYLavAEb6dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp1czicE9gNlC6ayVygMCUwncJLhOhd+nTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOjhgk0kjs02pQhCBIl74mjClUV7jT3k306dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06uZ+UwLXbSyh48lVMRLnl6ZLPiAecy9xp7yb6dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnRypIcjr81cuz3rYb2LKdzecA/T3k306dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dHDbNOM4EU5ct9QK8AAqBNk6VXy9xp7yb6dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnVzP4aezfcMS9hJQcMcBAumJGwvJvp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp03zbs4hv+UA3oEmDF+mQgFIlV8vcae8m+nTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp6+vTSTPhae8YxaxwGepW5N9OnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTo5V44X+0pNI4UuDImhxIPeTfTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTpvpsAE7MS7zjM72Hrd1drKAe8m+nTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dN8PZ4xtmg9KDqVSSVS5WLpQCN9OnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOjk2U78o6pA6BerxbuNAoBpQCN9OnTo7j/Ezy7hX/6zHfuaXk46Dt/fIKAb02MXwpfiHSnavTIADyFocXoDpS/ZiR+2G76xcEbCgb8hz5HRNOgcbHk306dOnTp06dOnTp06dOnTp06dOnTp06dPYIIKhUVHXKifucPA9s95N9Om/RY37ewJSxNV+77d/miWqwv4u+ULR2pCosc9Pc6HRwZp3dLPhZS5gQD3k306d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Uzk6kckYdUJVU6wEHsvPzHxJCvtPeTfTp06dOnTp06dOnTp06dOnTp06b8QKRL7SISAJbUNdgAO4HdwHKz50duSwk2aAYaPEr8C9jWJGd41+oS+Rj2wO4gQWRhIvd3aooEtXygAKX//jUGH2/7OcYoxvp06dOnTp06dOnTp06dOnTp06dOnTp0cpUMRrWFMycHsduYzh9xkAAMZQD3nBMkH3lwSvfQPK4rfRZp7yu3z6gj5hvGEBRxe1b4Cf/RhlZwLefOnTp06dOnTp06dOnTp06dOnTp06dOnTp05TbSWRmzaptZKo7RAaSvt/mjU095N9vALiFYvXXOv7LN/4yhTTzZyhjj6dOnTfSZ1jYf+v6eswwZURQVt1uLyb6dOnTp06dOnTp06dOnTp06dOnTp06dOm+JSJv9a0uQ/Gn/wwZASDM5nAVXy9xp73gugdxzy7QCUVAWrImPUYdJqNQAseMt8PywjHTsL7oxMW/wPhhQ/Upjgz38+ij/DzmXuNPeTfTp06dOnTp06dOnTp06dOnTp06OZs+Eglm1o6p/o9U4HrTX4QmO6Pp06dOnTp1JsmTmXuNPeTfTp06dOnTp06dOnTp06dOnTp06dOnTp06dOm+7QUU3+YCOwnpdQGz/+iks718A/yXuNPeTfTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06d36iq+XuNPeTfTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp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' } },
  { type: 'webdav', title: 'WebDAV 音乐目录', sub: '直接读取远程文件；本地建立只读元数据索引', icon: 'cloud', logo: require('../assets/brands/webdav.png') },
];

// 连接页说明 / 输入 hint（对齐 Figma NM-REMOTE-SUBSONIC-001）
interface ConnectCopy { desc: string; baseHint?: string; passHint?: string; badge?: string }
const CONNECT_COPY: Record<string, ConnectCopy> = {
  navidrome: { desc: '通过 Subsonic 1.16.1 / OpenSubsonic 连接远程曲库。', baseHint: '自动补全 /rest；测试 ping 与 OpenSubsonic 扩展', passHint: '凭证保存到系统安全存储', badge: '1.16.1' },
  emby: { desc: '通过 Emby / Jellyfin API 登录并选择音乐库。', passHint: '凭证保存到系统安全存储' },
  jellyfin: { desc: '通过 Emby / Jellyfin API 登录并选择音乐库。', passHint: '凭证保存到系统安全存储' },
  daoliyu: { desc: '道理鱼专有 API；可用时优先协商 Subsonic 兼容协议。', passHint: '凭证保存到系统安全存储' },
  webdav: { desc: '通过 PROPFIND / GET / Range 直接读取远程音频文件。', passHint: '凭证保存到系统安全存储' },
  subsonic: { desc: '通过 Subsonic 1.16.1 / OpenSubsonic 连接远程曲库。', baseHint: '自动补全 /rest；测试 ping 与 OpenSubsonic 扩展', passHint: '凭证保存到系统安全存储' },
};

export function ProviderEditScreen({ route }: { route?: { params?: { acctId?: string; type?: ProviderType } } }) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const existing = route?.params?.acctId ? providers.get(route.params.acctId) : undefined;

  const [picked, setPicked] = useState<ProviderType | null>(existing?.type ?? route?.params?.type ?? null);
  // subsonic 系有 密码/Token 两种认证方式（Tab 容器）；emby/webdav 只有账号密码
  const [authTab, setAuthTab] = useState(0);
  const [a, setA] = useState<ProviderAcct>(existing ?? { id: `pv-${Date.now()}`, type: 'navidrome', name: '', base: '', user: '', pass: '' });
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [tested, setTested] = useState(false);

  const set = (p: Partial<ProviderAcct>) => setA(prev => ({ ...prev, ...p }));
  const subsonicFamily = picked === 'navidrome' || picked === 'subsonic' || picked === 'daoliyu';
  const copy: ConnectCopy = picked ? CONNECT_COPY[picked] ?? { desc: '' } : { desc: '' };

  const pickType = (t: ProviderType) => {
    setPicked(t);
    setA(prev => ({ ...prev, type: t }));
    setTested(false);
  };

  // 测试连接：只验证，不保存
  const testConn = async () => {
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[st.content, IS_HD && { paddingHorizontal: 40, gap: 16, flexGrow: 1, justifyContent: 'center', paddingBottom: 30 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[st.desc, IS_HD && hdSt.desc, { textAlign: 'center' }]}>选择服务器类型。NextMusic 会先测试能力，再保存凭证。</Text>
          {IS_HD ? (
            /* HD:一排四张竖版卡(整卡可聚焦,对齐引导页卡片语言;限宽居中+垂直居中) */
            <View style={{ flexDirection: 'row', gap: 16, maxWidth: 920, width: '100%', alignSelf: 'center' }}>
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
                      ? <Image source={c.logo} style={{ width: 44, height: 44, borderRadius: 10 }} resizeMode="contain" />
                      : <Icon name={c.icon} size={30} color={C.brandText} />}
                  </View>
                  <Text style={hdSt.typeTitle}>{c.title}</Text>
                  {c.badge ? (
                    <View style={hdSt.typeBadge}><Text style={hdSt.typeBadgeText}>{c.badge}</Text></View>
                  ) : null}
                  <Text style={hdSt.typeSub}>{c.sub}</Text>
                </HDTouch>
              ))}
            </View>
          ) : (
            <>
              {TYPE_CARDS.map(c => (
                <TouchableOpacity key={c.type} style={st.typeCard} activeOpacity={0.7} onPress={() => pickType(c.type)}>
                  <View style={st.typeCardHead}>
                    <Text style={st.typeCardTitle}>{c.title}</Text>
                    {c.badge ? <Text style={st.badge}>{c.badge}</Text> : null}
                  </View>
                  <Text style={st.typeCardSub}>{c.sub}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[st.desc, IS_HD && hdSt.desc]}>服务器地址与账号由用户明确填写，也可以从历史连接中选择。</Text>
        </ScrollView>
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

        <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
          <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>{a.type === 'webdav' ? '账号（可选）' : '用户名'}</Text>
          <TextInput
            style={[st.inputValue, IS_HD && hdSt.inputValue]}
            value={a.user}
            placeholder={a.type === 'webdav' ? '匿名可留空' : 'music_user'}
            placeholderTextColor={C.text3}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={v => { set({ user: v }); setTested(false); }}
          />
        </View>

        <View style={[st.inputCard, IS_HD && hdSt.inputCard]}>
          <Text style={[st.inputLabel, IS_HD && hdSt.inputLabel]}>密码</Text>
          <TextInput
            style={[st.inputValue, IS_HD && hdSt.inputValue]}
            value={a.pass}
            placeholder="••••••••"
            placeholderTextColor={C.text3}
            secureTextEntry
            onChangeText={v => { set({ pass: v }); setTested(false); }}
          />
          {copy.passHint ? <Text style={st.inputHint}>{copy.passHint}</Text> : null}
        </View>

        {tested ? (
          <View style={st.infoCard}>
            <View style={st.typeCardHead}>
              <Text style={st.infoTitle}>连接测试通过</Text>
              {copy.badge ? <Text style={st.badge}>{copy.badge}</Text> : null}
            </View>
            <Text style={st.typeCardSub}>可浏览 / 播放 / 导入歌单 / 下载</Text>
          </View>
        ) : null}

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
    flex: 1, minHeight: 230, borderRadius: 18, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18,
  },
  typeFocus: { borderWidth: 2.5, borderColor: C.brand, borderRadius: 18 },
  typeIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: C.brandDim, alignItems: 'center', justifyContent: 'center' },
  typeTitle: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  typeBadge: { backgroundColor: C.brandDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  typeBadgeText: { color: C.brandText, fontSize: 12, fontWeight: '700' },
  typeSub: { color: C.text3, fontSize: 12, textAlign: 'center', lineHeight: 17 },
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
