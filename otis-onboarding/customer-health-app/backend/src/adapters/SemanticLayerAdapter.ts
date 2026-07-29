import type {
  CustomerDetailRaw,
  CustomerMetricRow,
  DataAdapter,
  FilterOptions,
  InsightsRaw,
  NpsTrendPoint,
} from "./types.js";
import { config } from "../config.js";
import {
  int,
  iso,
  monthKey,
  num,
  runAll,
  runQuery,
  truthy,
  type CubeQuery,
  type Row,
} from "./semanticClient.js";

/**
 * Reads the DataOS/Cube.js semantic layer and returns data in the SAME canonical
 * shapes as PostgresAdapter, so the API + frontend + health scoring are unchanged.
 *
 * Because Cube exposes measures/dimensions (not arbitrary SQL), a few things that
 * Postgres computes with window functions / min-max are aggregated here in Node:
 *   - latest NPS score/date/category  (from the ~4k row-level NPS fetch)
 *   - min/max dates: oldest_install, first/next contract dates (row-level fetch)
 *   - promoters/passives/detractors, negative feedback, open vs total orders (pivot)
 * All fetches are sized against real row counts and paginate if a page fills up.
 */

const TODAY = () => new Date().toISOString().slice(0, 10);

function indexBy(rows: Row[], key: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) m.set(String(r[key]), r);
  return m;
}
function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key]);
    let bucket = m.get(k);
    if (!bucket) { bucket = []; m.set(k, bucket); }
    bucket.push(r);
  }
  return m;
}

export class SemanticLayerAdapter implements DataAdapter {
  // Memoize the expensive bulk fetch so customerDetail can reuse a customer's
  // metric row instead of re-querying 12 models per page view.
  private metricsCache: { at: number; rows: CustomerMetricRow[] } | null = null;

  async customerMetrics(): Promise<CustomerMetricRow[]> {
    if (this.metricsCache && Date.now() - this.metricsCache.at < config.cacheTtlMs) {
      return this.metricsCache.rows;
    }

    const q = {
      customers: {
        dimensions: [
          "CUSTOMERS.CUSTOMER_ID", "CUSTOMERS.CUSTOMER_NAME", "CUSTOMERS.CUSTOMER_CLASSIFICATION",
          "CUSTOMERS.SALES_SEGMENT", "CUSTOMERS.NSA_NAME", "CUSTOMERS.REGION_DESC",
          "CUSTOMERS.SUBREGION_DESC", "CUSTOMERS.GBO", "CUSTOMERS.COUNTRY_CD", "CUSTOMERS.BILLING_CURRENCY_CD",
        ],
      },
      // Row-level NPS (RESPONSEID keeps every response distinct so counts are exact).
      nps: {
        dimensions: [
          "NPS_SURVEYS.RESPONSEID", "NPS_SURVEYS.CUSTOMER_ID", "NPS_SURVEYS.RESPONSE_DATE",
          "NPS_SURVEYS.NPS_SCORE", "NPS_SURVEYS.NPS_CATEGORY", "NPS_SURVEYS.NPS_SENTIMENT",
          "NPS_SURVEYS.NPS_SENTIMENT_SCORE",
        ],
      },
      callbacks: {
        measures: ["CALLBACKS.TOTAL_CALLBACKS", "CALLBACKS.AVG_CALLBACK_LEAD_TIME_HOURS", "CALLBACKS.TOTAL_UNIT_DOWNTIME_HOURS"],
        dimensions: ["CALLBACKS.CUSTOMER_ID"],
      },
      callbacksOos: {
        measures: ["CALLBACKS.TOTAL_CALLBACKS"],
        dimensions: ["CALLBACKS.CUSTOMER_ID"],
        filters: [{ member: "CALLBACKS.OUT_OF_SERVICE_FLAG", operator: "equals", values: ["Y"] }],
      },
      mcp: {
        measures: ["MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS", "MCP_COMPLIANCE.TOTAL_COMPLETED_VISITS", "MCP_COMPLIANCE.TOTAL_MISSED_VISITS", "MCP_COMPLIANCE.AVG_COMPLIANCE_PCT"],
        dimensions: ["MCP_COMPLIANCE.CUSTOMER_ID"],
      },
      // Last visit month precision (MCP_COMPLIANCE is already unit-month grain via
      // REPORT_MONTH — there is no finer per-visit date on this model).
      mcpLastVisit: {
        measures: ["MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS"],
        dimensions: ["MCP_COMPLIANCE.CUSTOMER_ID"],
        timeDimensions: [{ dimension: "MCP_COMPLIANCE.REPORT_MONTH", granularity: "month" }],
      },
      // Row-level units (UNIT_ID keeps units distinct for an exact count).
      units: {
        dimensions: ["UNITS.UNIT_ID", "UNITS.CUSTOMER_ID", "UNITS.INSTALLATION_DATE", "UNITS.CURRENT_HEALTH_SCORE", "UNITS.OTIS_ONE_ENROLLED"],
      },
      unitHealth: {
        measures: ["OTIS_ONE_UNIT_HEALTH.UNITS_MONITORED"],
        dimensions: ["OTIS_ONE_UNIT_HEALTH.CUSTOMER_ID"],
        filters: [{ member: "OTIS_ONE_UNIT_HEALTH.PREDICTED_FAILURE_FLAG", operator: "equals", values: ["Y"] }],
      },
      // Row-level contracts (CONTRACT_ID distinct) → counts, min/max dates, sums.
      contracts: {
        dimensions: [
          "CONTRACTS.CONTRACT_ID", "CONTRACTS.CUSTOMER_ID", "CONTRACTS.CONTRACTSTATUS",
          "CONTRACTS.CONTRACTSTARTDATE", "CONTRACTS.RENEWALDATE", "CONTRACTS.CANCELDATE",
          "CONTRACTS.CONTRACTVALUE", "CONTRACTS.GROSSMONTHLYBILLING",
        ],
      },
      // AR is a monthly snapshot; summing the measures across every month inflates
      // "current" balances ~20x, so we fetch row-level and keep the LATEST month
      // per contract in Node (mirrors Postgres' DISTINCT ON (contract, month DESC)).
      ar: {
        dimensions: [
          "AR_OPENAR.CONTRACT_ID", "AR_OPENAR.CUSTOMER_ID", "AR_OPENAR.AR_MONTH",
          "AR_OPENAR.OPEN_AR", "AR_OPENAR.AR_OVER_90_DAYS", "AR_OPENAR.DISPUTEDAMOUNT", "AR_OPENAR.DELINQUENT",
        ],
      },
      orders: {
        measures: ["OPEN_ORDERS.OPEN_ORDER_COUNT"],
        dimensions: ["OPEN_ORDERS.CUSTOMER_ID", "OPEN_ORDERS.ORDER_STATUS"],
      },
    } satisfies Record<string, CubeQuery>;

    const r = await runAll(q);

    // ── group / pivot the multi-row results by customer ──────────────────────
    const npsByCust = groupBy(r.nps, "NPS_SURVEYS.CUSTOMER_ID");
    const unitsByCust = groupBy(r.units, "UNITS.CUSTOMER_ID");
    const contractsByCust = groupBy(r.contracts, "CONTRACTS.CUSTOMER_ID");
    const ordersByCust = groupBy(r.orders, "OPEN_ORDERS.CUSTOMER_ID");

    const cbById = indexBy(r.callbacks, "CALLBACKS.CUSTOMER_ID");
    const cbOosById = indexBy(r.callbacksOos, "CALLBACKS.CUSTOMER_ID");
    const mcpById = indexBy(r.mcp, "MCP_COMPLIANCE.CUSTOMER_ID");
    const predictedById = indexBy(r.unitHealth, "OTIS_ONE_UNIT_HEALTH.CUSTOMER_ID");
    const arByCust = this.aggregateAr(r.ar);

    // last visit month per customer (max bucket)
    const lastVisitByCust = new Map<string, string | null>();
    for (const row of r.mcpLastVisit) {
      const id = String(row["MCP_COMPLIANCE.CUSTOMER_ID"]);
      const m = monthKey(row["MCP_COMPLIANCE.REPORT_MONTH.month"]);
      const prev = lastVisitByCust.get(id) ?? null;
      if (m && (!prev || m > prev)) lastVisitByCust.set(id, m);
    }

    const rows: CustomerMetricRow[] = r.customers.map((c) => {
      const id = String(c["CUSTOMERS.CUSTOMER_ID"]);
      const nps = this.aggregateNps(npsByCust.get(id) ?? []);
      const units = this.aggregateUnits(unitsByCust.get(id) ?? []);
      const ct = this.aggregateContracts(contractsByCust.get(id) ?? []);

      let openOrders = 0;
      let totalOrders = 0;
      for (const o of ordersByCust.get(id) ?? []) {
        const n = int(o["OPEN_ORDERS.OPEN_ORDER_COUNT"]);
        totalOrders += n;
        if (String(o["OPEN_ORDERS.ORDER_STATUS"]) !== "Closed") openOrders += n;
      }

      const cb = cbById.get(id);
      const mcp = mcpById.get(id);
      const ar = arByCust.get(id);

      return {
        customer_id: id,
        customer_name: c["CUSTOMERS.CUSTOMER_NAME"] ?? null,
        classification: c["CUSTOMERS.CUSTOMER_CLASSIFICATION"] ?? null,
        sales_segment: c["CUSTOMERS.SALES_SEGMENT"] ?? null,
        nsa_name: c["CUSTOMERS.NSA_NAME"] ?? null,
        region: c["CUSTOMERS.REGION_DESC"] ?? null,
        subregion: c["CUSTOMERS.SUBREGION_DESC"] ?? null,
        gbo: c["CUSTOMERS.GBO"] ?? null,
        country: c["CUSTOMERS.COUNTRY_CD"] ?? null,
        currency: c["CUSTOMERS.BILLING_CURRENCY_CD"] ?? null,

        ...nps,

        total_callbacks: int(cb?.["CALLBACKS.TOTAL_CALLBACKS"]),
        oos_callbacks: int(cbOosById.get(id)?.["CALLBACKS.TOTAL_CALLBACKS"]),
        avg_lead_time_hours: num(cb?.["CALLBACKS.AVG_CALLBACK_LEAD_TIME_HOURS"]),
        downtime_hours: num(cb?.["CALLBACKS.TOTAL_UNIT_DOWNTIME_HOURS"]),
        last_callback_date: null, // not shown in the list; computed exactly in detail

        scheduled_visits: int(mcp?.["MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS"]),
        completed_visits: int(mcp?.["MCP_COMPLIANCE.TOTAL_COMPLETED_VISITS"]),
        missed_visits: int(mcp?.["MCP_COMPLIANCE.TOTAL_MISSED_VISITS"]),
        avg_compliance: num(mcp?.["MCP_COMPLIANCE.AVG_COMPLIANCE_PCT"]),
        last_visit_date: lastVisitByCust.get(id) ?? null,

        ...units,
        predicted_failures: int(predictedById.get(id)?.["OTIS_ONE_UNIT_HEALTH.UNITS_MONITORED"]),

        ...ct,
        open_ar: ar ? ar.open_ar : null,
        ar_over_90: ar ? ar.ar_over_90 : null,
        disputed: ar ? ar.disputed : null,
        delinquent: ar ? ar.delinquent : false,
        open_orders: openOrders,
        total_orders: totalOrders,
      };
    });

    this.metricsCache = { at: Date.now(), rows };
    return rows;
  }

  // ── per-customer aggregations shared by list + detail ──────────────────────
  private aggregateNps(responses: Row[]) {
    let sumScore = 0, countScore = 0, sumSent = 0, countSent = 0;
    let promoters = 0, passives = 0, detractors = 0, negative = 0;
    let latest: Row | null = null;
    for (const x of responses) {
      const score = num(x["NPS_SURVEYS.NPS_SCORE"]);
      if (score !== null) { sumScore += score; countScore++; }
      const sent = num(x["NPS_SURVEYS.NPS_SENTIMENT_SCORE"]);
      if (sent !== null) { sumSent += sent; countSent++; }
      const cat = x["NPS_SURVEYS.NPS_CATEGORY"];
      if (cat === "Promoter") promoters++;
      else if (cat === "Passive") passives++;
      else if (cat === "Detractor") detractors++;
      if (x["NPS_SURVEYS.NPS_SENTIMENT"] === "Negative") negative++;
      const d = iso(x["NPS_SURVEYS.RESPONSE_DATE"]);
      if (score !== null && d && (!latest || d > (iso(latest["NPS_SURVEYS.RESPONSE_DATE"]) ?? ""))) latest = x;
    }
    return {
      avg_nps: countScore ? Math.round((sumScore / countScore) * 10) / 10 : null,
      latest_nps: latest ? num(latest["NPS_SURVEYS.NPS_SCORE"]) : null,
      latest_nps_category: latest ? latest["NPS_SURVEYS.NPS_CATEGORY"] ?? null : null,
      latest_nps_date: latest ? iso(latest["NPS_SURVEYS.RESPONSE_DATE"]) : null,
      nps_responses: responses.length,
      promoters,
      passives,
      detractors,
      avg_sentiment: countSent ? Math.round((sumSent / countSent) * 100) / 100 : null,
      negative_feedback: negative,
    };
  }

  private aggregateUnits(units: Row[]) {
    let connected = 0, sumHealth = 0, countHealth = 0;
    let oldest: string | null = null;
    for (const u of units) {
      if (truthy(u["UNITS.OTIS_ONE_ENROLLED"])) connected++;
      const h = num(u["UNITS.CURRENT_HEALTH_SCORE"]);
      if (h !== null) { sumHealth += h; countHealth++; }
      const d = iso(u["UNITS.INSTALLATION_DATE"]);
      if (d && (!oldest || d < oldest)) oldest = d;
    }
    return {
      total_units: units.length,
      connected_units: connected,
      avg_unit_health: countHealth ? Math.round((sumHealth / countHealth) * 1000) / 1000 : null,
      oldest_install: oldest,
    };
  }

  private aggregateContracts(contracts: Row[]) {
    let active = 0, cancelled = 0, value = 0, activeGmb = 0, allGmb = 0;
    let first: string | null = null, nextRenewal: string | null = null;
    const today = TODAY();
    for (const c of contracts) {
      const status = String(c["CONTRACTS.CONTRACTSTATUS"] ?? "");
      const isActive = status === "Active";
      if (isActive) active++;
      if (/cancel/i.test(status) || c["CONTRACTS.CANCELDATE"]) cancelled++;
      value += num(c["CONTRACTS.CONTRACTVALUE"]) ?? 0;
      const gmb = num(c["CONTRACTS.GROSSMONTHLYBILLING"]) ?? 0;
      allGmb += gmb;
      if (isActive) activeGmb += gmb;
      const start = iso(c["CONTRACTS.CONTRACTSTARTDATE"]);
      if (start && (!first || start < first)) first = start;
      const renew = iso(c["CONTRACTS.RENEWALDATE"]);
      if (renew && renew >= today && (!nextRenewal || renew < nextRenewal)) nextRenewal = renew;
    }
    return {
      total_contracts: contracts.length,
      active_contracts: active,
      cancelled_contracts: cancelled,
      gross_monthly_billing: contracts.length ? (activeGmb || allGmb) : null,
      contract_value: contracts.length ? value : null,
      first_contract_date: first,
      next_renewal_date: nextRenewal,
    };
  }

  // Keep only the latest AR_MONTH row per contract, then sum per customer — so
  // "open AR" reflects the current balance, not the sum of every monthly snapshot.
  private aggregateAr(rows: Row[]) {
    const latest = new Map<string, Row>();
    for (const x of rows) {
      const k = String(x["AR_OPENAR.CONTRACT_ID"]);
      const month = iso(x["AR_OPENAR.AR_MONTH"]) ?? "";
      const prev = latest.get(k);
      if (!prev || month > (iso(prev["AR_OPENAR.AR_MONTH"]) ?? "")) latest.set(k, x);
    }
    const byCust = new Map<string, { open_ar: number; ar_over_90: number; disputed: number; delinquent: boolean }>();
    for (const x of latest.values()) {
      const id = String(x["AR_OPENAR.CUSTOMER_ID"]);
      const agg = byCust.get(id) ?? { open_ar: 0, ar_over_90: 0, disputed: 0, delinquent: false };
      agg.open_ar += num(x["AR_OPENAR.OPEN_AR"]) ?? 0;
      agg.ar_over_90 += num(x["AR_OPENAR.AR_OVER_90_DAYS"]) ?? 0;
      agg.disputed += num(x["AR_OPENAR.DISPUTEDAMOUNT"]) ?? 0;
      if (String(x["AR_OPENAR.DELINQUENT"]) === "Y") agg.delinquent = true;
      byCust.set(id, agg);
    }
    return byCust;
  }

  async customerDetail(customerId: string): Promise<CustomerDetailRaw | null> {
    // Reuse the cached bulk metric row for this customer (keeps list + detail
    // perfectly consistent and avoids re-querying every model per page view).
    const metrics = (await this.customerMetrics()).find((m) => m.customer_id === customerId);
    if (!metrics) return null;

    const eq = (member: string) => ({ member, operator: "equals", values: [customerId] });

    const q = {
      npsTrend: {
        measures: ["NPS_SURVEYS.AVG_NPS_SCORE", "NPS_SURVEYS.NPS", "NPS_SURVEYS.TOTAL_RESPONSES"],
        timeDimensions: [{ dimension: "NPS_SURVEYS.RESPONSE_DATE", granularity: "month" }],
        filters: [eq("NPS_SURVEYS.CUSTOMER_ID")],
      },
      npsHistory: {
        dimensions: [
          "NPS_SURVEYS.RESPONSEID", "NPS_SURVEYS.RESPONSE_DATE", "NPS_SURVEYS.NPS_SCORE", "NPS_SURVEYS.NPS_CATEGORY",
          "NPS_SURVEYS.NPS_SENTIMENT", "NPS_SURVEYS.NPS_VERBATIM", "NPS_SURVEYS.NPS_DRIVER_TOPICS",
          "NPS_SURVEYS.RISK_COLOR", "NPS_SURVEYS.SATISFACTION_RATING",
        ],
        filters: [eq("NPS_SURVEYS.CUSTOMER_ID")],
        order: { "NPS_SURVEYS.RESPONSE_DATE": "desc" },
        limit: 100,
      },
      contracts: {
        dimensions: [
          "CONTRACTS.CONTRACT_ID", "CONTRACTS.CONTRACTTYPEDESCRIPTION", "CONTRACTS.SERVICEPACKAGEDESC",
          "CONTRACTS.CONTRACTSTATUSDESCRIPTION", "CONTRACTS.CONTRACTSTARTDATE", "CONTRACTS.ORIGINALCONTRACTEXPDATE",
          "CONTRACTS.RENEWALDATE", "CONTRACTS.CANCELDATE", "CONTRACTS.CANCELLATIONREASON",
          "CONTRACTS.CONTRACTVALUE", "CONTRACTS.GROSSMONTHLYBILLING", "CONTRACTS.RENEWALFLAG",
          "CONTRACTS.CURRENCY_CD", "CONTRACTS.SALESREPNAME",
        ],
        filters: [eq("CONTRACTS.CUSTOMER_ID")],
      },
      units: {
        dimensions: [
          "UNITS.UNIT_ID", "UNITS.PRODUCT_CLASS", "UNITS.PRODUCT_NAME", "UNITS.INSTALLATION_DATE",
          "UNITS.UNIT_STATUS", "UNITS.OTIS_ONE_ENROLLED", "UNITS.CURRENT_HEALTH_SCORE",
        ],
        filters: [eq("UNITS.CUSTOMER_ID")],
      },
      openIssues: {
        dimensions: [
          "OPEN_ORDERS.ORDER_KEY", "OPEN_ORDERS.ORDER_TYPE", "OPEN_ORDERS.ORDER_STATUS", "OPEN_ORDERS.ORDER_DATE",
          "OPEN_ORDERS.JOB_REVENUE", "OPEN_ORDERS.JOB_COST", "OPEN_ORDERS.MARGIN_PCT",
        ],
        filters: [eq("OPEN_ORDERS.CUSTOMER_ID"), { member: "OPEN_ORDERS.ORDER_STATUS", operator: "notEquals", values: ["Closed"] }],
        order: { "OPEN_ORDERS.ORDER_DATE": "desc" },
        limit: 50,
      },
      missedVisitTrend: {
        measures: ["MCP_COMPLIANCE.TOTAL_MISSED_VISITS", "MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS", "MCP_COMPLIANCE.TOTAL_COMPLETED_VISITS"],
        timeDimensions: [{ dimension: "MCP_COMPLIANCE.REPORT_MONTH", granularity: "month" }],
        filters: [eq("MCP_COMPLIANCE.CUSTOMER_ID")],
      },
      negativeFeedback: {
        dimensions: [
          "NPS_SURVEYS.RESPONSEID", "NPS_SURVEYS.RESPONSE_DATE", "NPS_SURVEYS.NPS_SCORE", "NPS_SURVEYS.NPS_VERBATIM",
          "NPS_SURVEYS.NPS_DRIVER_TOPICS", "NPS_SURVEYS.RISK_COLOR", "NPS_SURVEYS.NPS_SENTIMENT",
        ],
        filters: [
          eq("NPS_SURVEYS.CUSTOMER_ID"),
          { member: "NPS_SURVEYS.NPS_SENTIMENT", operator: "equals", values: ["Negative"] },
          { member: "NPS_SURVEYS.NPS_VERBATIM", operator: "set" },
        ],
        order: { "NPS_SURVEYS.RESPONSE_DATE": "desc" },
        limit: 25,
      },
      arTrend: {
        measures: ["AR_OPENAR.TOTAL_OPEN_AR", "AR_OPENAR.TOTAL_AR_OVER_90"],
        timeDimensions: [{ dimension: "AR_OPENAR.AR_MONTH", granularity: "month" }],
        filters: [eq("AR_OPENAR.CUSTOMER_ID")],
      },
      callbackDates: {
        dimensions: ["CALLBACKS.CALLBACK_DATE"],
        filters: [eq("CALLBACKS.CUSTOMER_ID")],
        order: { "CALLBACKS.CALLBACK_DATE": "desc" },
        limit: 1,
      },
      recentNotes: {
        dimensions: ["MECHANIC_NOTES.WORKCOMPLETIONDATE", "MECHANIC_NOTES.MESSAGENOTES"],
        filters: [eq("MECHANIC_NOTES.CUSTOMER_ID"), { member: "MECHANIC_NOTES.MESSAGENOTES", operator: "set" }],
        order: { "MECHANIC_NOTES.WORKCOMPLETIONDATE": "desc" },
        limit: 20,
      },
    } satisfies Record<string, CubeQuery>;

    const r = await runAll(q);

    // fill the one list-omitted exact field now that we're scoped to one customer
    metrics.last_callback_date = iso(r.callbackDates[0]?.["CALLBACKS.CALLBACK_DATE"]) ?? null;

    const npsTrend: NpsTrendPoint[] = r.npsTrend
      .map((x) => ({
        month: monthKey(x["NPS_SURVEYS.RESPONSE_DATE.month"]) ?? "",
        avg_nps: num(x["NPS_SURVEYS.AVG_NPS_SCORE"]),
        net_nps: num(x["NPS_SURVEYS.NPS"]),
        responses: int(x["NPS_SURVEYS.TOTAL_RESPONSES"]),
      }))
      .filter((p) => p.month)
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      metrics,
      npsTrend,
      npsHistory: r.npsHistory.map((x) => ({
        response_date: iso(x["NPS_SURVEYS.RESPONSE_DATE"]),
        nps_score: num(x["NPS_SURVEYS.NPS_SCORE"]),
        nps_category: x["NPS_SURVEYS.NPS_CATEGORY"] ?? null,
        nps_sentiment: x["NPS_SURVEYS.NPS_SENTIMENT"] ?? null,
        nps_verbatim: x["NPS_SURVEYS.NPS_VERBATIM"] ?? null,
        nps_driver_topics: x["NPS_SURVEYS.NPS_DRIVER_TOPICS"] ?? null,
        risk_color: x["NPS_SURVEYS.RISK_COLOR"] ?? null,
        satisfaction_rating: num(x["NPS_SURVEYS.SATISFACTION_RATING"]),
      })),
      contracts: r.contracts.map((x) => ({
        contract_id: x["CONTRACTS.CONTRACT_ID"],
        contract_type_desc: x["CONTRACTS.CONTRACTTYPEDESCRIPTION"],
        service_package: x["CONTRACTS.SERVICEPACKAGEDESC"],
        status: x["CONTRACTS.CONTRACTSTATUSDESCRIPTION"],
        start_date: iso(x["CONTRACTS.CONTRACTSTARTDATE"]),
        exp_date: iso(x["CONTRACTS.ORIGINALCONTRACTEXPDATE"]),
        renewal_date: iso(x["CONTRACTS.RENEWALDATE"]),
        cancel_date: iso(x["CONTRACTS.CANCELDATE"]),
        cancel_reason: x["CONTRACTS.CANCELLATIONREASON"],
        contract_value: num(x["CONTRACTS.CONTRACTVALUE"]),
        gross_monthly_billing: num(x["CONTRACTS.GROSSMONTHLYBILLING"]),
        renewalflag: x["CONTRACTS.RENEWALFLAG"],
        currency: x["CONTRACTS.CURRENCY_CD"],
        sales_rep: x["CONTRACTS.SALESREPNAME"],
      })),
      units: r.units.map((x) => {
        const install = iso(x["UNITS.INSTALLATION_DATE"]);
        const ageYears = install ? Math.floor((Date.now() - new Date(install).getTime()) / (365.25 * 864e5)) : null;
        return {
          unit_id: x["UNITS.UNIT_ID"],
          product_class: x["UNITS.PRODUCT_CLASS"],
          product_name: x["UNITS.PRODUCT_NAME"],
          installation_date: install,
          unit_status: x["UNITS.UNIT_STATUS"],
          otis_one_enrolled: x["UNITS.OTIS_ONE_ENROLLED"],
          current_health_score: num(x["UNITS.CURRENT_HEALTH_SCORE"]),
          age_years: ageYears,
        };
      }),
      openIssues: r.openIssues.map((x) => ({
        order_key: x["OPEN_ORDERS.ORDER_KEY"],
        order_type: x["OPEN_ORDERS.ORDER_TYPE"],
        order_status: x["OPEN_ORDERS.ORDER_STATUS"],
        order_date: iso(x["OPEN_ORDERS.ORDER_DATE"]),
        job_revenue: num(x["OPEN_ORDERS.JOB_REVENUE"]),
        job_cost: num(x["OPEN_ORDERS.JOB_COST"]),
        margin_pct: num(x["OPEN_ORDERS.MARGIN_PCT"]),
      })),
      missedVisitTrend: this.rollupMissedVisits(r.missedVisitTrend),
      negativeFeedback: r.negativeFeedback.map((x) => ({
        response_date: iso(x["NPS_SURVEYS.RESPONSE_DATE"]),
        nps_score: num(x["NPS_SURVEYS.NPS_SCORE"]),
        nps_verbatim: x["NPS_SURVEYS.NPS_VERBATIM"],
        nps_driver_topics: x["NPS_SURVEYS.NPS_DRIVER_TOPICS"],
        risk_color: x["NPS_SURVEYS.RISK_COLOR"],
        nps_sentiment: x["NPS_SURVEYS.NPS_SENTIMENT"],
      })),
      arTrend: r.arTrend
        .map((x) => ({
          month: monthKey(x["AR_OPENAR.AR_MONTH.month"]) ?? "",
          open_ar: num(x["AR_OPENAR.TOTAL_OPEN_AR"]),
          over_90: num(x["AR_OPENAR.TOTAL_AR_OVER_90"]),
        }))
        .filter((p) => p.month)
        .sort((a, b) => a.month.localeCompare(b.month)),
      recentNotes: r.recentNotes.map((x) => ({
        work_date: iso(x["MECHANIC_NOTES.WORKCOMPLETIONDATE"]),
        notes: x["MECHANIC_NOTES.MESSAGENOTES"],
      })),
    };
  }

  private rollupMissedVisits(rows: Row[]) {
    return rows
      .map((x) => ({
        month: monthKey(x["MCP_COMPLIANCE.REPORT_MONTH.month"]) ?? "",
        missed: int(x["MCP_COMPLIANCE.TOTAL_MISSED_VISITS"]),
        scheduled: int(x["MCP_COMPLIANCE.TOTAL_SCHEDULED_VISITS"]),
        completed: int(x["MCP_COMPLIANCE.TOTAL_COMPLETED_VISITS"]),
      }))
      .filter((p) => p.month)
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async insights(): Promise<InsightsRaw> {
    const q = {
      sentiment: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.NPS_SENTIMENT"] },
      category: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.NPS_CATEGORY"] },
      topics: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.NPS_DRIVER_TOPICS", "NPS_SURVEYS.NPS_CATEGORY"], limit: 5000 },
      byGbo: { measures: ["NPS_SURVEYS.TOTAL_RESPONSES"], dimensions: ["NPS_SURVEYS.GBO", "NPS_SURVEYS.NPS_CATEGORY"], limit: 5000 },
    } satisfies Record<string, CubeQuery>;

    const r = await runAll(q);

    const sentimentBreakdown = r.sentiment
      .map((x) => ({ sentiment: x["NPS_SURVEYS.NPS_SENTIMENT"] ?? "Unknown", count: int(x["NPS_SURVEYS.TOTAL_RESPONSES"]) }))
      .sort((a, b) => b.count - a.count);
    const categoryBreakdown = r.category
      .map((x) => ({ category: x["NPS_SURVEYS.NPS_CATEGORY"] ?? "Unknown", count: int(x["NPS_SURVEYS.TOTAL_RESPONSES"]) }))
      .sort((a, b) => b.count - a.count);

    // NPS_DRIVER_TOPICS can hold a comma-separated list, so split and attribute
    // the response count to each topic (mirrors Postgres' unnest/split behaviour).
    const topicAgg = (predicate: (cat: string) => boolean, limit: number) => {
      const m = new Map<string, number>();
      for (const x of r.topics) {
        const cat = String(x["NPS_SURVEYS.NPS_CATEGORY"] ?? "");
        if (!predicate(cat)) continue;
        const count = int(x["NPS_SURVEYS.TOTAL_RESPONSES"]);
        for (const raw of String(x["NPS_SURVEYS.NPS_DRIVER_TOPICS"] ?? "").split(",")) {
          const topic = raw.trim();
          if (!topic) continue;
          m.set(topic, (m.get(topic) ?? 0) + count);
        }
      }
      return [...m.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, limit);
    };

    const gboMap = new Map<string, { detractors: number; total: number }>();
    for (const x of r.byGbo) {
      const gbo = String(x["NPS_SURVEYS.GBO"] ?? "Unknown");
      const cat = String(x["NPS_SURVEYS.NPS_CATEGORY"] ?? "");
      const n = int(x["NPS_SURVEYS.TOTAL_RESPONSES"]);
      const g = gboMap.get(gbo) ?? { detractors: 0, total: 0 };
      g.total += n;
      if (cat === "Detractor") g.detractors += n;
      gboMap.set(gbo, g);
    }
    const detractorsByGbo = [...gboMap.entries()]
      .map(([gbo, v]) => ({ gbo, detractors: v.detractors, total: v.total }))
      .sort((a, b) => b.detractors - a.detractors)
      .slice(0, 12);

    return {
      sentimentBreakdown,
      categoryBreakdown,
      satisfiedTopics: topicAgg((c) => c === "Promoter", 12),
      dissatisfiedTopics: topicAgg((c) => c === "Detractor", 12),
      allTopics: topicAgg(() => true, 15),
      // NPS carries GBO but no clean region column; mirror Postgres and surface
      // GBO concentration for the "region" view too.
      detractorsByRegion: detractorsByGbo.map((g) => ({ region: g.gbo, detractors: g.detractors, total: g.total })),
      detractorsByGbo,
    };
  }

  async filterOptions(): Promise<FilterOptions> {
    const q = {
      regions: { dimensions: ["CUSTOMERS.REGION_DESC"], limit: 1000 },
      gbos: { dimensions: ["CUSTOMERS.GBO"], limit: 1000 },
      segments: { dimensions: ["CUSTOMERS.SALES_SEGMENT"], limit: 1000 },
      classifications: { dimensions: ["CUSTOMERS.CUSTOMER_CLASSIFICATION"], limit: 1000 },
    } satisfies Record<string, CubeQuery>;
    const r = await runAll(q);
    const vals = (rows: Row[], member: string) =>
      rows.map((x) => x[member]).filter((v): v is string => v != null && v !== "").sort();
    return {
      regions: vals(r.regions, "CUSTOMERS.REGION_DESC"),
      gbos: vals(r.gbos, "CUSTOMERS.GBO"),
      segments: vals(r.segments, "CUSTOMERS.SALES_SEGMENT"),
      classifications: vals(r.classifications, "CUSTOMERS.CUSTOMER_CLASSIFICATION"),
    };
  }
}
