import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Gauge,
  DollarSign,
  TrendingUp,
  CalendarClock,
  Wrench,
  AlertTriangle,
  FileText,
  MessageSquareWarning,
  Building2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchCustomer } from "../lib/api";
import { Card, HealthBadge, NpsBadge, SectionTitle, Spinner, StatLine, ProgressBar, EmptyState } from "../components/ui";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "../lib/format";
import { scoreColor, soft, CHART } from "../lib/health";
import { ChartTooltip } from "../components/charts";

const GRID = "rgba(148,163,184,0.18)";
const AXIS = "#94a3b8";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: ["customer", id], queryFn: () => fetchCustomer(id!), enabled: !!id });
  if (isLoading || !data) return <Spinner label="Loading customer profile…" />;

  const c = data.customer;

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex w-fit items-center gap-2 text-sm text-fg-secondary hover:text-fg-primary">
        <ArrowLeft size={16} /> Back to customers
      </Link>

      <Card className="!p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <ScoreDisc score={c.healthScore} />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-fg-primary">{c.customer_name}</h1>
                <HealthBadge category={c.healthCategory} />
                <NpsBadge npsClass={c.npsClass} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-secondary">
                <span>{c.customer_id}</span>
                <span>· {c.sales_segment ?? "—"}</span>
                <span>· Class {c.classification ?? "—"}</span>
                <span>· {c.gbo ?? c.region}</span>
                {c.nsa_name && <span>· {c.nsa_name}</span>}
              </div>
            </div>
          </div>
          {c.delinquent && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium" style={{ color: "#ff5537", backgroundColor: soft("#ff5537", 12) }}>
              <AlertTriangle size={16} /> Account is delinquent
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric icon={<TrendingUp size={18} />} label="Latest NPS" value={c.latest_nps ?? "—"} sub={`avg ${c.avg_nps ?? "—"}`} color={CHART.teal} />
        <Metric icon={<DollarSign size={18} />} label="ARR" value={fmtCurrency(c.arr)} sub="annualised" color={CHART.violet} />
        <Metric icon={<Gauge size={18} />} label="CLV (est.)" value={fmtCurrency(c.clv)} sub={`${c.tenureYears ?? "—"} yr tenure`} color={CHART.good} />
        <Metric icon={<CalendarClock size={18} />} label="Missed Visits" value={fmtNum(c.missed_visits)} sub={`of ${fmtNum(c.scheduled_visits)} scheduled`} color={CHART.amber} />
        <Metric icon={<Wrench size={18} />} label="Callbacks" value={fmtNum(c.total_callbacks)} sub={`${fmtNum(c.oos_callbacks)} out-of-service`} color={CHART.ember} />
        <Metric icon={<AlertTriangle size={18} />} label="Open Issues" value={fmtNum(c.open_orders)} sub={`${fmtNum(c.total_units)} units`} color={CHART.blue} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionTitle title="Health Drivers" subtitle="What's shaping this score" />
          <div className="space-y-3.5">
            {c.drivers.map((d) => (
              <div key={d.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-fg-primary">{d.label}</span>
                  <span className="text-xs font-semibold" style={{ color: scoreColor(d.score) }}>{d.score}</span>
                </div>
                <ProgressBar value={d.score} />
                <div className="mt-1 text-[11px] text-fg-secondary">{d.detail} · weight {Math.round(d.weight * 100)}%</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="NPS & Satisfaction Trend" subtitle="Score and net NPS over time" />
          {data.npsTrend.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.npsTrend} margin={{ left: -20, right: 10, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} minTickGap={24} />
                <YAxis yAxisId="l" domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} />
                <YAxis yAxisId="r" orientation="right" domain={[-100, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} />
                <Tooltip content={<ChartTooltip />} />
                <Line yAxisId="l" type="monotone" dataKey="avg_nps" name="Avg NPS" stroke={CHART.teal} strokeWidth={2.5} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="net_nps" name="Net NPS" stroke={CHART.good} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No survey history for this customer." />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Service Visits" subtitle="Completed vs missed" />
          {data.missedVisitTrend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.missedVisitTrend} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: AXIS }} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill={CHART.good} />
                <Bar dataKey="missed" name="Missed" stackId="a" fill={CHART.ember} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No PM compliance data." />}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <StatMini label="Compliance" value={fmtPct(c.avg_compliance)} />
            <StatMini label="Avg response" value={c.avg_lead_time_hours != null ? `${c.avg_lead_time_hours}h` : "—"} />
            <StatMini label="Downtime" value={c.downtime_hours != null ? `${fmtNum(c.downtime_hours)}h` : "—"} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Accounts Receivable" subtitle="Open AR & 90+ day aging" />
          {data.arTrend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.arTrend} margin={{ left: -8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.violet} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: AXIS }} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} width={54} tickFormatter={(v) => fmtCurrency(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="open_ar" name="Open AR" stroke={CHART.violet} strokeWidth={2} fill="url(#ar)" />
                <Area type="monotone" dataKey="over_90" name="90+ days" stroke={CHART.ember} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No AR data." />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Contract Details" />
          <StatLine label="Active contracts" value={c.active_contracts} />
          <StatLine label="Cancelled" value={c.cancelled_contracts} />
          <StatLine label="Gross monthly billing" value={fmtCurrency(c.gross_monthly_billing)} />
          <StatLine label="Contract value" value={fmtCurrency(c.contract_value)} />
          <StatLine label="Next renewal" value={fmtDate(c.next_renewal_date)} />
          <StatLine label="Open AR" value={fmtCurrency(c.open_ar)} />
          <StatLine label="90+ days AR" value={fmtCurrency(c.ar_over_90)} />
          <div className="mt-3 space-y-2">
            {data.contracts.slice(0, 4).map((ct: any) => (
              <div key={ct.contract_id} className="rounded-xl border border-divider p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-fg-primary">{ct.contract_type_desc ?? ct.service_package ?? ct.contract_id}</span>
                  <span style={{ color: ct.status === "Active" ? "#0ea88f" : "#ff5537" }}>{ct.status}</span>
                </div>
                <div className="mt-1 text-fg-secondary">{fmtCurrency(ct.gross_monthly_billing)}/mo · exp {fmtDate(ct.exp_date)}</div>
                {ct.cancel_reason && <div className="mt-1" style={{ color: "#ff5537" }}>Cancel: {ct.cancel_reason}</div>}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Equipment" subtitle="Units & modernization status" action={<Building2 size={16} className="text-fg-secondary" />} />
          <StatLine label="Total units" value={c.total_units} />
          <StatLine label="Connected (Otis ONE)" value={c.connected_units} />
          <StatLine label="Avg unit health" value={c.avg_unit_health != null ? fmtPct(c.avg_unit_health * 100) : "—"} />
          <StatLine label="Predicted failures" value={c.predicted_failures} />
          <StatLine label="Oldest unit age" value={c.oldestUnitAgeYears != null ? `${c.oldestUnitAgeYears} yrs` : "—"} />
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {data.units.slice(0, 12).map((u: any) => {
              const m = modernization(u.age_years);
              return (
                <div key={u.unit_id} className="flex items-center justify-between rounded-lg border border-divider px-3 py-2 text-xs">
                  <div>
                    <div className="font-medium text-fg-primary">{u.product_name ?? u.product_class}</div>
                    <div className="text-fg-secondary">{u.age_years != null ? `${u.age_years} yrs old` : "age n/a"} · {u.unit_status}</div>
                  </div>
                  <span className="chip" style={{ color: m.color, backgroundColor: soft(m.color, 15) }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Negative Feedback" subtitle="Recent detractor verbatims" action={<MessageSquareWarning size={16} style={{ color: "#ff5537" }} />} />
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {data.negativeFeedback.length ? data.negativeFeedback.map((f: any, i: number) => (
              <div key={i} className="rounded-xl border p-3" style={{ borderColor: soft("#ff5537", 25), backgroundColor: soft("#ff5537", 6) }}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium" style={{ color: "#ff5537" }}>NPS {f.nps_score}</span>
                  <span className="text-fg-secondary">{fmtDate(f.response_date)}</span>
                </div>
                <p className="text-sm text-fg-primary">“{f.nps_verbatim}”</p>
                {f.nps_driver_topics && <div className="mt-1.5 text-[11px] text-fg-secondary">{f.nps_driver_topics}</div>}
              </div>
            )) : <EmptyState message="No negative feedback recorded." />}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Open Service Issues" subtitle="Orders not yet closed" action={<FileText size={16} className="text-fg-secondary" />} />
          {data.openIssues.length ? (
            <div className="space-y-2">
              {data.openIssues.map((o: any) => (
                <div key={o.order_key} className="flex items-center justify-between rounded-xl border border-divider px-3 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-fg-primary">{o.order_type}</span>
                    <span className="ml-2 text-xs text-fg-secondary">{o.order_key} · {fmtDate(o.order_date)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="chip" style={{ color: "#e08704", backgroundColor: soft("#e08704", 14) }}>{o.order_status}</span>
                    <span className="text-xs font-medium text-fg-secondary">{fmtCurrency(o.job_revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No open service issues." />}
        </Card>

        <Card>
          <SectionTitle title="Recent Field Notes" subtitle="Mechanic observations" />
          {data.recentNotes.length ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.recentNotes.map((n, i) => (
                <div key={i} className="rounded-xl border border-divider p-3 text-sm">
                  <div className="text-xs text-fg-secondary">{fmtDate(n.work_date)}</div>
                  <p className="mt-0.5 text-fg-primary">{n.notes}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No field notes." />}
        </Card>
      </div>
    </div>
  );
}

function modernization(age: number | null): { label: string; color: string } {
  if (age == null) return { label: "Unknown", color: "#94a3b8" };
  if (age >= 25) return { label: "Modernize", color: "#ff5537" };
  if (age >= 15) return { label: "Aging", color: "#e08704" };
  return { label: "Current", color: "#0ea88f" };
}

function ScoreDisc({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl" style={{ background: soft(color, 12) }}>
      <div className="text-center">
        <div className="text-3xl font-semibold" style={{ color }}>{score}</div>
        <div className="text-[10px] font-medium uppercase text-fg-secondary">health</div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color: string }) {
  return (
    <div className="surface-tile p-4">
      <div className="mb-2" style={{ color }}>{icon}</div>
      <div className="text-xl font-semibold text-fg-primary">{value}</div>
      <div className="text-xs font-medium text-fg-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-fg-secondary">{sub}</div>}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-bg-secondary py-2">
      <div className="text-sm font-semibold text-fg-primary">{value}</div>
      <div className="text-[10px] font-medium text-fg-secondary">{label}</div>
    </div>
  );
}
