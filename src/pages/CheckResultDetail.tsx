import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem, CheckStatus } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { CheckResultRow } from "@/lib/db-types";
import { useReviewState, useDownload, useExportCsv } from "@/hooks/useReviewState";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import CompareView from "@/components/CompareView";
import ShareLinkModal from "@/components/ShareLinkModal";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import { ArrowLeft, Download, GitCompare, Link2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "チェック済", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "修正中", class: "bg-primary/10 text-primary" },
  resolved: { label: "修正完了", class: "bg-status-ok/10 text-status-ok" },
  approved: { label: "承認済", class: "bg-product-cta/10 text-product-cta" },
};

export default function CheckResultDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [record, setRecord] = useState<CheckResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { downloadFile } = useDownload();
  const { exportCsv } = useExportCsv();

  const checkItems = record?.check_items ? (record.check_items as unknown as CheckItem[]) : null;
  const { items, markers, commentCounts, paintMode, setPaintMode, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(id, checkItems);

  useEffect(() => {
    if (!id) return;
    supabase.from("check_results").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      handleSupabaseError(error, "check_results");
      setRecord(data);
      setLoading(false);
    });
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
    if (record.process_type === "sf" && inputData?.image_base64) {
      downloadFile(inputData.image_base64, `${record.product_code}_${record.process_type}_${date}.jpg`, true);
    } else {
      downloadFile(inputData?.script_text || record.input_text || "", `${record.product_code}_${record.process_type}_${date}.txt`, false);
    }
  };

  const handleExportCsv = () => {
    if (!record) return;
    exportCsv(items, `checkmate_${record.product_code}_${Date.now()}.csv`);
  };

  const handleAnnotationSave = async (annotations: unknown[]) => {
    if (!id || !user) return;
    const { error } = await supabase.from("comments").insert([{
      check_result_id: id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: "アノテーション追加",
      annotation_data: { annotations } as unknown as Json,
      status: "open",
    }]);
    handleSupabaseError(error, "annotation save");
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!record) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">結果が見つかりません</div>;

  const isSf = record.process_type === "sf";
  const currentStatus = record.status || "pending";
  const sc = statusConfig[currentStatus] || statusConfig.pending;
  const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
  const fileName = `${record.product_code.toUpperCase()}_${record.process_type.toUpperCase()}_${new Date(record.created_at!).toISOString().slice(0, 10)}`;

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border px-4 py-2 flex items-center gap-3 bg-card shrink-0">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium truncate">{fileName}</span>
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
              <CheckCircle2 className="h-3 w-3 mr-1" />AIチェック結果
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />共有リンク
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />DL
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportCsv}>CSV</Button>
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
                label={`${record.client_name} / ${record.product_name} / スタイルフレーム`}
                noDataMessage="プレビュー不可（旧バージョン）。再チェックしてください。"
              />
            ) : (
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">{record.client_name} / {record.product_name} / 字コンテ</span>
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
      />

      <CompareView checkResultId={id!} processType={record.process_type} originalText={record.input_text} open={compareOpen} onOpenChange={setCompareOpen} />
      <ShareLinkModal checkResultId={id!} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
