// LRC parser: supports multiple [mm:ss.ff] tags per line, merges lyric + tlyric
export interface LyricLine {
  t: number; // seconds
  text: string;
  trans?: string;
}

export function parseLrc(raw: string): LyricLine[] {
  const map = new Map<number, LyricLine>();
  let offsetMs = 0; // 1028 老板实测(歌词快一句): LRC [offset:±ms] 标签——正值提前/负值延后,此前未解析被丢弃
  for (const line of raw.split('\n')) {
    const off = /^\s*\[offset:\s*(-?\d+)\s*\]\s*$/i.exec(line);
    if (off) { offsetMs = +off[1]; continue; }
    const times: number[] = [];
    let rest = line.trim();
    let m: RegExpExecArray | null;
    const re = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
    while ((m = re.exec(rest))) {
      const t = +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0) - offsetMs / 1000;
      times.push(t);
    }
    if (!times.length) continue;
    rest = rest.replace(re, '').replace(/<\d+(?:[.,:]\d+)*>/g, '').trim(); // strip intra-line <ms,ms> word tags (lxlyric)
    if (!rest) continue;
    for (const t of times) {
      const exist = map.get(t);
      if (exist) exist.text = rest;
      else map.set(t, { t, text: rest });
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

export function mergeTranslation(base: LyricLine[], tRaw: string): LyricLine[] {
  const tMap = new Map(parseLrc(tRaw).map(l => [Math.round(l.t * 100) / 100, l.text]));
  if (!tMap.size) return base;
  const out = base.map(l => {
    const key = Math.round(l.t * 100) / 100;
    return { ...l, trans: tMap.get(key) };
  });
  return out.length ? out : base;
}

export function findActiveLine(lines: LyricLine[], pos: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= pos) idx = i; // 1028 老板实测(歌词比歌快一行):去 0.3s 提前量——行密集处 300ms 提前点亮下一行=视觉快一行
    else break;
  }
  return Math.max(0, idx - 1); // 1028 老板三轮校准(恒快一句):行匹配语义与源歌词轴错位一行,统一回退一行
}
