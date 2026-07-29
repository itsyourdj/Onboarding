import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HEALTH_COLORS, NPS_COLORS, scoreColor, soft } from "../lib/health";
import type { HealthCategory, NpsClass } from "../lib/api";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("surface-card p-5", className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-fg-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-fg-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  brand: "#14b8a6",
  emerald: "#0ea88f",
  rose: "#ff5537",
  amber: "#e08704",
  sky: "#5b8cff",
  violet: "#7c6bff",
};

export function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = "brand",
  to,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: keyof typeof ACCENTS;
  to?: string;
}) {
  const color = ACCENTS[accent];
  const inner = (
    <div className="surface-card card-lift group relative overflow-hidden p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 origin-center scale-y-[0.35] opacity-0 transition-all duration-200 group-hover:scale-y-100 group-hover:opacity-100"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-secondary">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ color, backgroundColor: soft(color) }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-[1.9rem] font-semibold leading-none tabular text-fg-primary">{value}</div>
      {sub && <div className="mt-2 text-xs text-fg-secondary">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function HealthBadge({ category }: { category: HealthCategory }) {
  const c = HEALTH_COLORS[category];
  return (
    <span className="chip" style={{ color: c, backgroundColor: soft(c, 15) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {category}
    </span>
  );
}

export function NpsBadge({ npsClass }: { npsClass: NpsClass }) {
  const c = NPS_COLORS[npsClass];
  return (
    <span className="chip" style={{ color: c, backgroundColor: soft(c, 15) }}>
      {npsClass}
    </span>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const c = color ?? scoreColor(value);
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-secondary">
      <div
        className="h-full rounded-pill transition-all duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%`, backgroundColor: c }}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-fg-secondary">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-divider"
        style={{ borderTopColor: "var(--color-action-primary)" }}
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function StatLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-divider py-2.5 text-sm last:border-0">
      <span className="text-fg-secondary">{label}</span>
      <span className="font-medium text-fg-primary">{value}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-divider py-10 text-sm text-fg-secondary">
      {message}
    </div>
  );
}
