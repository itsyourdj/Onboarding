# syntax=docker/dockerfile:1

# Single-image build: the backend serves both the JSON API and the compiled
# React SPA. No separate frontend image and no database baked in.
#
#   • Local demo:  DATA_SOURCE=postgres  + a Postgres container (docker-compose)
#   • Production:  DATA_SOURCE=semantic  + SEMANTIC_API_URL/TOKEN (no database)

# ─── Stage 1: build the frontend ────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: runtime — backend + built SPA in one image ────────────────────
FROM node:22-alpine
WORKDIR /app/backend
# tsx + typescript are devDependencies but are needed to run the app, so keep
# them (install before flipping NODE_ENV so npm doesn't prune dev deps).
COPY backend/package*.json ./
RUN npm ci --include=dev
COPY backend/ ./
# The compiled SPA is served from ./public (see STATIC_DIR).
COPY --from=frontend /app/frontend/dist ./public
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production \
    PORT=4000 \
    STATIC_DIR=/app/backend/public
USER node
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
