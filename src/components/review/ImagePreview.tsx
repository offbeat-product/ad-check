import { useCallback, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import type { MentionMember } from "@/components/comments/MentionInput";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckMarker } from "@/lib/marker-positions";

interface AnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

interface ImagePreviewProps {
  imageSrc: string | null | undefined;
  markers: CheckMarker[];
  paintMode: boolean;
  onPaintModeToggle: () => void;
  onMarkerClick: (patternId: string) => void;
  onAnnotationSave?: (annotations: unknown[], comment: string, mentionedUserIds?: string[], isCorrection?: boolean) => void;
  label?: string;
  noDataMessage?: string;
  overlay?: React.ReactNode;
  savedAnnotations?: AnnotationData[];
  highlightAnnotation?: AnnotationData | null;
  members?: MentionMember[];
}

export default function ImagePreview({
  imageSrc, markers, paintMode, onPaintModeToggle, onMarkerClick, onAnnotationSave,
  label, noDataMessage, overlay, savedAnnotations, highlightAnnotation, members,
}: ImagePreviewProps) {
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        <Button size="sm" variant={paintMode ? "default" : "outline"} onClick={onPaintModeToggle} className="text-xs h-7">
          <Pin className="h-3 w-3 mr-1" />
          ペイントモード
        </Button>
      </div>
      <div ref={imageContainerRef} className={cn("relative rounded-lg border border-border bg-muted/30", paintMode ? "overflow-visible mb-16" : "overflow-hidden")}>
        {imageSrc ? (
          <img src={imageSrc} alt="Preview" className="w-full" onLoad={handleImageLoad} />
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
            {noDataMessage || "プレビューなし"}
          </div>
        )}

        {/* Auto-generated check markers - z-30 to be above canvas */}
        <TooltipProvider>
          {markers.map((m) => (
            <Tooltip key={m.item.pattern_id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-130 z-30",
                    m.item.status === "NG" ? "check-marker-ng" : "check-marker-warning",
                    paintMode && "opacity-40 pointer-events-none"
                  )}
                  style={{ left: `${m.position.x}%`, top: `${m.position.y}%` }}
                  onClick={(e) => { e.stopPropagation(); onMarkerClick(m.item.pattern_id); }}
                >
                  {m.number}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px] z-50">
                <span className="font-bold">{m.item.pattern_id}</span>: {m.item.item}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        {/* Saved annotation overlays (from comments) - only visible in paint mode */}
        {paintMode && savedAnnotations && savedAnnotations.length > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]" viewBox={`0 0 ${imageSize.width || 800} ${imageSize.height || 400}`} preserveAspectRatio="none">
            {savedAnnotations.map((ann, i) => (
              <SavedAnnotationSvg key={i} ann={ann} containerWidth={imageSize.width || 800} containerHeight={imageSize.height || 400} />
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

        <AnnotationCanvas active={paintMode} width={imageSize.width || 800} height={imageSize.height || 400} onSaveAnnotations={onAnnotationSave} members={members} />

        {overlay}
      </div>
    </div>
  );
}

function SavedAnnotationSvg({ ann, containerWidth, containerHeight }: { ann: AnnotationData; containerWidth: number; containerHeight: number }) {
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
  // Fallback: draw a rect around imagePosition
  return <rect x={px} y={py} width={Math.max(pw, 10)} height={Math.max(ph, 10)} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth} strokeDasharray="6 4" opacity={0.5} />;
}
