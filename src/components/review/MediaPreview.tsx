import type { CheckMarker } from "@/lib/marker-positions";

interface MediaPreviewProps {
  /** base64 data URI or public URL */
  src: string | null | undefined;
  mediaType: "audio" | "video";
  label?: string;
  noDataMessage?: string;
  /** Optional script text displayed below the player */
  scriptText?: string;
}

export default function MediaPreview({ src, mediaType, label, noDataMessage, scriptText }: MediaPreviewProps) {
  const hasSource = !!src && src.trim().length > 0;

  // Detect if the source is a base64 data URI that was stored as raw text (not a valid src)
  const isRawBase64Text = hasSource && !src!.startsWith("data:") && !src!.startsWith("http") && !src!.startsWith("blob:");

  return (
    <div className="space-y-4">
      {label && <span className="text-xs text-muted-foreground block">{label}</span>}

      {hasSource && !isRawBase64Text ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          {mediaType === "video" ? (
            <video
              src={src!}
              controls
              controlsList="nodownload"
              className="w-full max-h-[70vh] rounded-md bg-black"
              preload="metadata"
            >
              お使いのブラウザは動画再生に対応していません。
            </video>
          ) : (
            <div className="flex items-center justify-center py-8">
              <audio
                src={src!}
                controls
                controlsList="nodownload"
                className="w-full max-w-md"
                preload="metadata"
              >
                お使いのブラウザは音声再生に対応していません。
              </audio>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 h-48 flex items-center justify-center text-muted-foreground text-sm">
          {noDataMessage || "プレビューなし"}
        </div>
      )}

      {scriptText && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium">テキスト入力</span>
          <div className="font-mono text-sm border border-border rounded-lg p-3 bg-card whitespace-pre-wrap">
            {scriptText}
          </div>
        </div>
      )}
    </div>
  );
}
