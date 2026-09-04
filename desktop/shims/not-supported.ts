// 桌面原生能力 shim:v1.1.7 前是 throw 占位;现在经 nmDesktop(preload IPC)真实现
// SAF openDocument → Electron 文件对话框;blob-util fetch → 主进程流式下载
const nm = (globalThis as never as Record<string, { openFile?: () => Promise<{ path: string; text: string } | null>; pickDir?: () => Promise<string | null>; saveFile?: (o: { defaultName?: string; text?: string }) => Promise<{ path: string } | null>; download?: (o: Record<string, unknown>) => Promise<{ ok: boolean; path?: string; size?: number; error?: string }> }>).nmDesktop;

export const openDocument = async () => {
  const r = await nm?.openFile?.();
  return r ? [{ uri: r.path, name: r.path.split('/').pop() || 'file' }] : [];
};
export const openDocumentTree = async () => {
  const dir = await nm?.pickDir?.();
  return dir ? { uri: dir } : null;
};
export const readFile = async (uri: string) => {
  const r = await nm?.openFile?.();
  if (!r) throw new Error('未选择文件');
  return r.text;
};
export const writeFile = async () => { throw new Error('桌面版请使用「导出到文件」(保存对话框)'); };
// SAF createDocument → Electron 保存对话框(v1.1.7 备份导出)
export const createDocument = async (text: string, opts?: { initialName?: string }) => {
  const r = await nm?.saveFile?.({ defaultName: opts?.initialName || 'NextMusic-backup.json', text });
  return r ? { uri: r.path } : null;
};
// blob-util fetch 对应:走主进程下载器
export const fetch = async (opts: { url: string; path?: string } | string) => {
  throw new Error('desktop downloads 走 nm:download IPC,不经 blob-util');
};
export default { openDocument, openDocumentTree, readFile, writeFile, createDocument, fetch };
