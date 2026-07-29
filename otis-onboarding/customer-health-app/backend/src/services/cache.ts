import { getAdapter } from "../adapters/index.js";
import { config } from "../config.js";
import { scoreAll, type ScoredCustomer } from "./health.js";

let cache: { at: number; data: ScoredCustomer[] } | null = null;

export async function getScoredCustomers(force = false): Promise<ScoredCustomer[]> {
  if (!force && cache && Date.now() - cache.at < config.cacheTtlMs) return cache.data;
  const rows = await getAdapter().customerMetrics();
  const data = scoreAll(rows);
  cache = { at: Date.now(), data };
  return data;
}

export function invalidate() {
  cache = null;
}
