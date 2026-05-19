FROM node:22-alpine AS base

ARG APP_FILTER
ENV APP_FILTER=${APP_FILTER}
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter ${APP_FILTER} build

CMD corepack pnpm --filter ${APP_FILTER} dev
