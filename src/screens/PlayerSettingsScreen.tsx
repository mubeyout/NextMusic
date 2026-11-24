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
      </Section>
      <Section title="收藏">
        {/* 老板 1124:收藏行为可选——弹面板选歌单 / 一键进我喜欢的 */}
        <ValueRow label="收藏方式" value={s.favPickSheet ? '选择歌单' : '直接进我喜欢的'} options={[
          { label: '选择歌单（弹出收藏面板）', value: 'ask' },
          { label: '直接进「我喜欢的」', value: 'direct' },
        ]} onPick={v => settings.set('favPickSheet', v === 'ask')} />
      </Section>
    </PageShell>
  );
}
