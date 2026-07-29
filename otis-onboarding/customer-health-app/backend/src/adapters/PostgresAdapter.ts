import { query } from "../db/pool.js";
import type {
  CustomerDetailRaw,
  CustomerMetricRow,
  DataAdapter,
  FilterOptions,
  InsightsRaw,
  NpsTrendPoint,
} from "./types.js";

const METRICS_SQL = `
WITH nps AS (
  SELECT customer_id,
    round(avg(nps_score),1)                                    AS avg_nps,
    count(*)                                                   AS nps_responses,
    count(*) FILTER (WHERE nps_category='Promoter')            AS promoters,
    count(*) FILTER (WHERE nps_category='Passive')             AS passives,
    count(*) FILTER (WHERE nps_category='Detractor')           AS detractors,
    round(avg(sentiment_score),2)                              AS avg_sentiment,
    count(*) FILTER (WHERE nps_sentiment='Negative')           AS negative_feedback
  FROM v_nps GROUP BY customer_id
),
latest_nps AS (
  SELECT DISTINCT ON (customer_id) customer_id,
    nps_score AS latest_nps, nps_category AS latest_nps_category, response_date AS latest_nps_date
  FROM v_nps WHERE nps_score IS NOT NULL
  ORDER BY customer_id, response_date DESC
),
cb AS (
  SELECT customer_id,
    count(*)                                                   AS total_callbacks,
    count(*) FILTER (WHERE out_of_service_flag='Y')            AS oos_callbacks,
    round(avg(EXTRACT(EPOCH FROM (arrived_ts - callback_ts))/3600.0)::numeric,1) AS avg_lead_time_hours,
    round(sum(CASE WHEN out_of_service_flag='Y'
              THEN EXTRACT(EPOCH FROM (left_ts - callback_ts))/3600.0 ELSE 0 END)::numeric,1) AS downtime_hours,
    max(callback_date)                                         AS last_callback_date
  FROM v_callbacks GROUP BY customer_id
),
mcp AS (
  SELECT customer_id,
    sum(scheduled_visits)                                      AS scheduled_visits,
    sum(completed_visits)                                      AS completed_visits,
    sum(missed_visits)                                         AS missed_visits,
    round(avg(compliance_pct),1)                               AS avg_compliance,
    max(last_visit_date)                                       AS last_visit_date
  FROM v_mcp GROUP BY customer_id
),
ar_c AS (
  SELECT DISTINCT ON (contract_id) contract_id, customer_id, open_ar, ar_over_90, disputed, delinquent
  FROM v_ar ORDER BY contract_id, ar_month DESC
),
ar AS (
  SELECT customer_id,
    sum(open_ar)                                               AS open_ar,
    sum(ar_over_90)                                            AS ar_over_90,
    sum(disputed)                                              AS disputed,
    bool_or(delinquent='Y')                                    AS delinquent
  FROM ar_c GROUP BY customer_id
),
un AS (
  SELECT customer_id,
    count(*)                                                   AS total_units,
    count(*) FILTER (WHERE otis_one_enrolled='True')           AS connected_units,
    round(avg(current_health_score),3)                         AS avg_unit_health,
    min(installation_date)                                     AS oldest_install
  FROM v_units GROUP BY customer_id
),
uh_latest AS (
  SELECT DISTINCT ON (unit_id) unit_id, customer_id, predicted_failure_flag
  FROM v_unit_health ORDER BY unit_id, snapshot_date DESC
),
uh AS (
  SELECT customer_id, count(*) FILTER (WHERE predicted_failure_flag='Y') AS predicted_failures
  FROM uh_latest GROUP BY customer_id
),
ct AS (
  SELECT customer_id,
    count(*)                                                   AS total_contracts,
    count(*) FILTER (WHERE status='Active')                    AS active_contracts,
    count(*) FILTER (WHERE status ILIKE '%cancel%' OR cancel_date IS NOT NULL) AS cancelled_contracts,
    COALESCE(sum(gross_monthly_billing) FILTER (WHERE status='Active'),
             sum(gross_monthly_billing))                       AS gross_monthly_billing,
    sum(contract_value)                                        AS contract_value,
    min(start_date)                                            AS first_contract_date,
    min(renewal_date) FILTER (WHERE renewal_date >= CURRENT_DATE) AS next_renewal_date
  FROM v_contracts GROUP BY customer_id
),
oo AS (
  SELECT customer_id,
    count(*) FILTER (WHERE order_status <> 'Closed')           AS open_orders,
    count(*)                                                   AS total_orders
  FROM v_orders GROUP BY customer_id
)
SELECT
  c.customer_id, c.customer_name, c.classification, c.sales_segment, c.nsa_name,
  c.region, c.subregion, c.gbo, c.country, c.currency,
  nps.avg_nps, ln.latest_nps, ln.latest_nps_category, ln.latest_nps_date,
  COALESCE(nps.nps_responses,0) AS nps_responses,
  COALESCE(nps.promoters,0) AS promoters, COALESCE(nps.passives,0) AS passives,
  COALESCE(nps.detractors,0) AS detractors, nps.avg_sentiment,
  COALESCE(nps.negative_feedback,0) AS negative_feedback,
  COALESCE(cb.total_callbacks,0) AS total_callbacks,
  COALESCE(cb.oos_callbacks,0) AS oos_callbacks,
  cb.avg_lead_time_hours, cb.downtime_hours, cb.last_callback_date,
  COALESCE(mcp.scheduled_visits,0) AS scheduled_visits,
  COALESCE(mcp.completed_visits,0) AS completed_visits,
  COALESCE(mcp.missed_visits,0) AS missed_visits,
  mcp.avg_compliance, mcp.last_visit_date,
  COALESCE(un.total_units,0) AS total_units,
  COALESCE(un.connected_units,0) AS connected_units,
  un.avg_unit_health, un.oldest_install,
  COALESCE(uh.predicted_failures,0) AS predicted_failures,
  COALESCE(ct.total_contracts,0) AS total_contracts,
  COALESCE(ct.active_contracts,0) AS active_contracts,
  COALESCE(ct.cancelled_contracts,0) AS cancelled_contracts,
  ct.gross_monthly_billing, ct.contract_value, ct.first_contract_date, ct.next_renewal_date,
  ar.open_ar, ar.ar_over_90, ar.disputed, COALESCE(ar.delinquent,false) AS delinquent,
  COALESCE(oo.open_orders,0) AS open_orders, COALESCE(oo.total_orders,0) AS total_orders
FROM v_customers c
LEFT JOIN nps        ON nps.customer_id = c.customer_id
LEFT JOIN latest_nps ln ON ln.customer_id = c.customer_id
LEFT JOIN cb         ON cb.customer_id = c.customer_id
LEFT JOIN mcp        ON mcp.customer_id = c.customer_id
LEFT JOIN ar         ON ar.customer_id = c.customer_id
LEFT JOIN un         ON un.customer_id = c.customer_id
LEFT JOIN uh         ON uh.customer_id = c.customer_id
LEFT JOIN ct         ON ct.customer_id = c.customer_id
LEFT JOIN oo         ON oo.customer_id = c.customer_id
`;

function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v: any): number {
  return num(v) ?? 0;
}
function iso(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function mapMetric(r: any): CustomerMetricRow {
  return {
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    classification: r.classification,
    sales_segment: r.sales_segment,
    nsa_name: r.nsa_name,
    region: r.region,
    subregion: r.subregion,
    gbo: r.gbo,
    country: r.country,
    currency: r.currency,
    avg_nps: num(r.avg_nps),
    latest_nps: num(r.latest_nps),
    latest_nps_category: r.latest_nps_category,
    latest_nps_date: iso(r.latest_nps_date),
    nps_responses: int(r.nps_responses),
    promoters: int(r.promoters),
    passives: int(r.passives),
    detractors: int(r.detractors),
    avg_sentiment: num(r.avg_sentiment),
    negative_feedback: int(r.negative_feedback),
    total_callbacks: int(r.total_callbacks),
    oos_callbacks: int(r.oos_callbacks),
    avg_lead_time_hours: num(r.avg_lead_time_hours),
    downtime_hours: num(r.downtime_hours),
    last_callback_date: iso(r.last_callback_date),
    scheduled_visits: int(r.scheduled_visits),
    completed_visits: int(r.completed_visits),
    missed_visits: int(r.missed_visits),
    avg_compliance: num(r.avg_compliance),
    last_visit_date: iso(r.last_visit_date),
    total_units: int(r.total_units),
    connected_units: int(r.connected_units),
    avg_unit_health: num(r.avg_unit_health),
    oldest_install: iso(r.oldest_install),
    predicted_failures: int(r.predicted_failures),
    total_contracts: int(r.total_contracts),
    active_contracts: int(r.active_contracts),
    cancelled_contracts: int(r.cancelled_contracts),
    gross_monthly_billing: num(r.gross_monthly_billing),
    contract_value: num(r.contract_value),
    first_contract_date: iso(r.first_contract_date),
    next_renewal_date: iso(r.next_renewal_date),
    open_ar: num(r.open_ar),
    ar_over_90: num(r.ar_over_90),
    disputed: num(r.disputed),
    delinquent: Boolean(r.delinquent),
    open_orders: int(r.open_orders),
    total_orders: int(r.total_orders),
  };
}

export class PostgresAdapter implements DataAdapter {
  async customerMetrics(): Promise<CustomerMetricRow[]> {
    const rows = await query(METRICS_SQL);
    return rows.map(mapMetric);
  }

  async customerDetail(customerId: string): Promise<CustomerDetailRaw | null> {
    const metricRows = await query(
      `${METRICS_SQL}\nWHERE c.customer_id = $1`,
      [customerId]
    );
    if (metricRows.length === 0) return null;
    const metrics = mapMetric(metricRows[0]);

    const [
      npsTrend,
      npsHistory,
      contracts,
      units,
      openIssues,
      missedVisitTrend,
      negativeFeedback,
      arTrend,
      recentNotes,
    ] = await Promise.all([
      query(
        `SELECT to_char(date_trunc('month', response_date),'YYYY-MM') AS month,
                round(avg(nps_score),1) AS avg_nps,
                round((count(*) FILTER (WHERE nps_category='Promoter')::numeric
                     - count(*) FILTER (WHERE nps_category='Detractor')::numeric)
                     * 100.0 / NULLIF(count(*),0),0) AS net_nps,
                count(*) AS responses
         FROM v_nps WHERE customer_id=$1 AND response_date IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [customerId]
      ),
      query(
        `SELECT response_date, nps_score, nps_category, nps_sentiment, nps_verbatim,
                nps_driver_topics, risk_color, satisfaction_rating
         FROM v_nps WHERE customer_id=$1 ORDER BY response_date DESC NULLS LAST LIMIT 100`,
        [customerId]
      ),
      query(
        `SELECT contract_id, contract_type_desc, service_package, status, start_date, exp_date,
                renewal_date, cancel_date, cancel_reason, contract_value, gross_monthly_billing,
                renewalflag, currency, sales_rep
         FROM v_contracts WHERE customer_id=$1 ORDER BY start_date DESC NULLS LAST`,
        [customerId]
      ),
      query(
        `SELECT u.unit_id, u.product_class, u.product_name, u.installation_date, u.unit_status,
                u.otis_one_enrolled, u.current_health_score,
                EXTRACT(YEAR FROM age(CURRENT_DATE, u.installation_date))::int AS age_years
         FROM v_units u WHERE u.customer_id=$1 ORDER BY u.installation_date ASC NULLS LAST`,
        [customerId]
      ),
      query(
        `SELECT order_key, order_type, order_status, order_date, job_revenue, job_cost, margin_pct
         FROM v_orders WHERE customer_id=$1 AND order_status <> 'Closed'
         ORDER BY order_date DESC NULLS LAST LIMIT 50`,
        [customerId]
      ),
      query(
        `SELECT to_char(date_trunc('month', report_month),'YYYY-MM') AS month,
                sum(missed_visits) AS missed, sum(scheduled_visits) AS scheduled,
                sum(completed_visits) AS completed
         FROM v_mcp WHERE customer_id=$1 AND report_month IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [customerId]
      ),
      query(
        `SELECT response_date, nps_score, nps_verbatim, nps_driver_topics, risk_color, nps_sentiment
         FROM v_nps
         WHERE customer_id=$1 AND (nps_sentiment='Negative' OR nps_category='Detractor')
           AND nps_verbatim IS NOT NULL AND nps_verbatim <> ''
         ORDER BY response_date DESC LIMIT 25`,
        [customerId]
      ),
      query(
        `SELECT to_char(date_trunc('month', ar_month),'YYYY-MM') AS month,
                sum(open_ar) AS open_ar, sum(ar_over_90) AS over_90
         FROM v_ar WHERE customer_id=$1 AND ar_month IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [customerId]
      ),
      query(
        `SELECT work_date, notes FROM v_notes
         WHERE customer_id=$1 AND notes IS NOT NULL AND notes <> ''
         ORDER BY work_date DESC NULLS LAST LIMIT 20`,
        [customerId]
      ),
    ]);

    return {
      metrics,
      npsTrend: npsTrend.map((r: any) => ({
        month: r.month,
        avg_nps: num(r.avg_nps),
        net_nps: num(r.net_nps),
        responses: int(r.responses),
      })) as NpsTrendPoint[],
      npsHistory: npsHistory.map((r: any) => ({
        response_date: iso(r.response_date),
        nps_score: num(r.nps_score),
        nps_category: r.nps_category,
        nps_sentiment: r.nps_sentiment,
        nps_verbatim: r.nps_verbatim,
        nps_driver_topics: r.nps_driver_topics,
        risk_color: r.risk_color,
        satisfaction_rating: num(r.satisfaction_rating),
      })),
      contracts: contracts.map((r: any) => ({
        ...r,
        start_date: iso(r.start_date),
        exp_date: iso(r.exp_date),
        renewal_date: iso(r.renewal_date),
        cancel_date: iso(r.cancel_date),
        contract_value: num(r.contract_value),
        gross_monthly_billing: num(r.gross_monthly_billing),
      })),
      units: units.map((r: any) => ({
        ...r,
        installation_date: iso(r.installation_date),
        current_health_score: num(r.current_health_score),
        age_years: num(r.age_years),
      })),
      openIssues: openIssues.map((r: any) => ({
        ...r,
        order_date: iso(r.order_date),
        job_revenue: num(r.job_revenue),
        job_cost: num(r.job_cost),
        margin_pct: num(r.margin_pct),
      })),
      missedVisitTrend: missedVisitTrend.map((r: any) => ({
        month: r.month,
        missed: int(r.missed),
        scheduled: int(r.scheduled),
        completed: int(r.completed),
      })),
      negativeFeedback: negativeFeedback.map((r: any) => ({
        ...r,
        response_date: iso(r.response_date),
        nps_score: num(r.nps_score),
      })),
      arTrend: arTrend.map((r: any) => ({
        month: r.month,
        open_ar: num(r.open_ar),
        over_90: num(r.over_90),
      })),
      recentNotes: recentNotes.map((r: any) => ({
        work_date: iso(r.work_date),
        notes: r.notes,
      })),
    };
  }

  async insights(): Promise<InsightsRaw> {
    const [
      sentimentBreakdown,
      categoryBreakdown,
      satisfiedTopics,
      dissatisfiedTopics,
      allTopics,
      detractorsByRegion,
      detractorsByGbo,
    ] = await Promise.all([
      query(`SELECT COALESCE(nps_sentiment,'Unknown') AS sentiment, count(*)::int AS count
              FROM v_nps GROUP BY 1 ORDER BY 2 DESC`),
      query(`SELECT COALESCE(nps_category,'Unknown') AS category, count(*)::int AS count
              FROM v_nps GROUP BY 1 ORDER BY 2 DESC`),
      query(`SELECT trim(topic) AS topic, count(*)::int AS count
              FROM v_nps, unnest(string_to_array(nps_driver_topics, ',')) AS topic
              WHERE nps_category='Promoter' AND nps_driver_topics IS NOT NULL AND trim(topic) <> ''
              GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      query(`SELECT trim(topic) AS topic, count(*)::int AS count
              FROM v_nps, unnest(string_to_array(nps_driver_topics, ',')) AS topic
              WHERE nps_category='Detractor' AND nps_driver_topics IS NOT NULL AND trim(topic) <> ''
              GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      query(`SELECT trim(topic) AS topic, count(*)::int AS count
              FROM v_nps, unnest(string_to_array(nps_driver_topics, ',')) AS topic
              WHERE nps_driver_topics IS NOT NULL AND trim(topic) <> ''
              GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
      query(`SELECT COALESCE(gbo,'Unknown') AS gbo,
                    count(*) FILTER (WHERE nps_category='Detractor')::int AS detractors,
                    count(*)::int AS total
              FROM v_nps GROUP BY 1 HAVING count(*) FILTER (WHERE nps_category='Detractor') > 0
              ORDER BY 2 DESC LIMIT 12`),
      query(`SELECT COALESCE(gbo,'Unknown') AS gbo,
                    count(*) FILTER (WHERE nps_category='Detractor')::int AS detractors,
                    count(*)::int AS total
              FROM v_nps GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    ]);

    return {
      sentimentBreakdown: sentimentBreakdown as any,
      categoryBreakdown: categoryBreakdown as any,
      satisfiedTopics: satisfiedTopics as any,
      dissatisfiedTopics: dissatisfiedTopics as any,
      allTopics: allTopics as any,
      // NPS surveys carry GBO but not a clean region column, so we surface GBO-level
      // concentration for both views (region view uses GBO as the closest grain here).
      detractorsByRegion: (detractorsByRegion as any).map((r: any) => ({
        region: r.gbo,
        detractors: r.detractors,
        total: r.total,
      })),
      detractorsByGbo: detractorsByGbo as any,
    };
  }

  async filterOptions(): Promise<FilterOptions> {
    const [regions, gbos, segments, classifications] = await Promise.all([
      query(`SELECT DISTINCT region FROM v_customers WHERE region IS NOT NULL ORDER BY 1`),
      query(`SELECT DISTINCT gbo FROM v_customers WHERE gbo IS NOT NULL ORDER BY 1`),
      query(`SELECT DISTINCT sales_segment FROM v_customers WHERE sales_segment IS NOT NULL ORDER BY 1`),
      query(`SELECT DISTINCT classification FROM v_customers WHERE classification IS NOT NULL ORDER BY 1`),
    ]);
    return {
      regions: regions.map((r: any) => r.region),
      gbos: gbos.map((r: any) => r.gbo),
      segments: segments.map((r: any) => r.sales_segment),
      classifications: classifications.map((r: any) => r.classification),
    };
  }
}
