import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X, ArrowUpDown, AlertCircle } from "lucide-react";
import { fetchCustomers, fetchFilters } from "../lib/api";
import { Card, HealthBadge, NpsBadge, Spinner } from "../components/ui";
import { fmtCurrency, fmtDate, fmtNum } from "../lib/format";
import { scoreColor, soft } from "../lib/health";
import { AccessRestricted } from "../components/AccessRestricted";

const FILTER_KEYS = ["category", "nps", "region", "gbo", "segment", "classification", "search", "sort"] as const;

export default function Customers({ fullAccess }: { fullAccess: boolean }) {
  if (!fullAccess) return <AccessRestricted tabName="Customers" />;

  const [params, setParams] = useSearchParams();
  const { data: filters } = useQuery({ queryKey: ["filters"], queryFn: fetchFilters });

  const query: Record<string, string> = {};
  FILTER_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) query[k] = v;
  });

  const { data, isLoading } = useQuery({ queryKey: ["customers", query], queryFn: () => fetchCustomers(query) });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const activeChips = FILTER_KEYS.filter((k) => k !== "sort" && k !== "search" && params.get(k));

  return (
    <div className="space-y-5">
      <Card className="!p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-secondary" />
              <input
                value={params.get("search") ?? ""}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Search customer name or ID…"
                className="field-input !h-11 !pl-10"
              />
            </div>
            <div className="relative sm:w-56">
              <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-secondary" />
              <select
                value={params.get("sort") ?? "score_asc"}
                onChange={(e) => set("sort", e.target.value)}
                className="select-chevron field-input !h-11 !w-full !bg-bg-secondary !pl-10 !pr-9 font-medium"
              >
                <option value="score_asc">Sort: Lowest health</option>
                <option value="score_desc">Sort: Highest health</option>
                <option value="arr_desc">Sort: Highest ARR</option>
                <option value="nps_asc">Sort: Lowest NPS</option>
                <option value="name">Sort: Name A–Z</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select label="Health" value={params.get("category") ?? ""} onChange={(v) => set("category", v)} options={filters?.categories ?? []} />
            <Select label="NPS" value={params.get("nps") ?? ""} onChange={(v) => set("nps", v)} options={filters?.npsClasses ?? []} />
            <Select label="Region" value={params.get("region") ?? ""} onChange={(v) => set("region", v)} options={filters?.regions ?? []} />
            <Select label="GBO" value={params.get("gbo") ?? ""} onChange={(v) => set("gbo", v)} options={filters?.gbos ?? []} />
            <Select label="Segment" value={params.get("segment") ?? ""} onChange={(v) => set("segment", v)} options={filters?.segments ?? []} />
            <Select label="Class" value={params.get("classification") ?? ""} onChange={(v) => set("classification", v)} options={filters?.classifications ?? []} />
          </div>

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
              <SlidersHorizontal className="h-3.5 w-3.5 text-fg-secondary" />
              {activeChips.map((k) => (
                <button key={k} onClick={() => set(k, "")} className="chip" style={{ color: "var(--color-action-primary)", backgroundColor: soft("#009293", 12) }}>
                  {params.get(k)} <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={() => setParams(new URLSearchParams(), { replace: true })} className="ml-1 text-xs font-medium text-fg-secondary hover:text-fg-primary">
                Clear all
              </button>
            </div>
          )}
        </div>
      </Card>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="px-1 text-sm text-fg-secondary">
            <span className="font-semibold text-fg-primary">{data.count}</span> customers
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] table-fixed text-sm">
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-divider text-left text-[10px] uppercase tracking-wide text-fg-secondary">
                  <th className="px-4 py-3.5 font-semibold">Customer</th>
                  <th className="px-2 py-3.5 font-semibold">Health</th>
                  <th className="px-2 py-3.5 font-semibold">NPS</th>
                  <th className="px-2 py-3.5 font-semibold">Segment / GBO</th>
                  <th className="whitespace-nowrap px-2 py-3.5 text-right font-semibold">Missed</th>
                  <th className="whitespace-nowrap px-2 py-3.5 text-right font-semibold">Calls</th>
                  <th className="whitespace-nowrap px-2 py-3.5 text-right font-semibold">Open</th>
                  <th className="whitespace-nowrap px-2 py-3.5 text-right font-semibold">ARR</th>
                  <th className="whitespace-nowrap px-4 py-3.5 text-right font-semibold">Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.customer_id} className="group border-b border-divider transition-colors hover:bg-bg-secondary">
                    <td className="px-4 py-3">
                      <Link to={`/customers/${c.customer_id}`} className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-semibold" style={{ background: soft(scoreColor(c.healthScore)), color: scoreColor(c.healthScore) }}>
                          {c.healthScore}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium leading-snug text-fg-primary group-hover:text-action-primary">{c.customer_name}</div>
                          <div className="truncate text-xs text-fg-secondary">{c.customer_id} · {c.region}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3"><HealthBadge category={c.healthCategory} /></td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1.5">
                        <NpsBadge npsClass={c.npsClass} />
                        {c.latest_nps != null && <span className="text-xs font-medium text-fg-secondary">{c.latest_nps}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="truncate text-fg-primary" title={c.sales_segment ?? undefined}>{c.sales_segment ?? "—"}</div>
                      <div className="truncate text-xs text-fg-secondary" title={c.gbo ?? undefined}>{c.gbo ?? "—"}</div>
                    </td>
                    <td className="px-2 py-3 text-right tabular text-fg-primary">{fmtNum(c.missed_visits)}</td>
                    <td className="px-2 py-3 text-right tabular text-fg-primary">{fmtNum(c.total_callbacks)}</td>
                    <td className="px-2 py-3 text-right tabular">
                      {c.open_orders > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium" style={{ color: "#e08704" }}>
                          <AlertCircle className="h-3.5 w-3.5" />{c.open_orders}
                        </span>
                      ) : <span className="text-fg-secondary">0</span>}
                    </td>
                    <td className="px-2 py-3 text-right font-medium tabular text-fg-primary">{fmtCurrency(c.arr)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-fg-secondary">{fmtDate(c.last_visit_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {data.customers.length === 0 && (
              <div className="py-12 text-center text-sm text-fg-secondary">No customers match these filters.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select-chevron field-input !h-10 !w-full !bg-bg-secondary !pr-8 font-medium"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
