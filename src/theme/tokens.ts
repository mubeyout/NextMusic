// Design tokens — extracted 1:1 from Figma "测试2" · NextMusic design system
export const C = {
  brand: '#1ED760',       // Next Green
  brandDim: '#1ed76047',
  brandSoft: '#6BE88F',   // lyrics active green
  bg: '#121212',          // Night
  bgDeep: '#06080D',      // player page
  bgGradientTop: '#0D2A1B',
  surface: '#1A1A1A',     // cards on Night (b3 area)
  surface2: '#232323',
  text: '#FFFFFF',
  text2: '#B3B3B3',
  text3: '#595959',
  onBrand: '#121212',     // text on green/white pills
  white: '#FFFFFF',
  stroke: '#FFFFFF14',
} as const;

export const SP = {
  screen: 20,             // horizontal page padding (Figma @20, width 350 on 390)
};

export const FS = {
  // rounded sizes used across screens
  title28: 28,
  title24: 24,
  title18: 18,
  title17: 17,
  body14: 14,
  body13: 13,
  body12: 12,
  caption11: 11,
  caption10: 10,
  small9: 9,
} as const;
