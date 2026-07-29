// Canonical, source-agnostic shapes. Both the Postgres adapter (today) and the
// Semantic-Layer adapter (later) must return data in exactly these shapes, so the
// health-scoring logic and API surface never change when the data source swaps.

export interface CustomerMetricRow {
  customer_id: string;
  customer_name: string | null;
  classification: string | null;
  sales_segment: string | null;
  nsa_name: string | null;
  region: string | null;
  subregion: string | null;
  gbo: string | null;
  country: string | null;
  currency: string | null;

  // Satisfaction
  avg_nps: number | null;
  latest_nps: number | null;
  latest_nps_category: string | null;
  latest_nps_date: string | null;
  nps_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  avg_sentiment: number | null;
  negative_feedback: number;

  // Service delivery
  total_callbacks: number;
  oos_callbacks: number;
  avg_lead_time_hours: number | null;
  downtime_hours: number | null;
  last_callback_date: string | null;
  scheduled_visits: number;
  completed_visits: number;
  missed_visits: number;
  avg_compliance: number | null;
  last_visit_date: string | null;

  // Equipment
  total_units: number;
  connected_units: number;
  avg_unit_health: number | null;
  oldest_install: string | null;
  predicted_failures: number;

  // Contract & financial
  total_contracts: number;
  active_contracts: number;
  cancelled_contracts: number;
  gross_monthly_billing: number | null;
  contract_value: number | null;
  first_contract_date: string | null;
  next_renewal_date: string | null;
  open_ar: number | null;
  ar_over_90: number | null;
  disputed: number | null;
  delinquent: boolean;
  open_orders: number;
  total_orders: number;
}

export interface NpsTrendPoint {
  month: string;
  avg_nps: number | null;
  net_nps: number | null;
  responses: number;
}

export interface CustomerDetailRaw {
  metrics: CustomerMetricRow;
  npsTrend: NpsTrendPoint[];
  npsHistory: Array<{
    response_date: string | null;
    nps_score: number | null;
    nps_category: string | null;
    nps_sentiment: string | null;
    nps_verbatim: string | null;
    nps_driver_topics: string | null;
    risk_color: string | null;
    satisfaction_rating: number | null;
  }>;
  contracts: Array<Record<string, any>>;
  units: Array<Record<string, any>>;
  openIssues: Array<Record<string, any>>;
  missedVisitTrend: Array<{ month: string; missed: number; scheduled: number; completed: number }>;
  negativeFeedback: Array<Record<string, any>>;
  arTrend: Array<{ month: string; open_ar: number | null; over_90: number | null }>;
  recentNotes: Array<{ work_date: string | null; notes: string | null }>;
}

export interface InsightsRaw {
  sentimentBreakdown: Array<{ sentiment: string; count: number }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  satisfiedTopics: Array<{ topic: string; count: number }>;
  dissatisfiedTopics: Array<{ topic: string; count: number }>;
  allTopics: Array<{ topic: string; count: number }>;
  detractorsByRegion: Array<{ region: string; detractors: number; total: number }>;
  detractorsByGbo: Array<{ gbo: string; detractors: number; total: number }>;
}

export interface FilterOptions {
  regions: string[];
  gbos: string[];
  segments: string[];
  classifications: string[];
}

export interface DataAdapter {
  customerMetrics(): Promise<CustomerMetricRow[]>;
  customerDetail(customerId: string): Promise<CustomerDetailRaw | null>;
  insights(): Promise<InsightsRaw>;
  filterOptions(): Promise<FilterOptions>;
}
