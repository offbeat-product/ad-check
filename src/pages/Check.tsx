import { useState, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS, PROCESSES, type ProductCode, type ProcessType, type CheckResult, type CheckItem } from "@/lib/types";
import { runScriptCheck, runSfCheck } from "@/lib/webhook";
import { compressImage, type CompressResult } from "@/lib/image-compress";
import ContextBar from "@/components/ContextBar";
import CheckResultView from "@/components/CheckResultView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, Info, RefreshCw, Download } from "lucide-react";
import type { AppLayoutContext } from "@/components/AppLayout";

export default function CheckPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const context = useOutletContext<AppLayoutContext | undefined>();

  const [selectedProduct, setSelectedProduct] = useState<ProductCode>(
    context?.selectedProduct || "ltr_expo"
  );
  const [selectedProcess, setSelectedProcess] = useState<ProcessType>("script");
  const [scriptText, setScriptText] = useState("");
  const [imageData, setImageData] = useState<CompressResult | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const product = PRODUCTS.find((p) => p.code === selectedProduct)!;

  const isProcessEnabled = (processId: ProcessType) => {
    const proc = PROCESSES.find((p) => p.id === processId)!;
    if (proc.enabledFor === "all") return true;
    if (proc.enabledFor === "none") return false;
    return proc.enabledFor === selectedProduct;
  };

  const handleProductChange = (code: ProductCode) => {
    setSelectedProduct(code);
    setResult(null);
    if (selectedProcess === "sf" && code !== "tmd_aga") {
      setSelectedProcess("script");
    }
  };

  const handleLoadSample = () => {
    setScriptText(product.sampleText);
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "エラー", description: "ファイルサイズは10MB以下にしてください", variant: "destructive" });
      return;
    }
    try {
      const compressed = await compressImage(file);
      setImageData(compressed);
      setImagePreviewUrl(URL.createObjectURL(file));
    } catch {
      toast({ title: "エラー", description: "画像の処理に失敗しました", variant: "destructive" });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /image\/(png|jpeg|jpg|webp)/.test(file.type)) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handleExecute = async () => {
    if (!user) return;
    setLoading(true);
    setResult(null);
    try {
      let res: CheckResult;
      if (selectedProcess === "sf") {
        if (!imageData) throw new Error("画像を選択してください");
        res = await runSfCheck(imageData.base64, imageData.mediaType);
      } else {
        if (!scriptText.trim()) throw new Error("テキストを入力してください");
        const webhookPath = product.webhookPaths[selectedProcess];
        if (!webhookPath) throw new Error("このWebhookは設定されていません");
        res = await runScriptCheck(webhookPath, scriptText);
      }
      setResult(res);

      await supabase.from("check_results").insert({
        user_id: user.id,
        client_name: "レバレジーズ",
        product_code: product.code,
        product_name: product.name,
        process_type: selectedProcess,
        input_type: selectedProcess === "sf" ? "image" : "text",
        input_text: selectedProcess === "sf" ? null : scriptText,
        overall_status: res.overall_status,
        detected_case: res.detected_case,
        ng_count: res.ng_count,
        warning_count: res.warning_count,
        ok_count: res.ok_count,
        total_checks: res.total_checks,
        check_items: res.check_items as any,
        raw_response: res as any,
      });
    } catch (err: any) {
      toast({ title: "チェックエラー", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    const header = "pattern_id,item,status,severity,location,detail,suggestion";
    const rows = result.check_items.map((ci: CheckItem) =>
      [ci.pattern_id, ci.item, ci.status, ci.severity, ci.location || "", ci.detail, ci.suggestion || ""]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkmate_${product.code}_${selectedProcess}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const processLabel = PROCESSES.find((p) => p.id === selectedProcess)?.label || "";

  const loadingText = selectedProcess === "sf"
    ? "🎨 Vision APIによるSFチェック実行中..."
    : selectedProduct === "tmd_aga"
    ? "薬事チェック含むAIチェック実行中..."
    : "AIチェック実行中...";

  const productColorMap: Record<string, string> = {
    "product-ltr": "hsl(193, 100%, 50%)",
    "product-cta": "hsl(264, 100%, 58%)",
    "product-tmd": "hsl(166, 100%, 39%)",
  };

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">
          レバレジーズ &gt; {product.name} &gt; {processLabel}
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Context bar */}
        <ContextBar client="レバレジーズ" productName={product.name} processLabel={processLabel} />

        {/* STEP 1: Product & Process */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 1 — コンテキスト選択</h2>

          {/* Product tabs */}
          <div className="flex gap-2 flex-wrap">
            {PRODUCTS.map((p) => {
              const color = productColorMap[p.color] || "hsl(193, 100%, 50%)";
              const isActive = selectedProduct === p.code;
              return (
                <button
                  key={p.code}
                  onClick={() => handleProductChange(p.code)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-all"
                  style={isActive ? {
                    backgroundColor: `${color}15`,
                    borderColor: `${color}80`,
                    color: color,
                  } : {
                    borderColor: "hsl(214, 32%, 91%)",
                    color: "hsl(215, 16%, 47%)",
                  }}
                >
                  <div className="font-bold">{p.label}</div>
                  <div className="text-[10px] opacity-70">{p.rules}</div>
                  <div className="text-[10px] opacity-50">{p.meta}</div>
                </button>
              );
            })}
          </div>

          {/* Process chips */}
          <div className="flex gap-2 flex-wrap">
            {PROCESSES.map((proc) => {
              const enabled = isProcessEnabled(proc.id);
              return (
                <button
                  key={proc.id}
                  disabled={!enabled}
                  onClick={() => { setSelectedProcess(proc.id); setResult(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    selectedProcess === proc.id && enabled
                      ? "border-primary bg-primary/10 text-primary"
                      : enabled
                      ? "border-border text-muted-foreground hover:border-foreground/20"
                      : "border-border/50 text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  {proc.label}
                  {!enabled && proc.enabledFor !== "all" && (
                    <span className="ml-1 text-[10px]">準備中</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Info panel */}
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary mb-2">
              <Info className="h-3 w-3" />
              商材情報
            </div>
            {product.infoLines.map((line, i) => (
              <p key={i} className="text-xs text-muted-foreground">{line}</p>
            ))}
            {product.warning && (
              <p className="text-xs text-status-warning font-medium mt-2">{product.warning}</p>
            )}
          </div>
        </section>

        {/* STEP 2: Input */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 2 — 入力</h2>

          {selectedProcess === "sf" ? (
            <div>
              {!imageData ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
                >
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">画像をドラッグ＆ドロップ、またはクリックして選択</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PNG / JPG / WebP・最大10MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative inline-block">
                    <img src={imagePreviewUrl!} alt="Preview" className="max-h-64 rounded-lg border border-border" />
                    <button
                      onClick={() => { setImageData(null); setImagePreviewUrl(null); }}
                      className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 hover:opacity-80"
                    >
                      <X className="h-3 w-3 text-destructive-foreground" />
                    </button>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>元サイズ: {(imageData.originalSize / 1024).toFixed(0)}KB</span>
                    <span>→ 圧縮後: {(imageData.compressedSize / 1024).toFixed(0)}KB</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder={"冒頭：\n前半：\n中盤：\n後半：\n締め："}
                className="min-h-[200px] resize-y border-border font-mono text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleLoadSample} className="text-xs">
                サンプル読込
              </Button>
            </div>
          )}
        </section>

        {/* STEP 3: Execute & Results */}
        <section className="space-y-6">
          <Button
            onClick={handleExecute}
            disabled={loading || (selectedProcess === "sf" ? !imageData : !scriptText.trim())}
            className="w-full bg-primary text-primary-foreground font-bold text-base py-6 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {loadingText}
              </span>
            ) : (
              "AIチェック実行"
            )}
          </Button>

          {result && (
            <div className="space-y-4">
              <CheckResultView
                result={result}
                title={`レバレジーズ / ${product.name} / ${processLabel}チェック`}
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setResult(null); handleExecute(); }}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  再チェック
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportCsv}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  結果をエクスポート
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
