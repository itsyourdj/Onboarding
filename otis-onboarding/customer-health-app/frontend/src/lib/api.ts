import axios from "axios";

// Resolve the API base against the document's <base href> so it works no matter
// what path the app is mounted under (root, /metadata_sync/, /obs_app/, …).
// document.baseURI reflects the injected <base href>, e.g. https://host/metadata_sync/
// -> https://host/metadata_sync/api . At root it resolves to https://host/api .
export const API_BASE = new URL("api", document.baseURI).toString();

export const api = axios.create({ baseURL: API_BASE });

export type HealthCategory = "Healthy" | "Watch" | "At Risk";
export type NpsClass = "Promoter" | "Passive" | "Detractor" | "No Survey";

export interface HealthDriver {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface Overview {
  total: number;
  healthy: number;
  watch: number;
  atRisk: number;
  overallScore: number;
  npsNet: number;
  npsResponses: number;
  promoters: number;
  detractors: number;
  passives: number;
  totalArr: number;
  atRiskArr: number;
  scoreDistribution: { label: string; count: number }[];
  bySegment: GroupStat[];
  byRegion: GroupStat[];
  byGbo: GroupStat[];
  topAtRisk: {
    customer_id: string;
    customer_name: string;
    healthScore: number;
    healthCategory: HealthCategory;
    region: string;
    gbo: string;
    arr: number | null;
    npsClass: NpsClass;
  }[];
}
export interface GroupStat {
  name: string;
  count: number;
  avgScore: number;
  atRisk: number;
}

export interface CustomerListItem {
  customer_id: string;
  customer_name: string | null;
  region: string | null;
  subregion: string | null;
  gbo: string | null;
  sales_segment: string | null;
  classification: string | null;
  nsa_name: string | null;
  healthScore: number;
  healthCategory: HealthCategory;
  npsClass: NpsClass;
  latest_nps: number | null;
  avg_nps: number | null;
  missed_visits: number;
  total_callbacks: number;
  total_units: number;
  open_orders: number;
  arr: number | null;
  clv: number | null;
  delinquent: boolean;
  last_visit_date: string | null;
}

export interface CustomerDetail {
  customer: CustomerListItem & {
    subregion: string | null;
    country: string | null;
    tenureYears: number | null;
    oldestUnitAgeYears: number | null;
    avg_sentiment: number | null;
    negative_feedback: number;
    promoters: number;
    passives: number;
    detractors: number;
    nps_responses: number;
    scheduled_visits: number;
    completed_visits: number;
    avg_compliance: number | null;
    downtime_hours: number | null;
    avg_lead_time_hours: number | null;
    oos_callbacks: number;
    connected_units: number;
    avg_unit_health: number | null;
    predicted_failures: number;
    active_contracts: number;
    cancelled_contracts: number;
    next_renewal_date: string | null;
    open_ar: number | null;
    ar_over_90: number | null;
    disputed: number | null;
    gross_monthly_billing: number | null;
    contract_value: number | null;
    drivers: HealthDriver[];
  };
  npsTrend: { month: string; avg_nps: number | null; net_nps: number | null; responses: number }[];
  npsHistory: {
    response_date: string | null;
    nps_score: number | null;
    nps_category: string | null;
    nps_sentiment: string | null;
    nps_verbatim: string | null;
    nps_driver_topics: string | null;
    risk_color: string | null;
    satisfaction_rating: number | null;
  }[];
  contracts: any[];
  units: any[];
  openIssues: any[];
  missedVisitTrend: { month: string; missed: number; scheduled: number; completed: number }[];
  negativeFeedback: any[];
  arTrend: { month: string; open_ar: number | null; over_90: number | null }[];
  recentNotes: { work_date: string | null; notes: string | null }[];
}

export interface Insights {
  sentimentBreakdown: { sentiment: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
  satisfiedTopics: { topic: string; count: number }[];
  dissatisfiedTopics: { topic: string; count: number }[];
  allTopics: { topic: string; count: number }[];
  detractorsByRegion: { region: string; detractors: number; total: number }[];
  detractorsByGbo: { gbo: string; detractors: number; total: number }[];
}

export interface FilterOptions {
  regions: string[];
  gbos: string[];
  segments: string[];
  classifications: string[];
  categories: HealthCategory[];
  npsClasses: NpsClass[];
}

export const fetchOverview = () => api.get<Overview>("/overview").then((r) => r.data);
export const fetchInsights = () => api.get<Insights>("/insights").then((r) => r.data);
export const fetchFilters = () => api.get<FilterOptions>("/filters").then((r) => r.data);
export const fetchCustomers = (params: Record<string, string>) =>
  api.get<{ count: number; customers: CustomerListItem[] }>("/customers", { params }).then((r) => r.data);
export const fetchCustomer = (id: string) =>
  api.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data);
