import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ArrowDown, X, GitCompare, Plus, Pin, CheckCircle2 } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import type { MentionMember } from "@/components/comments/MentionInput";

export interface DraftEntry {
  label: string;
  data: string | null;
  text: string;
}

interface ComparisonLeftPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string; file_name?: string };
  drafts: DraftEntry[];
  onDraftsChange: (drafts: DraftEntry[]) => void;
  activePairIndex: number;
  onActivePairIndexChange: (index: number) => void;
  onClose: () => void;
  checkResultId?: string | null;
  /** Called when a new draft file is uploaded so it can be persisted as a project_file */
  onRevisionUploaded?: (fileData: string, fileType: string, versionNumber: number, originalFile: File) => Promise<string | void> | void;
  /** Paint mode support */
  paintMode?: boolean;
  onPaintModeToggle?: () => void;
  onAnnotationSave?: (annotations: unknown[], comment: string, mentionedUserIds?: string[], isCorrection?: boolean) => void;
  savedAnnotations?: Array<{ type: string; points: { x: number; y: number }[]; color: string; strokeWidth: number; text?: string; imagePosition?: { x: number; y: number; width: number; height: number } }>;
  highlightAnnotation?: { type: string; points: { x: number; y: number }[]; color: string; strokeWidth: number; text?: string; imagePosition?: { x: number; y: number; width: number; height: number } } | null;
  members?: MentionMember[];
  /** Client submission */
  submissionType?: string;
  onSubmitToClient?: () => void;
  /** Internal revision */
  onInternalRevision?: () => void;
}

export default function ComparisonLeftPanel({
  file, drafts, onDraftsChange, activePairIndex, onActivePairIndexChange, onClose, checkResultId,
  onRevisionUploaded,
  paintMode, onPaintModeToggle, onAnnotationSave, savedAnnotations, highlightAnnotation, members,
  submissionType, onSubmitToClient, onInternalRevision,
}: ComparisonLeftPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<number, { width: number; height: number }>>({});
  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const isAudio = aiCfg?.inputMode === "audio";
  const isVideo = aiCfg?.inputMode === "video";
  const isMedia = isAudio || isVideo;

  const handleImageLoad = useCallback((index: number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    if (!target) return;
    setImageSizes(prev => ({ ...prev, [index]: { width: target.clientWidth, height: target.clientHeight } }));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetIndex: number) => {
    const f = e.target.files?.[0];
    if (!f) return;

    let newData: string | null = null;
    let newText = "";
    let fileType = "text";

    if (isImage && f.type.startsWith("image/")) {
      try {
        const compressed = await compressImage(f);
        newData = `data:${compressed.mediaType};base64,${compressed.base64}`;
        fileType = "image";
      } catch {
        toast({ title: "画像の処理に失敗しました", variant: "destructive" });
        return;
      }
    } else if (isMedia) {
      newData = URL.createObjectURL(f);
      fileType = isVideo ? "video" : "audio";
    } else {
      const text = await f.text();
      newText = text;
      newData = text;
      fileType = "text";
    }

    const updated = [...drafts];
    if (targetIndex < updated.length) {
      updated[targetIndex] = { ...updated[targetIndex], data: newData, text: newText };
    } else {
      updated.push({ label: `第${targetIndex + 1}稿`, data: newData, text: newText });
    }
    onDraftsChange(updated);

    if (targetIndex > 0) {
      onActivePairIndexChange(targetIndex - 1);
    }

    // Save to project_files as a child version
    // For media files, the callback returns the Storage URL to replace the blob URL
    if (targetIndex > 0 && newData && onRevisionUploaded) {
      const storageUrl = await onRevisionUploaded(newData, fileType, targetIndex + 1, f);
      if (storageUrl && (isMedia)) {
        // Replace blob URL with actual Storage URL in drafts
        const updatedWithUrl = [...(updated)];
        if (targetIndex < updatedWithUrl.length) {
          updatedWithUrl[targetIndex] = { ...updatedWithUrl[targetIndex], data: storageUrl };
        }
        onDraftsChange(updatedWithUrl);
      }
    }

    e.target.value = "";
  };

  const handleAddDraft = () => {
    const nextIndex = drafts.length;
    setUploadingIndex(nextIndex);
    fileInputRef.current?.click();
  };

  const handleRemoveDraft = (index: number) => {
    if (index === 0) return;
    const updated = drafts.filter((_, i) => i !== index);
    onDraftsChange(updated);
    if (activePairIndex >= updated.length - 1) {
      onActivePairIndexChange(Math.max(0, updated.length - 2));
    }
  };

  const renderImageWithPaint = (data: string, label: string, draftIndex: number) => {
    const size = imageSizes[draftIndex] || { width: 800, height: 400 };
    const isActiveDraft = draftIndex === activePairIndex || draftIndex === activePairIndex + 1;
    return (
      <div className={cn("relative rounded-lg border border-border bg-muted/30", paintMode && isActiveDraft ? "overflow-visible" : "overflow-hidden")}>
        <img src={data} alt={label} className="w-full max-h-[25vh] object-contain" onLoad={(e) => handleImageLoad(draftIndex, e)} />
        
        {/* Saved annotations overlay */}
        {savedAnnotations && savedAnnotations.length > 0 && draftIndex === 0 ? <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
            {savedAnnotations.map((ann, i) => (
              <SavedAnnotationSvg key={i} ann={ann} containerWidth={size.width} containerHeight={size.height} />
            ))}
          </svg> : null}

        {/* Highlight annotation */}
        {highlightAnnotation?.imagePosition && draftIndex === 0 ? <div
            className="absolute border-3 border-primary border-dashed rounded animate-pulse z-[25] pointer-events-none"
            style={{
              left: `${highlightAnnotation.imagePosition.x}%`,
              top: `${highlightAnnotation.imagePosition.y}%`,
              width: `${highlightAnnotation.imagePosition.width}%`,
              height: `${highlightAnnotation.imagePosition.height}%`,
              borderWidth: '3px',
            }}
          /> : null}

        {/* Annotation canvas - only on active draft pair */}
        {paintMode && isActiveDraft ? <AnnotationCanvas active={paintMode} width={size.width} height={size.height} onSaveAnnotations={onAnnotationSave} members={members} /> : null}
      </div>
    );
  };

  const renderFilePreview = (data: string | null, label: string, draftIndex: number) => {
    if (!data) return (
      <div className="h-20 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">データなし</div>
    );

    if (isImage) {
      return renderImageWithPaint(data, label, draftIndex);
    }
    if (isVideo || (data.startsWith("http") && /\.(mp4|mov|webm|avi)(\?|$)/i.test(data))) {
      return <video src={data} controls playsInline className="w-full max-h-[20vh] rounded-lg border border-border" />;
    }
    if (isAudio || (data.startsWith("http") && /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(data))) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("http") && /\/(videos|deliverables)\//.test(data)) {
      return <video src={data} controls playsInline className="w-full max-h-[20vh] rounded-lg border border-border" />;
    }
    if (data.startsWith("http") && /\/audios\//.test(data)) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("blob:")) {
      if (isVideo) return <video src={data} controls playsInline className="w-full max-h-[20vh] rounded-lg border border-border" />;
      if (isAudio) return <audio src={data} controls className="w-full" />;
    }
    return (
      <div className="border border-border rounded-lg p-2 max-h-[15vh] overflow-y-auto">
        <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">{data.substring(0, 1500)}</pre>
      </div>
    );
  };

  const acceptType = isImage ? "image/png,image/jpeg,image/webp"
    : isVideo ? "video/mp4,video/webm,video/quicktime"
    : isAudio ? "audio/mpeg,audio/wav,audio/mp4,audio/ogg"
    : ".txt,.docx";

  const beforeDraft = drafts[activePairIndex];
  const afterDraft = drafts[activePairIndex + 1];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">比較チェックモード</span>
        </div>
        <div className="flex items-center gap-1">
          {isImage && onPaintModeToggle ? <Button size="sm" variant={paintMode ? "default" : "outline"} onClick={onPaintModeToggle} className="text-xs h-7">
              <Pin className="h-3 w-3 mr-1" />
              ペイント
            </Button> : null}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            <X className="h-3 w-3 mr-1" />閉じる
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2 overflow-y-auto">
        {drafts.map((draft, i) => (
          <div key={i}>
            <div className={cn(
              "rounded-lg border p-3 transition-colors",
              (i === activePairIndex || i === activePairIndex + 1)
                ? "border-primary/40 bg-primary/5"
                : "border-border"
            )}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <span className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                    i === 0 ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {i === 0 ? "初" : i + 1}
                  </span>
                  {draft.label}
                  {i === activePairIndex && afterDraft ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">比較元</span> : null}
                  {i === activePairIndex + 1 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">比較先</span>
                  )}
                </label>
                <div className="flex items-center gap-1">
                  {i > 0 && drafts.length > 2 && (
                    <button
                      onClick={() => handleRemoveDraft(i)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {draft.data ? (
                <div className="relative">
                  {renderFilePreview(draft.data, draft.label, i)}
                  {i > 0 && !paintMode && (
                    <button
                      onClick={() => {
                        const updated = [...drafts];
                        updated[i] = { ...updated[i], data: null, text: "" };
                        onDraftsChange(updated);
                      }}
                      className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 text-xs hover:bg-background shadow-sm border border-border z-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : i > 0 ? (
                !isImage && !isMedia ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draft.text}
                      onChange={(e) => {
                        const updated = [...drafts];
                        updated[i] = { ...updated[i], text: e.target.value, data: e.target.value };
                        onDraftsChange(updated);
                      }}
                      placeholder="テキストを入力、またはファイルをアップロード..."
                      className="min-h-[60px] text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => {
                      setUploadingIndex(i);
                      fileInputRef.current?.click();
                    }}>
                      <Upload className="h-3 w-3 mr-1" />ファイル選択
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setUploadingIndex(i);
                      fileInputRef.current?.click();
                    }}
                    className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{isImage ? "画像" : isVideo ? "動画" : "音声"}をアップロード</p>
                  </div>
                )
              ) : null}
            </div>

            {i < drafts.length - 1 && (
              <div className="flex justify-center py-1">
                <button
                  onClick={() => onActivePairIndexChange(i)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
                    i === activePairIndex
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-primary"
                  )}
                >
                  <ArrowDown className="h-4 w-4" />
                  {i === activePairIndex && <span className="text-[10px]">比較中</span>}
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="pt-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs h-8 border-dashed"
            onClick={handleAddDraft}
          >
            <Plus className="h-3 w-3 mr-1" />
            第{drafts.length + 1}稿を追加
          </Button>
        </div>

        {!isImage && !isMedia && beforeDraft?.data && afterDraft?.data ? <TextDiff original={beforeDraft.data} revised={afterDraft.data} /> : null}

        {/* Submit to client button — show draft number */}
        {submissionType !== "client" && onSubmitToClient && afterDraft ? <div className="space-y-2">
            <Button
              size="sm"
              className="w-full text-xs gap-1.5 h-10"
              onClick={onSubmitToClient}
            >
              <CheckCircle2 className="h-4 w-4" />
              クライアントに第{activePairIndex + 2}稿を提出する
            </Button>
            {onInternalRevision ? <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5 h-10"
                onClick={onInternalRevision}
              >
                <ArrowDown className="h-4 w-4" />
                社内で第{activePairIndex + 2}稿を修正する
              </Button> : null}
          </div> : null}
        {submissionType === "client" && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              クライアント提出済み
            </div>
            {onInternalRevision ? <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5 h-10"
                onClick={onInternalRevision}
              >
                <ArrowDown className="h-4 w-4" />
                社内で第{activePairIndex + 2}稿を修正する
              </Button> : null}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={acceptType}
        onChange={(e) => handleFileUpload(e, uploadingIndex ?? drafts.length)}
      />
    </div>
  );
}

function SavedAnnotationSvg({ ann, containerWidth, containerHeight }: { ann: { type: string; points: { x: number; y: number }[]; color: string; strokeWidth: number; imagePosition?: { x: number; y: number; width: number; height: number } }; containerWidth: number; containerHeight: number }) {
  if (!ann.imagePosition) return null;
  const { x, y, width, height } = ann.imagePosition;
  const px = (x / 100) * containerWidth;
  const py = (y / 100) * containerHeight;
  const pw = (width / 100) * containerWidth;
  const ph = (height / 100) * containerHeight;

  if (ann.type === "rect") {
    return <rect x={px} y={py} width={pw} height={ph} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={0.7} />;
  }
  if (ann.type === "ellipse") {
    return <ellipse cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2} ry={ph / 2} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={0.7} />;
  }
  return <rect x={px} y={py} width={Math.max(pw, 10)} height={Math.max(ph, 10)} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} strokeDasharray="6 4" opacity={0.5} />;
}

function TextDiff({ original, revised }: { original: string; revised: string }) {
  const [show, setShow] = useState(false);
  const origLines = original.split("\n");
  const newLines = revised.split("\n");
  const maxLen = Math.max(origLines.length, newLines.length);

  return (
    <div>
      <button onClick={() => setShow(!show)} className="text-xs text-primary hover:underline mb-2 flex items-center gap-1">
        <GitCompare className="h-3 w-3" />
        {show ? "差分を隠す" : "差分ハイライト表示"}
      </button>
      {show ? <div className="border border-border rounded-lg overflow-hidden text-xs">
          <div className="flex border-b border-border bg-muted/30">
            <div className="flex-1 px-3 py-1.5 font-semibold text-muted-foreground">修正前</div>
            <div className="w-px bg-border" />
            <div className="flex-1 px-3 py-1.5 font-semibold text-muted-foreground">修正後</div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
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
        </div> : null}
    </div>
  );
}
