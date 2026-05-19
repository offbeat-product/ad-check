import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, MessageCircle, Check, CheckCheck, AlertTriangle } from "lucide-react";
import { CorrectionPatternCard } from "@/components/CorrectionPatterns";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, checkItemStr } from "@/lib/check-display";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
function parseTimestamp(ts: string | null | undefined): number {
  if (ts == null || ts === "") return -1;
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
function renderWithTimestamps(text: string | null | undefined, onSeek?: (seconds: number) => void): ReactNode {
  const safe = checkItemStr(text);
  if (!onSeek) return safe || "\u00A0";
  // Match patterns like 00:20, 0:30, 1:23:45, 00:20.350 (with optional milliseconds)
  const timestampRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)/g;
  const parts = safe.split(timestampRegex);
  if (parts.length <= 1) return safe || "\u00A0";

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
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Label tag e.g. "AIチェック" or "比較チェック" */
  sourceLabel?: string;
  /** 誤検知報告（NG/WARNING のみ親で制御） */
  falsePositiveFeedback?: {
    alreadyReported: boolean;
    onSubmit: (payload: { reason: string | null; scope: "product" | "project" }) => Promise<void>;
  } | null;
}

const CheckItemCard = forwardRef<HTMLDivElement, CheckItemCardProps>(
  ({ item, index, marker, isResolved, isSelected, isHighlighted, isApplied, commentCount, productCode, dupeCount = 1, onToggleSelect, onToggleResolved, onCommentClick, onSeekMedia, onMarkerClick, onMouseEnter, onMouseLeave, sourceLabel = "AIチェック", falsePositiveFeedback }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const [fpExpanded, setFpExpanded] = useState(false);
    const [fpReason, setFpReason] = useState("");
    const [fpScope, setFpScope] = useState<"product" | "project">("product");
    const [fpSubmitting, setFpSubmitting] = useState(false);

    // Auto-scroll into view when highlighted
    useEffect(() => {
      if (isHighlighted) {
        const el = innerRef.current;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, [isHighlighted]);

    useEffect(() => {
      if (falsePositiveFeedback?.alreadyReported) {
        setFpExpanded(false);
        setFpReason("");
        setFpScope("product");
      }
    }, [falsePositiveFeedback?.alreadyReported]);

    // Extract the first timestamp from item fields for card-level click-to-seek
    const handleCardSeek = useCallback(() => {
      if (!onSeekMedia) return;
      if (item.timestamp_start) {
        const startSeconds = parseTimestamp(item.timestamp_start);
        if (startSeconds >= 0) {
          onSeekMedia(Math.max(0, startSeconds - 2));
          return;
        }
      }
      const timestampRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)/;
      const fields = [checkItemStr(item.location), checkItemStr(item.item), checkItemStr(item.detail)];
      for (const field of fields) {
        const match = field.match(timestampRegex);
        if (match) {
          const seconds = parseTimestamp(match[1]);
          if (seconds >= 0) {
            onSeekMedia(seconds);
            return;
          }
        }
      }
    }, [item, onSeekMedia]);

    return (
      <div
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        onClick={handleCardSeek}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          "border-l-4 rounded-lg border border-border p-3 space-y-2 bg-card interactive-card cursor-pointer",
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
            {isApplied ? <CheckCheck className="h-4 w-4 text-status-ok" /> : null}
            {marker ? <button
                onClick={(e) => { e.stopPropagation(); onMarkerClick?.(checkItemStr(item.pattern_id)); }}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:scale-110 transition-transform",
                  item.status === "NG" ? "bg-status-ng" : "bg-status-warning"
                )}
                title="プレビューで該当箇所を表示"
              >
                {marker.number}
              </button> : null}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sourceLabel}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{checkItemStr(item.pattern_id) || "—"}</span>
              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", severityBadge[item.severity] || "")}>
                {item.severity}
              </Badge>
              <Badge className={cn("text-[10px] h-4 px-1.5", statusBadgeColors[item.status] || "")}>
                {STATUS_LABEL[item.status] || item.status}
              </Badge>
              {dupeCount > 1 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-muted-foreground/30 text-muted-foreground bg-muted/50">
                  同様 ×{dupeCount}
                </Badge>
              )}
              {isApplied ? <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-status-ok/30 text-status-ok bg-status-ok/10">反映済み</Badge> : null}
            </div>

            <p className="text-sm font-medium">{renderWithTimestamps(item.item, onSeekMedia)}</p>
            {item.timestamp_start ? <button
                onClick={(e) => { e.stopPropagation(); handleCardSeek(); }}
                className="text-xs text-primary cursor-pointer hover:underline"
              >
                🕐 {item.timestamp_end ? `${checkItemStr(item.timestamp_start)} 〜 ${checkItemStr(item.timestamp_end)}` : checkItemStr(item.timestamp_start)}
              </button> : null}
            {checkItemStr(item.location) ? (
              <p className="text-xs text-muted-foreground">📍 {renderWithTimestamps(item.location, onSeekMedia)}</p>
            ) : null}
            <p className="text-xs text-foreground/80 mt-1">{renderWithTimestamps(item.detail, onSeekMedia)}</p>

            {checkItemStr(item.suggestion) && item.status !== "OK" && (
              <div className="text-xs text-primary bg-primary/5 rounded-md p-2 mt-2 flex items-start gap-1.5">
                <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                <span>修正案: {renderWithTimestamps(item.suggestion, onSeekMedia)}</span>
              </div>
            )}

            {falsePositiveFeedback && (item.status === "NG" || item.status === "WARNING") ? <div
                className="mt-3 space-y-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {falsePositiveFeedback.alreadyReported ? (
                  <p className="w-full mt-3 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 border border-gray-200 rounded-md text-center flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    誤検知報告済
                  </p>
                ) : (
                  <>
                    {!fpExpanded ? (
                      <button
                        type="button"
                        className="w-full mt-3 px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-300 rounded-md hover:bg-orange-100 transition-colors flex items-center justify-center gap-1.5"
                        onClick={() => setFpExpanded(true)}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        誤検知を報告
                      </button>
                    ) : (
                      <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md space-y-2">
                        <div className="space-y-1">
                          <Label htmlFor={`fp-reason-${index}`} className="text-sm font-medium text-gray-700 mb-1">
                            理由（任意）
                          </Label>
                          <Textarea
                            id={`fp-reason-${index}`}
                            rows={3}
                            placeholder="例: この商材ではBGMのフェードアウトは不要です"
                            value={fpReason}
                            onChange={(e) => setFpReason(e.target.value)}
                            className="w-full text-sm min-h-[4.5rem] resize-y border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-sm font-medium text-gray-700">適用範囲</span>
                          <RadioGroup
                            value={fpScope}
                            onValueChange={(v) => setFpScope(v as "product" | "project")}
                            className="gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="product" id={`fp-scope-product-${index}`} />
                              <Label htmlFor={`fp-scope-product-${index}`} className="text-sm text-gray-700 font-normal cursor-pointer">
                                この商材全体に適用
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="project" id={`fp-scope-project-${index}`} />
                              <Label htmlFor={`fp-scope-project-${index}`} className="text-sm text-gray-700 font-normal cursor-pointer">
                                この案件のみ
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-4 py-1.5 rounded-md text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white"
                            disabled={fpSubmitting}
                            onClick={async () => {
                              setFpSubmitting(true);
                              try {
                                await falsePositiveFeedback.onSubmit({
                                  reason: fpReason.trim() ? fpReason : null,
                                  scope: fpScope,
                                });
                                setFpExpanded(false);
                                setFpReason("");
                                setFpScope("product");
                              } finally {
                                setFpSubmitting(false);
                              }
                            }}
                          >
                            {fpSubmitting ? "送信中..." : "送信"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 px-4 py-1.5 rounded-md text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                            disabled={fpSubmitting}
                            onClick={() => {
                              setFpExpanded(false);
                              setFpReason("");
                              setFpScope("product");
                            }}
                          >
                            キャンセル
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div> : null}

            {item.status !== "OK" && checkItemStr(item.pattern_id) && (
              <div className="mt-2">
                <CorrectionPatternCard ruleId={checkItemStr(item.pattern_id)} productCode={productCode} />
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <button onClick={onCommentClick} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary press-feedback">
              <MessageCircle className="h-3 w-3" />{commentCount}
            </button>
            <button
              onClick={onToggleResolved}
              className={cn(
                "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border press-feedback transition-all duration-150",
                isResolved ? "border-status-ok/30 text-status-ok bg-status-ok/10 badge-pop" : "border-border text-muted-foreground hover:border-status-ok/30 hover:text-status-ok"
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