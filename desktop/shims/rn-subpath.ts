// react-native/* 子路径通用 stub:RNW 不提供 RN 内部文件,全部置空(native-only 代码路径)
const stub = new Proxy(function stub() {}, {
  get: (t, k) => (k === '__esModule' ? true : k === 'default' ? stub : stub),
  apply: () => stub,
});
export default stub;
export const __esModule = true;
