import { useCallback, useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import type { MentionMember } from "@/components/comments/MentionInput";
import { Pin } from "lucide-react";

interface AnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

export interface MediaPreviewHandle {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
}

interface MediaPreviewProps {
  src: string | null | undefined;
  mediaType: "audio" | "video";
  label?: string;
  noDataMessage?: string;
  scriptText?: string;
  paintMode?: boolean;
  onPaintModeToggle?: () => void;
  onAnnotationSave?: (annotations: unknown[], comment: string, mentionedUserIds?: string[], isCorrection?: boolean) => void;
  savedAnnotations?: AnnotationData[];
  highlightAnnotation?: AnnotationData | null;
  members?: MentionMember[];
  boundingBox?: [number, number, number, number] | null;
  boundingBoxLabel?: string;
}

const MediaPreview = forwardRef<MediaPreviewHandle, MediaPreviewProps>(function MediaPreview({
  src, mediaType, label, noDataMessage, scriptText,
  paintMode, onPaintModeToggle, onAnnotationSave,
  savedAnnotations, highlightAnnotation, members,
  boundingBox, boundingBoxLabel,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [seekFlash, setSeekFlash] = useState(false);

  const hasSource = !!src && src.trim().length > 0;
  const isRawBase64Text = hasSource && !src!.startsWith("data:") && !src!.startsWith("http") && !src!.startsWith("blob:");
  const hasPaintSupport = onPaintModeToggle !== undefined;

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
    seekTo: (seconds: number) => {
      if (mediaRef.current) {
        mediaRef.current.currentTime = seconds;
        // Flash red border to indicate seek position
        setSeekFlash(true);
        setTimeout(() => setSeekFlash(false), 1500);
      }
    },
  }), []);

  const handleVideoLoad = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    setContainerSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        setContainerSize({ width: clientWidth, height: clientHeight });
      }
    }
  }, [hasSource]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        {hasPaintSupport && (
          <Button size="sm" variant={paintMode ? "default" : "outline"} onClick={onPaintModeToggle} className="text-xs h-7">
            <Pin className="h-3 w-3 mr-1" />
            ペイントモード
          </Button>
        )}
      </div>

      <div ref={containerRef} className={cn(
        "relative rounded-lg transition-all duration-300",
        paintMode ? "overflow-visible mb-16" : "overflow-hidden",
        seekFlash ? "border-destructive border-2 ring-4 ring-destructive/30 shadow-[0_0_20px_rgba(239,68,68,0.3)]" : "border border-border",
        "bg-muted/30"
      )}>
        {hasSource && !isRawBase64Text ? (
          mediaType === "video" ? (
            <video
              ref={(el) => { mediaRef.current = el; }}
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
                ref={(el) => { mediaRef.current = el; }}
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

        {paintMode && savedAnnotations && savedAnnotations.length > 0 && containerSize.width > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]" viewBox={`0 0 ${containerSize.width} ${containerSize.height}`} preserveAspectRatio="none">
            {savedAnnotations.map((ann, i) => (
              <SavedAnnotationSvg key={i} ann={ann} containerWidth={containerSize.width} containerHeight={containerSize.height} />
            ))}
          </svg>
        )}

        {highlightAnnotation?.imagePosition && containerSize.width > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[25] animate-pulse" viewBox={`0 0 ${containerSize.width} ${containerSize.height}`} preserveAspectRatio="none">
            {renderHighlightAnnotation(highlightAnnotation, containerSize.width, containerSize.height)}
          </svg>
        )}

        {boundingBox && mediaType === "video" && containerSize.width > 0 && containerSize.height > 0 && (
          <BoundingBoxOverlay
            boundingBox={boundingBox}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            label={boundingBoxLabel}
          />
        )}

        {hasPaintSupport && (
          <AnnotationCanvas
            active={!!paintMode}
            width={containerSize.width || 800}
            height={containerSize.height || 400}
            onSaveAnnotations={onAnnotationSave}
            members={members}
            getMediaCurrentTime={mediaType === "video" ? () => mediaRef.current?.currentTime ?? 0 : undefined}
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
});

export default MediaPreview;

function BoundingBoxOverlay({
  boundingBox,
  containerWidth,
  containerHeight,
  label,
}: {
  boundingBox: [number, number, number, number];
  containerWidth: number;
  containerHeight: number;
  label?: string;
}) {
  const [yMin, xMin, yMax, xMax] = boundingBox;
  const left = (xMin / 1000) * containerWidth;
  const top = (yMin / 1000) * containerHeight;
  const width = ((xMax - xMin) / 1000) * containerWidth;
  const height = ((yMax - yMin) / 1000) * containerHeight;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        border: "2.5px solid #EF4444",
        borderRadius: "4px",
        backgroundColor: "rgba(239, 68, 68, 0.08)",
        zIndex: 20,
        transition: "all 0.3s ease",
      }}
    >
      {label && (
        <span
          className="absolute -top-5 left-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "#EF4444", color: "white" }}
        >
          {label}
        </span>
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

function renderHighlightAnnotation(ann: AnnotationData, containerWidth: number, containerHeight: number) {
  if (!ann.imagePosition) return null;
  const { x, y, width, height } = ann.imagePosition;
  const px = (x / 100) * containerWidth;
  const py = (y / 100) * containerHeight;
  const pw = (width / 100) * containerWidth;
  const ph = (height / 100) * containerHeight;
  const strokeColor = ann.color || "hsl(var(--primary))";
  const sw = Math.max(ann.strokeWidth || 2, 3);

  if (ann.type === "rect") {
    return <rect x={px} y={py} width={pw} height={ph} fill={`${strokeColor}20`} stroke={strokeColor} strokeWidth={sw} opacity={0.9} />;
  }
  if (ann.type === "ellipse") {
    return <ellipse cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2} ry={ph / 2} fill={`${strokeColor}20`} stroke={strokeColor} strokeWidth={sw} opacity={0.9} />;
  }
  if (ann.type === "arrow" && ann.points.length >= 2) {
    return <line x1={ann.points[0].x} y1={ann.points[0].y} x2={ann.points[1].x} y2={ann.points[1].y} stroke={strokeColor} strokeWidth={sw} opacity={0.9} />;
  }
  return <rect x={px} y={py} width={Math.max(pw, 10)} height={Math.max(ph, 10)} fill={`${strokeColor}20`} stroke={strokeColor} strokeWidth={sw} strokeDasharray="6 4" opacity={0.7} />;
}
