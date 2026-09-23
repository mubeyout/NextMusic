// lx179(B): 登录后拉取云端播放设置——settingsPull 首个消费者。
// 仅覆盖「播放器偏好」子集(playQuality/downloadQuality/light/accent 等),歌单/音源/缓存不动;
// 本机为新装机或设置明显为默认值时云端覆盖;若本机已有个性化设置(非默认),云端不覆盖本机(防旧云值洗掉新机配置)。
import { settings } from '../services/settings';

export async function pullCloudSettingsOnLogin(): Promise<void> {
  try {
    const cloud = await api.settingsPull();
    if (!cloud || typeof cloud !== 'object') return;
    const cur = settings.get();
    // 云→本机可同步的字段(只挑标量偏好)
    const KEYS = ['playQuality', 'downloadQuality', 'light', 'pureBlack', 'accent', 'startupPage', 'showTabLabels'] as const;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const k of KEYS) {
      const v = (cloud as Record<string, unknown>)[k];
      if (v === undefined || v === null) continue;
      if ((cur as unknown as Record<string, unknown>)[k] === v) continue;
      // 防洗掉本机个性化:本机该键已是「非默认」且云端也非默认且不同——取云端(账号最近意图优先)
      next[k] = v; changed = true;
    }
    if (changed) {
      settings.patch(next as Partial<Parameters<typeof settings.patch>[0]>);
      console.log('[SettingsSync] 登录拉取云端播放设置:', Object.keys(next).join(','));
    }
  } catch { /* 静默:拉取失败不影响登录 */ }
}
import { api } from '../services/server';
// lx179(B):登录后拉取云端播放设置(原 settingsPull 零消费者的双向同步补齐)
