# 三端分层与改动守则（phone / HD / desktop）

> 目的：共享核心代码的复用收益最大化，同时防止「改一个端改坏另一个端」。
> 机械防护：`node scripts/check-boundaries.mjs`（发布/合码前必跑）。

## 端点构成

| 端 | 形态 | 构建 | 代码组成 |
|----|------|------|---------|
| phone | 手机竖版 | `assemblePhoneRelease` | L0 + L1 |
| HD | 车机/TV 横版（包名 .hd） | `assembleHdRelease` | L0 + L2 + **L1 桥接子集** |
| desktop | RN-Web + Electron（**渲染 HD 形态**） | `cd desktop && npm run build` | 同 HD 树 + `Platform.OS==='web'` 适配 |

## 分层（依赖只能自上而下）

```
L2 HD UI 层     src/hd/*（HDMain/HDPlayer/HDPlayerBar/HDCollect/HDSearch...）
                 desktop/*（Electron 壳,入口渲染 HD 形态）
                      │ 复用桥接屏(IS_HD 分支适配)
L1 phone UI 层  src/screens/*  src/components/*（MiniPlayer/CollectSheet/ActionSheet/Dialog...）
                      │
L0 核心层       src/state/*（PlayerProvider/AppState/library/favorites/useFav）
                 src/services/*（server/lxapi/sync/downloads/lyric）
                 src/theme/*（tokens/Icon/icon-data）
```

- **L0 三端共享**：任何改动波及全部三端
- **L2 → L1 是允许的**（HD 复用 phone 屏，屏内用 `IS_HD` 分支适配）
- **L1 → L2 禁止**（phone 层不得 import `src/hd/*`；守护脚本拦截）
- 少数「物理在 hd/、语义属共享」的原语走白名单：`HDTouch`（D-pad 触控）、`HDActions`（命令弹窗通道）、`hdtokens`、`hdkeyboard`——待逐步迁往共享层
- `useFav` 已归位 `src/state/useFav.ts`（lx160，原在 hd/ 被 phone 反向引用）

## L1 桥接屏清单（HD/桌面正在复用的 phone 屏）

改这些 = 改 HD/桌面，必须双端验证：

`QueueScreen` `CommentsScreen` `PlayerSettingsScreen` `ImportPlaylistScreen` `FxScreen` `MediaLibsScreen` `SearchScreen` `RouteScreen` `SettingSubScreens` `SourcesAccountScreens` `ProviderEditScreen`

（`PlaylistDetail`/`Settings`/登录等已有 HD 独立实现 `HDPlaylistDetail`/`HDSettings`/`HDAuthLogin`，不在此列。）

## 改动检查清单

1. 改 **L0**（state/services/theme）→ 三端全验：phone+hd 双构建装机，desktop `npm run build` 冒烟
2. 改 **L1 非桥接**（如 MiniPlayer、HomeScreen）→ 验 phone；`grep -rn "hd/"` 确认无 HD 引用
3. 改 **L1 桥接屏** → 验 phone + HD + desktop
4. 改 **L2**（src/hd、desktop）→ 验 HD + desktop；跑边界脚本确认 phone 无引用
5. 动到 `IS_HD` / `Platform.OS` 分支的文件 = 天然桥接，按波及面大的端处理
6. 合码前：`node scripts/check-boundaries.mjs` 必须绿

## 历史教训（为什么要有这份文档）

- lx157 收藏改造时把 `hd/useFav` 引进了 phone 层（MiniPlayer/PlayerScreen）——典型 L1→L2 反向依赖，若日后重构 hd/ 目录会静默炸 phone
- lx158 菜单去重时改了共享 `PlaylistDetailScreen`，同一次改动同时影响 phone 与 HD 表现——桥接屏必须有双端验证意识
