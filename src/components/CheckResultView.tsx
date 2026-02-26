import type { CheckResult, CheckItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { getSubmitLabel, getSubmitBadgeClass, STATUS_LABEL } from "@/lib/check-display";

interface Props {
  result: CheckResult;
  title: string;
}

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export default function CheckResultView({ result, title }: Props) {
  const sortedItems = [...result.check_items].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );

  const submit = getSubmitLabel(result.overall_status);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h3 className="text-lg font-bold">{title}</h3>
        {result.detected_case && (
          <p className="text-sm text-muted-foreground">検出: <span className="text-primary font-medium">{result.detected_case}</span></p>
        )}
      </div>

      <div className={`grid grid-cols-2 ${result.manual_count ? "md:grid-cols-5" : "md:grid-cols-4"} gap-3`}>
        <SummaryCard label="判定" value={submit.label} className={getSubmitBadgeClass(result.overall_status)} />
        <SummaryCard label="修正必須" value={result.ng_count} className="bg-[#EF4444]/10 text-[#EF4444]" />
        <SummaryCard label="要確認" value={result.warning_count} className="bg-[#F59E0B]/10 text-[#F59E0B]" />
        <SummaryCard label="問題なし" value={result.ok_count} className="bg-[#10B981]/10 text-[#10B981]" />
        {(result.manual_count ?? 0) > 0 && (
          <SummaryCard label="手動確認" value={result.manual_count!} className="bg-[#6B7280]/10 text-[#6B7280]" />
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
  NG: "border-l-[#EF4444]",
  WARNING: "border-l-[#F59E0B]",
  OK: "border-l-[#10B981]",
  MANUAL: "border-l-[#6B7280]",
};

const statusBadgeColors: Record<string, string> = {
  NG: "bg-[#EF4444] text-white",
  WARNING: "bg-[#F59E0B] text-white",
  OK: "bg-[#10B981] text-white",
  MANUAL: "bg-[#6B7280] text-white",
};

const severityBadge: Record<string, string> = {
  high: "bg-[#EF4444]/10 text-[#EF4444]",
  medium: "bg-[#F59E0B]/10 text-[#F59E0B]",
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
