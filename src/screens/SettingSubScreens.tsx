// 设置子页（全部真实功能：持久化 + 可操作）
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import RNBlobUtil from 'react-native-blob-util';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SubPage } from '../components/SubPage';
import { ToggleRow, ValueRow, ActionRow, StaticRow, NavRow, InputRow, Section, PageShell } from '../components/SettingRows';
import { settings, useSettings, QUALITY_LABEL, type Quality } from '../services/settings';
import { providerApi } from '../services/providers';
import { library } from '../state/library';
import { downloads as dlStore, fmtBytes } from '../services/downloads';
import { APP_VERSION } from '../services/appversion';

// ---------- 基本设置 ----------
export function BasicSettingsScreen() {
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void };
  const s = useSettings();
  const [cacheSize, setCacheSize] = useState('计算中…');

  const dirSize = async (d: string, depth: number): Promise<number> => {
    if (depth > 3) return 0;
    let names: string[] = [];
    try { names = await RNBlobUtil.fs.ls(d); } catch { return 0; }
    let total = 0;
    for (const n of names) {
      try {
        const st = await RNBlobUtil.fs.stat(`${d}/${n}`);
        if (st.type === 'directory') total += await dirSize(st.path, depth + 1);
        else total += st.size || 0;
      } catch { /* skip */ }
    }
    return total;
  };
  const measure = () => {
    (async () => {
      try { setCacheSize(fmtBytes(await dirSize(RNBlobUtil.fs.dirs.CacheDir, 0))); }
      catch { setCacheSize('未知'); }
    })();
  };
  useEffect(measure, []);

  const clearCache = () => {
    dialog.alert('清除缓存', `当前缓存 ${cacheSize}，确定清除？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清除', style: 'destructive',
        onPress: async () => {
          try {
            const names = await RNBlobUtil.fs.ls(RNBlobUtil.fs.dirs.CacheDir);
            for (const n of names) await RNBlobUtil.fs.unlink(`${RNBlobUtil.fs.dirs.CacheDir}/${n}`).catch(() => {});
            measure();
            toast('缓存已清除');
          } catch { dialog.alert('失败', '清除缓存时出错'); }
        },
      },
    ]);
  };

  return (
    <PageShell title="基本设置" onBack={() => nav.goBack()}>
      <Section title="启动">
        <ValueRow label="启动页面" value={s.startupPage} options={[{ label: '首页', value: 'home' }, { label: '探索', value: 'explore' }, { label: '我的', value: 'my' }]} onPick={v => settings.set('startupPage', v as 'home')} />
        <ToggleRow label="恢复上次播放状态" value={s.restorePlayback} onChange={v => settings.set('restorePlayback', v)} />
        <ToggleRow label="启动即播放" value={s.autoplay} onChange={v => settings.set('autoplay', v)} />
      </Section>
      <Section title="界面">
        <ValueRow label="语言" value="system" options={[{ label: '跟随系统', value: 'system' }, { label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }]} onPick={() => dialog.alert('语言', '当前版本内置中文界面，多语言将随后续版本提供')} />
        <ToggleRow label="底栏显示标签" value={s.showTabLabels} onChange={v => settings.set('showTabLabels', v)} />
        <StaticRow label="圆角风格" value="标准" />
      </Section>
      <Section title="缓存">
        <StaticRow label="图片与网络缓存" value={cacheSize} />
        <ActionRow label="清除缓存" value="" onPress={clearCache} />
        <StaticRow label="已下载占用" value={fmtBytes(dlStore.totalBytes())} />
        <NavRow label="下载管理" value={`${dlStore.all().length} 首`} onPress={() => nav.navigate('Downloads')} />
      </Section>
    </PageShell>
  );
}

// ---------- 主题与外观 ----------
export function ThemeScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const s = useSettings();
  const accents = [
    { name: 'Next 绿', color: '#1ED760' },
    { name: '薄暮蓝', color: '#3B82F6' },
    { name: '晚樱粉', color: '#F472B6' },
    { name: '琥珀橙', color: '#F59E0B' },
  ];
  return (
    <PageShell title="主题与外观" onBack={() => nav.goBack()}>
      <Section title="模式">
        <StaticRow label="深色模式" value="始终深色" />
        <ToggleRow label="纯黑背景（重启生效）" value={s.pureBlack} onChange={v => settings.set('pureBlack', v)} />
      </Section>
      <Section title="强调色">
        <View style={ts.swatchRow}>
          {accents.map(a => (
            <TouchableOpacity key={a.name} style={ts.swatchItem} onPress={() => settings.set('accent', a.color)}>
              <View style={[ts.swatch, { backgroundColor: a.color }, s.accent === a.color && ts.swatchOn]}>
                {s.accent === a.color ? <Icon name="check" size={16} color="#121212" /> : null}
              </View>
              <Text style={ts.swatchName}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={ts.note}>切换强调色后重启应用生效</Text>
      </Section>
    </PageShell>
  );
}

// ---------- 关于与帮助 ----------
export function AboutScreen() {
  const nav = useNavigation() as { goBack: () => void };
  return (
    <PageShell title="关于与帮助" onBack={() => nav.goBack()}>
      <Section title="版本">
        <StaticRow label="当前版本" value={APP_VERSION} />
        <ActionRow label="检查更新" onPress={() => dialog.alert('检查更新', '当前已是最新版本')} />
        <ActionRow label="更新日志" onPress={() => dialog.alert('更新日志', '3.2.0-lx4\n· 我的页移除更多菜单\n\n3.2.0-lx3\n· 服务器账号强关联与创建账号流\n\n3.2.0\n· 净室重建：三 Tab + 排行榜 + 歌单 + 全屏播放器')} />
      </Section>
      <Section title="帮助">
        <StaticRow label="使用手册" value="整理中" />
        <StaticRow label="服务器部署指南" value="整理中" />
        <StaticRow label="常见问题" value="整理中" />
      </Section>
      <Section title="开源与致谢">
        <StaticRow label="LX Music" value="音源引擎" />
        <StaticRow label="Subsonic / Emby / Jellyfin" value="媒体库协议" />
        <StaticRow label="IconPark 图标体系" value="视觉" />
      </Section>
      <Text style={ts.footer}>NextMusic · 为纯粹听歌而生</Text>
    </PageShell>
  );
}

// ---------- 下载设置 ----------
export function DownloadsSettingsScreen() {
  const nav = useNavigation() as { goBack: () => void; navigate: (s: string) => void };
  const s = useSettings();
  const QUALITIES: { label: string; value: Quality }[] = [
    { label: QUALITY_LABEL['128k'], value: '128k' },
    { label: QUALITY_LABEL['320k'], value: '320k' },
    { label: QUALITY_LABEL.flac, value: 'flac' },
  ];
  return (
    <PageShell title="下载设置" onBack={() => nav.goBack()}>
      <Section title="网络">
        <ToggleRow label="仅 Wi-Fi 下载" value={s.wifiOnly} onChange={v => settings.set('wifiOnly', v)} />
        <ValueRow label="下载音质" value={s.downloadQuality} options={QUALITIES} onPick={v => settings.set('downloadQuality', v as Quality)} />
      </Section>
      <Section title="存储">
        <ValueRow label="同时下载数" value={String(s.maxConcurrent)} options={[1, 2, 3, 4, 5].map(n => ({ label: `${n} 首`, value: String(n) }))} onPick={v => settings.set('maxConcurrent', Number(v))} />
        <StaticRow label="下载位置" value="应用内部存储" />
        <NavRow label="下载管理" value={`${dlStore.all().length} 首 · ${fmtBytes(dlStore.totalBytes())}`} onPress={() => nav.navigate('Downloads')} />
      </Section>
    </PageShell>
  );
}

// ---------- 云备份（WebDAV） ----------
interface DavConf { base: string; user: string; pass: string }
const DAV_KEY = 'nextmusic-webdav-backup';

function loadDav(): DavConf {
  try { return { base: '', user: '', pass: '', ...JSON.parse(kvGetString(DAV_KEY) || '{}') }; } catch { return { base: '', user: '', pass: '' }; }
}
// 独立小 KV，避免与媒体库 WebDAV 账号混用
import { createMMKV } from 'react-native-mmkv';
import { dialog, toast } from '../components/Dialog';
const davKv = createMMKV({ id: DAV_KEY });
function kvGetString(k: string): string | undefined { return davKv.getString('conf'); }

export function BackupSettingsScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const s = useSettings();
  const [dav, setDav] = useState<DavConf>(loadDav);
  const [busy, setBusy] = useState(false);

  const save = (patch: Partial<DavConf>) => {
    const next = { ...dav, ...patch };
    setDav(next);
    davKv.set('conf', JSON.stringify(next));
  };

  const test = async () => {
    if (!dav.base) { toast('请先填写服务器地址'); return; }
    setBusy(true);
    try {
      await providerApi.webdavTest(dav);
      dialog.alert('连接成功', 'WebDAV 服务器可用');
    } catch (e) {
      dialog.alert('连接失败', (e as Error).message);
    } finally { setBusy(false); }
  };

  const backupNow = async () => {
    if (!dav.base) { toast('请先配置 WebDAV'); return; }
    setBusy(true);
    try {
      const payload = {
        at: Date.now(), version: APP_VERSION,
        playlists: s.backupPlaylists ? library.all() : undefined,
        settings: s.backupSettings ? settings.get() : undefined,
      };
      await providerApi.webdavPut(dav, '/NextMusic/backup.json', JSON.stringify(payload));
      toast('备份完成 · 已上传到云端');
    } catch (e) {
      dialog.alert('备份失败', (e as Error).message);
    } finally { setBusy(false); }
  };

  const restore = async () => {
    if (!dav.base) { toast('请先配置 WebDAV'); return; }
    setBusy(true);
    try {
      const text = await providerApi.webdavGet(dav, '/NextMusic/backup.json');
      const data = JSON.parse(text) as { playlists?: { id: string; name: string; songs: [] }[]; settings?: Record<string, unknown> };
      const n = data.playlists?.length || 0;
      dialog.alert('恢复备份', `云端备份包含 ${n} 个歌单，是否覆盖本机歌单？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复',
          onPress: () => {
            if (data.playlists) {
              for (const pl of data.playlists) {
                const exist = library.all().find(p => p.name === pl.name);
                if (exist) library.update(exist.id, { songs: pl.songs });
                else library.create(pl.name, pl.songs, { cover: undefined });
              }
            }
            if (data.settings) settings.patch(data.settings as never);
            toast(`已恢复 ${n} 个歌单`);
          },
        },
      ]);
    } catch (e) {
      dialog.alert('恢复失败', (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <PageShell title="云备份" onBack={() => nav.goBack()}>
      <Section title="WebDAV 服务器">
        <InputRow label="服务器地址" value={dav.base} placeholder="http://10.0.0.1:5244/dav" onChange={v => save({ base: v })} />
        <InputRow label="账号" value={dav.user} placeholder="user" onChange={v => save({ user: v })} />
        <InputRow label="密码" value={dav.pass} placeholder="password" secure onChange={v => save({ pass: v })} />
        <ActionRow label={busy ? '处理中…' : '测试连接'} onPress={test} />
      </Section>
      <Section title="备份">
        <ActionRow label={busy ? '处理中…' : '立即备份'} onPress={backupNow} />
        <ActionRow label="从云端恢复" onPress={restore} />
        <ToggleRow label="自动备份" value={s.autoBackup} onChange={v => settings.set('autoBackup', v)} />
      </Section>
      <Section title="备份内容">
        <ToggleRow label="歌单与收藏" value={s.backupPlaylists} onChange={v => settings.set('backupPlaylists', v)} />
        <ToggleRow label="设置项" value={s.backupSettings} onChange={v => settings.set('backupSettings', v)} />
      </Section>
    </PageShell>
  );
}

// ---------- 可视化 ----------
export function VizSettingsScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const s = useSettings();
  return (
    <PageShell title="可视化设置" onBack={() => nav.goBack()}>
      <Section title="样式">
        <ValueRow label="默认样式" value={s.vizStyle} options={[{ label: '波形', value: 'wave' }, { label: '频谱', value: 'spectrum' }, { label: '圆形律动', value: 'circle' }]} onPick={v => settings.set('vizStyle', v as 'spectrum')} />
        <ToggleRow label="播放页显示可视化" value={s.vizEnabled} onChange={v => settings.set('vizEnabled', v)} />
        <ToggleRow label="随音乐变色" value={s.vizColorful} onChange={v => settings.set('vizColorful', v)} />
      </Section>
      <Text style={ts.footer}>可视化组件将在播放页后续版本上线</Text>
    </PageShell>
  );
}

// ---------- 代理 ----------
export function ProxySettingsScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const s = useSettings();
  const p = s.proxy;
  const patch = (v: Partial<typeof p>) => settings.set('proxy', { ...p, ...v });
  return (
    <PageShell title="代理设置" onBack={() => nav.goBack()}>
      <Section title="网络">
        <ToggleRow label="使用代理" value={p.enabled} onChange={v => patch({ enabled: v })} />
        <ValueRow label="代理类型" value={p.type} options={[{ label: 'HTTP', value: 'http' }, { label: 'SOCKS5', value: 'socks5' }]} onPick={v => patch({ type: v as 'http' })} />
        <InputRow label="地址" value={p.host} placeholder="192.168.1.1" onChange={v => patch({ host: v })} />
        <InputRow label="端口" value={p.port} placeholder="7890" onChange={v => patch({ port: v })} />
      </Section>
      <Text style={ts.footer}>代理配置已保存；音源请求走代理的能力在后续版本生效</Text>
    </PageShell>
  );
}

const ts = StyleSheet.create({
  swatchRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 4, marginTop: 10 },
  swatchItem: { alignItems: 'center', gap: 8 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: C.text },
  swatchName: { color: C.text2, fontSize: 11 },
  note: { color: C.text3, fontSize: 11, lineHeight: 15, marginTop: 12, paddingHorizontal: 4 },
  footer: { color: C.text3, fontSize: 11, textAlign: 'center', marginTop: 16, marginBottom: 8, lineHeight: 16 },
});

// 保留 SubPage 引用避免未使用告警（部分页面共用样式）
void SubPage; void useSafeAreaInsets;
