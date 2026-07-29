import type { TooltipProps } from "recharts";

export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-divider bg-bg-elevated px-3 py-2 text-xs shadow-pop">
      {label !== undefined && label !== "" && (
        <div className="mb-1 font-semibold text-fg-primary">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-fg-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: (p.color as string) ?? "#14b8a6" }} />
          <span className="capitalize">{p.name}:</span>
          <span className="font-medium text-fg-primary">
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
