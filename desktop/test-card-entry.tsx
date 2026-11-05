// [验收出图] WebLyricCardModal standalone 渲染页——必须先走主入口同款 polyfills(vite alias 的 mmkv 等 shim 依赖它)——mock song/lyrics,零服务器依赖
// CDP 驱动它自带的 Pill 面板切版式/主题/选项后对 canvas 截图
import './src/polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebLyricCardModal } from '../src/hd/WebLyricCardModal';
import type { LyricLine } from '../src/services/lyric';
import type { SongItem } from '../src/services/server';

const song: SongItem = {
  name: '晴天',
  singer: '周杰伦',
  source: 'kw', songmid: 'acc-test-001', albumId: 'acc',
  interval: '04:29', albumName: '叶惠美',
  img: 'http://127.0.0.1:8799/cover.png',
  lrc: null,
};
const NO_LYRIC = typeof location !== 'undefined' && location.search.includes('nolyric=1');
const lyrics: LyricLine[] = NO_LYRIC ? [] : [
  { t: 12, text: '从前从前 有个人爱你很久' },
  { t: 26, text: '但偏偏 风渐渐 把距离吹得好远' },
  { t: 44, text: '好不容易 又能再多爱一天' },
  { t: 62, text: '但故事的最后 你好像还是说了拜拜' },
  { t: 88, text: '刮风这天 我试过握着你手' },
  { t: 106, text: '但偏偏 雨渐渐 大到我看你不见' },
];

function Host() {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {open && <WebLyricCardModal onClose={() => setOpen(true)} song={song} lyrics={lyrics} positionSec={167} />}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Host />);
