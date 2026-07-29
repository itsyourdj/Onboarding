import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, ShieldCheck, AlertTriangle, TrendingUp, DollarSign, ArrowRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { fetchOverview } from "../lib/api";
import { Card, KpiCard, SectionTitle, HealthBadge, Spinner, ProgressBar } from "../components/ui";
import { fmtCurrency, fmtNum } from "../lib/format";
import { scoreColor, soft } from "../lib/health";
import { ChartTooltip } from "../components/charts";

const GRID = "rgba(148,163,184,0.18)";
const AXIS = "#94a3b8";

export default function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  if (isLoading || !data) return <Spinner label="Crunching customer health…" />;

  const healthyPct = Math.round((data.healthy / data.total) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Total Customers" value={fmtNum(data.total)} icon={<Users size={17} />} accent="brand" to="/customers" sub={`${data.npsResponses.toLocaleString()} survey responses`} />
        <KpiCard label="Healthy" value={fmtNum(data.healthy)} icon={<ShieldCheck size={17} />} accent="emerald" to="/customers?category=Healthy" sub={`${healthyPct}% of portfolio`} />
        <KpiCard label="At Risk" value={fmtNum(data.atRisk)} icon={<AlertTriangle size={17} />} accent="rose" to="/customers?category=At Risk" sub={`${fmtCurrency(data.atRiskArr)} ARR exposed`} />
        <KpiCard label="Total ARR" value={fmtCurrency(data.totalArr)} icon={<DollarSign size={17} />} accent="violet" sub="Annual recurring revenue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center text-center">
          <SectionTitle title="Overall Health Score" />
          <RadialGauge score={data.overallScore} />
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            <MiniStat label="Healthy" value={data.healthy} color="#0ea88f" />
            <MiniStat label="Watch" value={data.watch} color="#e08704" />
            <MiniStat label="At Risk" value={data.atRisk} color="#ff5537" />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Net Promoter" subtitle="Portfolio-wide voice of customer" />
          <div className="flex items-end gap-3">
            <span className="text-5xl font-semibold text-fg-primary">{data.npsNet}</span>
            <span className="mb-1.5 flex items-center gap-1 text-sm font-medium" style={{ color: "#0ea88f" }}>
              <TrendingUp size={16} /> Net NPS
            </span>
          </div>
          <div className="mt-5 space-y-3">
            <NpsRow label="Promoters" value={data.promoters} total={data.npsResponses} color="#0ea88f" />
            <NpsRow label="Passives" value={data.passives} total={data.npsResponses} color="#5b8cff" />
            <NpsRow label="Detractors" value={data.detractors} total={data.npsResponses} color="#ff5537" />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Health Distribution" subtitle="Customers by score band" />
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data.scoreDistribution} margin={{ left: -18, right: 8, top: 8 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.scoreDistribution.map((_, i) => (
                  <Cell key={i} fill={scoreColor([20, 47, 62, 77, 92][i])} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Customers Needing Attention"
            subtitle="Lowest health scores — act now"
            action={
              <Link to="/customers?category=At Risk" className="inline-flex items-center gap-1 text-sm font-medium text-action-primary hover:opacity-80">
                View all <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="space-y-1">
            {data.topAtRisk.map((c) => (
              <Link key={c.customer_id} to={`/customers/${c.customer_id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-secondary">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-semibold" style={{ background: soft(scoreColor(c.healthScore)), color: scoreColor(c.healthScore) }}>
                  {c.healthScore}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg-primary">{c.customer_name}</div>
                  <div className="truncate text-xs text-fg-secondary">{c.gbo}</div>
                </div>
                <HealthBadge category={c.healthCategory} />
                <span className="w-16 text-right text-xs font-medium text-fg-secondary">{fmtCurrency(c.arr)}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Health by Segment" subtitle="Average score & at-risk concentration" />
          <div className="space-y-3">
            {data.bySegment.map((s) => (
              <div key={s.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-fg-primary">{s.name}</span>
                  <span className="text-xs text-fg-secondary">
                    {s.count} cust · avg <span className="font-semibold" style={{ color: scoreColor(s.avgScore) }}>{s.avgScore}</span>
                    {s.atRisk > 0 && <span className="ml-2" style={{ color: "#ff5537" }}>{s.atRisk} at risk</span>}
                  </span>
                </div>
                <ProgressBar value={s.avgScore} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RadialGauge({ score }: { score: number }) {
  const data = [{ name: "score", value: score, fill: scoreColor(score) }];
  return (
    <div className="relative h-[190px] w-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={20} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold text-fg-primary">{score}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">out of 100</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-bg-secondary py-2">
      <div className="text-xl font-semibold" style={{ color }}>{value}</div>
      <div className="text-[11px] font-medium text-fg-secondary">{label}</div>
    </div>
  );
}

function NpsRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{label}</span>
        <span className="text-xs font-medium text-fg-secondary">{value.toLocaleString()} · {pct}%</span>
      </div>
      <ProgressBar value={pct} color={color} />
    </div>
  );
}
