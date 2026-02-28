import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { CheckResult, CheckItem, ProcessType, ProcessConfig } from "@/lib/types";
import { PROCESS_LIST } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { Product, Client, Project } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { runScriptCheck, runSfCheck, runAudioCheck, runVideoCheck } from "@/lib/webhook";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage, type CompressResult } from "@/lib/image-compress";
import ContextBar from "@/components/ContextBar";
import CheckResultView from "@/components/CheckResultView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, Info, RefreshCw, Download, Music, Film, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useCheckProgress, ESTIMATED_DURATION } from "@/hooks/useCheckProgress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Narration-specific
  const [naScriptText, setNaScriptText] = useState("");

  // BGM-specific
  const [bgmDescription, setBgmDescription] = useState("");
  const [bgmDuration, setBgmDuration] = useState<string>("");
  const [bgmLicense, setBgmLicense] = useState("");

  // Video-specific
  const [videoScriptText, setVideoScriptText] = useState("");
  const [videoDuration, setVideoDuration] = useState<string>("");
  const [videoFormat, setVideoFormat] = useState("MP4");
  const [videoResolution, setVideoResolution] = useState("");
  const [videoFps, setVideoFps] = useState<string>("");
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [videoStorageUrl, setVideoStorageUrl] = useState<string | null>(null);
  const [audioStorageUrl, setAudioStorageUrl] = useState<string | null>(null);

  // Rule info
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  const [highRuleTitles, setHighRuleTitles] = useState<string[]>([]);

  // Execution
  const [loading, setLoading] = useState(false);
  const inputModeForProcess: Record<string, string> = { script: "text", na_script: "text", narration: "audio", bgm: "audio", vcon: "video", video_horizontal: "video", video_vertical: "video", styleframe: "image", storyboard: "image" };
  const checkProgress = useCheckProgress(ESTIMATED_DURATION[inputModeForProcess[selectedProcess] || "text"] || 60_000);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showAudioConfirm, setShowAudioConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isExecutingRef = useRef(false);

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

  // Fetch rule count & high-severity titles when product or process changes
  useEffect(() => {
    if (!selectedProductId) {
      setRuleCount(null);
      setHighRuleTitles([]);
      return;
    }
    let cancelled = false;
    const processTypeCode = selectedProcess;
    console.log('Debug check_rules query:', {
      product_id: selectedProductId,
      process_type: processTypeCode,
    });
    supabase
      .from("check_rules")
      .select("id, title, severity, process_type", { count: "exact" })
      .eq("product_id", selectedProductId)
      .like("process_type", `%${processTypeCode}%`)
      .eq("is_active", true)
      .then((res) => {
        if (cancelled) return;
        console.log('Debug check_rules result:', { data: res.data, count: res.count, error: res.error });
        setRuleCount(res.count ?? 0);
        const highTitles = (res.data ?? [])
          .filter((r: any) => r.severity === "high")
          .slice(0, 3)
          .map((r: any) => r.title);
        setHighRuleTitles(highTitles);
      });
    return () => { cancelled = true; };
  }, [selectedProductId, selectedProcess]);

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
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [imagePreviewUrl, mediaPreviewUrl]);

  const handleMediaUpload = useCallback(async (file: File) => {
    const isVideo = /\.(mp4|mov|webm)$/i.test(file.name) || file.type.startsWith("video/");
    const isAudio = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name) || file.type.startsWith("audio/");
    const maxSize = isVideo ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "エラー",
        description: isVideo
          ? "動画ファイルは500MB以下にしてください"
          : "ファイルサイズは50MB以下にしてください",
        variant: "destructive",
      });
      return;
    }
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreviewUrl(url);

    // Upload to Storage for video or audio files
    if ((isVideo || isAudio) && user) {
      const bucketName = isVideo ? "videos" : "audios";
      const setProgress = isVideo ? setVideoUploadProgress : () => {};
      const setStorageUrl = isVideo ? setVideoStorageUrl : setAudioStorageUrl;

      if (isVideo) setVideoUploadProgress(0);
      setStorageUrl(null);

      try {
        const productId = product?.id || user.id;
        // Sanitize filename to avoid URL encoding issues with special characters
        const sanitizedName = file.name
          .replace(/[^\w\d._-]/g, "_")
          .replace(/_+/g, "_");
        const path = `${productId}/${Date.now()}_${sanitizedName}`;

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("認証が必要です");

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && isVideo) {
              setVideoUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          });
          xhr.addEventListener("load", () => {
            // Supabase Storage returns 200 (upsert) or 201 (new), treat both as success
            if (xhr.status >= 200 && xhr.status < 400) resolve();
            else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText?.slice(0, 200)}`));
          });
          xhr.addEventListener("error", () => reject(new Error("ネットワークエラーが発生しました")));

          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucketName}/${path}`);
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.setRequestHeader("x-upsert", "true");
          xhr.send(file);
        });

        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(path);
        setStorageUrl(urlData.publicUrl);
        if (isVideo) setVideoUploadProgress(100);
        toast({ title: "アップロード完了", description: `${file.name} をアップロードしました` });
      } catch (err) {
        console.error("[MediaUpload] error:", err);
        if (isVideo) setVideoUploadProgress(null);
        setStorageUrl(null);
        toast({ title: "アップロードエラー", description: err instanceof Error ? err.message : "アップロードに失敗しました", variant: "destructive" });
      }
    }
  }, [toast, user, product]);

  const clearMedia = useCallback(() => {
    setMediaFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setVideoUploadProgress(null);
    setVideoStorageUrl(null);
    setAudioStorageUrl(null);
  }, [mediaPreviewUrl]);

  const handleExecute = async () => {
    if (!user) return;
    if (!product) {
      toast({ title: "エラー", description: "商材を選択してください", variant: "destructive" });
      return;
    }
    // Prevent duplicate execution
    if (isExecutingRef.current) return;

    // For video mode: ensure upload is complete before sending
    if (processConfig.inputMode === "video" && mediaFile) {
      if (!videoStorageUrl) {
        toast({ title: "アップロード中", description: "動画のアップロードが完了するまでお待ちください", variant: "destructive" });
        return;
      }
    }
    // For audio mode: ensure upload is complete before sending
    if (processConfig.inputMode === "audio" && mediaFile) {
      if (!audioStorageUrl && mediaFile.type.startsWith("audio/")) {
        toast({ title: "アップロード中", description: "音声のアップロードが完了するまでお待ちください", variant: "destructive" });
        return;
      }
    }

    isExecutingRef.current = true;
    setLoading(true);
    checkProgress.start();
    setResult(null);
    try {
      // Gather reference materials from DB
      const refMaterials = await gatherReferenceMaterials(
        selectedProjectId || "",
        product.id,
        selectedProcess
      );
      const referenceContext = JSON.stringify(refMaterials);
      console.log('[CheckMate] reference_context材料数:', {
        product_base: Object.entries(refMaterials.product_base).filter(([, v]) => v).length,
        project_specific: Object.entries(refMaterials.project_specific).filter(([, v]) => v).length,
        correction_patterns: refMaterials.correction_patterns?.length || 0,
      });

      let res: CheckResult;
      if (processConfig.inputMode === "image") {
        if (!imageData) throw new Error("画像を選択してください");
        res = await runSfCheck(product.id, imageData.base64, imageData.mediaType, selectedProcess, referenceContext);
      } else if (processConfig.inputMode === "audio") {
        // Convert audio file to base64 if available
        let audioBase64 = "";
        if (mediaFile) {
          audioBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(",")[1] || result;
              resolve(base64);
            };
            reader.onerror = () => reject(new Error("音声の読み込みに失敗しました"));
            reader.readAsDataURL(mediaFile);
          });
        }

        if (selectedProcess === "narration") {
          if (!naScriptText.trim()) throw new Error("NA原稿テキストを入力してください");
          res = await runAudioCheck(product.id, "narration", naScriptText, {
            file_name: mediaFile?.name || "",
            duration: null,
            format: null,
          }, {
            audioUrl: audioStorageUrl || "",
            audioMimeType: mediaFile?.type || "",
            audioBase64,
          }, referenceContext);
        } else {
          // BGM
          if (!bgmDescription.trim()) throw new Error("BGM情報を入力してください");
          const descParts = [bgmDescription];
          if (bgmLicense) descParts.push(`ライセンス: ${bgmLicense}`);
          res = await runAudioCheck(product.id, "bgm", descParts.join("\n"), {
            file_name: mediaFile?.name || "",
            duration: bgmDuration ? Number(bgmDuration) : null,
            format: null,
          }, {
            audioUrl: audioStorageUrl || "",
            audioMimeType: mediaFile?.type || "",
            audioBase64,
          }, referenceContext);
        }
      } else if (processConfig.inputMode === "video") {
        if (!videoScriptText.trim()) throw new Error("テロップテキストを入力してください");
        const metadata: Record<string, any> = {
          file_name: mediaFile?.name || "",
          duration: videoDuration ? Number(videoDuration) : null,
          format: videoFormat || null,
        };
        if (selectedProcess === "video_horizontal" || selectedProcess === "video_vertical") {
          metadata.resolution = videoResolution || null;
          metadata.fps = videoFps ? Number(videoFps) : null;
        }
        if (selectedProcess === "video_vertical") {
          metadata.aspect_ratio = "9:16";
        }

        // Video files: always use Storage URL, never send base64 (too large for webhook payload)
        const videoMimeType = mediaFile?.type || "";
        console.log("[QuickCheck] video webhook payload:", { videoStorageUrl, videoMimeType, process: selectedProcess });

        res = await runVideoCheck(product.id, selectedProcess, videoScriptText, {
          videoUrl: videoStorageUrl || "",
          videoMimeType,
          videoBase64: "", // Always empty - n8n fetches video via URL
          metadata,
        }, referenceContext, selectedProjectId || undefined);
      } else {
        if (!scriptText.trim()) throw new Error("テキストを入力してください");
        res = await runScriptCheck(product.id, scriptText, selectedProcess, referenceContext);
      }
      setResult(res);
      checkProgress.complete();

      const inputData = processConfig.inputMode === "image" && imageData
        ? { image_base64: `data:${imageData.mediaType};base64,${imageData.base64}` }
        : processConfig.inputMode === "audio"
        ? { script_text: selectedProcess === "narration" ? naScriptText : bgmDescription, audio_url: audioStorageUrl || "" }
        : processConfig.inputMode === "video"
        ? { script_text: videoScriptText, video_url: videoStorageUrl || "" }
        : { script_text: scriptText };

      const { data: crData, error } = await supabase.from("check_results").insert([{
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
      }]).select("id").single();
      handleSupabaseError(error, "check_results insert");

      // Auto-sync to project if a project is selected
      if (selectedProjectId && crData) {
        const fileData = processConfig.inputMode === "image" && imageData
          ? `data:${imageData.mediaType};base64,${imageData.base64}`
          : processConfig.inputMode === "audio"
          ? (audioStorageUrl || "")
          : processConfig.inputMode === "video"
          ? (videoStorageUrl || "")
          : scriptText;

        const fileType = processConfig.inputMode === "image" ? "image"
          : processConfig.inputMode === "audio" ? "audio"
          : processConfig.inputMode === "video" ? "video"
          : "text";

        const fileName = processConfig.inputMode === "image" ? (imageData?.mediaType?.includes("png") ? "quick_check.png" : "quick_check.jpg")
          : mediaFile ? mediaFile.name
          : `quick_check_${selectedProcess}.txt`;

        await supabase.from("project_files").insert([{
          project_id: selectedProjectId,
          process_type: selectedProcess,
          file_name: fileName,
          file_type: fileType,
          file_data: fileData,
          status: "checked",
          check_result_id: crData.id,
          created_by: user.email || "",
        }]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      console.error("[QuickCheck] AIチェックエラー:", err);
      toast({ title: "チェック送信に失敗しました。再度お試しください", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      isExecutingRef.current = false;
      checkProgress.reset();
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
    : processConfig.inputMode === "audio"
    ? "🎵 音声解析中..."
    : processConfig.inputMode === "video"
    ? "🎬 動画解析中..."
    : "AIチェック実行中...";

  const isUploading = (videoUploadProgress !== null && videoUploadProgress < 100);
  const videoUploadReady = processConfig.inputMode === "video" && mediaFile ? !!videoStorageUrl : true;

  const canExecute = !!product && processConfig.enabled && !isUploading && videoUploadReady && (
    processConfig.inputMode === "image" ? !!imageData
    : processConfig.inputMode === "audio"
      ? (selectedProcess === "narration" ? !!naScriptText.trim() : !!bgmDescription.trim())
    : processConfig.inputMode === "video" ? !!videoScriptText.trim()
    : !!scriptText.trim()
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

          {clients.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">クライアント・商材が登録されていません</p>
              <p className="text-xs text-muted-foreground">先に設定画面からクライアント・商材を登録してください</p>
            </div>
          ) : (
          <>
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
                <SelectValue placeholder={selectedClientId ? (filteredProducts.length === 0 ? "この クライアントに商材がありません" : "商材を選択") : "クライアントを先に選択してください"} />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.length === 0 ? (
                  <SelectItem value="__empty__" disabled>商材が登録されていません</SelectItem>
                ) : (
                  filteredProducts.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))
                )}
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
                チェック情報
              </div>
              <p className="text-xs text-muted-foreground">商材：{product.name}</p>
              <p className="text-xs text-muted-foreground">工程：{processConfig.label}</p>
              {ruleCount !== null && (
                <p className="text-xs text-muted-foreground">ルール：{ruleCount}項目</p>
              )}
              {highRuleTitles.length > 0 && (
                <p className="text-xs text-muted-foreground">重点：{highRuleTitles.join(" / ")}</p>
              )}
              {product.warning && (
                <p className="text-xs text-status-warning font-medium mt-2">{product.warning}</p>
              )}
            </div>
          )}
          </>
          )}
        </section>

        {/* ── STEP 2: Input ── */}
        {selectedProductId && (
          <section className="glass-card p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">STEP 2 — 入力</h2>

            {!processConfig.enabled ? (
              <div className="border-2 border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-sm">この工程のAIチェックは準備中です。今後のアップデートで対応予定です。</p>
              </div>
            ) : processConfig.inputMode === "image" ? (
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
            ) : processConfig.inputMode === "audio" ? (
              <div className="space-y-5">
                {/* Audio file upload */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-2 block">音声ファイル（推奨 — アップロードするとAIが音声を直接分析します）</Label>
                  <MediaInput
                    mediaFile={mediaFile}
                    mediaPreviewUrl={mediaPreviewUrl}
                    inputRef={mediaInputRef}
                    onUpload={handleMediaUpload}
                    onClear={clearMedia}
                    mode="audio"
                  />
                </div>

                {selectedProcess === "narration" ? (
                  /* Narration: NA script textarea */
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">NA原稿テキスト（AIチェックに使用）</Label>
                    <Textarea
                      value={naScriptText}
                      onChange={e => setNaScriptText(e.target.value)}
                      placeholder="ナレーション原稿のテキストを貼り付けてください"
                      className="min-h-[160px] resize-y border-border font-mono text-sm"
                    />
                  </div>
                ) : (
                  /* BGM: info form */
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">BGMの雰囲気 / ジャンル（AIチェックに使用）</Label>
                      <Input
                        value={bgmDescription}
                        onChange={e => setBgmDescription(e.target.value)}
                        placeholder="例：爽やかなアコースティック"
                        className="border-border text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">尺（秒）</Label>
                      <Input
                        type="number"
                        value={bgmDuration}
                        onChange={e => setBgmDuration(e.target.value)}
                        placeholder="例：30"
                        className="border-border text-sm w-32"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">ライセンス情報</Label>
                      <Input
                        value={bgmLicense}
                        onChange={e => setBgmLicense(e.target.value)}
                        placeholder="例：Artlist商用利用可"
                        className="border-border text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : processConfig.inputMode === "video" ? (
              <div className="space-y-5">
                {/* Telop / script text — PRIMARY, required */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                    {selectedProcess === "vcon" ? "テロップ/字コンテテキスト（AIチェック対象）" : `テロップ/字コンテテキスト（AIチェック対象）`}
                    <span className="text-destructive ml-1">*必須</span>
                  </Label>
                  <Textarea
                    value={videoScriptText}
                    onChange={e => setVideoScriptText(e.target.value)}
                    placeholder={selectedProcess === "vcon" ? "Vコンのテロップ/ナレーション原稿を貼り付けてください" : `${processConfig.label}のテロップテキストを貼り付けてください`}
                    className="min-h-[160px] resize-y border-border font-mono text-sm"
                  />
                </div>

                {/* Video file upload — optional */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-2 block">動画ファイル（推奨 — アップロードするとAIが動画を直接分析します）</Label>
                  <MediaInput
                    mediaFile={mediaFile}
                    mediaPreviewUrl={mediaPreviewUrl}
                    inputRef={mediaInputRef}
                    onUpload={handleMediaUpload}
                    onClear={clearMedia}
                    mode="video"
                    maxSizeLabel="MP4 / MOV / WebM・最大500MB"
                    uploadProgress={videoUploadProgress}
                    storageUrl={videoStorageUrl}
                  />
                </div>

                {/* Video metadata */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">尺（秒）</Label>
                      <Input
                        type="number"
                        value={videoDuration}
                        onChange={e => setVideoDuration(e.target.value)}
                        placeholder="例：30"
                        className="border-border text-sm"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">ファイル形式</Label>
                      <Input
                        value={videoFormat}
                        onChange={e => setVideoFormat(e.target.value)}
                        placeholder="例：MP4"
                        className="border-border text-sm"
                      />
                    </div>
                  </div>

                  {(selectedProcess === "video_horizontal" || selectedProcess === "video_vertical") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">解像度</Label>
                        <Input
                          value={videoResolution}
                          onChange={e => setVideoResolution(e.target.value)}
                          placeholder={selectedProcess === "video_vertical" ? "例：1080x1920" : "例：1920x1080"}
                          className="border-border text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">フレームレート (fps)</Label>
                        <Input
                          type="number"
                          value={videoFps}
                          onChange={e => setVideoFps(e.target.value)}
                          placeholder="例：30"
                          className="border-border text-sm"
                          min={0}
                        />
                      </div>
                    </div>
                  )}

                  {selectedProcess === "video_vertical" && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-2 block">アスペクト比</Label>
                      <Input
                        value="9:16"
                        disabled
                        className="border-border text-sm w-32 opacity-60"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : processConfig.inputMode === "text" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Textarea
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    placeholder="テキストを貼り付けてください"
                    className="min-h-[200px] resize-y border-border font-mono text-sm"
                  />
                  {product?.sample_text && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadSample}
                      className="absolute top-2 right-2 text-[10px] h-6 px-2 opacity-70 hover:opacity-100"
                    >
                      テンプレート挿入
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
                <p className="text-sm">この工程のAIチェックは準備中です。今後のアップデートで対応予定です。</p>
              </div>
            )}
          </section>
        )}

        {/* ── Fix status pre-flight for video processes ── */}
        {selectedProductId && processConfig.inputMode === "video" && selectedProjectId && (
          <FixStatusPreFlight projectId={selectedProjectId} currentProcessType={selectedProcess} />
        )}

        {/* ── Execute & Result ── */}
        <section className="space-y-6">
          <Button
            onClick={() => {
              if (processConfig.inputMode === "audio" && !mediaFile) {
                setShowAudioConfirm(true);
                return;
              }
              handleExecute();
            }}
            disabled={loading || !canExecute}
            className="w-full bg-primary text-primary-foreground font-bold text-base py-6 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {loading ? (
              <span className="flex flex-col items-center gap-2 w-full">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {loadingText}
                </span>
                {checkProgress.isRunning && (
                  <span className="flex items-center gap-2 w-full max-w-xs">
                    <Progress value={checkProgress.progress} className="h-2 flex-1" />
                    <span className="text-xs font-mono opacity-80 w-8">{checkProgress.progress}%</span>
                  </span>
                )}
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

      <AlertDialog open={showAudioConfirm} onOpenChange={setShowAudioConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>音声ファイルなしでチェックしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              音声ファイルなしの場合、テキストのみの簡易チェックになります。音声関連の項目は手動確認が必要になりますが、よろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>戻る</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowAudioConfirm(false); handleExecute(); }}>
              チェック実行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

// ── Media (Audio/Video) Input Sub-component ──
function MediaInput({
  mediaFile,
  mediaPreviewUrl,
  inputRef,
  onUpload,
  onClear,
  mode,
  maxSizeLabel,
  uploadProgress,
  storageUrl,
}: {
  mediaFile: File | null;
  mediaPreviewUrl: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onUpload: (file: File) => void;
  onClear: () => void;
  mode: "audio" | "video";
  maxSizeLabel?: string;
  uploadProgress?: number | null;
  storageUrl?: string | null;
}) {
  const isAudio = mode === "audio";
  const accept = isAudio ? ".mp3,.wav,.m4a,.aac,.ogg" : ".mp4,.mov,.webm";
  const Icon = isAudio ? Music : Film;
  const label = isAudio ? "音声ファイル" : "動画ファイル";
  const formats = maxSizeLabel || (isAudio ? "MP3 / WAV / M4A・最大50MB" : "MP4 / MOV / WebM・最大500MB");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  if (!mediaFile) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
      >
        <Icon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{label}をドラッグ＆ドロップ、またはクリックして選択</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{formats}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </div>
    );
  }

  const isUploading = uploadProgress !== null && uploadProgress !== undefined && uploadProgress < 100;
  const isUploaded = uploadProgress === 100 && !!storageUrl;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="border border-border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{mediaFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={onClear}
              className="bg-destructive rounded-full p-1 hover:opacity-80 shrink-0"
              disabled={isUploading}
            >
              <X className="h-3 w-3 text-destructive-foreground" />
            </button>
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="space-y-1 mb-3">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">アップロード中... {uploadProgress}%</p>
            </div>
          )}

          {/* Upload complete */}
          {isUploaded && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 mb-3">
              <CheckCircle2 className="h-3.5 w-3.5" />
              アップロード完了
            </div>
          )}

          {mediaPreviewUrl && isAudio && (
            <audio controls className="w-full" src={mediaPreviewUrl}>
              お使いのブラウザは音声再生に対応していません。
            </audio>
          )}
          {mediaPreviewUrl && !isAudio && (
            <video controls className="w-full max-h-64 rounded-lg" src={mediaPreviewUrl}>
              お使いのブラウザは動画再生に対応していません。
            </video>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fix Status Pre-flight for Video Checks ──
function FixStatusPreFlight({ projectId, currentProcessType }: { projectId: string; currentProcessType: string }) {
  const [fixedTypes, setFixedTypes] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const relatedProcessTypes = ["script", "storyboard", "styleframe", "na_script", "vcon"]
    .filter(pt => pt !== currentProcessType);

  const processLabels: Record<string, string> = {
    script: "字コンテ",
    storyboard: "絵コンテ",
    styleframe: "スタイルフレーム",
    na_script: "NAスクリプト",
    vcon: "Vコン",
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    supabase
      .from("project_files")
      .select("process_type")
      .eq("project_id", projectId)
      .eq("status", "fixed")
      .in("process_type", relatedProcessTypes)
      .then(({ data }) => {
        if (cancelled) return;
        setFixedTypes(new Set(data?.map(f => f.process_type) || []));
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [projectId, currentProcessType]);

  if (!loaded) return null;

  return (
    <section className="glass-card p-4 space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">■ 照合データの状況</h3>
      <div className="space-y-1">
        {relatedProcessTypes.map(pt => {
          const isFixed = fixedTypes.has(pt);
          return (
            <div key={pt} className="flex items-center gap-2 text-xs">
              <span className={isFixed ? "text-status-ok" : "text-status-warning"}>
                {isFixed ? "✅" : "⚠️"}
              </span>
              <span className="font-medium w-32">{processLabels[pt] || pt}</span>
              <span className={isFixed ? "text-status-ok" : "text-muted-foreground"}>
                {isFixed ? "FIX済み（照合に使用します）" : "未FIX（照合スキップ）"}
              </span>
            </div>
          );
        })}
      </div>
      {fixedTypes.size === 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          ※ 照合に使用できるFIXデータがありません。各工程でFIX確定してからチェックすることを推奨します。
        </p>
      )}
    </section>
  );
}