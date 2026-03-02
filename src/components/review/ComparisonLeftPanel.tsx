import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ArrowDown, X, GitCompare } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import MediaPreview from "./MediaPreview";

interface ComparisonLeftPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string; file_name?: string };
  newFileData: string | null;
  onNewFileDataChange: (data: string | null) => void;
  newText: string;
  onNewTextChange: (text: string) => void;
  onClose: () => void;
}

export default function ComparisonLeftPanel({
  file, newFileData, onNewFileDataChange, newText, onNewTextChange, onClose,
}: ComparisonLeftPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const isAudio = aiCfg?.inputMode === "audio";
  const isVideo = aiCfg?.inputMode === "video";
  const isMedia = isAudio || isVideo;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (isImage && f.type.startsWith("image/")) {
      try {
        const compressed = await compressImage(f);
        onNewFileDataChange(`data:${compressed.mediaType};base64,${compressed.base64}`);
      } catch {
        toast({ title: "画像の処理に失敗しました", variant: "destructive" });
      }
    } else if (isMedia) {
      // For audio/video, create object URL
      const url = URL.createObjectURL(f);
      onNewFileDataChange(url);
    } else {
      const text = await f.text();
      onNewTextChange(text);
      onNewFileDataChange(text);
    }
  };

  const renderFilePreview = (data: string | null, label: string) => {
    if (!data) return (
      <div className="h-32 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">データなし</div>
    );

    if (isImage) {
      return <img src={data} alt={label} className="w-full rounded-lg border border-border max-h-[35vh] object-contain" />;
    }
    if (isVideo || (data.startsWith("http") && /\.(mp4|mov|webm|avi)(\?|$)/i.test(data))) {
      return <video src={data} controls playsInline className="w-full rounded-lg border border-border max-h-[35vh]" />;
    }
    if (isAudio || (data.startsWith("http") && /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(data))) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("http") && /\/(videos|deliverables)\//.test(data)) {
      return <video src={data} controls playsInline className="w-full rounded-lg border border-border max-h-[35vh]" />;
    }
    if (data.startsWith("http") && /\/audios\//.test(data)) {
      return <audio src={data} controls className="w-full" />;
    }
    if (data.startsWith("blob:")) {
      if (isVideo) return <video src={data} controls playsInline className="w-full rounded-lg border border-border max-h-[35vh]" />;
      if (isAudio) return <audio src={data} controls className="w-full" />;
    }
    return (
      <div className="border border-border rounded-lg p-3 max-h-[25vh] overflow-y-auto">
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{data.substring(0, 2000)}</pre>
      </div>
    );
  };

  const acceptType = isImage ? "image/png,image/jpeg,image/webp"
    : isVideo ? "video/mp4,video/webm,video/quicktime"
    : isAudio ? "audio/mpeg,audio/wav,audio/mp4,audio/ogg"
    : ".txt,.docx";

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

      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {/* Before: Current file */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-2 block flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold">前</span>
            修正前（現在ファイル）
          </label>
          {renderFilePreview(file.file_data, "修正前")}
        </div>

        {/* Arrow */}
        <div className="flex justify-center py-1">
          <ArrowDown className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* After: Upload */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-2 block flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">後</span>
            修正後（アップロード）
          </label>
          {newFileData ? (
            <div className="relative">
              {renderFilePreview(newFileData, "修正後")}
              <button
                onClick={() => { onNewFileDataChange(null); onNewTextChange(""); }}
                className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 text-xs hover:bg-background shadow-sm border border-border"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : !isImage && !isMedia ? (
            <div className="space-y-2">
              <Textarea
                value={newText}
                onChange={(e) => { onNewTextChange(e.target.value); onNewFileDataChange(e.target.value); }}
                placeholder="修正後のテキストを入力、またはファイルをアップロード..."
                className="min-h-[100px] text-xs font-mono"
              />
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" />ファイル選択
              </Button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">修正後の{isImage ? "画像" : isVideo ? "動画" : "音声"}をアップロード</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" className="hidden" accept={acceptType} onChange={handleFileUpload} />
        </div>

        {/* Text diff preview */}
        {!isImage && !isMedia && newFileData && file.file_data && (
          <TextDiff original={file.file_data} revised={newFileData} />
        )}
      </div>
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
