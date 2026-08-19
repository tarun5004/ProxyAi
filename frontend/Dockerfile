# syntax=docker/dockerfile:1.7

FROM node:22.23.2-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.23.2-bookworm-slim AS node-runtime

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /app
ARG COMMIT_SHA=unknown
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=build --chown=nonroot:nonroot /app/public ./public

USER nonroot
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["/usr/local/bin/node", "server.js"]
