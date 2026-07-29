// Validates every semantic-layer query the app will use.
// Run:  node --env-file=.env scripts/probe-semantic.mjs
// Each query is submitted, polled to SUCCESS, then its result is fetched.

const BASE = process.env.SEMANTIC_API_URL;
const TOKEN = process.env.SEMANTIC_API_TOKEN;
if (!BASE || !TOKEN) {
  console.error("Missing SEMANTIC_API_URL / SEMANTIC_API_TOKEN in env");
  process.exit(1);
}

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch JSON with retry on non-2xx / HTML (gateway throttling returns HTML error pages).
async function jfetch(url, opts = {}, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, opts);
    const text = await res.text();
    const looksJson = text.trim().startsWith("{") || text.trim().startsWith("[");
    if (res.ok && looksJson) return JSON.parse(text);
    if (attempt >= tries) {
      throw new Error(`${res.status} (${text.slice(0, 80).replace(/\s+/g, " ")})`);
    }
    await sleep(1500 * attempt); // backoff
  }
}

async function runQuery(body, { timeoutMs = 120000 } = {}) {
  const subJson = await jfetch(`${BASE}/api/v1/query/semantic/rest`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const id = subJson.id;
  if (!id) throw new Error(`no statement id: ${JSON.stringify(subJson).slice(0, 200)}`);

  const started = Date.now();
  let status = subJson.status;
  while (status !== "SUCCESS" && status !== "FAILED") {
    if (Date.now() - started > timeoutMs) throw new Error(`poll timeout (last=${status})`);
    await sleep(1500);
    const stJson = await jfetch(`${BASE}/api/v1/query/statement/${id}`, { headers: H });
    status = stJson.status;
    if (status === "FAILED") throw new Error(`FAILED: ${JSON.stringify(stJson.error ?? stJson).slice(0, 200)}`);
  }

  return jfetch(`${BASE}/api/v1/query/statement/${id}/result?format=json`, { headers: H });
}

// Run tasks with limited concurrency to avoid gateway throttling.
async function pool(items, size, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { status: "fulfilled", value: await fn(items[idx], idx) }; }
      catch (e) { results[idx] = { status: "rejected", reason: e }; }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

const QUERIES = {
  // Diagnostics: verify CUSTOMER_ID is queryable on the customer master.
  "diag.customers.byId": { query: { dimensions: ["CUSTOMERS.CUSTOMER_ID", "CUSTOMERS.CUSTOMER_NAME"], limit: 5, timezone: "UTC" } },

  "filter.regions": { query: { dimensions: ["CUSTOMERS.REGION_DESC"], limit: 1000, timezone: "UTC" } },
  "filter.gbos": { query: { dimensions: ["CUSTOMERS.GBO"], limit: 1000, timezone: "UTC" } },
  "filter.segments": { query: { dimensions: ["CUSTOMERS.SALES_SEGMENT"], limit: 1000, timezone: "UTC" } },
  "filter.classifications": { query: { dimensions: ["CUSTOMERS.CUSTOMER_CLASSIFICATION"], limit: 1000, timezone: "UTC" } },

  "customers.base": {
    query: {
      dimensions: [
        "CUSTOMERS.CUSTOMER_ID", "CUSTOMERS.CUSTOMER_NAME", "CUSTOMERS.CUSTOMER_CLASSIFICATION",
        "CUSTOMERS.SALES_SEGMENT", "CUSTOMERS.NSA_NAME", "CUSTOMERS.REGION_DESC",
        "CUSTOMERS.SUBREGION_DESC", "CUSTOMERS.GBO", "CUSTOMERS.COUNTRY_CD", "CUSTOMERS.BILLING_CURRENCY_CD",
      ],
      limit: 5000, timezone: "UTC",
    },
  },

  "nps.overall": {
    query: {
      measures: ["NPS_SURVEYS.AVG_NPS_SCORE", "NPS_SURVEYS.TOTAL_RESPONSES", "NPS_SURVEYS.AVG_SENTIMENT_SCORE", "NPS_SURVEYS.NPS"],
      dimensions: ["NPS_SURVEYS.CUSTOMER_ID"], limit: 5000, timezone: "UTC",
    },
  },
  "nps.byCategory": {
    query: {
      measures: ["NPS_SURVEYS.TOTAL_RESPONSES"],
      dimensions: ["NPS_SURVEYS.CUSTOMER_ID", "NPS_SURVEYS.NPS_CATEGORY"], limit: 50000, timezone: "UTC",
    },
  },
  "nps.bySentiment": {
    query: {
      measures: ["NPS_SURVEYS.TOTAL_RESPONSES"],
      dimensions: ["NPS_SURVEYS.CUSTOMER_ID", "NPS_SURVEYS.NPS_SENTIMENT"], limit: 50000, timezone: "UTC",
    },
  },

  "callbacks.total": {
    query: {
      measures: ["CALLBACKS.TOTAL_CALLBACKS", "CALLBACKS.AVG_CALLBACK_LEAD_TIME_HOURS", "CALLBACKS.TOTAL_UNIT_DOWNTIME_HOURS"],
      dimensions: ["CALLBACKS.CUSTOMER_ID"], limit: 50000, timezone: "UTC",
    },
  },
  "callbacks.oos": {
    query: {
      measures: ["CALLBACKS.TOTAL_CALLBACKS"], dimensions: ["CALLBACKS.CUSTOMER_ID"],
      filters: [{ member: "CALLBACKS.OUT_OF_SERVICE_FLAG", operator: "equals", values: ["Y"] }],
      limit: 50000, timezone: "UTC",
    },
  },

  "mcp.visits": {
    query: {
      measures: ["MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS", "MCP_COMPLIANCE.TOTAL_COMPLETED_VISITS", "MCP_COMPLIANCE.TOTAL_MISSED_VISITS", "MCP_COMPLIANCE.AVG_COMPLIANCE_PCT"],
      dimensions: ["MCP_COMPLIANCE.CUSTOMER_ID"], limit: 5000, timezone: "UTC",
    },
  },

  "units.base": {
    query: { measures: ["UNITS.UNIT_COUNT", "UNITS.AVG_UNIT_HEALTH"], dimensions: ["UNITS.CUSTOMER_ID"], limit: 5000, timezone: "UTC" },
  },
  "units.connected": {
    query: {
      measures: ["UNITS.UNIT_COUNT"], dimensions: ["UNITS.CUSTOMER_ID"],
      filters: [{ member: "UNITS.OTIS_ONE_ENROLLED", operator: "equals", values: ["true"] }],
      limit: 5000, timezone: "UTC",
    },
  },

  "contracts.base": {
    query: {
      measures: ["CONTRACTS.CONTRACT_COUNT", "CONTRACTS.TOTAL_CONTRACT_VALUE", "CONTRACTS.TOTAL_GROSS_MONTHLY_BILLING"],
      dimensions: ["CONTRACTS.CUSTOMER_ID"], limit: 5000, timezone: "UTC",
    },
  },
  "contracts.active": {
    query: {
      measures: ["CONTRACTS.CONTRACT_COUNT"], dimensions: ["CONTRACTS.CUSTOMER_ID"],
      filters: [{ member: "CONTRACTS.CONTRACTSTATUS", operator: "equals", values: ["Active"] }],
      limit: 5000, timezone: "UTC",
    },
  },

  "ar.base": {
    query: {
      measures: ["AR_OPENAR.TOTAL_OPEN_AR", "AR_OPENAR.TOTAL_AR_OVER_90", "AR_OPENAR.TOTAL_DISPUTED"],
      dimensions: ["AR_OPENAR.CUSTOMER_ID"], limit: 5000, timezone: "UTC",
    },
  },

  "orders.byStatus": {
    query: { measures: ["OPEN_ORDERS.OPEN_ORDER_COUNT"], dimensions: ["OPEN_ORDERS.CUSTOMER_ID", "OPEN_ORDERS.ORDER_STATUS"], limit: 50000, timezone: "UTC" },
  },

  "uh.predicted": {
    query: {
      measures: ["OTIS_ONE_UNIT_HEALTH.UNITS_MONITORED"], dimensions: ["OTIS_ONE_UNIT_HEALTH.CUSTOMER_ID"],
      filters: [{ member: "OTIS_ONE_UNIT_HEALTH.PREDICTED_FAILURE_FLAG", operator: "equals", values: ["Y"] }],
      limit: 5000, timezone: "UTC",
    },
  },

  "insights.sentiment": {
    query: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.NPS_SENTIMENT"], limit: 100, timezone: "UTC" },
  },
  "insights.detractorsByGbo": {
    query: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.GBO", "NPS_SURVEYS.NPS_CATEGORY"], limit: 5000, timezone: "UTC" },
  },

  // Trend via timeDimensions granularity (no customer filter — validates monthly grain).
  "detail.npsTrend": {
    query: {
      measures: ["NPS_SURVEYS.AVG_NPS_SCORE", "NPS_SURVEYS.TOTAL_RESPONSES", "NPS_SURVEYS.NPS"],
      timeDimensions: [{ dimension: "NPS_SURVEYS.RESPONSE_DATE", granularity: "month" }],
      limit: 1000, timezone: "UTC",
    },
  },
};

const names = Object.keys(QUERIES);
const results = await pool(names, 3, async (name) => {
  const t0 = Date.now();
  const r = await runQuery(QUERIES[name]);
  return { name, ms: Date.now() - t0, row_count: r.row_count ?? (r.rows?.length ?? 0), cols: r.cols, sample: r.rows?.slice(0, 2) };
});

console.log("\n================ SEMANTIC QUERY PROBE ================\n");
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const res = results[i];
  if (res.status === "fulfilled") {
    const v = res.value;
    console.log(`✅ ${name.padEnd(26)} rows=${String(v.row_count).padStart(6)}  (${v.ms}ms)`);
    console.log(`     cols: ${JSON.stringify(v.cols)}`);
    console.log(`     sample: ${JSON.stringify(v.sample)}`);
  } else {
    console.log(`❌ ${name.padEnd(26)} ERROR: ${res.reason?.message ?? res.reason}`);
  }
}
console.log("\n=====================================================\n");
