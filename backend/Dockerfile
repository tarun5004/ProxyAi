# syntax=docker/dockerfile:1.7

FROM node:22.20.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.20.0-bookworm-slim AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:22.20.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV RUNTIME_ROLE=api

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs proxiai

COPY --from=production-dependencies --chown=proxiai:nodejs \
    /app/node_modules ./node_modules
COPY --from=build --chown=proxiai:nodejs /app/dist ./dist
COPY --chown=proxiai:nodejs package.json ./package.json

USER proxiai
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "if(process.env.RUNTIME_ROLE==='worker'){process.exit(0)}fetch('http://127.0.0.1:8080/health/ready').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]
