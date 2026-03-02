import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitCompare, Loader2, Bot } from "lucide-react";
import { runComparisonCheck } from "@/lib/webhook";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { CheckItem, CheckResult } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ComparisonCheckPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string };
  productId: string;
  projectId: string;
  /** New file data from ComparisonLeftPanel */
  newFileData: string | null;
  newText: string;
  /** Open comparison mode in left panel */
  onOpenComparisonMode: () => void;
  onCheckComplete?: (result: CheckResult) => void;
}

export default function ComparisonCheckPanel({
  file, productId, projectId, newFileData, newText, onOpenComparisonMode, onCheckComplete,
}: ComparisonCheckPanelProps) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const enabled = aiCfg?.enabled ?? false;

  const hasNewContent = isImage ? !!newFileData : !!(newText || newFileData);

  const handleRunComparison = async () => {
    if (!enabled) return;
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
      toast({ title: "比較チェック完了", description: `Grade: ${res.overall_status}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      toast({ title: "チェックエラー", description: message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!hasNewContent && !result ? (
          /* Empty state: prompt to open comparison mode */
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[300px]">
            <GitCompare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">比較チェック</p>
            <p className="text-xs text-center mb-4">修正前後のファイルを比較して<br />変更点をAIがチェックします</p>
            <Button size="sm" variant="outline" onClick={onOpenComparisonMode} className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />
              比較モードを開く
            </Button>
          </div>
        ) : !result ? (
          /* Has content but no result yet */
          <div className="flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[200px]">
            <GitCompare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium mb-1">修正後ファイルがセットされました</p>
            <p className="text-xs text-center mb-3">下の「比較チェック実行」ボタンを押してください</p>
          </div>
        ) : (
          /* Results */
          <ResultView result={result} />
        )}
      </div>

      {/* Bottom action */}
      <div className="shrink-0 border-t border-border p-3 bg-card space-y-2">
        {!hasNewContent && !result && (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenComparisonMode}>
            <GitCompare className="h-3 w-3 mr-1" />比較モードを開く
          </Button>
        )}
        {hasNewContent && enabled && (
          <Button size="sm" className="w-full text-xs" onClick={handleRunComparison} disabled={checking}>
            {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitCompare className="h-3 w-3 mr-1" />}
            {checking ? "比較チェック中..." : "比較チェック実行"}
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
