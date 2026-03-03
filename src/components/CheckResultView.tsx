import { format } from "date-fns";
import type { CheckResult, CheckItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { getSubmitLabelFromCounts, getSubmitBadgeClassFromCounts, STATUS_LABEL } from "@/lib/check-display";
import { CalendarDays } from "lucide-react";

interface Props {
  result: CheckResult;
  title: string;
  checkedAt?: string | null;
}

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export default function CheckResultView({ result, title, checkedAt }: Props) {
  const sortedItems = [...result.check_items].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );

  const submit = getSubmitLabelFromCounts(result.ng_count);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h3 className="text-lg font-bold">{title}</h3>
        {checkedAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>チェック実行日時: {format(new Date(checkedAt), "yyyy/MM/dd HH:mm")}</span>
          </div>
        )}
        {result.detected_case && (
          <p className="text-sm text-muted-foreground">検出: <span className="text-primary font-medium">{result.detected_case}</span></p>
        )}
      </div>

      <div className={`grid grid-cols-2 ${result.manual_count ? "md:grid-cols-5" : "md:grid-cols-4"} gap-3`}>
        <SummaryCard label="判定" value={submit.label} className={getSubmitBadgeClassFromCounts(result.ng_count)} />
        <SummaryCard label="修正必須" value={result.ng_count} className="bg-status-ng/10 text-status-ng" />
        <SummaryCard label="要確認" value={result.warning_count} className="bg-status-warning/10 text-status-warning" />
        <SummaryCard label="問題なし" value={result.ok_count} className="bg-status-ok/10 text-status-ok" />
        {(result.manual_count ?? 0) > 0 && (
          <SummaryCard label="手動確認" value={result.manual_count!} className="bg-status-manual/10 text-status-manual" />
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
      <div className="text-xs font-bold tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

const borderColors: Record<string, string> = {
  NG: "border-l-status-ng",
  WARNING: "border-l-status-warning",
  OK: "border-l-status-ok",
  MANUAL: "border-l-status-manual",
};

const statusBadgeColors: Record<string, string> = {
  NG: "bg-status-ng text-white",
  WARNING: "bg-status-warning text-white",
  OK: "bg-status-ok text-white",
  MANUAL: "bg-status-manual text-white",
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
        <Badge className={`${statusBadgeColors[item.status] || ""} text-xs font-bold`}>
          {STATUS_LABEL[item.status] || item.status}
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
