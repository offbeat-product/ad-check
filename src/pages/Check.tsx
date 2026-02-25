import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { CheckResult, CheckItem, ProcessType, ProcessConfig } from "@/lib/types";
import { PROCESS_LIST } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { Product, Client, Project } from "@/lib/db-types";
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

export default function CheckPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Selections
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<ProcessType>("script");

  // Input
  const [scriptText, setScriptText] = useState("");
  const [imageData, setImageData] = useState<CompressResult | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Execution
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch clients & products ──
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
    ]).then(([clientRes, prodRes]) => {
      if (cancelled) return;
      handleSupabaseError(clientRes.error, "clients");
      handleSupabaseError(prodRes.error, "products");
      setClients(clientRes.data ?? []);
      setDbProducts(prodRes.data ?? []);

      // Restore from localStorage
      const savedProductId = localStorage.getItem("checkmate_selected_product_id");
      const prods = prodRes.data ?? [];
      const cls = clientRes.data ?? [];
      if (savedProductId) {
        const savedProduct = prods.find(p => p.id === savedProductId);
        if (savedProduct) {
          setSelectedClientId(savedProduct.client_id);
          setSelectedProductId(savedProductId);
        }
      }
      setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Fetch projects when product changes ──
  useEffect(() => {
    if (!selectedProductId) { setProjects([]); return; }
    supabase
      .from("projects")
      .select("*")
      .eq("product_id", selectedProductId)
      .order("name")
      .then(({ data, error }) => {
        handleSupabaseError(error, "projects");
        setProjects(data ?? []);
      });
  }, [selectedProductId]);

  // Persist product selection
  useEffect(() => {
    if (selectedProductId) {
      try { localStorage.setItem("checkmate_selected_product_id", selectedProductId); } catch {}
    }
  }, [selectedProductId]);

  // Derived
  const filteredProducts = selectedClientId
    ? dbProducts.filter(p => p.client_id === selectedClientId)
    : [];
  const product = dbProducts.find(p => p.id === selectedProductId);
  const client = clients.find(c => c.id === selectedClientId);
  const project = projects.find(p => p.id === selectedProjectId);
  const processConfig = PROCESS_LIST.find(p => p.id === selectedProcess)!;
  const infoLines = product?.info_lines ?? [];

  // ── Handlers ──
  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    setSelectedProductId(null);
    setSelectedProjectId(null);
    setProjects([]);
    setResult(null);
  };

  const handleProductChange = (id: string) => {
    setSelectedProductId(id);
    setSelectedProjectId(null);
    setResult(null);
  };

  const handleProjectChange = (val: string) => {
    setSelectedProjectId(val === "__none__" ? null : val);
  };

  const handleProcessChange = (proc: ProcessConfig) => {
    if (!proc.enabled) return;
    setSelectedProcess(proc.id);
    setResult(null);
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
    } catch {
      toast({ title: "エラー", description: "画像の処理に失敗しました", variant: "destructive" });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /image\/(png|jpeg|jpg|webp)/.test(file.type)) handleImageUpload(file);
  }, [handleImageUpload]);

  useEffect(() => {
    return () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); };
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
      if (processConfig.inputMode === "image") {
        if (!imageData) throw new Error("画像を選択してください");
        res = await runSfCheck(product.id, imageData.base64, imageData.mediaType);
      } else {
        if (!scriptText.trim()) throw new Error("テキストを入力してください");
        res = await runScriptCheck(product.id, scriptText);
      }
      setResult(res);

      const inputData = processConfig.inputMode === "image" && imageData
        ? { image_base64: `data:${imageData.mediaType};base64,${imageData.base64}` }
        : { script_text: scriptText };

      const { error } = await supabase.from("check_results").insert([{
        user_id: user.id,
        client_name: client?.name ?? "",
        product_code: product.code,
        product_name: product.name,
        process_type: selectedProcess,
        input_type: processConfig.inputMode === "image" ? "image" : "text",
        input_text: processConfig.inputMode === "image" ? null : scriptText,
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

  // ── Loading / Empty states ──
  if (dataLoading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;

  const loadingText = processConfig.inputMode === "image"
    ? "🎨 Vision APIによるチェック実行中..."
    : "AIチェック実行中...";

  const canExecute = !!product && processConfig.enabled && (
    processConfig.inputMode === "image" ? !!imageData : !!scriptText.trim()
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">
          {client?.name ?? "未選択"} &gt; {product?.name ?? "未選択"} &gt; {processConfig.label}
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <ContextBar
          client={client?.name ?? ""}
          productName={product?.name ?? ""}
          projectName={project?.name}
          processLabel={processConfig.label}
        />

        {/* ── STEP 1: Context Selection ── */}
        <section className="glass-card p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 1 — コンテキスト選択</h2>

          {/* ① Client */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">① クライアント選択（必須）</label>
            <Select value={selectedClientId ?? ""} onValueChange={handleClientChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="クライアントを選択" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ② Product */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">② 商材選択（必須）</label>
            <Select
              value={selectedProductId ?? ""}
              onValueChange={handleProductChange}
              disabled={!selectedClientId}
            >
              <SelectTrigger className={`w-full ${!selectedClientId ? "opacity-50" : ""}`}>
                <SelectValue placeholder={selectedClientId ? "商材を選択" : "クライアントを先に選択してください"} />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ③ Project (optional) */}
          {selectedProductId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">③ 案件選択（任意）</label>
              <Select
                value={selectedProjectId ?? "__none__"}
                onValueChange={handleProjectChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="案件を選択しない（クイックチェック）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">案件を選択しない（クイックチェック）</SelectItem>
                  {projects.length === 0 ? (
                    <SelectItem value="__empty__" disabled>案件はまだありません</SelectItem>
                  ) : (
                    projects.map(pj => (
                      <SelectItem key={pj.id} value={pj.id}>{pj.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ④ Process */}
          {selectedProductId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">④ 工程選択（必須）</label>
              <div className="flex gap-2 flex-wrap">
                {PROCESS_LIST.map(proc => (
                  <button
                    key={proc.id}
                    disabled={!proc.enabled}
                    onClick={() => handleProcessChange(proc)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      selectedProcess === proc.id && proc.enabled
                        ? "border-primary bg-primary/10 text-primary"
                        : proc.enabled
                        ? "border-border text-muted-foreground hover:border-foreground/20"
                        : "border-border/50 text-muted-foreground/40 cursor-not-allowed"
                    }`}
                  >
                    {proc.label}
                    {!proc.enabled && <span className="ml-1 text-[10px]">準備中</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product info card */}
          {product && (
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-primary mb-2">
                <Info className="h-3 w-3" />
                商材情報
              </div>
              {infoLines.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">{line}</p>
              ))}
              {product.warning && (
                <p className="text-xs text-status-warning font-medium mt-2">{product.warning}</p>
              )}
            </div>
          )}
        </section>

        {/* ── STEP 2: Input ── */}
        {selectedProductId && processConfig.enabled && (
          <section className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 2 — 入力</h2>

            {processConfig.inputMode === "image" ? (
              <ImageInput
                imageData={imageData}
                imagePreviewUrl={imagePreviewUrl}
                fileInputRef={fileInputRef}
                onUpload={handleImageUpload}
                onDrop={handleDrop}
                onClear={() => {
                  setImageData(null);
                  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                  setImagePreviewUrl(null);
                }}
              />
            ) : processConfig.inputMode === "text" ? (
              <div className="space-y-3">
                <Textarea
                  value={scriptText}
                  onChange={e => setScriptText(e.target.value)}
                  placeholder={"冒頭：\n前半：\n中盤：\n後半：\n締め："}
                  className="min-h-[200px] resize-y border-border font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleLoadSample} className="text-xs" disabled={!product?.sample_text}>
                  サンプル読込
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-sm">この工程は現在準備中です</p>
              </div>
            )}
          </section>
        )}

        {/* ── Execute & Result ── */}
        <section className="space-y-6">
          <Button
            onClick={handleExecute}
            disabled={loading || !canExecute}
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
                title={`${client?.name ?? ""} / ${product?.name ?? ""} / ${processConfig.label}チェック`}
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

// ── Image Input Sub-component ──
function ImageInput({
  imageData,
  imagePreviewUrl,
  fileInputRef,
  onUpload,
  onDrop,
  onClear,
}: {
  imageData: CompressResult | null;
  imagePreviewUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUpload: (file: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
}) {
  if (!imageData) {
    return (
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
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
          onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative inline-block">
        <img src={imagePreviewUrl!} alt="Preview" className="max-h-64 rounded-lg border border-border" />
        <button
          onClick={onClear}
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
  );
}
