import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { runScriptCheck, runSfCheck } from "@/lib/webhook";
import type { CheckRecord, CheckItem } from "@/lib/types";
import type { ProjectFile, Product, Project, Client } from "@/lib/db-types";
import { useReviewState, useDownload, useExportCsv } from "@/hooks/useReviewState";
import { compressImage } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CompareView from "@/components/CompareView";
import ShareLinkModal from "@/components/ShareLinkModal";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import { ArrowLeft, Download, GitCompare, Link2, CheckCircle2, Loader2, Bot, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<string, { label: string; class: string }> = {
  uploaded: { label: "未チェック", class: "bg-muted text-muted-foreground" },
  checking: { label: "チェック中", class: "bg-primary/10 text-primary" },
  checked: { label: "チェック済", class: "bg-primary/10 text-primary" },
  revision_requested: { label: "修正依頼", class: "bg-status-warning/10 text-status-warning" },
  revised: { label: "修正済", class: "border border-status-ok text-status-ok" },
  approved: { label: "承認済", class: "bg-status-ok/10 text-status-ok" },
};

export default function FileReviewPage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { downloadFile } = useDownload();
  const { exportCsv } = useExportCsv();

  const [file, setFile] = useState<ProjectFile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [record, setRecord] = useState<CheckRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [uploadRevisionOpen, setUploadRevisionOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectFile[]>([]);

  // Mandatory annotation comment state
  const [pendingAnnotation, setPendingAnnotation] = useState<{ annotations: any[] } | null>(null);
  const [annotationComment, setAnnotationComment] = useState("");

  const checkItems = record ? (record.check_items as any[]) : null;
  const { items, markers, commentCounts, paintMode, setPaintMode, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(record?.id, checkItems);

  useEffect(() => {
    if (!fileId || !projectId) return;
    (async () => {
      const { data: f } = await supabase.from("project_files").select("*").eq("id", fileId).single();
      if (!f) { setLoading(false); return; }
      setFile(f as any);

      const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
      setProject(proj as any);

      if (proj) {
        const { data: prod } = await supabase.from("products").select("*").eq("id", (proj as any).product_id).single();
        setProduct(prod as any);
        if (prod) {
          const { data: cl } = await supabase.from("clients").select("*").eq("id", (prod as any).client_id).single();
          setClient(cl as any);
        }
      }

      if ((f as any).check_result_id) {
        const { data: cr } = await supabase.from("check_results").select("*").eq("id", (f as any).check_result_id).single();
        setRecord(cr as any);
      }

      const { data: vers } = await supabase.from("project_files").select("*")
        .or(`id.eq.${fileId},parent_file_id.eq.${fileId}`)
        .order("version_number");
      setVersions((vers as any) || []);

      setLoading(false);
    })();
  }, [fileId, projectId]);

  const handleRunCheck = async () => {
    if (!file || !product || !user) return;
    setChecking(true);
    try {
      const webhookPaths = product.webhook_paths as Record<string, string>;
      const processType = file.process_type === "styleframe" ? "sf" : "script";
      let res: any;

      if (processType === "sf") {
        const base64 = file.file_data?.replace(/^data:[^;]+;base64,/, "") || "";
        const mediaType = file.file_data?.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
        res = await runSfCheck(base64, mediaType);
      } else {
        const webhookPath = webhookPaths[processType];
        if (!webhookPath) throw new Error("Webhook未設定");
        res = await runScriptCheck(webhookPath, file.file_data || "");
      }

      const inputData = processType === "sf" ? { image_base64: file.file_data } : { script_text: file.file_data };

      const { data: crData } = await supabase.from("check_results").insert({
        user_id: user.id,
        client_name: client?.name || "",
        product_code: product.code,
        product_name: product.name,
        process_type: processType,
        input_type: processType === "sf" ? "image" : "text",
        input_text: processType === "sf" ? null : file.file_data,
        overall_status: res.overall_status,
        detected_case: res.detected_case,
        ng_count: res.ng_count,
        warning_count: res.warning_count,
        ok_count: res.ok_count,
        total_checks: res.total_checks,
        check_items: res.check_items as any,
        raw_response: res as any,
        input_data: inputData as any,
      }).select("id").single();

      if (crData) {
        await supabase.from("project_files").update({
          status: "checked",
          check_result_id: (crData as any).id,
        } as any).eq("id", file.id);

        setFile({ ...file, status: "checked", check_result_id: (crData as any).id });

        const { data: fullCr } = await supabase.from("check_results").select("*").eq("id", (crData as any).id).single();
        setRecord(fullCr as any);
      }

      toast({ title: "チェック完了", description: `Grade: ${res.overall_status}` });
    } catch (err: any) {
      toast({ title: "チェックエラー", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!file) return;
    await supabase.from("project_files").update({ status: newStatus } as any).eq("id", file.id);
    setFile({ ...file, status: newStatus });
  };

  const handleDownload = () => {
    if (!file) return;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (file.file_type === "image" && file.file_data) {
      downloadFile(file.file_data, `${file.file_name}_${date}.jpg`, true);
    } else {
      downloadFile(file.file_data || "", `${file.file_name}_${date}.txt`, false);
    }
  };

  const handleExportCsv = () => {
    if (!record) return;
    exportCsv(items, `checkmate_${file?.file_name}_${Date.now()}.csv`);
  };

  const handleAnnotationSave = async (annotations: any[]) => {
    setPendingAnnotation({ annotations });
    setAnnotationComment("");
  };

  const confirmAnnotationComment = async () => {
    if (!pendingAnnotation || !record?.id || !user) return;
    await supabase.from("comments").insert({
      check_result_id: record.id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: annotationComment || "アノテーション追加",
      annotation_data: { annotations: pendingAnnotation.annotations } as any,
      status: "open",
    } as any);
    setPendingAnnotation(null);
    setAnnotationComment("");
    toast({ title: "コメントを保存しました" });
  };

  const cancelAnnotation = () => {
    setPendingAnnotation(null);
    setAnnotationComment("");
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!file) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">ファイルが見つかりません</div>;

  const isSf = file.file_type === "image" || file.process_type === "styleframe";
  const currentStatus = file.status || "uploaded";
  const sc = statusConfig[currentStatus] || statusConfig.uploaded;
  const hasCheckResult = !!record;
  const hasVersions = versions.length > 1;
  const canCheck = product && (
    (file.process_type === "script") ||
    (file.process_type === "styleframe" && product.code === "tmd_aga")
  );

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top action bar */}
        <header className="border-b border-border px-4 py-2 flex items-center gap-3 bg-card shrink-0">
          <button onClick={() => navigate(`/project/${projectId}`)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium truncate">{file.file_name}</span>

          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("px-3 py-1 rounded-full text-xs font-medium border shrink-0", sc.class)}>{sc.label}</button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => handleStatusChange(key)}
                  className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors", currentStatus === key ? "bg-muted" : "hover:bg-muted/50")}>
                  {cfg.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-1.5">
            {canCheck && (
              <Button size="sm" className="text-xs h-8" onClick={handleRunCheck} disabled={checking}>
                {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                {checking ? "チェック中..." : "AIチェック実行"}
              </Button>
            )}
            {!canCheck && file.process_type !== "script" && (
              <Button size="sm" variant="outline" className="text-xs h-8" disabled><Bot className="h-3 w-3 mr-1" />準備中</Button>
            )}
            {hasCheckResult && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setRightTab("ai-check")}>
                <CheckCircle2 className="h-3 w-3 mr-1" />AI結果
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />共有
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />DL
            </Button>
            {hasCheckResult && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportCsv}>CSV</Button>
            )}
            {hasVersions && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setCompareOpen(true)}>
                <GitCompare className="h-3 w-3 mr-1" />比較
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setUploadRevisionOpen(true)}>
              <Upload className="h-3 w-3 mr-1" />修正版
            </Button>
          </div>
        </header>

        {/* Creative preview */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {isSf ? (
              <ImagePreview
                imageSrc={file.file_data}
                markers={hasCheckResult ? markers : []}
                paintMode={paintMode}
                onPaintModeToggle={() => setPaintMode(!paintMode)}
                onMarkerClick={scrollToCard}
                onAnnotationSave={handleAnnotationSave}
                label={`${client?.name} / ${product?.name} / スタイルフレーム`}
                noDataMessage="プレビューなし"
                overlay={!hasCheckResult && !checking && canCheck ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Button onClick={handleRunCheck}><Bot className="h-4 w-4 mr-2" />AIチェック実行</Button>
                  </div>
                ) : undefined}
              />
            ) : (
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">{client?.name} / {product?.name} / 字コンテ</span>
                {!hasCheckResult && !checking && canCheck && (
                  <div className="mb-4 flex justify-center">
                    <Button onClick={handleRunCheck}><Bot className="h-4 w-4 mr-2" />AIチェック実行</Button>
                  </div>
                )}
                <ScriptDisplay text={file.file_data || ""} items={items} markers={markers} onItemClick={scrollToCard} />
              </div>
            )}
          </div>
        </div>
      </div>

      <ReviewRightPanel
        rightTab={rightTab}
        onTabChange={setRightTab}
        items={items}
        markers={markers}
        productCode={record?.product_code || product?.code || ""}
        commentCounts={commentCounts}
        highlightCard={highlightCard}
        commentFilter={commentFilter}
        checkResultId={record?.id || null}
        hasCheckResult={hasCheckResult}
        onCommentClick={handleCommentClick}
        emptyCheckMessage={
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
            <Bot className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">AIチェック未実行</p>
            <p className="text-xs mt-1">AIチェックを実行してください</p>
            {canCheck && (
              <Button size="sm" className="mt-4" onClick={handleRunCheck} disabled={checking}>
                {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                {checking ? "チェック中..." : "AIチェック実行"}
              </Button>
            )}
          </div>
        }
      />

      {/* Mandatory annotation comment popup */}
      {pendingAnnotation && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl shadow-xl p-5 w-[400px] space-y-3">
            <h3 className="text-sm font-semibold">アノテーションのコメントを入力</h3>
            <Textarea value={annotationComment} onChange={(e) => setAnnotationComment(e.target.value)} placeholder="修正内容を入力してください..." className="min-h-[80px] text-sm" autoFocus />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={cancelAnnotation}>取消（アノテーション削除）</Button>
              <Button size="sm" onClick={confirmAnnotationComment} disabled={!annotationComment.trim()}>保存して投稿</Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload revision */}
      <UploadRevisionModal open={uploadRevisionOpen} onOpenChange={setUploadRevisionOpen} file={file} projectId={projectId!}
        onUploaded={() => {
          setUploadRevisionOpen(false);
          supabase.from("project_files").select("*").or(`id.eq.${fileId},parent_file_id.eq.${fileId}`).order("version_number")
            .then(({ data }) => setVersions((data as any) || []));
        }} />

      {record && <CompareView checkResultId={record.id} processType={record.process_type} originalText={record.input_text} open={compareOpen} onOpenChange={setCompareOpen} />}
      {record && <ShareLinkModal checkResultId={record.id} open={shareOpen} onOpenChange={setShareOpen} />}
    </div>
  );
}

function UploadRevisionModal({ open, onOpenChange, file, projectId, onUploaded }: {
  open: boolean; onOpenChange: (o: boolean) => void; file: ProjectFile; projectId: string; onUploaded: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      let fileData = "";
      let fileType = file.file_type;
      if (f.type.startsWith("image/")) {
        const compressed = await compressImage(f);
        fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
        fileType = "image";
      } else {
        fileData = await f.text();
        fileType = "text";
      }
      const { data: existing } = await supabase.from("project_files").select("version_number")
        .or(`id.eq.${file.id},parent_file_id.eq.${file.id}`).order("version_number", { ascending: false }).limit(1);
      const nextVersion = existing && existing.length > 0 ? (existing[0] as any).version_number + 1 : 2;

      await supabase.from("project_files").insert({
        project_id: projectId, process_type: file.process_type,
        file_name: `${file.file_name}_v${nextVersion}`, file_type: fileType,
        file_data: fileData, file_size_bytes: f.size, version_number: nextVersion,
        parent_file_id: file.id, status: "revised", created_by: user.email || user.id,
      } as any);

      toast({ title: `v${nextVersion} をアップロードしました` });
      onUploaded();
    } catch {
      toast({ title: "エラー", variant: "destructive" });
    }
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>修正版をアップロード</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{uploading ? "アップロード中..." : "ファイルを選択"}</p>
            <input ref={fileInputRef} type="file" className="hidden"
              accept={file.file_type === "image" ? "image/png,image/jpeg,image/webp" : ".txt,.docx"}
              onChange={handleUpload} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
