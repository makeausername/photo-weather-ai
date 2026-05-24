FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages

ENV DATABASE_URL=postgresql://photo_weather:photo_weather@postgres:5432/photo_weather_ai

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm --filter @photo-weather/worker... build

FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages

CMD ["node", "apps/worker/dist/index.js"]
