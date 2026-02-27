import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import { Pin } from "lucide-react";
import type { CheckMarker } from "@/lib/marker-positions";

interface AnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

interface MediaPreviewProps {
  /** base64 data URI or public URL */
  src: string | null | undefined;
  mediaType: "audio" | "video";
  label?: string;
  noDataMessage?: string;
  /** Optional script text displayed below the player */
  scriptText?: string;
  /** Paint mode props (optional – when omitted, paint button is hidden) */
  paintMode?: boolean;
  onPaintModeToggle?: () => void;
  onAnnotationSave?: (annotations: unknown[], comment: string) => void;
  savedAnnotations?: AnnotationData[];
  highlightAnnotation?: AnnotationData | null;
}

export default function MediaPreview({
  src, mediaType, label, noDataMessage, scriptText,
  paintMode, onPaintModeToggle, onAnnotationSave,
  savedAnnotations, highlightAnnotation,
}: MediaPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const hasSource = !!src && src.trim().length > 0;
  const isRawBase64Text = hasSource && !src!.startsWith("data:") && !src!.startsWith("http") && !src!.startsWith("blob:");
  const hasPaintSupport = onPaintModeToggle !== undefined;

  const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    setContainerSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });
  }, []);

  // For audio, measure the container after mount
  const handleContainerRef = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el) {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    }
  }, []);

  return (
    <div className="relative">
      {/* Header row with label + paint mode toggle */}
      <div className="flex items-center justify-between mb-2">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        {hasPaintSupport && (
          <Button size="sm" variant={paintMode ? "default" : "outline"} onClick={onPaintModeToggle} className="text-xs h-7">
            <Pin className="h-3 w-3 mr-1" />
            ペイントモード
          </Button>
        )}
      </div>

      <div ref={handleContainerRef} className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
        {hasSource && !isRawBase64Text ? (
          mediaType === "video" ? (
            <video
              src={src!}
              controls
              controlsList="nodownload"
              className="w-full max-h-[70vh] rounded-md bg-black"
              preload="metadata"
              onLoadedMetadata={handleVideoLoad}
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
          )
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            {noDataMessage || "プレビューなし"}
          </div>
        )}

        {/* Saved annotation overlays */}
        {savedAnnotations && savedAnnotations.length > 0 && containerSize.width > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]" viewBox={`0 0 ${containerSize.width} ${containerSize.height}`} preserveAspectRatio="none">
            {savedAnnotations.map((ann, i) => (
              <SavedAnnotationSvg key={i} ann={ann} containerWidth={containerSize.width} containerHeight={containerSize.height} />
            ))}
          </svg>
        )}

        {/* Highlight overlay for clicked annotation */}
        {highlightAnnotation?.imagePosition && (
          <div
            className="absolute border-3 border-primary border-dashed rounded animate-pulse z-[25] pointer-events-none"
            style={{
              left: `${highlightAnnotation.imagePosition.x}%`,
              top: `${highlightAnnotation.imagePosition.y}%`,
              width: `${highlightAnnotation.imagePosition.width}%`,
              height: `${highlightAnnotation.imagePosition.height}%`,
              borderWidth: '3px',
            }}
          />
        )}

        {/* Annotation canvas overlay */}
        {hasPaintSupport && (
          <AnnotationCanvas
            active={!!paintMode}
            width={containerSize.width || 800}
            height={containerSize.height || 400}
            onSaveAnnotations={onAnnotationSave}
          />
        )}
      </div>

      {scriptText && (
        <div className="space-y-1 mt-4">
          <span className="text-xs text-muted-foreground font-medium">テキスト入力</span>
          <div className="font-mono text-sm border border-border rounded-lg p-3 bg-card whitespace-pre-wrap">
            {scriptText}
          </div>
        </div>
      )}
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
  if (ann.type === "arrow" && ann.points.length >= 2) {
    return <line x1={ann.points[0].x} y1={ann.points[0].y} x2={ann.points[1].x} y2={ann.points[1].y} stroke={ann.color} strokeWidth={ann.strokeWidth} opacity={0.7} />;
  }
  return <rect x={px} y={py} width={Math.max(pw, 10)} height={Math.max(ph, 10)} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} strokeDasharray="6 4" opacity={0.5} />;
}
