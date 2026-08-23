// 播放设置（真实持久化）
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { PageShell, Section, ToggleRow, ValueRow } from '../components/SettingRows';
import { settings, useSettings, QUALITY_LABEL, type Quality } from '../services/settings';

export function PlayerSettingsScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const s = useSettings();
  const QUALITIES: { label: string; value: Quality }[] = [
    { label: QUALITY_LABEL['128k'], value: '128k' },
    { label: QUALITY_LABEL['320k'], value: '320k' },
    { label: QUALITY_LABEL.flac, value: 'flac' },
  ];
  return (
    <PageShell title="播放设置" onBack={() => nav.goBack()}>
      <Section title="默认播放">
        <ValueRow label="默认音质" value={s.playQuality} options={QUALITIES} onPick={v => settings.set('playQuality', v as Quality)} />
        <ToggleRow label="打开歌曲自动播放" value={s.autoplay} onChange={v => settings.set('autoplay', v)} />
        <ToggleRow label="无缝播放" value={s.gapless} onChange={v => settings.set('gapless', v)} />
      </Section>
      <Section title="音频输出">
        <ToggleRow label="音量均衡" value={s.volumeNormalize} onChange={v => settings.set('volumeNormalize', v)} />
      </Section>
      <Section title="缓存与下载">
        <ToggleRow label="仅 Wi-Fi 下载" value={s.wifiOnly} onChange={v => settings.set('wifiOnly', v)} />
      </Section>
    </PageShell>
  );
}
