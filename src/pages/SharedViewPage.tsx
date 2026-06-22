import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { CheckResultRow, ShareLinkRow } from "@/lib/db-types";
import { parseCheckResultRow, type CheckResultWithParsedItems } from "@/lib/parse-check-result";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import MediaPreview, { type MediaPreviewHandle } from "@/components/review/MediaPreview";
import AICheckPanel from "@/components/review/AICheckPanel";
import SharedCommentsPanel from "@/components/SharedCommentsPanel";
import { useReviewState } from "@/hooks/useReviewState";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Lock, AlertTriangle, Bot, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdCheckLogoMark } from "@/components/AdCheckLogoMark";
import { downloadProjectFile, getSharedCheckDownloadPayload } from "@/lib/download-project-file";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildCommentContentWithMediaTimestamp,
  isValidMediaTimestamp,
  normalizeAnnotations,
  shouldShowTimedAnnotation,
  type CommentAnnotationData,
} from "@/lib/comment-annotations";

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [shareLink, setShareLink] = useState<ShareLinkRow | null>(null);
  const [record, setRecord] = useState<CheckResultWithParsedItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [mediaCurrentTime, setMediaCurrentTime] = useState<number | null>(null);
  const [selectedAnnotations, setSelectedAnnotations] = useState<CommentAnnotationData[]>([]);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedAnnotationTimestamp, setSelectedAnnotationTimestamp] = useState<number | null>(null);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [totalCommentCount, setTotalCommentCount] = useState(0);
  const [draftInfo, setDraftInfo] = useState<{ current_round: number; total_rounds: number; current_label: string } | null>(null);
  const mediaRef = useRef<MediaPreviewHandle>(null);

  const checkItems = record?.check_items ?? null;
  const { items, markers, commentCounts, highlightCard, rightTab, setRightTab, scrollToCard, handleCommentClick } =
    useReviewState(record?.id, checkItems);
  const aiInputMode = record ? AI_CHECK_CONFIG[record.process_type]?.inputMode : null;
  const isTimedMedia = aiInputMode === "audio" || aiInputMode === "video";
  const visibleSelectedAnnotations = useMemo(() => {
    if (!isTimedMedia) return selectedAnnotations;
    return shouldShowTimedAnnotation(mediaCurrentTime, selectedAnnotationTimestamp) ? selectedAnnotations : [];
  }, [isTimedMedia, mediaCurrentTime, selectedAnnotationTimestamp, selectedAnnotations]);

  // --- Data Loading ---
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadShareLink(cancelled);
    return () => { cancelled = true; };
  }, [token]);

  const loadShareLink = async (cancelled = false) => {
    const { data: rows, error: fetchError } = await supabase
      .rpc("get_share_link_by_token", { token_param: token! });
    const data = rows && rows.length > 0 ? rows[0] : null;

    if (cancelled) return;

    if (fetchError || !data) {
      setError("共有リンクが見つかりません");
      setLoading(false);
      return;
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setError("この共有リンクは期限切れです");
      setLoading(false);
      return;
    }

    setShareLink(data);

    if (data.password_hash) {
      setPasswordRequired(true);
      setLoading(false);
      return;
    }

    if (data.check_result_id) await loadCheckResult(data.check_result_id, cancelled);
    else { setError("チェック結果が見つかりません"); setLoading(false); }
  };

  const loadCheckResult = async (checkResultId: string, cancelled = false) => {
    // get_shared_check_result now returns the latest in the comparison chain
    const [{ data: rows, error }, { data: draftRows, error: draftError }] = await Promise.all([
      supabase.rpc("get_shared_check_result", { p_check_result_id: checkResultId, p_share_token: token! }),
      supabase.rpc("get_shared_draft_info", { p_check_result_id: checkResultId, p_share_token: token! }),
    ]);
    if (cancelled) return;
    const cr = rows && rows.length > 0 ? rows[0] : null;
    if (error || !cr) {
      setError("チェック結果が見つかりません");
      setDraftInfo(null);
    } else {
      setRecord(parseCheckResultRow(cr as CheckResultRow));
      const draft = draftRows && draftRows.length > 0 ? draftRows[0] : null;
      if (draftError || !draft) {
        console.warn("[get_shared_draft_info]", draftError?.message ?? "no draft info");
        setDraftInfo(null);
      } else {
        setDraftInfo({
          current_round: draft.current_round,
          total_rounds: draft.total_rounds,
          current_label: draft.current_label,
        });
      }
    }
    setLoading(false);
  };

  // --- Password ---
  const handlePasswordSubmit = async () => {
    if (!shareLink) return;
    try {
      const res = await supabase.functions.invoke("verify-share-password", {
        body: { share_link_id: shareLink.id, password: passwordInput },
      });
      if (res.data?.valid) {
        setPasswordRequired(false);
        setLoading(true);
        if (shareLink.check_result_id) await loadCheckResult(shareLink.check_result_id);
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    }
  };

  // --- Media Seek ---
  const handleSeekMedia = useCallback((seconds: number) => {
    mediaRef.current?.seekTo(seconds);
  }, []);

  // Track media current time for timestamp badges
  useEffect(() => {
    if (!record) return;
    const interval = setInterval(() => {
      if (mediaRef.current) {
        setMediaCurrentTime(mediaRef.current.getCurrentTime());
      }
    }, 500);
    return () => clearInterval(interval);
  }, [record]);

  // --- Paint Mode Annotation Save ---
  const handleAnnotationSave = useCallback(async (annotations: unknown[], comment: string) => {
    if (!record || !token) return;
    const guestName = localStorage.getItem("shared_guest_name");
    if (!guestName) {
      // Switch to comments tab to prompt guest name entry
      setRightTab("comments");
      return;
    }

    const mediaTimestamp = mediaRef.current?.getCurrentTime();
    const timestampValue = isValidMediaTimestamp(mediaTimestamp) ? mediaTimestamp : null;
    const content = buildCommentContentWithMediaTimestamp(comment, timestampValue);

    try {
      await supabase.functions.invoke("shared-comments", {
        body: {
          action: "create",
          share_token: token,
          check_result_id: record.id,
          author_name: guestName,
          author_email: localStorage.getItem("shared_guest_email") || "shared@guest",
          content,
          annotation_data: annotations.length > 0 ? annotations[0] : null,
          media_timestamp: null,
          guest_token: localStorage.getItem("ad_check_shared_guest_token"),
        },
      });
      setSelectedAnnotations(normalizeAnnotations(annotations.length > 0 ? annotations[0] : null));
      setSelectedAnnotationTimestamp(isValidMediaTimestamp(mediaTimestamp) ? mediaTimestamp : null);
      if (isValidMediaTimestamp(mediaTimestamp)) {
        setMediaCurrentTime(mediaTimestamp);
      }
      setCommentRefreshKey((k) => k + 1);
      setPaintMode(false);
    } catch (err) {
      console.error("[shared annotation save]", err);
    }
  }, [record, token, setRightTab]);

  const handleAnnotationClick = useCallback((data: unknown, commentId?: string, mediaTimestamp?: number | null) => {
    if (commentId) {
      setSelectedCommentId(commentId);
    }
    setSelectedAnnotationTimestamp(isValidMediaTimestamp(mediaTimestamp) ? mediaTimestamp : null);
    if (isValidMediaTimestamp(mediaTimestamp)) {
      mediaRef.current?.seekTo(mediaTimestamp);
      setMediaCurrentTime(mediaTimestamp);
    }
    setSelectedAnnotations(normalizeAnnotations(data));
  }, []);

  const handleSelectComment = useCallback((commentId: string | null) => {
    setSelectedCommentId(commentId);
    if (!commentId) {
      setSelectedAnnotations([]);
      setSelectedAnnotationTimestamp(null);
    }
  }, []);

  const [downloadBusy, setDownloadBusy] = useState(false);

  const handleSharedDownload = async () => {
    if (!record || downloadBusy) return;
    const payload = getSharedCheckDownloadPayload(record);
    if (!payload) {
      toast({
        title: "ダウンロードできません",
        description: "このチェック結果に保存されたファイルデータがありません。",
        variant: "destructive",
      });
      return;
    }
    setDownloadBusy(true);
    try {
      await downloadProjectFile(payload.source, payload.displayBaseName);
    } catch {
      toast({ title: "ダウンロードに失敗しました", variant: "destructive" });
    } finally {
      setDownloadBusy(false);
    }
  };

  // --- Render States ---
  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">読み込み中...</div>;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground gap-3">
        <AlertTriangle className="h-10 w-10 text-status-warning" />
        <p className="text-lg font-medium">{error}</p>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-[360px] space-y-4 p-6 border border-border rounded-xl bg-card shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-primary" />パスワードが必要です
          </div>
          <Input type="password" placeholder="パスワードを入力" value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()} />
          {passwordError ? <p className="text-xs text-destructive">パスワードが正しくありません</p> : null}
          <Button className="w-full" onClick={handlePasswordSubmit}>確認</Button>
        </div>
      </div>
    );
  }

  if (!record) return null;

  // --- Derived Data ---
  const aiCfg = AI_CHECK_CONFIG[record.process_type];
  const inputMode = aiCfg?.inputMode || "text";
  const inputData = record.input_data as Record<string, string> | null;
  const canReadComments = shareLink?.allow_comment_read ?? false;
  const canWriteComments = shareLink?.allow_comment_write ?? false;
  const allowDownload = shareLink?.allow_download === true;
  const canOfferDownload = getSharedCheckDownloadPayload(record) !== null;

  const imageSrc = inputData?.image_base64 || inputData?.image_url || null;
  const videoSrc = inputData?.video_url || null;
  const audioSrc = inputData?.audio_url || null;
  // Filter out raw URLs from script text display
  const rawScriptText = inputData?.script_text || record.input_text || "";
  const scriptText = rawScriptText.startsWith("http") ? "" : rawScriptText;

  const effectiveTab = rightTab === "comments" ? "comments" : "ai-check";

  // --- Preview Renderer ---
  const renderPreview = () => {
    const previewLabel = `${record.client_name} / ${record.product_name}`;

    switch (inputMode) {
      case "image":
        return (
          <ImagePreview
            imageSrc={imageSrc}
            markers={markers}
            paintMode={paintMode}
            onPaintModeToggle={() => setPaintMode(!paintMode)}
            onMarkerClick={scrollToCard}
            label={previewLabel}
            noDataMessage="プレビュー不可"
            onAnnotationSave={canWriteComments ? handleAnnotationSave : undefined}
            savedAnnotations={visibleSelectedAnnotations}
          />
        );
      case "video":
        return (
          <MediaPreview
            ref={mediaRef}
            src={videoSrc}
            mediaType="video"
            label={previewLabel}
            noDataMessage="動画プレビュー不可"
            scriptText={scriptText || undefined}
            paintMode={paintMode}
            onPaintModeToggle={canWriteComments ? () => setPaintMode(!paintMode) : undefined}
            onAnnotationSave={canWriteComments ? handleAnnotationSave : undefined}
            savedAnnotations={visibleSelectedAnnotations}
          />
        );
      case "audio":
        return (
          <MediaPreview
            ref={mediaRef}
            src={audioSrc}
            mediaType="audio"
            label={previewLabel}
            noDataMessage="音声プレビュー不可"
            scriptText={scriptText || undefined}
          />
        );
      default:
        return (
          <div>
            <span className="text-xs text-muted-foreground mb-2 block">{previewLabel}</span>
            <ScriptDisplay text={scriptText} items={items} markers={markers} onItemClick={scrollToCard} />
          </div>
        );
    }
  };

  // --- Main Layout ---
  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden">
      {/* Left: Preview */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card shrink-0">
          <span className="text-sm font-bold flex items-center gap-2">
            <AdCheckLogoMark size="sm" />
            <span className="whitespace-nowrap bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent">
              Ad Check
            </span>
          </span>
          <Badge variant="outline" className="text-xs">共有ビュー</Badge>
          <span className="text-sm text-muted-foreground ml-2">{record.client_name} / {record.product_name}</span>
          {draftInfo ? (
            <Badge variant="secondary" className="text-[10px]">
              {draftInfo.current_label}
              {draftInfo.total_rounds > 1 ? `／全${draftInfo.total_rounds}稿` : ""}
            </Badge>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {allowDownload ? <div className="flex justify-end mb-2">
                {!canOfferDownload ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled>
                          <Download className="h-3.5 w-3.5" />
                          ダウンロード
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      ダウンロード対象のファイルデータがありません
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={downloadBusy}
                    onClick={() => void handleSharedDownload()}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadBusy ? "ダウンロード中…" : "ダウンロード"}
                  </Button>
                )}
              </div> : null}
            {renderPreview()}
          </div>
        </div>
      </div>

      {/* Right: AI Check + Comments */}
      <div className="w-full md:w-[380px] shrink-0 h-screen border-l border-border flex flex-col bg-card overflow-hidden">
        <Tabs value={effectiveTab} onValueChange={setRightTab} className="relative flex-1 flex flex-col min-h-0">
          <TabsList className="w-full shrink-0 rounded-none border-b border-border bg-transparent h-10 p-0">
            <TabsTrigger value="ai-check" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
              AIチェック結果
            </TabsTrigger>
            {canReadComments ? <TabsTrigger value="comments" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10 gap-1">
                コメント
                {totalCommentCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {totalCommentCount > 99 ? "99+" : totalCommentCount}
                  </span>
                )}
              </TabsTrigger> : null}
          </TabsList>

          <TabsContent value="ai-check" forceMount className={cn(
            "absolute inset-0 top-10 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0",
            effectiveTab !== "ai-check" && "hidden"
          )}>
            {items.length > 0 ? (
              <AICheckPanel
                items={items}
                markers={markers}
                productCode={record.product_code}
                commentCounts={commentCounts}
                highlightCard={highlightCard}
                onCommentClick={handleCommentClick}
                checkResultId={record.id}
                onTabChange={setRightTab}
                overallStatus={(record as any).overall_status}
                checkedAt={record.created_at}
                onSeekMedia={handleSeekMedia}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
                <Bot className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">チェック結果がありません</p>
              </div>
            )}
          </TabsContent>

          {canReadComments ? <TabsContent value="comments" forceMount className={cn(
              "absolute inset-0 top-10 overflow-hidden mt-0 ring-0 focus-visible:ring-0",
              effectiveTab !== "comments" && "hidden"
            )}>
              <SharedCommentsPanel
                checkResultId={record.id}
                shareToken={token!}
                allowWrite={canWriteComments}
                onAnnotationClick={handleAnnotationClick}
                mediaCurrentTime={mediaCurrentTime}
                onSeekMedia={handleSeekMedia}
                refreshKey={commentRefreshKey}
                onCommentCountChange={setTotalCommentCount}
                selectedCommentId={selectedCommentId}
                onSelectComment={handleSelectComment}
              />
            </TabsContent> : null}
        </Tabs>
      </div>
    </div>
    </TooltipProvider>
  );
}
