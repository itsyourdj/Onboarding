// Sizing probe: how many rows do the row-level fetches return? Determines pagination.
// Run: node --env-file=.env scripts/probe-volumes.mjs
const BASE = process.env.SEMANTIC_API_URL;
const TOKEN = process.env.SEMANTIC_API_TOKEN;
const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jfetch(url, opts = {}, tries = 4) {
  for (let a = 1; ; a++) {
    const res = await fetch(url, opts);
    const t = await res.text();
    const ok = t.trim().startsWith("{") || t.trim().startsWith("[");
    if (res.ok && ok) return JSON.parse(t);
    if (a >= tries) throw new Error(`${res.status} ${t.slice(0, 80).replace(/\s+/g, " ")}`);
    await sleep(1500 * a);
  }
}
async function runQuery(body) {
  const sub = await jfetch(`${BASE}/api/v1/query/semantic/rest`, { method: "POST", headers: H, body: JSON.stringify(body) });
  let status = sub.status, id = sub.id, t0 = Date.now();
  while (status !== "SUCCESS" && status !== "FAILED") {
    if (Date.now() - t0 > 120000) throw new Error("timeout");
    await sleep(1500);
    const st = await jfetch(`${BASE}/api/v1/query/statement/${id}`, { headers: H });
    status = st.status;
    if (status === "FAILED") throw new Error("FAILED " + JSON.stringify(st.error ?? st).slice(0, 150));
  }
  return jfetch(`${BASE}/api/v1/query/statement/${id}/result?format=json`, { headers: H });
}
async function pool(items, size, fn) {
  const out = new Array(items.length); let i = 0;
  const w = async () => { while (i < items.length) { const idx = i++; try { out[idx] = { ok: true, v: await fn(items[idx]) }; } catch (e) { out[idx] = { ok: false, e }; } } };
  await Promise.all(Array.from({ length: size }, w)); return out;
}

const Q = {
  "nps.rows (all responses)": { query: { dimensions: ["NPS_SURVEYS.CUSTOMER_ID", "NPS_SURVEYS.RESPONSE_DATE", "NPS_SURVEYS.NPS_SCORE", "NPS_SURVEYS.NPS_CATEGORY", "NPS_SURVEYS.NPS_SENTIMENT", "NPS_SURVEYS.NPS_DRIVER_TOPICS"], limit: 50000, timezone: "UTC" } },
  "mcp.distinct(cust,lastvisit)": { query: { dimensions: ["MCP_COMPLIANCE.CUSTOMER_ID", "MCP_COMPLIANCE.LAST_VISIT_DATE"], limit: 50000, timezone: "UTC" } },
  "units.rows(cust,install)": { query: { dimensions: ["UNITS.CUSTOMER_ID", "UNITS.INSTALLATION_DATE"], limit: 50000, timezone: "UTC" } },
  "contracts.rows(dates)": { query: { dimensions: ["CONTRACTS.CUSTOMER_ID", "CONTRACTS.CONTRACTSTARTDATE", "CONTRACTS.RENEWALDATE", "CONTRACTS.CONTRACTSTATUS"], limit: 50000, timezone: "UTC" } },
  "callbacks.distinct(cust,date)": { query: { dimensions: ["CALLBACKS.CUSTOMER_ID", "CALLBACKS.CALLBACK_DATE"], limit: 50000, timezone: "UTC" } },
  "nps.topics(driver)": { query: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.NPS_DRIVER_TOPICS", "NPS_SURVEYS.NPS_CATEGORY"], limit: 50000, timezone: "UTC" } },
};
const names = Object.keys(Q);
const r = await pool(names, 3, (n) => runQuery(Q[n]));
console.log("\n===== VOLUME PROBE =====\n");
names.forEach((n, i) => {
  const x = r[i];
  if (x.ok) console.log(`✅ ${n.padEnd(32)} rows=${String(x.v.row_count ?? x.v.rows?.length).padStart(7)}  sample=${JSON.stringify(x.v.rows?.[0])}`);
  else console.log(`❌ ${n.padEnd(32)} ${x.e.message}`);
});
console.log("");
