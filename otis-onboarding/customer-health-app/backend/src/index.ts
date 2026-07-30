import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { overviewRouter } from "./routes/overview.js";
import { customersRouter } from "./routes/customers.js";
import { insightsRouter } from "./routes/insights.js";
import { filtersRouter } from "./routes/filters.js";
import { authRouter } from "./routes/auth.js";
import { getScoredCustomers } from "./services/cache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Normalize BASE_PATH -> "" (root) or "/prefix" (leading slash, no trailing).
const trimmedBase = (process.env.BASE_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
const normalizedBase = trimmedBase ? `/${trimmedBase}` : "";
// Value injected into <base href="…"> — always ends with a single slash.
const baseHref = `${normalizedBase}/`;

const app = express();
app.use(cors());
app.use(express.json());

// All app routes live on a single router that we mount at the base path (and at
// root as a fallback), so the app works whether or not the proxy strips the prefix.
const router = express.Router();

router.get("/api/health", (_req, res) =>
  res.json({ ok: true, dataSource: config.dataSource, basePath: normalizedBase || "/" })
);
router.use("/api/overview", overviewRouter);
router.use("/api/customers", customersRouter);
router.use("/api/insights", insightsRouter);
router.use("/api/filters", filtersRouter);
router.use("/api/auth", authRouter);

// Serve the built frontend (present in production images). STATIC_DIR overrides.
const staticDir = process.env.STATIC_DIR || path.join(__dirname, "../public");
const indexHtmlPath = path.join(staticDir, "index.html");

if (fs.existsSync(indexHtmlPath)) {
  // Cache the base-href-rewritten index.html once at boot.
  const rawIndex = fs.readFileSync(indexHtmlPath, "utf8");
  const indexHtml = rawIndex.replace(/<base\s+href="[^"]*"\s*\/?>/i, `<base href="${baseHref}" />`);

  router.use(express.static(staticDir, { index: false }));

  router.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.type("html").send(indexHtml);
  });
}

// Mount the prefixed path first so its catch-all handles /BASE/* (including
// /BASE/api/*); the root mount then covers the stripped-proxy case (/api/*).
if (normalizedBase) app.use(normalizedBase, router);
app.use(router);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal error" });
});

app.listen(config.port, () => {
  console.log(
    `Pulse listening on http://localhost:${config.port}${normalizedBase || ""} (env: ${config.env}, source: ${config.dataSource}, base: ${normalizedBase || "/"})`
  );
  // Warm the scored-customer cache at boot. The semantic path is slow cold
  // (~a dozen async queries), so priming here keeps the first request fast.
  getScoredCustomers(true)
    .then((rows) => console.log(`Cache warmed: ${rows.length} customers scored.`))
    .catch((err) => console.warn(`Cache warm skipped: ${err?.message ?? err}`));
});
