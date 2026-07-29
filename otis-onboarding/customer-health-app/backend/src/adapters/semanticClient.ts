import { config } from "../config.js";

// ── Cube.js / DataOS semantic REST client ───────────────────────────────────
// The query API is asynchronous and columnar:
//   1. POST {base}/api/v1/query/semantic/rest   with { query: <cube query> }  → { id, status }
//   2. GET  {base}/api/v1/query/statement/{id}                                 → { status }
//   3. GET  {base}/api/v1/query/statement/{id}/result?format=json             → { cols, rows, row_count }
// Rows come back as arrays aligned to `cols`; we zip them into objects keyed by
// the fully-qualified member name (e.g. "NPS_SURVEYS.CUSTOMER_ID").

export type CubeQuery = Record<string, unknown>;
export type Row = Record<string, any>;

interface StatementResult {
  cols: string[];
  rows: any[][];
  row_count?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authHeaders() {
  return {
    "Content-Type": "application/json",
    ...(config.semantic.token ? { Authorization: `Bearer ${config.semantic.token}` } : {}),
  };
}

// Fetch JSON, retrying on non-2xx or HTML error pages (the gateway returns HTML
// when it throttles a burst of async jobs).
async function jsonFetch(url: string, opts: RequestInit = {}, tries = 4): Promise<any> {
  let lastErr = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, opts);
    const text = await res.text();
    const looksJson = text.trimStart().startsWith("{") || text.trimStart().startsWith("[");
    if (res.ok && looksJson) return JSON.parse(text);
    lastErr = `${res.status} ${text.slice(0, 120).replace(/\s+/g, " ")}`;
    if (attempt < tries) await sleep(1500 * attempt);
  }
  throw new Error(`Semantic API request failed (${url.split("/api/")[1] ?? url}): ${lastErr}`);
}

// Submit → poll → fetch one page of results.
async function runPage(query: CubeQuery): Promise<StatementResult> {
  if (!config.semantic.url) {
    throw new Error("SEMANTIC_API_URL is not configured (set it in .env and DATA_SOURCE=semantic).");
  }
  const base = config.semantic.url;
  const submit = await jsonFetch(`${base}/api/v1/query/semantic/rest`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query }),
  });
  const id = submit.id;
  if (!id) throw new Error(`No statement id returned: ${JSON.stringify(submit).slice(0, 200)}`);

  let status: string = submit.status;
  const started = Date.now();
  while (status !== "SUCCESS" && status !== "FAILED") {
    if (Date.now() - started > config.semantic.pollTimeoutMs) {
      throw new Error(`Polling timed out (last status=${status})`);
    }
    await sleep(1500);
    const st = await jsonFetch(`${base}/api/v1/query/statement/${id}`, { headers: authHeaders() });
    status = st.status;
    if (status === "FAILED") {
      throw new Error(`Query FAILED: ${JSON.stringify(st.error ?? st).slice(0, 200)}`);
    }
  }

  const result = await jsonFetch(
    `${base}/api/v1/query/statement/${id}/result?format=json`,
    { headers: authHeaders() }
  );
  return { cols: result.cols ?? [], rows: result.rows ?? [], row_count: result.row_count };
}

function zip(cols: string[], rows: any[][]): Row[] {
  return rows.map((r) => {
    const o: Row = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i];
    return o;
  });
}

// Fetch a query's rows.
//  - If the query sets an explicit `limit`, it is treated as a HARD CAP: we make
//    a single request and never paginate past it (e.g. detail lists "top 25").
//  - If no `limit` is set, we page through with `offset` (page size = config)
//    until a short page returns, so bulk row-level fetches are never truncated.
export async function runQuery(query: CubeQuery): Promise<Row[]> {
  const hasCap = query.limit != null;
  if (hasCap) {
    const page = await runPage(query);
    return zip(page.cols, page.rows);
  }
  const pageSize = config.semantic.pageSize;
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const page = await runPage({ ...query, limit: pageSize, offset });
    out.push(...zip(page.cols, page.rows));
    if (page.rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

// Run many queries with bounded concurrency (avoids gateway throttling).
export async function runAll<T extends Record<string, CubeQuery>>(
  queries: T
): Promise<{ [K in keyof T]: Row[] }> {
  const entries = Object.entries(queries);
  const results: Record<string, Row[]> = {};
  let idx = 0;
  const worker = async () => {
    while (idx < entries.length) {
      const [key, query] = entries[idx++];
      results[key] = await runQuery(query);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, config.semantic.concurrency) }, worker)
  );
  return results as { [K in keyof T]: Row[] };
}

// ── value coercion helpers (measures often come back as strings) ─────────────
export function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
export function int(v: any): number {
  return Math.round(num(v) ?? 0);
}
export function iso(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}
// "2023-08-01T00:00:00.000000Z" | "2023-08-01" → "2023-08"
export function monthKey(v: any): string | null {
  const s = iso(v);
  return s ? s.slice(0, 7) : null;
}
export function truthy(v: any): boolean {
  return v === true || v === "true" || v === "True" || v === "Y" || v === 1 || v === "1";
}
