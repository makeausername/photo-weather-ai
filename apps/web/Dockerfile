FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages

ARG NEXT_PUBLIC_API_BASE_URL
ARG PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV PUBLIC_SITE_URL=${PUBLIC_SITE_URL}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @photo-weather/web build

FROM node:22-alpine AS runner

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages

EXPOSE 3000

CMD ["corepack", "pnpm", "--filter", "@photo-weather/web", "start"]
