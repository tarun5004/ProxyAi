# syntax=docker/dockerfile:1.7

FROM node:22.23.2-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.23.2-bookworm-slim AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:22.23.2-bookworm-slim AS node-runtime

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /app
ARG COMMIT_SHA=unknown
ENV NODE_ENV=production
ENV PORT=8080
ENV RUNTIME_ROLE=api
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=production-dependencies --chown=nonroot:nonroot \
    /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
COPY --chown=nonroot:nonroot package.json ./package.json

USER nonroot
EXPOSE 8080 9464

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/usr/local/bin/node", "-e", "if(process.env.RUNTIME_ROLE==='worker'){process.exit(0)}fetch('http://127.0.0.1:8080/health/ready').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["/usr/local/bin/node", "dist/server.js"]
