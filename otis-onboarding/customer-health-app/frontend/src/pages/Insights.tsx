import { useQuery } from "@tanstack/react-query";
import { ThumbsUp, ThumbsDown, Sparkles, MapPin } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { fetchInsights } from "../lib/api";
import { Card, SectionTitle, Spinner, EmptyState } from "../components/ui";
import { ChartTooltip } from "../components/charts";
import { soft } from "../lib/health";
import { AccessRestricted } from "../components/AccessRestricted";

const GRID = "rgba(148,163,184,0.18)";
const AXIS = "#94a3b8";

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#0ea88f",
  Neutral: "#5b8cff",
  Negative: "#ff5537",
  Unknown: "#94a3b8",
};
const CATEGORY_COLORS: Record<string, string> = {
  Promoter: "#0ea88f",
  Passive: "#5b8cff",
  Detractor: "#ff5537",
  Unknown: "#94a3b8",
};

export default function Insights({ fullAccess }: { fullAccess: boolean }) {
  if (!fullAccess) return <AccessRestricted tabName="Satisfaction Insights" />;

  const { data, isLoading } = useQuery({ queryKey: ["insights"], queryFn: fetchInsights });
  if (isLoading || !data) return <Spinner label="Analysing voice of customer…" />;

  const maxDissat = Math.max(...data.dissatisfiedTopics.map((t) => t.count), 1);
  const maxSat = Math.max(...data.satisfiedTopics.map((t) => t.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Sentiment Breakdown" subtitle="Across all survey responses" />
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={data.sentimentBreakdown} dataKey="count" nameKey="sentiment" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {data.sentimentBreakdown.map((d) => (
                    <Cell key={d.sentiment} fill={SENTIMENT_COLORS[d.sentiment] ?? "#94a3b8"} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.sentimentBreakdown.map((d) => (
                <Legend key={d.sentiment} color={SENTIMENT_COLORS[d.sentiment] ?? "#94a3b8"} label={d.sentiment} value={d.count} />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle title="NPS Category Mix" subtitle="Promoters, passives & detractors" />
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={data.categoryBreakdown} dataKey="count" nameKey="category" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {data.categoryBreakdown.map((d) => (
                    <Cell key={d.category} fill={CATEGORY_COLORS[d.category] ?? "#94a3b8"} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.categoryBreakdown.map((d) => (
                <Legend key={d.category} color={CATEGORY_COLORS[d.category] ?? "#94a3b8"} label={d.category} value={d.count} />
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Why Customers Are Satisfied" subtitle="Top themes among promoters" action={<ThumbsUp size={16} style={{ color: "#0ea88f" }} />} />
          <TopicBars topics={data.satisfiedTopics} max={maxSat} color="#0ea88f" />
        </Card>
        <Card>
          <SectionTitle title="Why Customers Are Dissatisfied" subtitle="Top themes among detractors" action={<ThumbsDown size={16} style={{ color: "#ff5537" }} />} />
          <TopicBars topics={data.dissatisfiedTopics} max={maxDissat} color="#ff5537" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <SectionTitle title="Common Feedback Themes" subtitle="Most-mentioned overall" action={<Sparkles size={16} className="text-action-primary" />} />
          <div className="flex flex-wrap gap-2">
            {data.allTopics.map((t) => {
              const scale = 0.8 + (t.count / (data.allTopics[0]?.count ?? 1)) * 0.9;
              return (
                <span key={t.topic} className="chip" style={{ fontSize: `${scale * 0.75}rem`, color: "var(--color-action-primary)", backgroundColor: soft("#009293", 12) }}>
                  {t.topic}
                  <span className="opacity-60">{t.count}</span>
                </span>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <SectionTitle title="Detractor Concentration by Branch / GBO" subtitle="Where dissatisfaction is highest" action={<MapPin size={16} style={{ color: "#ff5537" }} />} />
          {data.detractorsByGbo.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.detractorsByGbo} layout="vertical" margin={{ left: 40, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
                <YAxis type="category" dataKey="gbo" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: AXIS }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
                <Bar dataKey="detractors" name="Detractors" fill="#ff5537" radius={[0, 5, 5, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No detractor data." />}
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-fg-secondary">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium text-fg-primary">{value.toLocaleString()}</span>
    </div>
  );
}

function TopicBars({ topics, max, color }: { topics: { topic: string; count: number }[]; max: number; color: string }) {
  if (!topics.length) return <EmptyState message="No themes found." />;
  return (
    <div className="space-y-2.5">
      {topics.map((t) => (
        <div key={t.topic}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-fg-primary">{t.topic}</span>
            <span className="text-xs font-medium text-fg-secondary">{t.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-secondary">
            <div className="h-full rounded-pill" style={{ width: `${(t.count / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
