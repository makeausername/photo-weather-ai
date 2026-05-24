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
9. 天文星历文件检查
10. 数据库连接预检
11. 数据库迁移
12. 管理员创建与验证
13. HTTPS 与健康检查
14. 完成

The installer writes `.env.production` and `deploy/Caddyfile`, installs Docker only when Docker or the Compose plugin is missing, validates Compose config, builds images sequentially, starts PostgreSQL/Redis/astro-service, downloads the local JPL ephemeris file when accepted, runs database preflight, then runs migrations and seed data. After that it creates or updates the admin account, verifies the same admin email/password through `pnpm verify-admin`, then starts the full stack.

During database configuration the installer uses one source of truth:

- `DB_NAME`, default `photo_weather_ai`
- `DB_USER`, default `photo_weather_ai`
- `DB_PASSWORD`, auto-generated when left blank

It writes matching values to:

- `POSTGRES_DB=$DB_NAME`
- `POSTGRES_USER=$DB_USER`
- `POSTGRES_PASSWORD=$DB_PASSWORD`
- `DATABASE_URL=postgresql://$DB_USER:$URL_ENCODED_DB_PASSWORD@postgres:5432/$DB_NAME?schema=public`

Custom database passwords are URL-encoded with `python3 urllib.parse.quote` before `DATABASE_URL` is written. If `python3` is unavailable, leave the DB password blank so the installer generates a URL-safe password, use only URL-safe password characters, or install `python3` before using a custom password with reserved URL characters. The installer prints `POSTGRES_DB`, `POSTGRES_USER`, and a masked `DATABASE_URL`; it never prints `POSTGRES_PASSWORD`.

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

## Local Ephemeris File

Accurate moon phase, moonrise/moonset, astronomical night, and Milky Way windows require the local JPL `de421.bsp` ephemeris file. Production uses one explicit path:

- `EPHEMERIS_PATH=/app/data/de421.bsp`
- Compose volume: `astro_data:/app/data`

The installer prompts:

```text
需要下载本地天文星历文件 de421.bsp，用于精确计算月相、月出月落和银河窗口。直接回车下载，输入 n 跳过:
```

Direct Enter downloads by default. If skipped, precise astro calculations stay unavailable until the file is installed.

Manual fix:

```bash
bash scripts/download-ephemeris.sh
docker compose --env-file .env.production -f docker-compose.prod.yml restart astro-service api web
```

After installation, `GET http://astro-service:4100/health` from inside the app network should include:

```json
{
  "ephemerisAvailable": true,
  "ephemerisPath": "/app/data/de421.bsp"
}
```

If health still shows `ephemerisAvailable=false`, check `EPHEMERIS_PATH`, verify `/app/data/de421.bsp` exists inside the astro-service container, and confirm file permissions allow the container user to read it.

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

It uses `.env.production`, rebuilds images, starts dependencies, reruns database preflight, runs migrations and seed data, creates/verifies the admin account, starts services, and prints final status.

## Update

```bash
bash scripts/update.sh
```

The update script pulls latest Git code when an upstream is configured, rebuilds images sequentially, reruns database preflight, runs migrations and seed data, creates/verifies the admin account from `.env.production`, restarts services, and prints Compose status.

After provider configuration changes or forecast pipeline updates, run the public forecast smoke test:

```bash
bash scripts/test-real-weather.sh
```

Set `PHOTO_WEATHER_API_BASE_URL=https://your-domain/api` if `.env.production` does not contain `NEXT_PUBLIC_API_BASE_URL`.

## Backup

```bash
bash scripts/backup.sh
```

Backups are stored under `backups/YYYYMMDD-HHMMSS/`. The PostgreSQL dump is `postgres.dump`. The script also copies `.env.production` with restrictive permissions; do not share it or commit it.

## Status

```bash
bash scripts/status.sh
```

The status script shows Compose service state, public URL, API health, PostgreSQL status, Caddy status, internal astro-service health, `ephemerisAvailable`, `ephemerisPath`, recent logs, and recent error logs.

## Reinstall Test Environment

PostgreSQL only applies `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` during first volume initialization. Changing `.env.production` later does not change credentials inside an existing PostgreSQL data volume.

This is the common cause of:

```text
数据库连接失败，请检查 DATABASE_URL、POSTGRES_USER、POSTGRES_PASSWORD 是否一致。
```

There are two usual causes:

- `.env.production` has inconsistent `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL`.
- An old PostgreSQL Docker volume was initialized with earlier credentials and is still being reused.

When the installer detects an existing PostgreSQL volume, it shows:

```text
检测到已有 PostgreSQL 数据卷。
PostgreSQL 首次初始化后的用户名和密码不会因为修改 .env.production 自动改变。

请选择处理方式：
1. 保留现有数据并停止安装
2. 删除测试数据库卷并重新初始化
```

For staging/test only:

```bash
bash scripts/reset-prod-db.sh
rm -f .env.production deploy/Caddyfile
bash scripts/install.sh
```

Deleting database data requires typing `DELETE_DB_DATA`. `scripts/reset-prod-db.sh` stops the Compose stack and removes only the PostgreSQL data volume by default. It does not remove Caddy certificate/config volumes unless you separately type `DELETE_CADDY_DATA`. Do not remove a real production volume until the backup has been verified.

## Compose Environment File

Production scripts always load `.env.production` through `--env-file`. Docker Compose reads `.env` automatically, but it does not automatically read `.env.production`.

`.env.production` must be a Docker Compose env file:

- one variable per line
- each non-empty, non-comment line must be `KEY=VALUE`
- `KEY` must contain only uppercase letters, numbers, and underscores
- no standalone secret/password lines
- no multiline values

The installer writes secrets through a safe env writer and uses URL-safe generated secrets for PostgreSQL, Redis, JWT, and generated admin passwords. It also runs:

```bash
bash scripts/check-env-production.sh
docker compose --env-file .env.production -f docker-compose.prod.yml config >/tmp/photo-weather-compose-check.yml
```

If a previous installer run left a broken env file, run `bash scripts/install.sh` again. When it prints `检测到现有 .env.production 格式错误。`, choose the default `Y` to back up the old file as `.env.production.broken-YYYYMMDD-HHMMSS` and regenerate a clean configuration.

Third-party API keys may contain characters that are easy to break in env files. The production installer now leaves initial provider keys empty; configure weather, map, and model provider keys in the admin console after deployment.

Provider configuration lives in `/admin/providers`; see [admin-providers.md](admin-providers.md). After saving QWeather, Open-Meteo, meteoblue, Amap, or DeepSeek settings, click `测试连接` in the UI. For a server-side safe diagnostic that does not print API keys:

```bash
bash scripts/test-providers.sh
```

The script uses `.env.production` and `docker compose --env-file .env.production -f docker-compose.prod.yml`. If admin login cannot be performed from the script, the UI manual test remains primary.

Correct production command examples:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
bash scripts/test-real-weather.sh
```

## Troubleshooting

- `邮箱或密码不正确。`: run `bash scripts/reset-admin.sh`, then `bash scripts/check-login.sh`. The admin command updates existing users; it does not skip password rotation when the user already exists.
- `登录服务暂时不可用，请稍后重试或联系管理员。`: run `bash scripts/status.sh`, then inspect API logs with `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api`. The UI intentionally hides Prisma, PostgreSQL hostnames, SQL details, and stack traces.
- Compose `unexpected character` while reading `.env.production`: the env file has an invalid line, usually a standalone generated secret or an unescaped value. Run `bash scripts/check-env-production.sh`; then rerun `bash scripts/install.sh` and choose to back up/regenerate the broken file.
- Astro health has `ephemerisAvailable=false`: run `bash scripts/download-ephemeris.sh`. If it remains false, check `EPHEMERIS_PATH=/app/data/de421.bsp`, inspect `docker compose --env-file .env.production -f docker-compose.prod.yml exec astro-service ls -lh /app/data/de421.bsp`, and fix file permissions.
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
