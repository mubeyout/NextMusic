// 连接第三方媒体库 —— 按 Figma NM-REMOTE-SELECT-001 / NM-REMOTE-SUBSONIC-001 整页重做
// 选择类型页：Bold 22 标题 + 说明 + 5 张类型卡（#2B2B2B r12 h64，Medium 14 + 推荐/说明 11）
// 连接页：说明 + Tab 容器(#1C1C1C r12 p4) + 输入卡(#2B2B2B r12: label 11 灰 + 值 14 白 + hint 10) + 测试连接/保存并开始索引 h46 r12
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
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
const TYPE_CARDS: { type: ProviderType; title: string; badge?: string; sub: string; icon: 'music' | 'tv' | 'wave' | 'cloud'; mbadge?: string; mcolor?: string }[] = [ // lx153:品牌色 monogram 徽标
  { type: 'navidrome', title: 'Navidrome / Subsonic', badge: '推荐', sub: '优先走 Subsonic 1.16.1 / OpenSubsonic 兼容协议', icon: 'music', mbadge: 'N', mcolor: '#19A457' }, // Navidrome 品牌绿
  { type: 'emby', title: 'Emby / Jellyfin', sub: '用户登录、音乐库选择、直放或服务端转码', icon: 'tv', mbadge: 'E', mcolor: '#52B54B' }, // Emby 品牌绿
  { type: 'daoliyu', title: '道理鱼音乐', sub: '专有适配；可用时优先协商兼容协议', icon: 'wave' },
  { type: 'webdav', title: 'WebDAV 音乐目录', sub: '直接读取远程文件；本地建立只读元数据索引', icon: 'cloud', mbadge: 'W', mcolor: '#3D7DE9' },
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
          <Text style={[st.desc, IS_HD && hdSt.desc]}>选择服务器类型。NextMusic 会先测试能力，再保存凭证。</Text>
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
                  <View style={[hdSt.typeIcon, c.mcolor ? { backgroundColor: c.mcolor } : null]}>
                    {c.mbadge ? <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{c.mbadge}</Text>
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
        <Text style={[st.desc, IS_HD && hdSt.desc]}>{copy.desc || PROVIDER_META[picked].hint}</Text>

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
  title: { color: C.text, fontSize: 22, fontWeight: '700', flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  desc: { color: C.text2, fontSize: 11, lineHeight: 16 },

  // 类型卡（Figma: #2B2B2B r12 p12×14 h64）
  typeCard: { backgroundColor: C.surface2, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
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
  inputCard: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  inputLabel: { color: C.text2, fontSize: 11 },
  inputValue: { color: C.text, fontSize: 14, paddingVertical: 4 },
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
  desc: { color: C.text2, fontSize: 13, lineHeight: 18 },
  inputCard: { backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, gap: 6 },
  inputLabel: { color: C.text2, fontSize: 13 },
  inputValue: { color: C.text, fontSize: 16, paddingVertical: 6 },
  btnGhost: { flex: 1, height: 58, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  btnGhostFocus: { borderWidth: 2, borderColor: C.brand, borderRadius: 14 },
  btnGhostText: { color: C.text, fontSize: 16, fontWeight: '600' },
  btnPrimary: { flex: 1.4, height: 58, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryFocus: { borderWidth: 2.5, borderColor: C.text, borderRadius: 14 },
  btnPrimaryText: { color: C.onBrand, fontSize: 16, fontWeight: '700' },
});
