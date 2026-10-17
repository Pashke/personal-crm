# syntax=docker/dockerfile:1

# Production image of the app. CI (GitHub Actions) builds it, the server only pulls it.
# One image does three jobs on the server (see deploy/compose.yaml):
#   next start           - the app itself
#   drizzle-kit migrate  - database migrations, a one-off container before the new app starts
#   tsx scripts/seed.ts  - test data, run by hand
# That is why it keeps the full node_modules, dev dependencies included.

FROM node:24.22.0-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Install exactly the pnpm version from the "packageManager" field of package.json.
RUN npm install --global --no-fund --no-audit "$(node -p 'require("./package.json").packageManager')" \
 && pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# public/ is empty and not in git, but Next.js and the runtime stage expect it.
# .next/cache is only the build cache, the running app does not need it.
RUN mkdir -p public \
 && pnpm build \
 && rm -rf .next/cache

FROM node:24.22.0-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/Pashke/personal-crm"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/node_modules/.bin:$PATH
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json /app/drizzle.config.ts ./
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/db ./src/db
COPY --from=build /app/scripts ./scripts
# The app writes its runtime cache into .next, so that folder belongs to the unprivileged user.
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 3000
CMD ["next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
