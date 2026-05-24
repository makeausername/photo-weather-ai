# Production/Staging Deployment

This deployment path is for a single Ubuntu/Debian server with Docker Compose, PostgreSQL, Redis, the web app, API, worker, local astro-service, and Caddy for automatic HTTPS.

## Server Requirements

- Ubuntu 22.04/24.04 or Debian.
- 2 CPU / 4 GB RAM minimum for testing.
- 4 CPU / 8 GB RAM recommended.
- Ports `80` and `443` open in the server firewall and cloud security group.
- Domain `A` record points to the server public IPv4 address.
- A Git checkout of this repository on the server.

## Install

```bash
bash scripts/install.sh
```

The installer uses a guided flow:

1. Environment check
2. Domain configuration
3. Database configuration
4. Admin account
5. Third-party service configuration
6. Config file generation
7. Docker service startup
8. Database initialization
9. HTTPS check
10. Completion summary

The installer prompts for:

- Domain.
- Admin email, password, and display name.
- PostgreSQL database name, user, and password.
- Redis password.
- JWT secret, with automatic generation when left blank.
- Optional Amap, DeepSeek, QWeather, and Open-Meteo commercial credentials.

The script writes `.env.production` and `deploy/Caddyfile`, installs Docker and the Docker Compose plugin if needed, validates the production Compose config, builds images, starts PostgreSQL/Redis/astro-service, downloads the local `de421.bsp` astro ephemeris into a Docker volume, runs Prisma migrations and seed data, creates the first admin account, and starts the full stack.

If the PostgreSQL password prompt is left blank, the installer generates a URL-safe password and uses the same value for `POSTGRES_PASSWORD` and the encoded password inside `DATABASE_URL`.

Docker build and initialization logs are written to `deploy/install.log`. Pass `--verbose` to print full command logs:

```bash
bash scripts/install.sh --verbose
```

Before Docker services are started, the installer prints a summary with domain, database name, database user, admin email, and whether optional providers were configured. It never prints database passwords, JWT secrets, or provider keys.

The normal deployment confirmation accepts Enter, `y`, or `yes` to continue, and `n` or `no` to cancel. Destructive operations are still strict: deleting a PostgreSQL test volume requires typing `DELETE_DB_DATA`, and Caddy certificate data is not removed unless separately confirmed.

Docker is installed automatically if it is missing. If Docker and the Docker Compose plugin are already available, the installer skips package installation and prints `OK Docker 已安装，跳过安装。` and `OK Docker Compose 插件可用。`.

If `.env.production` already exists, the installer asks whether to reuse it or regenerate it. If `deploy/Caddyfile` already exists, the installer asks whether to reuse it or regenerate it for the current domain.

If an existing PostgreSQL Docker volume is detected, the installer stops and asks whether to keep data and stop, back up the database and continue, or delete a test database volume after typing `DELETE_DB_DATA`. It never deletes database data silently.

## Compose Environment File

Production scripts always load `.env.production` through `--env-file`. Docker Compose reads `.env` automatically, but it does not automatically read `.env.production`.

Do not run plain `docker compose -f docker-compose.prod.yml ...` manually unless you also pass `--env-file .env.production`.

Correct production command examples:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

## Update

```bash
bash scripts/update.sh
```

The update script pulls the latest Git code when an upstream is configured, rebuilds images, runs migrations and seed data, restarts services, and prints Compose status.

## Backup

```bash
bash scripts/backup.sh
```

Backups are stored under `backups/YYYYMMDD-HHMMSS/`. The PostgreSQL dump is saved as `postgres.dump`. The script also copies `.env.production` into the backup directory with restrictive permissions; do not share it or commit it because it contains secrets.

## Status

```bash
bash scripts/status.sh
```

The status script shows Docker Compose service state, public URL, API health, PostgreSQL status, Caddy status, recent service logs, recent error logs, and the internal astro-service health endpoint from the API container network.

## Reset Test Database

For staging/test reinstall attempts only:

```bash
bash scripts/reset-prod-db.sh
```

The reset helper stops the production Compose stack and removes only the project PostgreSQL volume after you type `DELETE_DB_DATA`. It keeps Caddy certificate data unless you explicitly type `DELETE_CADDY_DATA`.

## Uninstall

```bash
bash scripts/uninstall.sh
```

Uninstall is safe by default. It stops services and keeps Docker volumes unless you explicitly type `DELETE_DATA`.

## SSL

Caddy automatically issues and renews HTTPS certificates for the configured domain. Certificate issuance requires ports `80` and `443` to be reachable from the public internet and DNS to point at the server.

## API Routing

The public production API base URL is:

```text
https://your-domain/api
```

The web image is built with `NEXT_PUBLIC_API_BASE_URL=https://your-domain/api`. Caddy routes `/api/*` to the API container and strips the `/api` prefix before proxying, so existing API routes such as `/forecast/calculate`, `/auth/login`, and `/health` do not need code-level `/api` prefixes.

The astro-service is only reachable on the internal Docker network at:

```text
http://astro-service:4100
```

PostgreSQL, Redis, and astro-service are not exposed publicly.

## Provider Config

Amap, DeepSeek, QWeather, and Open-Meteo credentials can be entered during install or later in the admin console. Installing credentials does not automatically call real weather APIs. Real provider calls still require the existing admin-side provider enablement and real-call controls.

## Security

- Do not commit `.env.production`.
- Use strong database, Redis, JWT, and admin passwords.
- Change the admin password after deployment if the install password was shared.
- Restrict SSH access and keep the server firewall tight.
- Keep ports `80` and `443` public; do not expose PostgreSQL, Redis, or astro-service.
- Store backups securely because the `.env.production` backup contains secrets.

## Troubleshooting

- Docker not running: run `sudo systemctl status docker`, then rerun `bash scripts/install.sh`.
- Docker installation looks slow: keep the installer running and check `deploy/install.log` from another SSH session. Use `bash scripts/install.sh --verbose` when you want full apt and Docker logs streamed to the terminal.
- Apt/dpkg lock warning: another package manager process is running. Wait for it to finish, or inspect running apt/dpkg processes before retrying the installer.
- Port `80` or `443` occupied: stop the conflicting service before Caddy starts.
- DNS not pointed: update the domain `A` record and wait for propagation; Caddy may fail certificate issuance until DNS is correct.
- Caddy certificate failure: check `bash scripts/status.sh` and `docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy`.
- Database migration failure: check PostgreSQL status with `bash scripts/status.sh`, confirm `DATABASE_URL`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` are generated from the same database inputs, then rerun `bash scripts/update.sh`.
- Prisma `P1000` during migration: the database credentials in `DATABASE_URL` do not match the credentials used when the PostgreSQL volume was first initialized, or the deployment is reusing an old PostgreSQL volume. For a new test deployment, reset the stack and regenerate runtime files:

  ```bash
  bash scripts/reset-prod-db.sh
  rm -f .env.production deploy/Caddyfile
  bash scripts/install.sh
  ```

  For an existing deployment with real data, run `bash scripts/backup.sh` first, then alter the PostgreSQL user/password inside the database or update `.env.production` to match the already-initialized database credentials. Do not remove volumes on a real deployment unless the backup has been verified.
- Login shows `登录服务暂时不可用，请稍后重试或联系管理员。`: check `bash scripts/status.sh`, then inspect server-side logs with `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api`. The UI intentionally hides raw Prisma, PostgreSQL host, and stack-trace details.
- Login shows `邮箱或密码不正确。`: the auth service is reachable, but the email/password pair did not match an active account. Use the admin credentials created during installation or rerun `bash scripts/update.sh` to reapply migrations and seed data.
- Astro-service health failure: confirm `astro_data` contains `de421.bsp`; rerun `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm astro-service python scripts/fetch_ephemeris.py`.
- Web cannot call API: confirm `.env.production` has `NEXT_PUBLIC_API_BASE_URL=https://your-domain/api`, rebuild with `bash scripts/update.sh`, and check `https://your-domain/api/health`.
