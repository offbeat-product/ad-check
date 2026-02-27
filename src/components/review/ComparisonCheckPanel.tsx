import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, GitCompare, Loader2, Bot } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
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
  onCheckComplete?: (result: CheckResult) => void;
}

export default function ComparisonCheckPanel({ file, productId, projectId, onCheckComplete }: ComparisonCheckPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newFileData, setNewFileData] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const isText = aiCfg?.inputMode === "text";
  const enabled = aiCfg?.enabled ?? false;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (isImage && f.type.startsWith("image/")) {
      try {
        const compressed = await compressImage(f);
        setNewFileData(`data:${compressed.mediaType};base64,${compressed.base64}`);
      } catch {
        toast({ title: "画像の処理に失敗しました", variant: "destructive" });
      }
    } else {
      const text = await f.text();
      setNewText(text);
      setNewFileData(text);
    }
  };

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

  const hasNewContent = isImage ? !!newFileData : !!(newText || newFileData);

  const renderDiff = () => {
    if (!isText) return null;
    const origLines = (file.file_data || "").split("\n");
    const newLines = (newText || newFileData || "").split("\n");
    const maxLen = Math.max(origLines.length, newLines.length);

    return (
      <div className="border border-border rounded-lg overflow-hidden text-xs">
        <div className="flex border-b border-border bg-muted/30">
          <div className="flex-1 px-3 py-1.5 font-semibold text-muted-foreground">修正前</div>
          <div className="w-px bg-border" />
          <div className="flex-1 px-3 py-1.5 font-semibold text-muted-foreground">修正後</div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {Array.from({ length: maxLen }).map((_, i) => {
            const l = origLines[i] || "";
            const r = newLines[i] || "";
            const changed = l !== r;
            return (
              <div key={i} className="flex border-b border-border/30">
                <div className={cn("flex-1 px-2 py-0.5 font-mono whitespace-pre-wrap break-all", changed && l ? "bg-destructive/10" : "")}>
                  {l || <span className="text-muted-foreground/30">—</span>}
                </div>
                <div className="w-px bg-border" />
                <div className={cn("flex-1 px-2 py-0.5 font-mono whitespace-pre-wrap break-all", changed && r ? "bg-status-ok/10" : "")}>
                  {r || <span className="text-muted-foreground/30">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderResultSummary = () => {
    if (!result) return null;
    const { check_items, ng_count, warning_count, ok_count, overall_status } = result;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">比較チェック結果:</span>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded text-white",
            overall_status === "A" || overall_status === "B" ? "bg-[#10B981]" : "bg-[#EF4444]"
          )}>{overall_status === "A" || overall_status === "B" ? "GO" : "NG"}</span>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-[#EF4444] font-medium">修正必須: {ng_count}</span>
          <span className="text-[#F59E0B] font-medium">要確認: {warning_count}</span>
          <span className="text-[#10B981] font-medium">問題なし: {ok_count}</span>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {check_items.map((item: CheckItem, i: number) => (
            <div key={i} className={cn("p-2 rounded border text-xs",
              item.status === "NG" ? "border-[#EF4444]/30 bg-[#EF4444]/5" :
              item.status === "WARNING" ? "border-[#F59E0B]/30 bg-[#F59E0B]/5" :
              "border-[#10B981]/30 bg-[#10B981]/5"
            )}>
              <div className="font-medium">{item.pattern_id}: {item.item}</div>
              <div className="text-muted-foreground mt-0.5">{item.detail}</div>
              {item.suggestion && <div className="mt-1 text-primary">💡 {item.suggestion}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Original content */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">修正前（現在のファイル）</label>
          {isImage && file.file_data ? (
            <img src={file.file_data} alt="修正前" className="w-full rounded-lg border border-border max-h-[200px] object-contain" />
          ) : (
            <div className="border border-border rounded-lg p-2 max-h-[150px] overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{file.file_data?.substring(0, 500) || "データなし"}</pre>
            </div>
          )}
        </div>

        {/* New content upload */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">修正後（アップロード）</label>
          {isImage ? (
            <div>
              {newFileData ? (
                <div className="relative">
                  <img src={newFileData} alt="修正後" className="w-full rounded-lg border border-border max-h-[200px] object-contain" />
                  <button onClick={() => setNewFileData(null)} className="absolute top-1 right-1 bg-background/80 rounded-full p-1 text-xs hover:bg-background">✕</button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">修正後の画像をアップロード</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleFileUpload} />
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={newText}
                onChange={(e) => { setNewText(e.target.value); setNewFileData(e.target.value); }}
                placeholder="修正後のテキストを入力、またはファイルをアップロード..."
                className="min-h-[100px] text-xs font-mono"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" />ファイル選択
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.docx" onChange={handleFileUpload} />
              </div>
            </div>
          )}
        </div>

        {/* Diff display */}
        {isText && hasNewContent && (
          <div>
            <button onClick={() => setShowDiff(!showDiff)} className="text-xs text-primary hover:underline mb-2 flex items-center gap-1">
              <GitCompare className="h-3 w-3" />
              {showDiff ? "差分を隠す" : "差分ハイライト表示"}
            </button>
            {showDiff && renderDiff()}
          </div>
        )}

        {/* Result */}
        {result && renderResultSummary()}
      </div>

      {/* Bottom action */}
      <div className="shrink-0 border-t border-border p-3 bg-card">
        {enabled ? (
          <Button size="sm" className="w-full text-xs" onClick={handleRunComparison}
            disabled={!hasNewContent || checking}>
            {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitCompare className="h-3 w-3 mr-1" />}
            {checking ? "比較チェック中..." : "比較チェック実行"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full text-xs opacity-50" disabled>
            <Bot className="h-3 w-3 mr-1" />比較チェック（準備中）
          </Button>
        )}
      </div>
    </div>
  );
}
