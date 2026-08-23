// LRC parser: supports multiple [mm:ss.ff] tags per line, merges lyric + tlyric
export interface LyricLine {
  t: number; // seconds
  text: string;
  trans?: string;
}

export function parseLrc(raw: string): LyricLine[] {
  const map = new Map<number, LyricLine>();
  for (const line of raw.split('\n')) {
    const times: number[] = [];
    let rest = line.trim();
    let m: RegExpExecArray | null;
    const re = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
    while ((m = re.exec(rest))) {
      const t = +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0);
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
    if (lines[i].t <= pos + 0.3) idx = i;
    else break;
  }
  return idx;
}
