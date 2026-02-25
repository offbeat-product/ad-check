import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { CheckResult, CheckItem } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { Product, Client } from "@/lib/db-types";
// getWebhookPaths no longer needed — unified v2 webhook
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { runScriptCheck, runSfCheck } from "@/lib/webhook";
import { compressImage, type CompressResult } from "@/lib/image-compress";
import ContextBar from "@/components/ContextBar";
import CheckResultView from "@/components/CheckResultView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, Info, RefreshCw, Download } from "lucide-react";

type ProcessType = "script" | "sf" | "ekonte" | "master";

const PROCESSES = [
  { id: "script" as ProcessType, label: "字コンテ / NA原稿", enabledFor: "all" as const },
  { id: "sf" as ProcessType, label: "スタイルフレーム", enabledFor: "sf_enabled" as const },
  { id: "ekonte" as ProcessType, label: "絵コンテ", enabledFor: "none" as const },
  { id: "master" as ProcessType, label: "動画マスター", enabledFor: "none" as const },
];

export default function CheckPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // DB-driven product data
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(() => {
    try { return localStorage.getItem("checkmate_selected_product_id"); } catch { return null; }
  });
  const [selectedProcess, setSelectedProcess] = useState<ProcessType>("script");
  const [scriptText, setScriptText] = useState("");
  const [imageData, setImageData] = useState<CompressResult | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [result, setResult] = useState<CheckResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch products and clients from DB
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("clients").select("*").order("name"),
    ]).then(([prodRes, clientRes]) => {
      if (cancelled) return;
      handleSupabaseError(prodRes.error, "products");
      handleSupabaseError(clientRes.error, "clients");
      const prods = prodRes.data ?? [];
      setDbProducts(prods);
      const cls = clientRes.data ?? [];
      setClients(cls);
      // Restore from localStorage or default to first product
      const saved = localStorage.getItem("checkmate_selected_product_id");
      if (saved && prods.some(p => p.id === saved)) {
        setSelectedProductId(saved);
      } else if (prods.length > 0 && !selectedProductId) {
        setSelectedProductId(prods[0].id);
      }
      setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const product = dbProducts.find((p) => p.id === selectedProductId);
  const clientName = product?.client_id ? clients.find(c => c.id === product.client_id)?.name ?? "" : "";

  const isProcessEnabled = (processId: ProcessType) => {
    if (!product) return false;
    const proc = PROCESSES.find((p) => p.id === processId)!;
    if (proc.enabledFor === "all") return true;
    if (proc.enabledFor === "none") return false;
    // "sf_enabled" - check product.sf_enabled
    return !!product.sf_enabled;
  };

  const handleProductChange = (id: string) => {
    setSelectedProductId(id);
    try { localStorage.setItem("checkmate_selected_product_id", id); } catch {}
    setResult(null);
    const prod = dbProducts.find(p => p.id === id);
    if (selectedProcess === "sf" && !prod?.sf_enabled) {
      setSelectedProcess("script");
    }
  };

  const handleLoadSample = () => {
    if (product?.sample_text) setScriptText(product.sample_text);
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "エラー", description: "ファイルサイズは10MB以下にしてください", variant: "destructive" });
      return;
    }
    try {
      const compressed = await compressImage(file);
      setImageData(compressed);
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
      // Clean up previous URL
      return () => URL.revokeObjectURL(url);
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

  // Clean up image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleExecute = async () => {
    if (!user) return;
    if (!product) {
      toast({ title: "エラー", description: "商材を選択してください", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      let res: CheckResult;
      if (selectedProcess === "sf") {
        if (!imageData) throw new Error("画像を選択してください");
        res = await runSfCheck(product.id, imageData.base64, imageData.mediaType);
      } else {
        if (!scriptText.trim()) throw new Error("テキストを入力してください");
        res = await runScriptCheck(product.id, scriptText);
      }
      setResult(res);

      const inputData = selectedProcess === "sf" && imageData
        ? { image_base64: `data:${imageData.mediaType};base64,${imageData.base64}` }
        : { script_text: scriptText };

      const { error } = await supabase.from("check_results").insert([{
        user_id: user.id,
        client_name: clientName,
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
        check_items: res.check_items as unknown as Json,
        raw_response: res as unknown as Json,
        input_data: inputData as unknown as Json,
      }]);
      handleSupabaseError(error, "check_results insert");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      toast({ title: "チェックエラー", description: message, variant: "destructive" });
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
    a.download = `checkmate_${product?.code}_${selectedProcess}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (dataLoading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (dbProducts.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">商材が登録されていません</div>;

  const processLabel = PROCESSES.find((p) => p.id === selectedProcess)?.label || "";
  const infoLines = product ? (product.info_lines ?? []) : [];

  const loadingText = selectedProcess === "sf"
    ? "🎨 Vision APIによるSFチェック実行中..."
    : product?.code === "tmd_aga"
    ? "薬事チェック含むAIチェック実行中..."
    : "AIチェック実行中...";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">
          {clientName} &gt; {product?.name ?? "未選択"} &gt; {processLabel}
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <ContextBar client={clientName} productName={product?.name ?? ""} processLabel={processLabel} />

        <section className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 1 — コンテキスト選択</h2>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">商材選択（必須）</label>
            <Select value={selectedProductId ?? ""} onValueChange={handleProductChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="商材を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {dbProducts.map((p) => {
                  const cName = p.client_id ? clients.find(c => c.id === p.client_id)?.name ?? "" : "";
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {cName ? `${cName} / ${p.name}` : p.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

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

          <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary mb-2">
              <Info className="h-3 w-3" />
              商材情報
            </div>
            {infoLines.map((line, i) => (
              <p key={i} className="text-xs text-muted-foreground">{line}</p>
            ))}
            {product?.warning && (
              <p className="text-xs text-status-warning font-medium mt-2">{product.warning}</p>
            )}
          </div>
        </section>

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
                      onClick={() => { setImageData(null); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(null); }}
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
              <Button variant="outline" size="sm" onClick={handleLoadSample} className="text-xs" disabled={!product?.sample_text}>
                サンプル読込
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <Button
            onClick={handleExecute}
            disabled={loading || !product || (selectedProcess === "sf" ? !imageData : !scriptText.trim())}
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
                title={`${clientName} / ${product.name} / ${processLabel}チェック`}
              />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setResult(null); handleExecute(); }} disabled={loading} className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />再チェック
                </Button>
                <Button variant="outline" onClick={handleExportCsv} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />結果をエクスポート
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
