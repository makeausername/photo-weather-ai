# Photo Weather AI

Commercial landscape photography weather decision system for Chinese mainland users.

This repository currently contains the initial TypeScript monorepo foundation only. It is
designed to grow into a self-hostable SaaS product with one-command Docker deployment and visual
admin configuration for provider keys, scoring weights, prompts, storage, billing, and
deployment-related settings.

## Architecture

- `apps/web`: Next.js App Router placeholder frontend.
- `apps/api`: Fastify API service skeleton.
- `apps/worker`: Node.js worker placeholder for future BullMQ jobs.
- `packages/shared`: shared types, Zod schemas, and utility contracts.
- `packages/config`: environment validation, runtime config loading, public/server config
  separation, admin setting definitions, and secret masking.
- `packages/db`: Prisma PostgreSQL schema, generated client access, additive migrations, seed
  data, and secret-safe repository helpers for the future admin configuration layer.
- `packages/geo`: geo provider interfaces and coordinate conversion placeholders.
- `packages/weather`: normalized weather types and provider interfaces.
- `packages/terrain`: terrain and elevation provider interfaces.
- `packages/astro`: astronomy provider interfaces.
- `packages/scoring`: scoring engine contracts.
- `packages/ai`: AI provider interfaces, mock provider, rule-only fallback, and DeepSeek
  skeleton.
- `packages/storage`: storage provider interfaces and mock storage.
- `packages/billing`: billing and quota placeholder types.

## Local Development

Use pnpm through Corepack:

```bash
corepack pnpm install
corepack pnpm dev
```

Validation commands:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Database

PostgreSQL is the production database target. The database package owns the Prisma schema under
`packages/db/prisma/schema.prisma`, the initial additive migration under
`packages/db/prisma/migrations`, deterministic seed data, and helpers for system settings,
provider configuration, admin audit logs, and API usage logs.

Root database commands:

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm db:studio
```

Use `db:migrate` for deployed PostgreSQL databases. Use `db:push` only for disposable local
development databases where schema drift is acceptable. The current migration is additive: it
creates the foundation tables and does not drop or rewrite existing data.

Set `DATABASE_URL` in `.env.local` or `.env`; do not commit local credentials. For Docker Compose,
the example is:

```bash
DATABASE_URL=postgresql://photo_weather:photo_weather@postgres:5432/photo_weather_ai
```

For an existing Alibaba Cloud PostgreSQL instance reached through an SSH tunnel, create a separate
database for this project, for example `photo_weather_ai`, then point the local tunnel URL at it:

```bash
DATABASE_URL=postgresql://photo_weather_ai:CHANGE_ME@127.0.0.1:15432/photo_weather_ai?schema=public
```

The project must not reuse another product's database. Provider secrets and permanent provider
settings belong in database-backed admin configuration, not in business code. Seed data only creates
placeholder providers and empty secret objects; it does not include real DeepSeek, QWeather,
Open-Meteo, Amap, storage, SMS, or payment credentials.

## Admin Configuration API

The Fastify API now exposes the initial admin configuration surface:

```bash
GET   /admin/settings
GET   /admin/settings/:key
PATCH /admin/settings/:key
GET   /admin/settings/groups

GET   /admin/providers
GET   /admin/providers/:providerType/:providerCode
PATCH /admin/providers/:providerType/:providerCode
POST  /admin/providers/:providerType/:providerCode/test-connection

GET   /admin/audit-logs
```

System-setting updates validate the stored setting value type and reject settings that are marked
non-editable. Provider updates validate provider type and provider code, merge JSON config and
secret patches, and return only safe provider output.

Provider API responses return `maskedSecretJson` only. They must never return raw `secretJson`.
Audit metadata is redacted before persistence, and every settings/provider `PATCH` writes an
`AdminAuditLog`. Until real admin auth exists, these audit entries use a null actor; this is a
temporary bootstrap behavior and must be replaced by RBAC-backed actor IDs before production use.

Provider connection testing is intentionally mocked in this phase. The test endpoint returns a
deterministic local response and does not call DeepSeek, QWeather, Open-Meteo, Amap, storage,
billing, SMS, or payment providers.

## Admin Console Skeleton

The Next.js app includes the initial admin route skeleton:

```bash
/admin
/admin/settings
/admin/providers
/admin/providers/ai
/admin/providers/weather
/admin/providers/geo
/admin/providers/storage
/admin/audit
```

The pages are a minimal operator console for visual configuration. They load settings, provider
placeholders, masked secret status, mock connection tests, and recent audit logs from the API.
Set `NEXT_PUBLIC_API_BASE_URL` if the browser should call an API origin other than
`http://localhost:4000`.

Admin authentication is not implemented yet. The admin pages and admin API are not production-secure
and must be protected by login, session handling, and RBAC before any public deployment.

## External Services

Local automated tests must not call real external services. The current implementation only uses
deterministic mock providers and placeholders. Do not call QWeather, Open-Meteo, Amap, DeepSeek,
or any other external provider from tests.

Real provider testing should be added later and run only on staging or production servers with
configured provider keys and explicit operator intent.

## Configuration

Copy `.env.example` to `.env` for local development. Secrets and provider settings must be loaded
from environment variables or future encrypted admin configuration, never hard-coded.

The final commercial target is one-command Docker deployment plus visual admin configuration for
DeepSeek, QWeather, Open-Meteo, Amap, storage, billing, scoring weights, prompt templates, and
deployment-related settings. This repository currently implements only the database foundation for
that direction; authentication UI, admin pages, billing, weather scoring, and real provider calls
remain intentionally out of scope.

## Docker Skeleton

`docker-compose.yml` defines future `web`, `api`, `worker`, `postgres`, `redis`, and `nginx`
services. The shell scripts under `scripts/` are placeholders for the later one-command installer,
first-admin creation flow, and backup tooling.
