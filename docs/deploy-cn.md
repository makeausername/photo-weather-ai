# 国内部署说明

国内部署入口：

```bash
bash scripts/install-cn.sh
```

`scripts/install-cn.sh` 复用 `scripts/install.sh` 的同一套安装逻辑和密码输入校验逻辑，不依赖 GitHub 特定流程。

管理员密码支持常见强密码符号；交互输入不会回显；请避免在命令行明文传入密码。安装器要求管理员密码至少 12 位，并包含大小写字母、数字和特殊字符。新生成的 `.env.production` 使用 `ADMIN_INITIAL_PASSWORD_B64` 保存初始管理员密码，避免强密码符号破坏 dotenv 解析。

如需重置管理员密码：

```bash
bash scripts/reset-admin.sh
```

重置脚本同样使用隐藏输入和强密码校验，并会更新 `.env.production` 中的 `ADMIN_INITIAL_PASSWORD_B64`，不会打印密码或 base64 值。

