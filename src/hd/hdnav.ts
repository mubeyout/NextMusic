// HD 屏外导航辅助:navRef 泛型为 RootParamList(无显式参数表),跳转全部走宽松签名
import { navRef } from '../navRef';

export const hdNav = () =>
  navRef.current as unknown as { navigate: (s: string, p?: object) => void; goBack: () => void } | null;
