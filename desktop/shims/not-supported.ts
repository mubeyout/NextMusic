// 桌面暂不支持的原生能力占位（SAF 文件选择 / blob 下载器）
// 调用时抛出可读错误；后续版本用 Electron 文件对话框实现
const unsupported = (name: string) => () => {
  throw new Error(`桌面版暂不支持该能力: ${name}（规划中）`);
};

export const openDocument = unsupported('openDocument');
export const readFile = unsupported('readFile');
export const writeFile = unsupported('writeFile');
export const fetch = unsupported('blob-fetch');
export default { openDocument, readFile, writeFile, fetch };
