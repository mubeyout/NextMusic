# NextMusic Server · Docker 部署

自托管音乐服务器：网页播放器（手机/桌面自适应）+ 管理控制台 + LX Music 客户端同步/自定义源服务。
基于开源 [lxserver](https://github.com/XCQ0607/lxserver)（Apache-2.0）扩展，详见镜像内 `/server/NOTICE.md`。

## 快速开始

```bash
mkdir nextmusic && cd nextmusic
curl -O https://raw.githubusercontent.com/mubeyout/NextMusic/main/docker/docker-compose.yml
mkdir data
docker compose up -d
```

打开 `http://<服务器IP>:9527` 即播放器；`http://<服务器IP>:9527/admin/` 进管理台（首次引导创建管理员账号）。

## 说明

| 项 | 值 |
|---|---|
| 端口 | `9527`（播放器 / 管理台 / API 同端口，改 compose 映射即可） |
| 数据卷 | `/server/data`（用户、凭证、日志、下载队列）——**升级/换机只迁移这个目录** |
| 环境变量 | `PORT`（默认 9527）、`BIND_IP`（默认 0.0.0.0） |

## 升级

```bash
docker compose pull && docker compose up -d   # 数据在 ./data 不受影响
```

## 版本

- `latest`：稳定发布
- 镜像内含构建说明与分层改动清单（`/server/NOTICE.md`，Apache-2.0 合规致谢）
