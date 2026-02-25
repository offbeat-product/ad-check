import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb, MessageCircle, Check, CheckCheck } from "lucide-react";
import { CorrectionPatternCard } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { forwardRef } from "react";

const borderColors: Record<string, string> = {
  NG: "border-l-[hsl(var(--status-ng))]",
  WARNING: "border-l-[hsl(var(--status-warning))]",
  OK: "border-l-[hsl(var(--status-ok))]",
};

const severityBadge: Record<string, string> = {
  high: "bg-status-ng/10 text-status-ng",
  medium: "bg-status-warning/10 text-status-warning",
  low: "bg-muted text-muted-foreground",
};

interface CheckItemCardProps {
  item: CheckItem;
  index: number;
  marker?: CheckMarker;
  isResolved: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isApplied?: boolean;
  commentCount: number;
  productCode: string;
  onToggleSelect: () => void;
  onToggleResolved: () => void;
  onCommentClick: () => void;
}

const CheckItemCard = forwardRef<HTMLDivElement, CheckItemCardProps>(
  ({ item, index, marker, isResolved, isSelected, isHighlighted, isApplied, commentCount, productCode, onToggleSelect, onToggleResolved, onCommentClick }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "border-l-4 rounded-lg border border-border p-3 space-y-2 transition-all bg-card",
          borderColors[item.status] || "",
          isResolved && "opacity-50",
          isApplied && "opacity-60 bg-status-ok/5",
          isHighlighted && "ring-2 ring-primary ring-offset-1"
        )}
      >
        <div className="flex items-start gap-2">
          {/* Marker + checkbox */}
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {item.status !== "OK" && !isApplied && (
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} className="h-3.5 w-3.5" />
            )}
            {isApplied && (
              <CheckCheck className="h-4 w-4 text-status-ok" />
            )}
            {marker && (
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                item.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
              )}>
                {marker.number}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AIチェック</span>
              <span className="text-[10px] font-mono text-muted-foreground">{item.pattern_id}</span>
              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", severityBadge[item.severity] || "")}>
                {item.severity}
              </Badge>
              <Badge className={cn("text-[10px] h-4 px-1.5", item.status === "NG" ? "status-ng" : item.status === "WARNING" ? "status-warning" : "status-ok")}>
                {item.status}
              </Badge>
              {isApplied && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-status-ok/30 text-status-ok bg-status-ok/10">反映済み</Badge>
              )}
            </div>

            <p className="text-sm font-medium">{item.item}</p>
            {item.location && <p className="text-xs text-muted-foreground">📍 {item.location}</p>}
            <p className="text-xs text-foreground/80 mt-1">{item.detail}</p>

            {/* Suggestion */}
            {item.suggestion && item.status !== "OK" && (
              <div className="text-xs text-primary bg-primary/5 rounded-md p-2 mt-2 flex items-start gap-1.5">
                <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                <span>修正案: {item.suggestion}</span>
              </div>
            )}

            {/* Correction pattern */}
            {item.status !== "OK" && (
              <div className="mt-2">
                <CorrectionPatternCard ruleId={item.pattern_id} productCode={productCode} />
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button onClick={onCommentClick} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
              <MessageCircle className="h-3 w-3" />{commentCount}
            </button>
            <button
              onClick={onToggleResolved}
              className={cn(
                "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                isResolved ? "border-status-ok/30 text-status-ok bg-status-ok/10" : "border-border text-muted-foreground hover:border-status-ok/30"
              )}
            >
              <Check className="h-3 w-3" />修正済
            </button>
          </div>
        </div>
      </div>
    );
  }
);

CheckItemCard.displayName = "CheckItemCard";
export default CheckItemCard;
