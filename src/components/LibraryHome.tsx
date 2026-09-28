// LibraryHome —— ⑤/⑦ 全库首页化 · 统一模板共享骨架(spec docs/library-system-v2-ui-spec.md ⑦ v2.5)
// 四段式: 库头横幅(类型色渐变+库名+统计行+连接状态点) / 快捷动作行 / 筛选chips+视图切换插槽 / 内容分区
// ⑦.3-v2 能力分层: 统一只统一壳——内容分区由各库按源 API 实际能力注入,能力缺失的分区由调用方不渲染(隐藏不占位)
// 视觉 7.4: 本机 #2E4A3E 系 / 云 #1E3A5F 系 / 第三方(WebDAV) #3E2E4A 系 / 公共 #14352A 系(低饱和深色渐变)
// 图标 ⓪-v3(iconpark 定稿,7385a0f 已落地): 本机 folder-music / 云 cloud / 公共 library / 第三方 server 或品牌 logo
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Icon, type IconName } from '../theme/Icon';
import { C } from '../theme/tokens';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';
import { GUTTER, focus } from '../hd/hdstyle';

export type LibKind = 'local' | 'cloud' | 'public' | 'provider';

// 7.4 库头横幅四库类型色(低饱和深色渐变)
export const LIB_KINDS: Record<LibKind, { icon: IconName; grad: [string, string]; label: string }> = {
  local: { icon: 'folder-music', grad: ['#2E4A3E', '#1B2E26'], label: '本机曲库' },
  cloud: { icon: 'cloud', grad: ['#1E3A5F', '#132740'], label: '云曲库' },
  public: { icon: 'library', grad: ['#14352A', '#0C211A'], label: '公共曲库' },
  provider: { icon: 'server', grad: ['#3E2E4A', '#261B2E'], label: '第三方媒体库' },
};

// 7.3 P0.5-3 源健康状态点:正常 brand / 延迟(读取中) warn / 断连 danger
export type LibStatus = 'ok' | 'warn' | 'bad';
const STATUS_COLOR: Record<LibStatus, string> = { ok: C.brand, warn: '#E8B33D', bad: '#D94D45' };

export interface LibQuickAction { icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }

// ⑤-B6 NEW 标:brand 底 onBrand 字 9px radius 999,歌名右侧 4px——7 天内入库歌曲(SongRow/HDSongRow 复用)
export function NewBadge() {
  return (
    <View style={lh.newBadge}><Text style={lh.newBadgeT}>NEW</Text></View>
  );
}

// ── 第一段 · 库头横幅:类型色渐变 + 类型 icon/品牌 logo + 库名 20/700 + 统计行 12 + 连接状态点 ──
export function LibBanner({ kind, name, stats, sub, status, brand, extra }: {
  kind: LibKind; name: string; stats?: string; sub?: string;
  status?: LibStatus | null; brand?: React.ReactNode; extra?: React.ReactNode;
}) {
  const t = LIB_KINDS[kind];
  return (
    <View style={[lh.banner, IS_HD && lh.bannerHD]}>
      <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={lh.bannerGrad} />
      <View style={lh.bannerRow}>
        {brand != null ? (
          <View style={[lh.brandWrap, IS_HD && lh.brandWrapHD]}>{brand}</View>
        ) : (
          <View style={[lh.kindIcon, IS_HD && lh.kindIconHD]}><Icon name={t.icon} size={IS_HD ? 26 : 21} color="#DCEDE3" /></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={lh.nameRow}>
            <Text style={[lh.name, IS_HD && lh.nameHD]} numberOfLines={1}>{name}</Text>
            {status ? <View style={[lh.statusDot, { backgroundColor: STATUS_COLOR[status] }]} /> : null}
          </View>
          {stats ? <Text style={lh.stats} numberOfLines={1}>{stats}</Text> : null}
          {sub ? <Text style={lh.subAddr} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </View>
      {extra}
    </View>
  );
}

// ── 第二段 · 快捷动作行(库型专属 2-4 个 icon 按钮) ──
export function LibActions({ actions }: { actions: LibQuickAction[] }) {
  if (!actions.length) return null;
  return (
    <View style={lh.actionRow}>
      {actions.map(a => IS_HD ? (
        <HDTouch key={a.label} style={[lh.actBtn, a.primary && lh.actBtnPrimary, a.disabled && lh.actBtnOff]}
          onPress={a.disabled ? undefined : a.onPress} focusStyle={focus(12)}>
          <Icon name={a.icon} size={20} color={a.primary ? C.onBrand : C.text2} />
          <Text style={[lh.actT, a.primary && lh.actTPrimary]}>{a.label}</Text>
        </HDTouch>
      ) : (
        <TouchableOpacity key={a.label} style={[lh.actBtn, a.primary && lh.actBtnPrimary, a.disabled && lh.actBtnOff]}
          onPress={a.onPress} disabled={a.disabled} activeOpacity={0.75}>
          <Icon name={a.icon} size={17} color={a.primary ? C.onBrand : C.text2} />
          <Text style={[lh.actT, a.primary && lh.actTPrimary]}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── 第三段 · 筛选 chips(共享件;视图切换=各页既有 tabs/胶囊,插槽式接入) ──
export function ChipsRow({ chips, active, onChange }: {
  chips: { key: string; label: string }[]; active: string; onChange: (k: string) => void;
}) {
  if (chips.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lh.chipsRow}>
      {chips.map(c => {
        const on = c.key === active;
        return IS_HD ? (
          <HDTouch key={c.key} style={[lh.chip, on && lh.chipOn]} onPress={() => onChange(c.key)} focusStyle={focus(999)}>
            <Text style={[lh.chipT, on && lh.chipTOn]}>{c.label}</Text>
          </HDTouch>
        ) : (
          <TouchableOpacity key={c.key} style={[lh.chip, on && lh.chipOn]} onPress={() => onChange(c.key)} activeOpacity={0.75}>
            <Text style={[lh.chipT, on && lh.chipTOn]}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── 第四段 · 内容分区容器(分区头+内容;能力缺失的分区由调用方整段不渲染) ──
export function HomeSection({ title, count, actionLabel, onAction, children }: {
  title: string; count?: number; actionLabel?: string; onAction?: () => void; children?: React.ReactNode;
}) {
  return (
    <View style={lh.section}>
      <View style={lh.secHead}>
        <Text style={[lh.secTitle, IS_HD && lh.secTitleHD]}>{title}</Text>
        {typeof count === 'number' && count > 0 ? <Text style={lh.secCount}>{count}</Text> : null}
        {actionLabel && onAction ? (
          IS_HD ? (
            <HDTouch style={lh.secMore} onPress={onAction} focusStyle={focus(999)}>
              <Text style={lh.secMoreT}>{actionLabel}</Text>
              <Icon name="chevronright" size={12} color={C.text2} />
            </HDTouch>
          ) : (
            <TouchableOpacity style={lh.secMore} onPress={onAction} hitSlop={6}>
              <Text style={lh.secMoreT}>{actionLabel}</Text>
              <Icon name="chevronright" size={12} color={C.text2} />
            </TouchableOpacity>
          )
        ) : null}
      </View>
      {children}
    </View>
  );
}

// 横滑卡轨(最近添加等)
export function HomeRail({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: IS_HD ? 14 : 10 }}>
      {children}
    </ScrollView>
  );
}

// 横滑封面卡:封面或兜底+名+副行(固定宽;DiscCard 的 31% 宽度不适配横滑轨)
export function RailCard({ cover, name, sub, icon, onPress }: {
  cover?: string | null; name: string; sub?: string; icon?: IconName; onPress?: () => void;
}) {
  const size = IS_HD ? 150 : 116;
  const inner = (
    <>
      {cover ? (
        <Image source={{ uri: cover }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: C.surface2 }} />
      ) : (
        <View style={[lh.railFallback, { width: size, height: size }]}>
          <Icon name={icon || 'music'} size={24} color="#ffffff8c" />
        </View>
      )}
      <Text style={[lh.railName, { maxWidth: size }]} numberOfLines={1}>{name}</Text>
      {sub ? <Text style={[lh.railSub, { maxWidth: size }]} numberOfLines={1}>{sub}</Text> : null}
    </>
  );
  if (IS_HD) return <HDTouch style={{ width: size, gap: 5 }} onPress={onPress} focusStyle={focus(12)}>{inner}</HDTouch>;
  return (
    <TouchableOpacity style={{ width: size, gap: 5 }} onPress={onPress} activeOpacity={0.82} disabled={!onPress}>
      {inner}
    </TouchableOpacity>
  );
}

// 组合态:四段一次到位(结构简单的页直接用;需在中间插自有 tabs 的页用上面的分段件)
export function LibraryHome({ kind, name, stats, sub, status, brand, bannerExtra, actions, filters, children }: {
  kind: LibKind; name: string; stats?: string; sub?: string; status?: LibStatus | null;
  brand?: React.ReactNode; bannerExtra?: React.ReactNode;
  actions: LibQuickAction[]; filters?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <View style={[lh.wrap, IS_HD && lh.wrapHD]}>
      <LibBanner kind={kind} name={name} stats={stats} sub={sub} status={status} brand={brand} extra={bannerExtra} />
      <LibActions actions={actions} />
      {filters}
      {children}
    </View>
  );
}

const lh = StyleSheet.create({
  wrap: { marginHorizontal: 16, gap: 12 },
  wrapHD: { marginHorizontal: GUTTER },
  // 库头横幅
  banner: { height: 96, borderRadius: 16, overflow: 'hidden', justifyContent: 'center' },
  bannerHD: { height: 116, borderRadius: 18 },
  bannerGrad: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  kindIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.10)', alignItems: 'center', justifyContent: 'center' },
  kindIconHD: { width: 52, height: 52, borderRadius: 16 },
  brandWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.10)', alignItems: 'center', justifyContent: 'center' },
  brandWrapHD: { width: 52, height: 52, borderRadius: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#F2F7F4', fontSize: 20, lineHeight: 26, fontWeight: '700', flexShrink: 1 },
  nameHD: { fontSize: 23, lineHeight: 30 },
  stats: { color: 'rgba(255,255,255,.85)', fontSize: 12, lineHeight: 17, marginTop: 2 },
  subAddr: { color: 'rgba(255,255,255,.6)', fontSize: 10.5, lineHeight: 15, marginTop: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,.28)', flexShrink: 0 },
  // 快捷动作行
  actionRow: { flexDirection: 'row', gap: 8 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  actBtnPrimary: { backgroundColor: C.brand },
  actBtnOff: { opacity: 0.45 },
  actT: { color: C.text2, fontSize: 11.5, fontWeight: '600' },
  actTPrimary: { color: C.onBrand, fontWeight: '700' },
  // chips
  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.stroke, paddingHorizontal: 13, paddingVertical: 6 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipT: { color: C.text2, fontSize: 12 },
  chipTOn: { color: C.onBrand, fontWeight: '700' },
  // 内容分区
  section: { gap: 9 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secTitle: { color: C.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  secTitleHD: { fontSize: 17, lineHeight: 24 },
  secCount: { color: C.text3, fontSize: 11 },
  secMore: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
  secMoreT: { color: C.text2, fontSize: 12, fontWeight: '500' },
  // 横滑卡
  railFallback: { borderRadius: 10, backgroundColor: C.artTint2, alignItems: 'center', justifyContent: 'center' },
  railName: { color: C.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  railSub: { color: C.text2, fontSize: 10, lineHeight: 13 },
  // NEW 标(⑤-B6)
  newBadge: { backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 1, flexShrink: 0, marginLeft: 4 },
  newBadgeT: { color: C.onBrand, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5 },
});
