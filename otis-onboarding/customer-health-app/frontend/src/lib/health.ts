import type { HealthCategory, NpsClass } from "./api";

// Concrete hex values chosen to read well on both light and dark surfaces
// (charts/badges use these directly since SVG fill can't resolve CSS vars).
export const HEALTH_COLORS: Record<HealthCategory, string> = {
  Healthy: "#0ea88f",
  Watch: "#e08704",
  "At Risk": "#ff5537",
};

export const NPS_COLORS: Record<NpsClass, string> = {
  Promoter: "#0ea88f",
  Passive: "#5b8cff",
  Detractor: "#ff5537",
  "No Survey": "#94a3b8",
};

export const CHART = {
  teal: "#14b8a6",
  blue: "#5b8cff",
  violet: "#7c6bff",
  amber: "#e08704",
  ember: "#ff5537",
  good: "#0ea88f",
  slate: "#94a3b8",
};

export const scoreColor = (score: number): string =>
  score >= 70 ? HEALTH_COLORS.Healthy : score >= 55 ? HEALTH_COLORS.Watch : HEALTH_COLORS["At Risk"];

export const soft = (hex: string, pct = 14): string =>
  `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
