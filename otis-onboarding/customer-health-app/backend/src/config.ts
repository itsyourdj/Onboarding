import dotenv from "dotenv";
dotenv.config();

// dev | prod — lets us run the same build against local Postgres (dev) or the
// provisioned/semantic backend (prod) just by flipping env vars.
const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "dev").toLowerCase();

export const config = {
  env: appEnv === "prod" || appEnv === "production" ? "prod" : "dev",
  port: Number(process.env.PORT ?? 4000),
  dataSource: (process.env.DATA_SOURCE ?? "postgres") as "postgres" | "semantic",
  pg: {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "customer_health",
    user: process.env.PGUSER ?? undefined,
    password: process.env.PGPASSWORD || undefined,
  },
  dataDir: process.env.DATA_DIR ?? "",
  semantic: {
    // Data-product BASE url; the client appends /api/v1/query/... paths.
    url: (process.env.SEMANTIC_API_URL ?? "").replace(/\/+$/, ""),
    token: process.env.SEMANTIC_API_TOKEN ?? "",
    // How many async queries to run in parallel (gateway throttles high concurrency).
    concurrency: Number(process.env.SEMANTIC_CONCURRENCY ?? 3),
    // Max rows per page before we paginate with offset.
    pageSize: Number(process.env.SEMANTIC_PAGE_SIZE ?? 50000),
    // How long a submitted statement may take before we give up polling.
    pollTimeoutMs: Number(process.env.SEMANTIC_POLL_TIMEOUT_MS ?? 120000),
  },
  // Cache TTL for the scored-customer snapshot (semantic is slow cold, so cache longer).
  cacheTtlMs: Number(
    process.env.CACHE_TTL_MS ?? (appEnv.startsWith("prod") ? 600000 : 60000)
  ),
};
