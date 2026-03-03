import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb, MessageCircle, Check, CheckCheck } from "lucide-react";
import { CorrectionPatternCard } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/check-display";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";

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

/** Parse timestamp strings like 00:20, 1:23, 00:01:30, 00:20.350 into seconds (with millisecond support) */
function parseTimestamp(ts: string): number {
  // Split off milliseconds if present (e.g., "00:20.350" -> "00:20" + "350")
  const [timePart, msPart] = ts.split(".");
  const parts = timePart.split(":").map(Number);
  if (parts.some(isNaN)) return -1;
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else return -1;
  // Add milliseconds
  if (msPart) {
    const ms = Number(msPart);
    if (!isNaN(ms)) {
      // Normalize: "35" -> 350ms, "350" -> 350ms, "3" -> 300ms
      const normalized = msPart.length === 1 ? ms * 100 : msPart.length === 2 ? ms * 10 : ms;
      seconds += normalized / 1000;
    }
  }
  return seconds;
}

/** Render text with clickable timestamps */
function renderWithTimestamps(text: string, onSeek?: (seconds: number) => void): ReactNode {
  if (!onSeek) return text;
  // Match patterns like 00:20, 0:30, 1:23:45, 00:20.350 (with optional milliseconds)
  const timestampRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)/g;
  const parts = text.split(timestampRegex);
  if (parts.length <= 1) return text;

  return parts.map((part, i) => {
    if (timestampRegex.lastIndex = 0, timestampRegex.test(part)) {
      const seconds = parseTimestamp(part);
      if (seconds >= 0) {
        return (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); onSeek(seconds); }}
            className="inline-flex items-center gap-0.5 text-primary font-mono font-medium bg-primary/10 hover:bg-primary/20 px-1 py-0.5 rounded text-[11px] transition-colors cursor-pointer border border-primary/20"
            title={`${part} にジャンプ`}
          >
            🕐 {part}
          </button>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

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
  dupeCount?: number;
  onToggleSelect: () => void;
  onToggleResolved: () => void;
  onCommentClick: () => void;
  onSeekMedia?: (seconds: number) => void;
  onMarkerClick?: (patternId: string) => void;
  /** Label tag e.g. "AIチェック" or "比較チェック" */
  sourceLabel?: string;
}

const CheckItemCard = forwardRef<HTMLDivElement, CheckItemCardProps>(
  ({ item, index, marker, isResolved, isSelected, isHighlighted, isApplied, commentCount, productCode, dupeCount = 1, onToggleSelect, onToggleResolved, onCommentClick, onSeekMedia, onMarkerClick, sourceLabel = "AIチェック" }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll into view when highlighted
    useEffect(() => {
      if (isHighlighted) {
        const el = innerRef.current;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, [isHighlighted]);

    return (
      <div
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={cn(
          "border-l-4 rounded-lg border border-border p-3 space-y-2 transition-all bg-card",
          borderColors[item.status] || "",
          isResolved && "opacity-50",
          isApplied && "opacity-60 bg-status-ok/5",
          isHighlighted && "ring-2 ring-primary ring-offset-1"
        )}
      >
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {item.status !== "OK" && !isApplied && (
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} className="h-3.5 w-3.5" />
            )}
            {isApplied && (
              <CheckCheck className="h-4 w-4 text-status-ok" />
            )}
            {marker && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkerClick?.(item.pattern_id); }}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:scale-110 transition-transform",
                  item.status === "NG" ? "bg-status-ng" : "bg-status-warning"
                )}
                title="プレビューで該当箇所を表示"
              >
                {marker.number}
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sourceLabel}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{item.pattern_id}</span>
              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", severityBadge[item.severity] || "")}>
                {item.severity}
              </Badge>
              <Badge className={cn("text-[10px] h-4 px-1.5", statusBadgeColors[item.status] || "")}>
                {STATUS_LABEL[item.status] || item.status}
              </Badge>
              {isApplied && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-status-ok/30 text-status-ok bg-status-ok/10">反映済み</Badge>
              )}
            </div>

            <p className="text-sm font-medium">{renderWithTimestamps(item.item, onSeekMedia)}</p>
            {item.location && <p className="text-xs text-muted-foreground">📍 {renderWithTimestamps(item.location, onSeekMedia)}</p>}
            <p className="text-xs text-foreground/80 mt-1">{renderWithTimestamps(item.detail, onSeekMedia)}</p>

            {item.suggestion && item.status !== "OK" && (
              <div className="text-xs text-primary bg-primary/5 rounded-md p-2 mt-2 flex items-start gap-1.5">
                <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                <span>修正案: {renderWithTimestamps(item.suggestion, onSeekMedia)}</span>
              </div>
            )}

            {item.status !== "OK" && (
              <div className="mt-2">
                <CorrectionPatternCard ruleId={item.pattern_id} productCode={productCode} />
              </div>
            )}
          </div>

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