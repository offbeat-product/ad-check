import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import type { MentionMember } from "@/components/comments/MentionInput";
import { ExternalLink, FileText, Pin, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommentAnnotationData } from "@/lib/comment-annotations";
import type { CheckMarker } from "@/lib/marker-positions";
import { checkItemStr } from "@/lib/check-display";

/** 表示サイズ段階。scale=null は従来どおりパネル幅いっぱい表示 */
const SIZE_LEVELS: { label: string; scale: number | null }[] = [
  { label: "小", scale: 0.55 },
  { label: "中", scale: 0.75 },
  { label: "大", scale: 1 },
  { label: "幅いっぱい", scale: null },
];
const DEFAULT_SIZE_LEVEL = 2;
const SIZE_LEVEL_STORAGE_KEY = "adcheck.imagePreview.sizeLevel";

function readStoredSizeLevel() {
  try {
    const stored = Number(localStorage.getItem(SIZE_LEVEL_STORAGE_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < SIZE_LEVELS.length ? stored : DEFAULT_SIZE_LEVEL;
  } catch {
    return DEFAULT_SIZE_LEVEL;
  }
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
  savedAnnotations?: CommentAnnotationData[];
  members?: MentionMember[];
}

export default function ImagePreview({
  imageSrc, markers, paintMode, onPaintModeToggle, onMarkerClick, onAnnotationSave,
  label, noDataMessage, overlay, savedAnnotations, members,
}: ImagePreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [availableWidth, setAvailableWidth] = useState(0);
  const [sizeLevel, setSizeLevel] = useState(readStoredSizeLevel);
  const canRenderImage =
    !!imageSrc &&
    (imageSrc.startsWith("data:image") || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(imageSrc));

  const scale = SIZE_LEVELS[sizeLevel]?.scale ?? null;
  const isScaled = canRenderImage && scale !== null;

  const changeSizeLevel = useCallback((next: number) => {
    setSizeLevel(next);
    try {
      localStorage.setItem(SIZE_LEVEL_STORAGE_KEY, String(next));
    } catch {
      // ストレージ不可でも表示自体は継続する
    }
  }, []);

  const measureImage = useCallback(() => {
    const el = imageRef.current;
    if (!el) return;
    setImageSize((prev) =>
      prev.width === el.clientWidth && prev.height === el.clientHeight
        ? prev
        : { width: el.clientWidth, height: el.clientHeight }
    );
  }, []);

  // 表示サイズはウィンドウ幅・サイズ切替で変わるため、マーカー座標系を追従させる
  useEffect(() => {
    const el = imageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureImage);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureImage, canRenderImage, imageSrc]);

  // 画像の最大幅は「枠の実寸 × 倍率」で決める（％指定だと枠が画像に追従せずマーカーがずれる）
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => setAvailableWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="relative text-center">
      <div className="flex items-center gap-2 mb-2 text-left">
        {label ? <span className="text-xs text-muted-foreground truncate">{label}</span> : null}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {canRenderImage ? (
            <div className="flex items-center rounded-md border border-border h-7">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => changeSizeLevel(sizeLevel - 1)}
                disabled={sizeLevel === 0}
                className="h-full px-1.5 rounded-r-none"
                aria-label="表示を小さく"
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <span className="px-1.5 text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                {SIZE_LEVELS[sizeLevel].label}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => changeSizeLevel(sizeLevel + 1)}
                disabled={sizeLevel === SIZE_LEVELS.length - 1}
                className="h-full px-1.5 rounded-l-none"
                aria-label="表示を大きく"
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
            </div>
          ) : null}
          <Button size="sm" variant={paintMode ? "default" : "outline"} onClick={onPaintModeToggle} className="text-xs h-7">
            <Pin className="h-3 w-3 mr-1" />
            ペイントモード
          </Button>
        </div>
      </div>
      <div
        ref={imageContainerRef}
        className={cn(
          "relative align-top text-left rounded-lg border border-border bg-muted/30",
          isScaled ? "inline-block max-w-full" : "block",
          paintMode ? "overflow-visible mb-16" : "overflow-hidden"
        )}
      >
        {canRenderImage ? (
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Preview"
            className={cn("block max-w-full", isScaled ? "w-auto" : "w-full")}
            style={
              isScaled
                ? {
                    maxWidth: availableWidth ? `${Math.floor(availableWidth * scale)}px` : undefined,
                    maxHeight: `calc((100vh - 13rem) * ${scale})`,
                  }
                : undefined
            }
            onLoad={measureImage}
          />
        ) : imageSrc ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm px-4 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <span>このファイルはプレビューできません。ファイルを開いて確認してください。</span>
            <a
              href={imageSrc}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              ファイルを開く
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
            {noDataMessage || "プレビューなし"}
          </div>
        )}

        {/* Auto-generated check markers - z-30 to be above canvas */}
        <TooltipProvider>
          {markers.map((m) => (
            <Tooltip key={`${checkItemStr(m.item.pattern_id)}-${m.number}`}>
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
                <span className="font-bold">{checkItemStr(m.item.pattern_id) || "—"}</span>: {checkItemStr(m.item.item) || "—"}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        {savedAnnotations && savedAnnotations.length > 0 ? <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]" viewBox={`0 0 ${imageSize.width || 800} ${imageSize.height || 400}`} preserveAspectRatio="none">
            {savedAnnotations.map((ann, i) => (
              <SavedAnnotationSvg key={i} ann={ann} containerWidth={imageSize.width || 800} containerHeight={imageSize.height || 400} />
            ))}
          </svg> : null}

        <AnnotationCanvas active={paintMode} width={imageSize.width || 800} height={imageSize.height || 400} onSaveAnnotations={onAnnotationSave} members={members} />

        {overlay}
      </div>
    </div>
  );
}

function SavedAnnotationSvg({ ann, containerWidth, containerHeight }: { ann: CommentAnnotationData; containerWidth: number; containerHeight: number }) {
  if (!ann.imagePosition) return null;
  const { x, y, width, height } = ann.imagePosition;
  const px = (x / 100) * containerWidth;
  const py = (y / 100) * containerHeight;
  const pw = (width / 100) * containerWidth;
  const ph = (height / 100) * containerHeight;
  const strokeColor = ann.color || "#ef4444";
  const sw = ann.strokeWidth;
  const op = 0.7;

  if (ann.type === "rect") {
    return <rect x={px} y={py} width={pw} height={ph} fill="none" stroke={strokeColor} strokeWidth={sw} opacity={op} />;
  }
  if (ann.type === "ellipse") {
    return <ellipse cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2} ry={ph / 2} fill="none" stroke={strokeColor} strokeWidth={sw} opacity={op} />;
  }
  if (ann.type === "arrow" && ann.points.length >= 2) {
    return <line x1={ann.points[0].x} y1={ann.points[0].y} x2={ann.points[1].x} y2={ann.points[1].y} stroke={strokeColor} strokeWidth={sw} opacity={op} />;
  }
  return <rect x={px} y={py} width={Math.max(pw, 10)} height={Math.max(ph, 10)} fill="none" stroke={strokeColor} strokeWidth={sw} strokeDasharray="6 4" opacity={0.5} />;
}
