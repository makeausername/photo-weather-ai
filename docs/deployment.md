# Production/Staging Deployment

This deployment path is for one Ubuntu/Debian server with Docker Compose, PostgreSQL, Redis, the web app, API, worker, local astro-service, and Caddy automatic HTTPS.

## Server Requirements

- Ubuntu 22.04/24.04 or Debian.
- 2 CPU / 4 GB RAM minimum for testing.
- 4 CPU / 8 GB RAM recommended.
- Ports `80` and `443` open in the server firewall and cloud security group.
- Domain `A` record points to the server public IPv4 address.
- A Git checkout of this repository on the server.

If RAM is below 4 GB and swap is below 4 GB, the installer offers to create a safe 4 GB `/swapfile` and persist it in `/etc/fstab`. Low-memory Docker builds are much less reliable without swap.

## Fresh Deployment

```bash
bash scripts/install.sh
```

The installer runs these sections:

1. 环境检查
2. 域名配置
3. 数据库配置
4. 管理员账号
5. 第三方服务配置
6. 生成配置文件
7. Docker 与系统资源检查
8. 构建并启动服务
9. 数据库初始化
10. 管理员验证
11. HTTPS 与健康检查
12. 完成

The installer writes `.env.production` and `deploy/Caddyfile`, installs Docker only when Docker or the Compose plugin is missing, validates Compose config, builds images sequentially, runs migrations and seed data, creates or updates the admin account, verifies the same admin email/password through `pnpm verify-admin`, then starts the full stack.

Logs are written to `deploy/install.log`. For streamed command output:

```bash
bash scripts/install.sh --verbose
```

Final output includes:

- `Website: https://DOMAIN`
- `Admin login: https://DOMAIN/admin/login`
- `Admin email: ADMIN_EMAIL`
- `Password: hidden`
- `Reset admin: bash scripts/reset-admin.sh`

## Admin Password Reset

Use this when `/admin/login` says `邮箱或密码不正确。` or when an operator needs to rotate the production admin password:

```bash
bash scripts/reset-admin.sh
```

The script loads `.env.production`, asks for the admin email and a hidden password twice, runs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=hidden \
  -e ADMIN_DISPLAY_NAME="Super Admin" \
  api pnpm create-admin

docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=hidden \
  api pnpm verify-admin
```

It never prints the password or password hash.

## Check Production Login

After install or reset:

```bash
bash scripts/check-login.sh
```

You can also provide credentials non-interactively:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='hidden' bash scripts/check-login.sh
```

The script calls `https://DOMAIN/api/auth/login` by default and prints only `登录验证成功` or `登录验证失败`.

## Resume After SSH Disconnect

If SSH disconnects during image build or initialization, reconnect and run:

```bash
bash scripts/resume-install.sh
```

It uses `.env.production`, rebuilds images, starts dependencies, runs migrations and seed data, creates/verifies the admin account, starts services, and prints final status.

## Update

```bash
bash scripts/update.sh
```

The update script pulls latest Git code when an upstream is configured, rebuilds images sequentially, runs migrations and seed data, creates/verifies the admin account from `.env.production`, restarts services, and prints Compose status.

## Backup

```bash
bash scripts/backup.sh
```

Backups are stored under `backups/YYYYMMDD-HHMMSS/`. The PostgreSQL dump is `postgres.dump`. The script also copies `.env.production` with restrictive permissions; do not share it or commit it.

## Status

```bash
bash scripts/status.sh
```

The status script shows Compose service state, public URL, API health, PostgreSQL status, Caddy status, internal astro-service health, recent logs, and recent error logs.

## Reinstall Test Environment

PostgreSQL only applies `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` during first volume initialization. Changing `.env.production` later does not change credentials inside an existing PostgreSQL data volume.

When the installer detects an existing PostgreSQL volume, it shows:

```text
检测到已有 PostgreSQL 数据卷。
PostgreSQL 首次初始化后的用户名和密码不会因为修改 .env.production 自动改变。
如果这是测试环境重新安装，可以清空旧数据库卷。
如果是正式环境，请先备份数据库。
```

For staging/test only:

```bash
bash scripts/reset-prod-db.sh
rm -f .env.production deploy/Caddyfile
bash scripts/install.sh
```

Deleting database data requires typing `DELETE_DB_DATA`. Do not remove a real production volume until the backup has been verified.

## Compose Environment File

Production scripts always load `.env.production` through `--env-file`. Docker Compose reads `.env` automatically, but it does not automatically read `.env.production`.

Correct production command examples:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

## Troubleshooting

- `邮箱或密码不正确。`: run `bash scripts/reset-admin.sh`, then `bash scripts/check-login.sh`. The admin command updates existing users; it does not skip password rotation when the user already exists.
- `登录服务暂时不可用，请稍后重试或联系管理员。`: run `bash scripts/status.sh`, then inspect API logs with `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api`. The UI intentionally hides Prisma, PostgreSQL hostnames, SQL details, and stack traces.
- Prisma `P1000` or database authentication failure: likely `.env.production` no longer matches an old PostgreSQL volume. For test reinstall, use `bash scripts/reset-prod-db.sh`. For real data, run `bash scripts/backup.sh` first and repair credentials inside PostgreSQL or restore the matching `.env.production`.
- Docker installation waits on apt/dpkg: the installer waits up to 5 minutes and prints blocking processes. It never deletes apt lock files.
- Docker build fails on a small server: enable the offered 4 GB swap file or move the build to a larger machine.
- Caddy certificate failure: confirm DNS and ports `80`/`443`, then run `bash scripts/status.sh`.
- Web cannot call API: confirm `.env.production` has `NEXT_PUBLIC_API_BASE_URL=https://your-domain/api`, rebuild with `bash scripts/update.sh`, and check `https://your-domain/api/health`.

## Security

- Do not commit `.env.production`.
- Do not print, paste, or store admin passwords in shell history.
- Keep database, Redis, JWT, and admin passwords strong.
- Keep PostgreSQL, Redis, and astro-service private on the Docker network.
- Store backups securely because `.env.production` backups contain secrets.
