import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ArrowDown, X, GitCompare, Plus } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface DraftEntry {
  label: string;
  data: string | null;
  text: string;
}

interface ComparisonLeftPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string; file_name?: string };
  /** All drafts: index 0 = 初稿 (current file), index 1+ = uploaded drafts */
  drafts: DraftEntry[];
  onDraftsChange: (drafts: DraftEntry[]) => void;
  /** Which pair is selected for comparison: compares drafts[activePairIndex] vs drafts[activePairIndex+1] */
  activePairIndex: number;
  onActivePairIndexChange: (index: number) => void;
  onClose: () => void;
  /** Comparison history for showing past rounds */
  checkResultId?: string | null;
}

export default function ComparisonLeftPanel({
  file, drafts, onDraftsChange, activePairIndex, onActivePairIndexChange, onClose, checkResultId,
}: ComparisonLeftPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const isAudio = aiCfg?.inputMode === "audio";
  const isVideo = aiCfg?.inputMode === "video";
  const isMedia = isAudio || isVideo;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetIndex: number) => {
    const f = e.target.files?.[0];
    if (!f) return;

    let newData: string | null = null;
    let newText = "";

    if (isImage && f.type.startsWith("image/")) {
      try {
        const compressed = await compressImage(f);
        newData = `data:${compressed.mediaType};base64,${compressed.base64}`;
      } catch {
        toast({ title: "画像の処理に失敗しました", variant: "destructive" });
        return;
      }
    } else if (isMedia) {
      newData = URL.createObjectURL(f);
    } else {
      const text = await f.text();
      newText = text;
      newData = text;
    }

    const updated = [...drafts];
    if (targetIndex < updated.length) {
      updated[targetIndex] = { ...updated[targetIndex], data: newData, text: newText };
    } else {
      updated.push({ label: `第${targetIndex + 1}稿`, data: newData, text: newText });
    }
    onDraftsChange(updated);

    // Auto-select this pair for comparison (compare previous draft vs this one)
    if (targetIndex > 0) {
      onActivePairIndexChange(targetIndex - 1);
    }

    // Reset file input
    e.target.value = "";
  };

  const handleAddDraft = () => {
    const nextIndex = drafts.length;
    setUploadingIndex(nextIndex);
    fileInputRef.current?.click();
  };

  const handleRemoveDraft = (index: number) => {
    if (index === 0) return; // Can't remove 初稿
    const updated = drafts.filter((_, i) => i !== index).map((d, i) => ({
      ...d,
      label: i === 0 ? "初稿" : `第${i + 1}稿`,
    }));
    onDraftsChange(updated);
    // Adjust active pair if needed
    if (activePairIndex >= updated.length - 1) {
      onActivePairIndexChange(Math.max(0, updated.length - 2));
    }
  };

  const renderFilePreview = (data: string | null, label: string, compact = false) => {
    const maxH = compact ? "max-h-[20vh]" : "max-h-[30vh]";
    if (!data) return (
      <div className="h-20 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">データなし</div>
    );

    if (isImage) {
      return <img src={data} alt={label} className={cn("w-full rounded-lg border border-border object-contain", maxH)} />;
    }
    if (isVideo || (data.startsWith("http") && /\.(mp4|mov|webm|avi)(\?|$)/i.test(data))) {
      return <video src={data} controls playsInline className={cn("w-full rounded-lg border border-border", maxH)} />;
    }
    if (isAudio || (data.startsWith("http") && /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(data))) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("http") && /\/(videos|deliverables)\//.test(data)) {
      return <video src={data} controls playsInline className={cn("w-full rounded-lg border border-border", maxH)} />;
    }
    if (data.startsWith("http") && /\/audios\//.test(data)) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("blob:")) {
      if (isVideo) return <video src={data} controls playsInline className={cn("w-full rounded-lg border border-border", maxH)} />;
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

  // The active comparison pair
  const beforeDraft = drafts[activePairIndex];
  const afterDraft = drafts[activePairIndex + 1];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">比較チェックモード</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
          <X className="h-3 w-3 mr-1" />閉じる
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-2 overflow-y-auto">
        {/* Draft timeline */}
        {drafts.map((draft, i) => (
          <div key={i}>
            {/* Draft entry */}
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
                  {i === activePairIndex && afterDraft && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">比較元</span>
                  )}
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
                  {renderFilePreview(draft.data, draft.label, true)}
                  {i > 0 && (
                    <button
                      onClick={() => {
                        const updated = [...drafts];
                        updated[i] = { ...updated[i], data: null, text: "" };
                        onDraftsChange(updated);
                      }}
                      className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded-full p-1 text-xs hover:bg-background shadow-sm border border-border"
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

            {/* Arrow between drafts */}
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

        {/* Add next draft button */}
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

        {/* Text diff for active pair */}
        {!isImage && !isMedia && beforeDraft?.data && afterDraft?.data && (
          <TextDiff original={beforeDraft.data} revised={afterDraft.data} />
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
      {show && (
        <div className="border border-border rounded-lg overflow-hidden text-xs">
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
        </div>
      )}
    </div>
  );
}
