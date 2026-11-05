// Shared by React Native, Web, HD and the NM/Next Figma library.
export const DESIGN = {
  "colors": {
    "brand": [
      "#1ED760",
      "#1ED760",
      "#1ED760"
    ],
    "onBrand": [
      "#121212",
      "#0B3D1F",
      "#121212"
    ],
    "bg": [
      "#121212",
      "#F6F7F9",
      "#000000"
    ],
    "bgDeep": [
      "#06080D",
      "#FFFFFF",
      "#06080D"
    ],
    "surface": [
      "#1A1A1A",
      "#FFFFFF",
      "#101010"
    ],
    "surface2": [
      "#232323",
      "#F0F1F4",
      "#181818"
    ],
    "elev": [
      "#1C1C1C",
      "#FFFFFF",
      "#1C1C1C"
    ],
    "text": [
      "#FFFFFF",
      "#26282C",
      "#FFFFFF"
    ],
    "text2": [
      "#B3B3B3",
      "#62676E",
      "#B3B3B3"
    ],
    "text3": [
      "#595959",
      "#8B9199",
      "#595959"
    ],
    "brandText": [
      "#1ED760",
      "#0E8A44",
      "#1ED760"
    ],
    "brandSoft": [
      "#6BE88F",
      "#1DB455",
      "#6BE88F"
    ],
    "selTint": [
      "#14251C",
      "#DFF2E7",
      "#14251C"
    ],
    "stroke": [
      "#FFFFFF14",
      "#1F232914",
      "#FFFFFF14"
    ],
    "strokeStrong": [
      "#FFFFFF1F",
      "#1F232924",
      "#FFFFFF1F"
    ],
    "inset": [
      "#242424",
      "#EDEFF3",
      "#242424"
    ],
    "inset2": [
      "#2E2E2E",
      "#E4E7EC",
      "#2E2E2E"
    ],
    "searchPill": [
      "#171717",
      "#ECEEF2",
      "#171717"
    ],
    "inputBar": [
      "#141414",
      "#F0F1F4",
      "#141414"
    ],
    "artTint": [
      "#233029",
      "#E7F1EB",
      "#233029"
    ],
    "danger": [
      "#FF6B6B",
      "#FF6B6B",
      "#FF6B6B"
    ],
    "heart": [
      "#FF5A76",
      "#FF5A76",
      "#FF5A76"
    ],
    "warning": [
      "#F0C75E",
      "#8A6914",
      "#F0C75E"
    ]
  },
  "space": {
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "xxl": 32,
    "section": 40
  },
  "radius": {
    "control": 12,
    "card": 16,
    "hero": 24,
    "pill": 999
  },
  "type": {
    "caption": 12,
    "body": 14,
    "label": 14,
    "subtitle": 18,
    "title": 24,
    "hero": 32
  },
  "layout": {
    "Phone": {
      "pagePadding": 16,
      "sectionGap": 24,
      "cardMin": 144,
      "touch": 44,
      "sidebar": 0,
      "playbar": 72
    },
    "Tablet": {
      "pagePadding": 24,
      "sectionGap": 32,
      "cardMin": 160,
      "touch": 44,
      "sidebar": 72,
      "playbar": 80
    },
    "Desktop": {
      "pagePadding": 32,
      "sectionGap": 32,
      "cardMin": 168,
      "touch": 44,
      "sidebar": 224,
      "playbar": 88
    },
    "HD": {
      "pagePadding": 24,
      "sectionGap": 32,
      "cardMin": 160,
      "touch": 56,
      "sidebar": 208,
      "playbar": 88
    }
  }
} as const;

export type LayoutKind = keyof typeof DESIGN.layout;
export const SPACE = DESIGN.space;
export const RADIUS = DESIGN.radius;
export const TYPE = DESIGN.type;
export const BREAKPOINT = { tablet: 600, desktop: 1024, wide: 1440 } as const;
export const CONTENT_MAX = 1440;

export function layoutForWidth(width: number, hd = false) {
  const kind: LayoutKind = hd ? 'HD' : width < BREAKPOINT.tablet ? 'Phone' : width < BREAKPOINT.desktop ? 'Tablet' : 'Desktop';
  return { kind, ...DESIGN.layout[kind], compact: width < BREAKPOINT.desktop, narrow: width < BREAKPOINT.tablet };
}

/** Fit columns to the measured container. Never squeeze cards below their minimum. */
export function gridMetrics(width: number, min = 144, gap: number = SPACE.md, maxCols = 8, _preferredMinCols = 1) {
  const available = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : SPACE.md;
  const safeMin = Number.isFinite(min) ? Math.max(1, min) : 144;
  const cap = Number.isFinite(maxCols) ? Math.max(1, Math.floor(maxCols)) : 8;
  const fits = Math.max(1, Math.floor((available + safeGap) / (safeMin + safeGap)));
  // A preferred minimum cannot override the space available.
  const cols = Math.min(cap, fits);
  return { cols, itemWidth: available > 0 ? Math.max(0, (available - safeGap * (cols - 1)) / cols) : 0 };
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
export function luminance(hex: string) {
  const c = rgb(hex).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, k: number) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round((v * (1 - k) + B[i] * k) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function readableAccent(accent: string, background: string, light: boolean) {
  let color = accent;
  for (let i = 0; i < 20 && contrast(color, background) < 4.5; i++) color = mix(color, light ? '#000000' : '#FFFFFF', 0.12);
  return color;
}
/** Keep the original NextMusic palette while sharing semantic tokens across clients. */
const ORIGINAL_COLORS: ReadonlyArray<Record<string,string>> = [
  {
    "brand": "#1ED760",
    "proGold": "#F0C75E",
    "proGoldDark": "#8A6914",
    "brandDim": "#1ed76047",
    "brandSoft": "#6BE88F",
    "bg": "#121212",
    "bgDeep": "#06080D",
    "bgGradientTop": "#0D2A1B",
    "surface": "#1A1A1A",
    "surface2": "#232323",
    "elev": "#1C1C1C",
    "text": "#FFFFFF",
    "text2": "#B3B3B3",
    "text3": "#595959",
    "onBrand": "#121212",
    "white": "#FFFFFF",
    "stroke": "#FFFFFF14",
    "inset": "#242424",
    "inset2": "#2E2E2E",
    "inputBar": "#141414",
    "searchPill": "#171717",
    "strokeFaint": "#FFFFFF0F",
    "strokeStrong": "#FFFFFF1F",
    "handle": "#FFFFFF2E",
    "scrim": "#000000AA",
    "artTint": "#233029",
    "artTint2": "#1E2B24",
    "selTint": "#14251C",
    "badgeOn": "#0E3B1F",
    "knobOn": "#0E3B1F",
    "knob": "#FFFFFF",
    "failTint": "#2A1A1A",
    "sheet": "#161618F5",
    "brandText": "#1ED760",
    "heart": "#FF5A76",
    "danger": "#FF6B6B",
    "warning": "#F0C75E",
    "hover": "rgba(255,255,255,.05)",
    "input": "rgba(255,255,255,.06)",
    "pop": "#22262E",
    "track": "rgba(255,255,255,.14)",
    "grad1": "rgba(255,255,255,.055)",
    "grad2": "rgba(255,255,255,.018)",
    "border": "#FFFFFF14",
    "glass": "rgba(16,18,22,.66)",
    "glassStrong": "rgba(22,25,30,.8)",
    "glassBar": "rgba(16,18,22,.9)"
  },
  {
    "brand": "#1ED760",
    "proGold": "#8A6914",
    "proGoldDark": "#8A6914",
    "brandDim": "#1ed76047",
    "brandSoft": "#1DB455",
    "bg": "#F6F7F9",
    "bgDeep": "#FFFFFF",
    "bgGradientTop": "#EAF6EE",
    "surface": "#FFFFFF",
    "surface2": "#F0F1F4",
    "elev": "#FFFFFF",
    "text": "#26282C",
    "text2": "#62676E",
    "text3": "#8B9199",
    "onBrand": "#0B3D1F",
    "white": "#FFFFFF",
    "stroke": "#1F232914",
    "inset": "#EDEFF3",
    "inset2": "#E4E7EC",
    "inputBar": "#F0F1F4",
    "searchPill": "#ECEEF2",
    "strokeFaint": "#1F232912",
    "strokeStrong": "#1F232924",
    "handle": "#1F23293D",
    "scrim": "#00000066",
    "artTint": "#E7F1EB",
    "artTint2": "#E7F1EB",
    "selTint": "#DFF2E7",
    "badgeOn": "#D9F4E5",
    "knobOn": "#FFFFFF",
    "knob": "#8F969E",
    "failTint": "#FDEEEE",
    "sheet": "#FAFBFCF5",
    "brandText": "#0E8A44",
    "heart": "#FF5A76",
    "danger": "#FF6B6B",
    "warning": "#8A6914",
    "hover": "rgba(31,35,41,.045)",
    "input": "rgba(31,35,41,.04)",
    "pop": "#FFFFFF",
    "track": "rgba(31,35,41,.14)",
    "grad1": "rgba(31,35,41,.045)",
    "grad2": "rgba(31,35,41,.012)",
    "border": "#1F232914",
    "glass": "rgba(255,255,255,.7)",
    "glassStrong": "rgba(255,255,255,.9)",
    "glassBar": "rgba(255,255,255,.92)"
  },
  {
    "brand": "#1ED760",
    "proGold": "#F0C75E",
    "proGoldDark": "#8A6914",
    "brandDim": "#1ed76047",
    "brandSoft": "#6BE88F",
    "bg": "#000000",
    "bgDeep": "#06080D",
    "bgGradientTop": "#0D2A1B",
    "surface": "#101010",
    "surface2": "#181818",
    "elev": "#1C1C1C",
    "text": "#FFFFFF",
    "text2": "#B3B3B3",
    "text3": "#595959",
    "onBrand": "#121212",
    "white": "#FFFFFF",
    "stroke": "#FFFFFF14",
    "inset": "#242424",
    "inset2": "#2E2E2E",
    "inputBar": "#141414",
    "searchPill": "#171717",
    "strokeFaint": "#FFFFFF0F",
    "strokeStrong": "#FFFFFF1F",
    "handle": "#FFFFFF2E",
    "scrim": "#000000AA",
    "artTint": "#233029",
    "artTint2": "#1E2B24",
    "selTint": "#14251C",
    "badgeOn": "#0E3B1F",
    "knobOn": "#0E3B1F",
    "knob": "#FFFFFF",
    "failTint": "#2A1A1A",
    "sheet": "#161618F5",
    "brandText": "#1ED760",
    "heart": "#FF5A76",
    "danger": "#FF6B6B",
    "warning": "#F0C75E",
    "hover": "rgba(255,255,255,.05)",
    "input": "rgba(255,255,255,.06)",
    "pop": "#22262E",
    "track": "rgba(255,255,255,.14)",
    "grad1": "rgba(255,255,255,.055)",
    "grad2": "rgba(255,255,255,.018)",
    "border": "#FFFFFF14",
    "glass": "rgba(16,18,22,.66)",
    "glassStrong": "rgba(22,25,30,.8)",
    "glassBar": "rgba(16,18,22,.9)"
  }
];
export function themeColors(s: { light?: boolean; pureBlack?: boolean; accent?: string }) {
  const mode = s.light ? 1 : s.pureBlack ? 2 : 0;
  const c = { ...ORIGINAL_COLORS[mode] };
  const accent = s.accent && /^#[0-9a-f]{6}$/i.test(s.accent) && s.accent.toUpperCase() !== '#1ED760' ? s.accent : null;
  if (accent) {
    c.brand = accent; c.brandDim = accent + '47';
    c.brandText = readableAccent(accent, c.bg, !!s.light);
    if (contrast(c.brandText, c.surface) < 4.5) c.brandText = readableAccent(c.brandText, c.surface, !!s.light);
    c.brandSoft = s.light ? mix(accent, '#000000', 0.22) : accent;
    c.onBrand = contrast(accent, '#121212') >= 4.5 ? '#121212' : contrast(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#000000';
    c.bgGradientTop = mix(c.bg, accent, s.light ? 0.14 : 0.16);
    c.selTint = mix(accent, s.light ? '#FFFFFF' : c.bg, s.light ? 0.87 : 0.85);
    c.badgeOn = s.light ? mix(accent, '#FFFFFF', 0.88) : c.selTint;
    c.artTint = c.artTint2 = s.light ? mix(accent, '#FFFFFF', 0.9) : ORIGINAL_COLORS[mode].artTint;
  }
  return c;
}
