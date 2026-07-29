import type { CustomerMetricRow } from "../adapters/types.js";

export type HealthCategory = "Healthy" | "Watch" | "At Risk";
export type NpsClass = "Promoter" | "Passive" | "Detractor" | "No Survey";

export interface HealthDriver {
  key: string;
  label: string;
  score: number; // 0-100 (higher = healthier)
  weight: number; // 0-1
  detail: string;
}

export interface ScoredCustomer extends CustomerMetricRow {
  healthScore: number;
  healthCategory: HealthCategory;
  npsClass: NpsClass;
  arr: number | null;
  clv: number | null;
  tenureYears: number | null;
  oldestUnitAgeYears: number | null;
  drivers: HealthDriver[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const yearsSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return +(((Date.now() - d) / (365.25 * 24 * 3600 * 1000))).toFixed(1);
};

function computeDrivers(m: CustomerMetricRow): HealthDriver[] {
  // --- NPS / satisfaction ---
  const npsVal = m.latest_nps ?? m.avg_nps;
  const npsScore = npsVal == null ? 60 : clamp((npsVal / 10) * 100);

  // --- PM compliance / missed visits ---
  const totalPlanned = m.scheduled_visits || 0;
  const missedRatio = totalPlanned > 0 ? m.missed_visits / totalPlanned : 0;
  const complianceScore =
    m.avg_compliance != null ? clamp(m.avg_compliance) : clamp(100 - missedRatio * 100);

  // --- Service reliability (callbacks + downtime) ---
  const cbPerUnit = m.total_units > 0 ? m.total_callbacks / m.total_units : m.total_callbacks;
  const downtimePenalty = m.downtime_hours ? clamp(m.downtime_hours / 5) : 0;
  const reliabilityScore = clamp(100 - cbPerUnit * 6 - downtimePenalty * 0.3);

  // --- Negative feedback ---
  const detractorRatio = m.nps_responses > 0 ? m.detractors / m.nps_responses : 0;
  const feedbackScore = clamp(100 - detractorRatio * 100);

  // --- Equipment health (avg_unit_health is 0..1) ---
  const baseEquip = m.avg_unit_health != null ? m.avg_unit_health * 100 : 65;
  const failurePenalty = m.total_units > 0 ? (m.predicted_failures / m.total_units) * 40 : 0;
  const equipmentScore = clamp(baseEquip - failurePenalty);

  // --- Financial / AR health ---
  let financialScore = 100;
  if (m.delinquent) financialScore -= 45;
  if ((m.ar_over_90 ?? 0) > 0) financialScore -= 25;
  if ((m.disputed ?? 0) > 0) financialScore -= 10;
  const monthly = m.gross_monthly_billing ?? 0;
  if (monthly > 0 && (m.open_ar ?? 0) > monthly * 3) financialScore -= 15;
  financialScore = clamp(financialScore);

  // --- Contract / renewal risk ---
  let contractScore = 100;
  if (m.cancelled_contracts > 0) contractScore -= m.cancelled_contracts * 25;
  if (m.total_contracts > 0 && m.active_contracts === 0) contractScore -= 30;
  if (m.next_renewal_date) {
    const days = (new Date(m.next_renewal_date).getTime() - Date.now()) / 86400000;
    if (days >= 0 && days < 90) contractScore -= 10; // renewal imminent = attention needed
  }
  contractScore = clamp(contractScore);

  return [
    { key: "nps", label: "NPS Score", score: Math.round(npsScore), weight: 0.24, detail: npsVal == null ? "No survey data" : `NPS ${npsVal}` },
    { key: "compliance", label: "Missed Visits / PM Compliance", score: Math.round(complianceScore), weight: 0.15, detail: `${m.missed_visits} missed of ${totalPlanned} scheduled` },
    { key: "reliability", label: "Service Response & Downtime", score: Math.round(reliabilityScore), weight: 0.15, detail: `${m.total_callbacks} callbacks${m.downtime_hours ? `, ${m.downtime_hours}h downtime` : ""}` },
    { key: "feedback", label: "Negative Feedback", score: Math.round(feedbackScore), weight: 0.1, detail: `${m.detractors} detractors / ${m.nps_responses} responses` },
    { key: "equipment", label: "Equipment Health / Age", score: Math.round(equipmentScore), weight: 0.14, detail: `${m.predicted_failures} predicted failures of ${m.total_units} units` },
    { key: "financial", label: "AR / Financial Health", score: Math.round(financialScore), weight: 0.12, detail: m.delinquent ? "Delinquent account" : `Open AR ${Math.round(m.open_ar ?? 0).toLocaleString()}` },
    { key: "contract", label: "Contract Renewal Status", score: Math.round(contractScore), weight: 0.1, detail: `${m.active_contracts} active, ${m.cancelled_contracts} cancelled` },
  ];
}

export function scoreCustomer(m: CustomerMetricRow): ScoredCustomer {
  const drivers = computeDrivers(m);
  const weightSum = drivers.reduce((s, d) => s + d.weight, 0);
  const healthScore = Math.round(
    drivers.reduce((s, d) => s + d.score * d.weight, 0) / weightSum
  );

  const healthCategory: HealthCategory =
    healthScore >= 70 ? "Healthy" : healthScore >= 55 ? "Watch" : "At Risk";

  // Customer-level NPS classification for the promoter/passive/detractor filters.
  let npsClass: NpsClass = "No Survey";
  const npsVal = m.latest_nps ?? m.avg_nps;
  if (m.latest_nps_category) {
    npsClass = m.latest_nps_category as NpsClass;
  } else if (npsVal != null) {
    npsClass = npsVal >= 9 ? "Promoter" : npsVal >= 7 ? "Passive" : "Detractor";
  }

  const arr =
    m.gross_monthly_billing != null ? Math.round(m.gross_monthly_billing * 12) : null;
  const tenureYears = yearsSince(m.first_contract_date);

  // CLV estimate: annualised recurring revenue projected over an expected remaining
  // lifetime that scales with the customer's current health (healthier => stickier).
  let clv: number | null = null;
  if (arr != null) {
    const expectedRemaining = 3 + (healthScore / 100) * 9; // ~3 to ~12 years
    const past = tenureYears ?? 0;
    clv = Math.round(arr * (past + expectedRemaining));
  }

  return {
    ...m,
    healthScore,
    healthCategory,
    npsClass,
    arr,
    clv,
    tenureYears,
    oldestUnitAgeYears: yearsSince(m.oldest_install),
    drivers,
  };
}

export function scoreAll(rows: CustomerMetricRow[]): ScoredCustomer[] {
  return rows.map(scoreCustomer);
}
