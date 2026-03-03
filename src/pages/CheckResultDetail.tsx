import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";

/**
 * CheckResultDetail now acts as a redirect page.
 * It looks up the project_file linked to this check_result and redirects
 * to the FileReviewPage for a consistent experience.
 * If no linked file is found, it falls back to a standalone view.
 */
export default function CheckResultDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      // Try to find a project_file linked to this check_result
      const { data: files, error } = await supabase
        .from("project_files")
        .select("id, project_id")
        .eq("check_result_id", id)
        .limit(1);

      if (cancelled) return;
      handleSupabaseError(error, "project_files lookup");

      if (files && files.length > 0 && files[0].project_id) {
        // Redirect to FileReviewPage
        navigate(`/project/${files[0].project_id}/file/${files[0].id}`, { replace: true });
      } else {
        // No linked file — try to navigate to the project if we can find it via check_result
        setFallback(true);
      }
    })();

    return () => { cancelled = true; };
  }, [id, navigate]);

  if (!fallback) {
    return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  }

  // Fallback: render the standalone check result view (import lazily)
  return <FallbackCheckResultView id={id!} />;
}

// Lazy inline fallback for check results not linked to any project file
import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem, CheckStatus } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { CheckResultRow } from "@/lib/db-types";
import { useReviewState, useDownload, useExportCsv } from "@/hooks/useReviewState";
import { exportCheckExcel } from "@/lib/export-excel";
import { getSubmitLabel, getSubmitBadgeClass } from "@/lib/check-display";
import { getProcessLabel } from "@/lib/process-config";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import CompareView from "@/components/CompareView";
import ShareLinkModal from "@/components/ShareLinkModal";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import MediaPreview from "@/components/review/MediaPreview";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import { ArrowLeft, Download, GitCompare, Link2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "チェック済", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "修正中", class: "bg-primary/10 text-primary" },
  resolved: { label: "修正完了", class: "bg-status-ok/10 text-status-ok" },
  approved: { label: "承認済", class: "bg-product-cta/10 text-product-cta" },
};

function FallbackCheckResultView({ id }: { id: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<CheckResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationData[]>([]);
  const [highlightAnnotation, setHighlightAnnotation] = useState<AnnotationData | null>(null);
  const { downloadFile } = useDownload();
  const { exportCsv } = useExportCsv();

  const checkItems = record?.check_items ? (record.check_items as unknown as CheckItem[]) : null;
  const { items, markers, commentCounts, paintMode, setPaintMode, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(id, checkItems);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase.from("check_results").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      handleSupabaseError(error, "check_results");
      setRecord(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const handleStatusChange = async (newStatus: CheckStatus) => {
    if (!id) return;
    const { error } = await supabase.from("check_results").update({ status: newStatus }).eq("id", id);
    if (!handleSupabaseError(error, "status update")) {
      setRecord((r) => (r ? { ...r, status: newStatus } : r));
    }
  };

  const handleDownload = () => {
    if (!record) return;
    const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if ((record.process_type === "sf" || record.process_type === "styleframe" || record.process_type === "storyboard") && inputData?.image_base64) {
      downloadFile(inputData.image_base64, `${record.product_code}_${record.process_type}_${date}.jpg`, true);
    } else {
      downloadFile(inputData?.script_text || record.input_text || "", `${record.product_code}_${record.process_type}_${date}.txt`, false);
    }
  };

  const handleExportCsv = () => {
    if (!record) return;
    exportCsv(items, `checkmate_${record.product_code}_${Date.now()}.csv`);
  };

  const handleExportExcel = () => {
    if (!record) return;
    const submit = getSubmitLabel(record.overall_status);
    exportCheckExcel(
      items,
      {
        productName: record.product_name,
        processType: record.process_type,
        overallStatus: submit.label,
        date: record.created_at ? new Date(record.created_at).toLocaleString("ja-JP") : "",
      },
      `checkmate_${record.product_code}_${Date.now()}.xlsx`
    );
  };

  const fetchSavedAnnotations = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("comments")
      .select("annotation_data")
      .eq("check_result_id", id)
      .not("annotation_data", "is", null);
    if (handleSupabaseError(error, "saved annotations")) return;
    const anns: AnnotationData[] = [];
    (data ?? []).forEach((c) => {
      const ad = c.annotation_data as Record<string, unknown> | null;
      if (ad && Array.isArray(ad.annotations)) {
        ad.annotations.forEach((a: unknown) => anns.push(a as AnnotationData));
      } else if (ad && ad.type) {
        anns.push(ad as unknown as AnnotationData);
      }
    });
    setSavedAnnotations(anns);
  }, [id]);

  useEffect(() => { fetchSavedAnnotations(); }, [fetchSavedAnnotations]);

  const handleAnnotationSave = async (annotations: unknown[], comment: string) => {
    if (!id || !user) return;
    const { error } = await supabase.from("comments").insert([{
      check_result_id: id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: comment || "アノテーション追加",
      annotation_data: { annotations } as unknown as Json,
      status: "open",
    }]);
    if (!handleSupabaseError(error, "annotation save")) {
      toast({ title: "コメントを保存しました" });
      fetchSavedAnnotations();
    }
  };

  const handleAnnotationClick = useCallback((annotationData: unknown) => {
    const ad = annotationData as Record<string, unknown> | null;
    if (!ad) return;
    let ann: AnnotationData | null = null;
    if (Array.isArray(ad.annotations) && ad.annotations.length > 0) {
      ann = ad.annotations[0] as AnnotationData;
    } else if (ad.type) {
      ann = ad as unknown as AnnotationData;
    }
    if (ann) {
      setHighlightAnnotation(ann);
      setTimeout(() => setHighlightAnnotation(null), 2500);
    }
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!record) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">結果が見つかりません</div>;

  const isAudio = record.process_type === "narration" || record.process_type === "bgm";
  const isVideo = record.process_type === "vcon" || record.process_type === "video_horizontal" || record.process_type === "video_vertical";
  const isSf = record.process_type === "sf" || record.process_type === "styleframe" || record.process_type === "storyboard";
  const currentStatus = record.status || "pending";
  const sc = statusConfig[currentStatus] || statusConfig.pending;
  const inputData = record.input_data as { image_base64?: string; script_text?: string; audio_base64?: string; video_url?: string; audio_url?: string } | null;
  const processLabel = getProcessLabel(record.process_type);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border px-4 py-2 flex items-center gap-3 bg-card shrink-0">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium truncate">{record.product_name} / {processLabel}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("px-3 py-1 rounded-full text-xs font-medium border shrink-0", sc.class)}>{sc.label}</button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => handleStatusChange(key as CheckStatus)}
                  className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors", currentStatus === key ? "bg-muted" : "hover:bg-muted/50")}>
                  {cfg.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setRightTab("ai-check")}>
              <CheckCircle2 className="h-3 w-3 mr-1" />AI結果
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />共有
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />DL
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportCsv}>CSV</Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-3 w-3 mr-1" />Excel
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-3 w-3 mr-1" />比較
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {isSf ? (
              <ImagePreview
                imageSrc={inputData?.image_base64}
                markers={markers}
                paintMode={paintMode}
                onPaintModeToggle={() => setPaintMode(!paintMode)}
                onMarkerClick={scrollToCard}
                onAnnotationSave={handleAnnotationSave}
                label={`${record.client_name} / ${record.product_name} / ${processLabel}`}
                noDataMessage="プレビュー不可（旧バージョン）。再チェックしてください。"
                savedAnnotations={savedAnnotations}
                highlightAnnotation={highlightAnnotation}
              />
            ) : isAudio || isVideo ? (
              <MediaPreview
                src={isAudio
                  ? (inputData?.audio_base64 || inputData?.audio_url || null)
                  : (inputData?.video_url || null)
                }
                mediaType={isAudio ? "audio" : "video"}
                label={`${record.client_name} / ${record.product_name} / ${processLabel}`}
                noDataMessage="メディアファイルなし（旧バージョン）"
                scriptText={inputData?.script_text || record.input_text || undefined}
                paintMode={paintMode}
                onPaintModeToggle={() => setPaintMode(!paintMode)}
                onAnnotationSave={handleAnnotationSave}
                savedAnnotations={savedAnnotations}
                highlightAnnotation={highlightAnnotation}
              />
            ) : (
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">{record.client_name} / {record.product_name} / {processLabel}</span>
                <ScriptDisplay text={inputData?.script_text || record.input_text || ""} items={items} markers={markers} onItemClick={scrollToCard} />
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
        productCode={record.product_code}
        commentCounts={commentCounts}
        highlightCard={highlightCard}
        commentFilter={commentFilter}
        checkResultId={id || null}
        hasCheckResult={true}
        onCommentClick={handleCommentClick}
        onCheckItemClick={scrollToCard}
        onAnnotationClick={handleAnnotationClick}
        overallStatus={record.overall_status}
      />

      <CompareView checkResultId={id!} processType={record.process_type} originalText={record.input_text} open={compareOpen} onOpenChange={setCompareOpen} />
      <ShareLinkModal checkResultId={id!} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
