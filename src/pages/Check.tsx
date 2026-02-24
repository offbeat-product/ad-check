import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS, PROCESSES, type ProductCode, type ProcessType, type CheckResult } from "@/lib/types";
import { runScriptCheck, runSfCheck } from "@/lib/webhook";
import { compressImage, type CompressResult } from "@/lib/image-compress";
import ContextBar from "@/components/ContextBar";
import CheckResultView from "@/components/CheckResultView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const productColorMap: Record<string, string> = {
  "product-ltr": "#00d4ff",
  "product-cta": "#7b2ff7",
  "product-tmd": "#00c9a7",
};
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, ArrowLeft, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CheckPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [selectedProduct, setSelectedProduct] = useState<ProductCode>("ltr_expo");
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

      // Save to DB
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

  const processLabel = PROCESSES.find((p) => p.id === selectedProcess)?.label || "";

  const loadingText = selectedProcess === "sf"
    ? "🎨 Vision APIによるSFチェック実行中..."
    : selectedProduct === "tmd_aga"
    ? "薬事チェック含むAIチェック実行中..."
    : "AIチェック実行中...";

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">
            <span className="mr-2">♟</span>
            <span className="gradient-text">CheckMate AI</span>
          </h1>
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
              const color = productColorMap[p.color] || "#00d4ff";
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
                  } : undefined}
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
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-2">
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
            /* Image upload */
            <div>
              {!imageData ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
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
            /* Text input */
            <div className="space-y-3">
              <Textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder={"冒頭：\n前半：\n中盤：\n後半：\n締め："}
                className="min-h-[200px] resize-y bg-muted border-border font-mono text-sm"
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
            className="w-full gradient-bg font-bold text-primary-foreground text-base py-6 hover:opacity-90 transition-opacity disabled:opacity-40"
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
            <CheckResultView
              result={result}
              title={`レバレジーズ / ${product.name} / ${processLabel}チェック`}
            />
          )}
        </section>
      </div>
    </div>
  );
}
