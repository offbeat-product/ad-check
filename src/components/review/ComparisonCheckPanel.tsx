import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GitCompare, Loader2, Bot, History } from "lucide-react";
import { runComparisonCheck } from "@/lib/webhook";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { CheckItem, CheckResult } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface ComparisonHistoryEntry {
  id: string;
  created_at: string;
  overall_status: string;
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
  comparison_round: number;
  check_items: CheckItem[];
}

interface ComparisonCheckPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string };
  productId: string;
  projectId: string;
  fileId?: string;
  checkResultId?: string | null;
  clientName?: string;
  productCode?: string;
  productName?: string;
  /** New file data from ComparisonLeftPanel */
  newFileData: string | null;
  newText: string;
  /** Open comparison mode in left panel */
  onOpenComparisonMode: () => void;
  onCheckComplete?: (result: CheckResult) => void;
  /** Called after saving comparison result to DB — updates file status */
  onComparisonSaved?: (savedRecord: ComparisonHistoryEntry) => void;
}

export default function ComparisonCheckPanel({
  file, productId, projectId, fileId, checkResultId, clientName, productCode, productName,
  newFileData, newText, onOpenComparisonMode, onCheckComplete, onComparisonSaved,
}: ComparisonCheckPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [history, setHistory] = useState<ComparisonHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const enabled = aiCfg?.enabled ?? false;

  const hasNewContent = isImage ? !!newFileData : !!(newText || newFileData);

  // Fetch comparison history
  useEffect(() => {
    if (!checkResultId) return;
    const fetchHistory = async () => {
      const { data, error } = await (supabase as any)
        .from("check_results")
        .select("id, created_at, overall_status, ng_count, warning_count, ok_count, total_checks, check_items")
        .eq("parent_check_result_id", checkResultId)
        .eq("check_type", "comparison")
        .order("created_at", { ascending: true });
      if (!error && data) {
        setHistory(data.map(d => ({
          ...d,
          ng_count: d.ng_count ?? 0,
          warning_count: d.warning_count ?? 0,
          ok_count: d.ok_count ?? 0,
          total_checks: d.total_checks ?? 0,
          comparison_round: (d as any).comparison_round ?? 0,
          check_items: (d.check_items as unknown as CheckItem[]) || [],
        })));
      }
    };
    fetchHistory();
  }, [checkResultId]);

  const handleRunComparison = async () => {
    if (!enabled || !user) return;
    setChecking(true);
    try {
      const refMaterials = await gatherReferenceMaterials(projectId, productId, file.process_type);
      const referenceContext = JSON.stringify(refMaterials);

      let data: Parameters<typeof runComparisonCheck>[2];
      if (isImage) {
        const newBase64 = newFileData?.replace(/^data:[^;]+;base64,/, "") || "";
        const origBase64 = file.file_data?.replace(/^data:[^;]+;base64,/, "") || "";
        const mediaType = newFileData?.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
        data = {
          image_base64: newBase64,
          media_type: mediaType,
          original_image_base64: origBase64,
        };
      } else {
        data = {
          script_text: newText || newFileData || "",
          original_text: file.file_data || "",
        };
      }

      const res = await runComparisonCheck(productId, file.process_type, data, referenceContext);
      setResult(res);
      onCheckComplete?.(res);

      // Save comparison result to DB
      const nextRound = history.length + 1;
      const { data: crData, error: insertErr } = await supabase.from("check_results").insert([{
        user_id: user.id,
        client_name: clientName || "",
        product_code: productCode || "",
        product_name: productName || "",
        process_type: file.process_type,
        input_type: isImage ? "image" : "text",
        input_text: isImage ? null : (newText || newFileData),
        overall_status: res.overall_status,
        detected_case: res.detected_case,
        ng_count: res.ng_count,
        warning_count: res.warning_count,
        ok_count: res.ok_count,
        total_checks: res.total_checks,
        check_items: res.check_items as unknown as Json,
        raw_response: res as unknown as Json,
        status: "completed",
        check_type: "comparison",
        comparison_round: nextRound,
        parent_check_result_id: checkResultId || null,
      } as any]).select("id, created_at").single();

      if (!handleSupabaseError(insertErr, "comparison result save") && crData) {
        const entry: ComparisonHistoryEntry = {
          id: crData.id,
          created_at: crData.created_at ?? new Date().toISOString(),
          overall_status: res.overall_status,
          ng_count: res.ng_count,
          warning_count: res.warning_count,
          ok_count: res.ok_count,
          total_checks: res.total_checks,
          comparison_round: nextRound,
          check_items: res.check_items,
        };
        setHistory(prev => [...prev, entry]);
        setSelectedHistoryId(crData.id);

        // Auto-update file status based on comparison result
        if (fileId) {
          const isGo = res.overall_status === "A" || res.overall_status === "B";
          const newStatus = isGo ? "checked" : "revision_requested";
          await supabase.from("project_files").update({ status: newStatus }).eq("id", fileId);
        }

        onComparisonSaved?.(entry);
      }

      toast({ title: "比較チェック完了", description: `Grade: ${res.overall_status}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      toast({ title: "チェックエラー", description: message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  // Determine which result to show: selected history or latest
  const displayResult = selectedHistoryId
    ? history.find(h => h.id === selectedHistoryId) || result
    : result;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* History timeline */}
        {history.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 mb-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">比較チェック履歴</span>
            </div>
            <div className="space-y-1">
              {history.map((h, i) => {
                const isGo = h.overall_status === "A" || h.overall_status === "B";
                const isSelected = selectedHistoryId === h.id;
                return (
                  <button
                    key={h.id}
                    onClick={() => {
                      setSelectedHistoryId(isSelected ? null : h.id);
                      if (!isSelected) {
                        // Load the result from history
                        setResult({
                          overall_status: h.overall_status as any,
                          ng_count: h.ng_count,
                          warning_count: h.warning_count,
                          ok_count: h.ok_count,
                          total_checks: h.total_checks,
                          check_items: h.check_items,
                        });
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors text-left",
                      isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className={cn(
                        "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0",
                        isGo ? "bg-[hsl(var(--status-ok))]" : "bg-[hsl(var(--status-ng))]"
                      )}>
                        {i + 1}
                      </span>
                      <span className="truncate">第{i + 2}稿チェック</span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                        isGo ? "text-status-ok bg-status-ok/10" : "text-status-ng bg-status-ng/10"
                      )}>
                        {isGo ? "GO" : "NG"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(h.created_at), "MM/dd HH:mm")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!hasNewContent && !displayResult && history.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[300px]">
            <GitCompare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">比較チェック</p>
            <p className="text-xs text-center mb-4">修正前後のファイルを比較して<br />変更点をAIがチェックします</p>
            <Button size="sm" variant="outline" onClick={onOpenComparisonMode} className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />
              比較モードを開く
            </Button>
          </div>
        ) : !displayResult && !hasNewContent ? (
          null
        ) : !displayResult ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[200px]">
            <GitCompare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium mb-1">修正後ファイルがセットされました</p>
            <p className="text-xs text-center mb-3">下の「比較チェック実行」ボタンを押してください</p>
          </div>
        ) : (
          <ResultView result={displayResult as any} />
        )}
      </div>

      {/* Bottom action */}
      <div className="shrink-0 border-t border-border p-3 bg-card space-y-2">
        {!hasNewContent && !displayResult && history.length === 0 && (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenComparisonMode}>
            <GitCompare className="h-3 w-3 mr-1" />比較モードを開く
          </Button>
        )}
        {/* Always show the button to open comparison mode for next round */}
        {(history.length > 0 || displayResult) && !hasNewContent && (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenComparisonMode}>
            <GitCompare className="h-3 w-3 mr-1" />次の稿をチェック
          </Button>
        )}
        {hasNewContent && enabled && (
          <Button size="sm" className="w-full text-xs" onClick={handleRunComparison} disabled={checking}>
            {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitCompare className="h-3 w-3 mr-1" />}
            {checking ? "比較チェック中..." : `比較チェック実行（第${history.length + 2}稿）`}
          </Button>
        )}
        {hasNewContent && !enabled && (
          <Button size="sm" variant="outline" className="w-full text-xs opacity-50" disabled>
            <Bot className="h-3 w-3 mr-1" />比較チェック（準備中）
          </Button>
        )}
      </div>
    </div>
  );
}

function ResultView({ result }: { result: CheckResult }) {
  const { check_items, ng_count, warning_count, ok_count, overall_status } = result;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">比較チェック結果:</span>
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded text-white",
          overall_status === "A" || overall_status === "B" ? "bg-[hsl(var(--status-ok))]" : "bg-[hsl(var(--status-ng))]"
        )}>{overall_status === "A" || overall_status === "B" ? "GO" : "NG"}</span>
      </div>
      <div className="flex gap-3 text-xs">
        <span className="text-status-ng font-medium">修正必須: {ng_count}</span>
        <span className="text-status-warning font-medium">要確認: {warning_count}</span>
        <span className="text-status-ok font-medium">問題なし: {ok_count}</span>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {check_items.map((item: CheckItem, i: number) => (
          <div key={i} className={cn("p-2 rounded border text-xs",
            item.status === "NG" ? "border-status-ng/30 bg-status-ng/5" :
            item.status === "WARNING" ? "border-status-warning/30 bg-status-warning/5" :
            "border-status-ok/30 bg-status-ok/5"
          )}>
            <div className="font-medium">{item.pattern_id}: {item.item}</div>
            <div className="text-muted-foreground mt-0.5">{item.detail}</div>
            {item.suggestion && <div className="mt-1 text-primary">💡 {item.suggestion}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
