// 帮助内容页：使用手册 / 服务器部署指南 / 常见问题（静态内置，离线可用）
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/tokens';
import { PageShell } from '../components/SettingRows';

function Doc({ blocks, title }: { title: string; blocks: { h?: string; p?: string; li?: string[] }[] }) {
  const nav = useNavigation() as unknown as { goBack: () => void };
  return (
    <PageShell title={title} onBack={() => nav.goBack()}>
      {blocks.map((b, i) => (
          <View key={i} style={s.block}>
            {b.h ? <Text style={s.h}>{b.h}</Text> : null}
            {b.p ? <Text style={s.p}>{b.p}</Text> : null}
            {b.li?.map((x, j) => (
              <View key={j} style={s.liRow}>
                <Text style={s.dot}>·</Text>
                <Text style={s.li}>{x}</Text>
              </View>
            ))}
          </View>
        ))}
    </PageShell>
  );
}

// ---------- 使用手册 ----------
const MANUAL = [
  { h: '快速上手', p: '首次打开 App：选择使用方式。本地模式无需任何配置即可搜索试听（浏览与搜索始终免费）；连接自建服务器后可登录账号并同步歌单。' },
  { h: '搜索与播放', li: [
    '搜索页支持五个音源（酷我/酷狗/网易/QQ/咪咕），点击顶部胶囊切换',
    '播放需要：登录服务器，或在「设置 → 音源管理」添加自定义音源',
    '点歌即播；播放页下滑可查看歌词与评论',
    '播放页三圆钮：收藏 / 下载 / 播放队列',
  ] },
  { h: '歌单管理', li: [
    '「我的 → 歌单」长按歌单可重命名 / 删除',
    '歌单详情页右上角 more 菜单：重新同步（平台歌单）/ 单曲移除',
    '导入在线歌单：我的 → 导入，粘贴网易 / QQ 音乐歌单链接',
    '媒体库（Emby 等）专辑弹窗支持「导入歌单」与「导入并下载」',
  ] },
  { h: '媒体库（第三方音乐服务器）', li: [
    '支持 Emby / Jellyfin / Navidrome / 道理鱼 / WebDAV 五类',
    '「我的 → 媒体库 → 添加」按向导填写地址与账号即可',
    '删除连接前会提示受影响的歌曲数量；重新连接同一服务器可自动恢复已导入歌曲',
    '无损格式（APE 等）会自动走服务器转码播放，首次启动稍慢属正常',
  ] },
  { h: '下载与离线', li: [
    '播放页 / 歌单页可下载歌曲；已下载歌曲自动离线优先播放',
    '「设置 → 下载设置」可调音质、并发数、查看失败记录',
    '设备本地音乐：「我的 → 本地音乐」扫描后可加入歌单',
  ] },
  { h: '音效（FX）', p: '设置 → 音效设置：10 段均衡器、14 种混响（真实 IR 卷积）、变调、3D 环绕。登录服务器后与 Web 播放器设置互通。' },
  { h: '备份', p: '设置 → 云备份：配置 WebDAV 后可把歌单与设置备份到云端；也支持导出为本地文件手动转移（见「数据导入导出」）。' },
];

export function ManualScreen() { return <Doc title="使用手册" blocks={MANUAL} />; }

// ---------- 更新日志（从 1.0.5 起重新记录，旧内测期归档已清） ----------
const CHANGELOG: { h: string; li: string[] }[] = [
  { h: '1.3.2（今日主线：账号体系重构 + 音源治理 + 设置全量审计）', li: [
    '登录非必须：浏览/搜索/歌单/榜单/评论免费开放；自有音源与媒体库不依赖服务器账号；登录只为云同步(歌单/设置/音源/缓存)且永不强制跳页',
    '音源治理：服务器共享源多级容灾(多源排序自动回落) · 每 6h 有效性检测(搜索+取链端到端) · 连续 3 次失败自动禁用 · 每日自动更新(可关)',
    '设置审计补齐 20/20：同时下载数 web 生效(并发 1-5) · 下载失败一键重试 · 服务器缓存列表 · 播放设置登录双向同步 · 键盘快捷键补 Alt+←→ 切歌',
    '媒体库体验：⋯ 管理菜单三端常驻(原 hover 限定) · web 列表 860 居中 · 匿名可播(带 h= 鉴权头直连代理)',
    'web 端自定义音源沙箱上线：iframe 沙箱 + 服务器 CORS 代理，自定义音源在浏览器真实可播',
    'README/GitHub 同步更新：投播设备、全能第三方客户端(12 种服务直连)等卖点上线',
  ] },
  { h: '1.3.1', li: [
    '播放优先级:本地→服务器端→音源(跨源同名歌直接播本地)',
    'WebDAV 媒体库 HD/桌面/docker 三端适配',
    '桌面版 macOS/Windows/Linux 上线;更新渠道回归 GitHub Releases',
  ] },
  { h: '1.0.5', li: [
    '新增：浅色主题（我的 → 设置 → 主题与外观 → 浅色），配色与桌面 Web 同源',
    '新增：浅色主题全量适配——输入框、按钮、开关、弹层、底栏图标等所有残留暗色/白色细节全部随主题切换',
    '新增：播放页黑胶唱片随播放旋转，暂停时停在当前角度',
    '修复：部分手机（如一加/OPPO）连接第二台蓝牙设备后，音频被系统多设备协同抢走，应用内切「本机扬声器」失效——新增抢路由哨兵，被抢后自动重建音频管线夺回输出',
    '更新日志从本版起重新记录',
  ] },
];

export function ChangelogScreen() { return <Doc title="更新日志" blocks={CHANGELOG} />; }

// ---------- 服务器部署指南 ----------
const DEPLOY = [
  { h: '这是什么', p: 'App 的在线搜索取链、账号与歌单同步、音效同步由自建的 LX Server 提供（开源项目 XCQ0607/lxserver）。不部署也可用本地模式 + 自定义音源。' },
  { h: 'Docker 一键部署', p: 'docker run 示例（数据目录按需替换）：' },
  { li: [
    'docker pull ghcr.io/xcq0607/lxserver:latest',
    'docker run -d --name lxmusic -p 9527:9527 \\',
    '  -v /path/to/data:/server/data \\',
    '  ghcr.io/xcq0607/lxserver:latest',
    '浏览器打开 http://服务器IP:9527 完成初始化与建号',
  ] },
  { h: '在 App 中连接', li: [
    '首次启动 Server 页填写服务器地址（如 http://192.168.1.10:9527）',
    '外网访问需自行配置端口映射 / DDNS / HTTPS',
    '登录后在「我的 → 使用方式与账号」可随时更换服务器地址',
  ] },
  { h: '音源配置（服务器端）', li: [
    '登录 Web 端后在设置里绑定自定义音源（聆澜等）',
    '服务器端音源对所有登录客户端生效；App 内也可单独添加本地音源',
    '取链失败时优先检查服务器端音源是否可用',
  ] },
  { h: '安全建议', li: [
    '不要把服务器直接暴露在公网不做 HTTPS',
    '建议反向代理 + 强密码 + 仅开放必要端口',
  ] },
];

export function DeployGuideScreen() { return <Doc title="服务器部署指南" blocks={DEPLOY} />; }

// ---------- 常见问题 ----------
const FAQ = [
  { h: '搜索能出结果，播放失败？', p: '浏览和搜索免费；播放需要登录服务器（服务器端绑定音源）或在 App 内添加自定义音源。两者配置其一即可。' },
  { h: '媒体库里的歌播放失败？', li: [
    '检查媒体库连接是否有效（我的 → 媒体库）',
    '删除过连接又重连的：同一服务器会自动恢复，无需重新导入',
    'APE 等无损首次播放需服务器转码预热，等待 10~20 秒属正常',
    '仍失败时：歌单详情 → 移除失效歌曲 一键清理',
  ] },
  { h: '下载的歌去哪了？', p: '下载保存在应用内部存储（设置 → 下载设置 → 下载管理可查看）。受 Android 10+ 存储策略限制，文件在应用私有目录，卸载 App 会一并删除，重要内容请备份。' },
  { h: '换了手机怎么迁移数据？', li: [
    '云备份：新旧设备配置同一个 WebDAV，旧设备「立即备份」→ 新设备「从云端恢复」',
    '文件方式：旧设备「导出到文件」→ 新设备「从文件导入」',
  ] },
  { h: '播放时歌词不显示？', p: '在线歌曲自动匹配歌词；媒体库歌曲取决于服务器是否提供歌词元数据。部分小众曲目可能无歌词。' },
  { h: '外网访问家里服务器？', p: '需要自行配置路由器端口映射 + DDNS，或使用内网穿透（Tailscale / frp 等）。App 内所有地址均支持填写域名。' },
  { h: '检查更新失败？', p: '检查更新需要能访问更新源（默认内网地址）。外网使用时可把更新源改为公网可达地址，或直接从分发渠道获取新版本。' },
];

export function FaqScreen() { return <Doc title="常见问题" blocks={FAQ} />; }

const s = StyleSheet.create({
  block: { marginBottom: 22 },
  h: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  p: { color: C.text2, fontSize: 13, lineHeight: 21 },
  liRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  dot: { color: C.brandText, fontSize: 13, lineHeight: 21 },
  li: { color: C.text2, fontSize: 13, lineHeight: 21, flex: 1 },
});
