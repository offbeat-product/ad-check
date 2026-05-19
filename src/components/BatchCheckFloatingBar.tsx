import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mapBulkToBatchProgress } from "@/lib/bulk-sequential-check-map";
import { useAutoCheck } from "@/providers/AutoCheckProvider";
import { getSubmitBadgeClass, getSubmitLabel } from "@/lib/check-display";

export default function BatchCheckFloatingBar() {
  const { bulkSequentialProgress, clearBulkSequentialProgress, cancelBulkSequentialCheck } =
    useAutoCheck();
  const [expanded, setExpanded] = useState(false);

  const progress = useMemo(
    () => mapBulkToBatchProgress(bulkSequentialProgress),
    [bulkSequentialProgress]
  );

  useEffect(() => {
    if (progress.status === "idle" || progress.status === "running") return;
    const timer = window.setTimeout(() => {
      clearBulkSequentialProgress();
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [progress.status, clearBulkSequentialProgress]);

  if (progress.status === "idle") return null;

  const isRunning = progress.status === "running";
  const isDone = progress.status === "done";
  const isCancelled = progress.status === "cancelled";
  const successCount = progress.results.filter((r) => r.success).length;
  const failCount = progress.results.filter((r) => !r.success).length;
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] bg-card border border-border rounded-lg shadow-lg animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2 px-3 py-2">
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : isDone && failCount === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-status-ok shrink-0" />
        ) : isCancelled ? (
          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        )}

        <span className="text-sm font-medium flex-1 truncate">
          {isRunning
            ? `AIチェック実行中: ${progress.current} / ${progress.total} 件完了`
            : isCancelled
              ? `一括チェックを中止 — ${successCount}件まで処理`
              : `一括チェック完了 — ${successCount}件成功${failCount > 0 ? `、${failCount}件失敗` : ""}`}
        </span>

        {progress.results.length > 0 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1 rounded hover:bg-muted">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        )}

        {isRunning ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={cancelBulkSequentialCheck}>
            中止
          </Button> : null}

        {!isRunning && (
          <button type="button" onClick={clearBulkSequentialProgress} className="p-1 rounded hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isRunning ? <div className="px-3 pb-2 space-y-1">
          <Progress value={pct} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground truncate" title={progress.currentFileName}>
            {progress.currentFileName || "…"}
          </p>
        </div> : null}

      {expanded && progress.results.length > 0 ? <div className="border-t border-border px-3 py-2 max-h-48 overflow-y-auto space-y-1">
          {progress.results.map((r, i) => (
            <div
              key={`${r.fileId}-${i}`}
              className={cn(
                "flex items-center justify-between text-xs px-2 py-1.5 rounded",
                r.success ? "bg-status-ok/10" : "bg-destructive/10"
              )}
            >
              <span className="truncate mr-2">{r.fileName}</span>
              {r.success ? (
                <Badge className={cn("text-[10px] shrink-0", getSubmitBadgeClass(r.grade))}>
                  {getSubmitLabel(r.grade)?.label ?? r.grade ?? "OK"}
                </Badge>
              ) : (
                <span className="text-destructive text-[10px] shrink-0">エラー</span>
              )}
            </div>
          ))}
        </div> : null}
    </div>
  );
}
