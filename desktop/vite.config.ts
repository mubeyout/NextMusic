// NextMusic Desktop — vite 配置（react-native-web 底座）
// 关键：alias 把 RN 原生依赖替换为 desktop/shims 的 web 实现；
//       其余依赖（navigation/svg/screens…）经主仓 node_modules 自然解析。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const R = (p: string) => path.resolve(__dirname, p);
const SHIMS = R('shims');
const ROOT = R('..'); // 主仓(NextMusic)

export default defineConfig({
  base: './', // Electron file:// 加载需相对资产路径
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      // 单一 React 实例:所有层(主仓组件/RNW/react-dom)钉到主仓 react,避免双实例 hooks 崩
      { find: /^react-dom\/client$/, replacement: `${__dirname}/node_modules/react-dom/client.js` },
      { find: /^react-dom$/, replacement: `${__dirname}/node_modules/react-dom` },
      { find: /^react$/, replacement: `${ROOT}/node_modules/react` },
      { find: /^react-native-linear-gradient$/, replacement: `${SHIMS}/linear-gradient.tsx` },
      { find: /^react-native-mmkv$/, replacement: `${SHIMS}/mmkv.ts` },
      { find: /^react-native-audio-pro$/, replacement: `${SHIMS}/audio-pro.ts` },
      { find: /^react-native-webview$/, replacement: `${SHIMS}/webview.tsx` },
      { find: /^react-native-gesture-handler$/, replacement: `${SHIMS}/gesture.tsx` },
      { find: /^react-native-safe-area-context$/, replacement: `${SHIMS}/safe-area.tsx` },
      { find: /^@react-navigation\/native-stack$/, replacement: `${ROOT}/node_modules/@react-navigation/native-stack` },
      { find: /^react-native-svg$/, replacement: `${SHIMS}/svg.tsx` },
      { find: /^react-native-screens$/, replacement: `${SHIMS}/screens.tsx` },
      // @react-navigation 全家钉主仓实例(避免 desktop 新 stack 的嵌套 core 双实例 → Couldn't register navigator)
      { find: /^@react-navigation\/core$/, replacement: `${ROOT}/node_modules/@react-navigation/core` },
      { find: /^@react-navigation\/routers$/, replacement: `${ROOT}/node_modules/@react-navigation/routers` },
      { find: /^@react-navigation\/elements$/, replacement: `${ROOT}/node_modules/@react-navigation/elements` },
      { find: /^@react-navigation\/native$/, replacement: `${ROOT}/node_modules/@react-navigation/native` },
      { find: /^react-native-saf-x$/, replacement: `${SHIMS}/not-supported.ts` },
      { find: /^react-native-blob-util$/, replacement: `${SHIMS}/not-supported.ts` },
      // react-native 子路径(native-only 内部文件)一律 stub —— 必须先于裸名匹配
      { find: /^react-native\/.+$/, replacement: `${SHIMS}/rn-subpath.ts` },
      // 最后：react-native → react-native-web（绝对入口，避免裸名被当文件路径）
      { find: /^react-native$/, replacement: `${SHIMS}/rn.ts` },
    ],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.APP_FLAVOR': JSON.stringify('hd'),
    'process.env.APP_VERSION': JSON.stringify(require('./package.json').version),
    // RNW 内部 44 处裸 global(performance/cancelAnimationFrame 等)——Electron preload 设了 global,
    // 纯浏览器(服务端部署)无 → ReferenceError。词法替换为 globalThat,两端皆可
    global: 'globalThis',
  },
  server: { port: 5199, strictPort: true, proxy: { '/api': 'http://127.0.0.1:9527' } }, // dev 验证用:web 形态音源调用走相对路径 /api,同源转发到本地服务
  build: { outDir: R('dist'), emptyOutDir: true, chunkSizeWarningLimit: 4096 },
});
