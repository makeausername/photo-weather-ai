# 国内部署说明

国内部署入口：

```bash
bash scripts/install-cn.sh
```

`scripts/install-cn.sh` 复用 `scripts/install.sh` 的同一套安装逻辑和密码输入校验逻辑，不依赖 GitHub 特定流程。

该入口默认设置：

- `INSTALL_REGION=cn`
- `DOCKER_INSTALL_METHOD=ubuntu`
- `APT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/ubuntu`
- `PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple`
- `DOCKER_REGISTRY_MIRRORS=https://docker.1ms.run,https://docker.m.daocloud.io,https://dockerproxy.com,https://mirror.baidubce.com`

因此大陆服务器新机流程仍然是：

```bash
git clone <repo>
cd photo-weather-ai
bash scripts/install-cn.sh
```

不需要先手动安装 Docker。脚本会优先使用 Ubuntu/Debian 软件包 `docker.io` 和 Compose v2 包，安装后验证 `docker --version` 与 `docker compose version`。如果使用 `DOCKER_INSTALL_METHOD=auto`，官方 Docker 源或 GPG 下载失败时会记录 `official Docker repository failed`，并回退到 Ubuntu/Debian 软件包路径。

如需覆盖镜像源：

```bash
APT_MIRROR=https://mirrors.aliyun.com/ubuntu \
PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple \
DOCKER_REGISTRY_MIRRORS=https://docker.1ms.run,https://mirror.baidubce.com \
bash scripts/install-cn.sh
```

管理员密码支持常见强密码符号；交互输入不会回显；请避免在命令行明文传入密码。安装器要求管理员密码至少 12 位，并包含大小写字母、数字和特殊字符。新生成的 `.env.production` 使用 `ADMIN_INITIAL_PASSWORD_B64` 保存初始管理员密码，避免强密码符号破坏 dotenv 解析。

如需重置管理员密码：

```bash
bash scripts/reset-admin.sh
```

重置脚本同样使用隐藏输入和强密码校验，并会更新 `.env.production` 中的 `ADMIN_INITIAL_PASSWORD_B64`，不会打印密码或 base64 值。
