import type { CheckResult, CheckItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  result: CheckResult;
  title: string;
}

const gradeColors: Record<string, string> = {
  A: "bg-[hsl(var(--grade-a))] text-white",
  B: "bg-[hsl(var(--grade-b))] text-white",
  C: "bg-[hsl(var(--grade-c))] text-white",
  D: "bg-[hsl(var(--grade-d))] text-white",
};

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export default function CheckResultView({ result, title }: Props) {
  const sortedItems = [...result.check_items].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h3 className="text-lg font-bold">{title}</h3>
        {result.detected_case && (
          <p className="text-sm text-muted-foreground">検出: <span className="text-primary font-medium">{result.detected_case}</span></p>
        )}
      </div>

      <div className={`grid grid-cols-2 ${result.manual_count ? "md:grid-cols-5" : "md:grid-cols-4"} gap-3`}>
        <SummaryCard label="Grade" value={result.overall_status} className={gradeColors[result.overall_status] || ""} />
        <SummaryCard label="NG" value={result.ng_count} className="bg-status-ng/10 text-status-ng" />
        <SummaryCard label="WARNING" value={result.warning_count} className="bg-status-warning/10 text-status-warning" />
        <SummaryCard label="OK" value={result.ok_count} className="bg-status-ok/10 text-status-ok" />
        {(result.manual_count ?? 0) > 0 && (
          <SummaryCard label="MANUAL" value={result.manual_count!} className="bg-muted text-muted-foreground" />
        )}
      </div>

      <div className="space-y-3">
        {sortedItems.map((item, i) => (
          <CheckItemCard key={i} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: string | number; className: string }) {
  return (
    <div className={`rounded-xl p-4 text-center ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

const borderColors: Record<string, string> = {
  NG: "border-l-[hsl(var(--status-ng))]",
  WARNING: "border-l-[hsl(var(--status-warning))]",
  OK: "border-l-[hsl(var(--status-ok))]",
};

const statusBadge: Record<string, string> = {
  NG: "status-ng",
  WARNING: "status-warning",
  OK: "status-ok",
};

const severityBadge: Record<string, string> = {
  high: "bg-status-ng/10 text-status-ng",
  medium: "bg-status-warning/10 text-status-warning",
  low: "bg-muted text-muted-foreground",
};

function CheckItemCard({ item, index }: { item: CheckItem; index: number }) {
  return (
    <div
      className={`glass-card border-l-4 ${borderColors[item.status] || ""} p-4 space-y-2 animate-slide-up`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground">{item.pattern_id}</span>
        <Badge variant="outline" className={severityBadge[item.severity] || ""}>
          {item.severity}
        </Badge>
        <Badge className={`${statusBadge[item.status]} text-xs font-bold`}>
          {item.status}
        </Badge>
      </div>
      <div className="font-semibold">{item.item}</div>
      {item.location && (
        <div className="text-sm text-muted-foreground">📍 {item.location}</div>
      )}
      <div className="text-sm text-foreground/80">{item.detail}</div>
      {item.suggestion && item.status !== "OK" && (
        <div className="text-sm text-primary bg-primary/5 rounded-md p-2">
          💡 修正案: {item.suggestion}
        </div>
      )}
    </div>
  );
}
