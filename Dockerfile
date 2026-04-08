# Base image
FROM node:20-alpine AS base

# Helpful for HF Spaces / Dev Mode
RUN apk add --no-cache git

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime
FROM base AS runner

ENV NODE_ENV=production \
    ASTRO_TELEMETRY_DISABLED=1

WORKDIR /app

# Copy app files and make sure uid 1000 owns /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 7860

CMD ["npm", "run", "preview"]