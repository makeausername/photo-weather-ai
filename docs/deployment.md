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

The installer prompts for:

- Domain.
- Admin email, password, and display name.
- PostgreSQL database name, user, and password.
- Redis password.
- JWT secret, with automatic generation when left blank.
- Optional Amap, DeepSeek, QWeather, and Open-Meteo commercial credentials.

The script writes `.env.production` and `deploy/Caddyfile`, installs Docker and the Docker Compose plugin if needed, builds images, starts PostgreSQL/Redis/astro-service, downloads the local `de421.bsp` astro ephemeris into a Docker volume, runs Prisma migrations and seed data, creates the first admin account, and starts the full stack.

If the PostgreSQL password prompt is left blank, the installer generates a URL-safe password and uses the same value for `POSTGRES_PASSWORD` and the encoded password inside `DATABASE_URL`.

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

The status script shows Docker Compose service state, recent logs for `web`, `api`, `astro-service`, and `caddy`, checks `https://your-domain`, checks `https://your-domain/api/health`, and tries the internal astro-service health endpoint from the API container network.

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
- Port `80` or `443` occupied: stop the conflicting service before Caddy starts.
- DNS not pointed: update the domain `A` record and wait for propagation; Caddy may fail certificate issuance until DNS is correct.
- Caddy certificate failure: check `bash scripts/status.sh` and `docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy`.
- Database migration failure: check PostgreSQL status, confirm `DATABASE_URL`, then rerun `bash scripts/update.sh`.
- Prisma `P1000` during migration: the database credentials in `DATABASE_URL` do not match the credentials used when the PostgreSQL volume was first initialized, or the deployment is reusing an old PostgreSQL volume. For a new test deployment, reset the stack and regenerate runtime files:

  ```bash
  docker compose -f docker-compose.prod.yml down -v --remove-orphans
  rm -f .env.production deploy/Caddyfile
  bash scripts/install.sh
  ```

  For an existing deployment with real data, run `bash scripts/backup.sh` first, then alter the PostgreSQL user/password inside the database or update `.env.production` to match the already-initialized database credentials. Do not remove volumes on a real deployment unless the backup has been verified.
- Astro-service health failure: confirm `astro_data` contains `de421.bsp`; rerun `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm astro-service python scripts/fetch_ephemeris.py`.
- Web cannot call API: confirm `.env.production` has `NEXT_PUBLIC_API_BASE_URL=https://your-domain/api`, rebuild with `bash scripts/update.sh`, and check `https://your-domain/api/health`.
