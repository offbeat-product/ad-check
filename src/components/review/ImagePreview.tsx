import { useCallback, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckMarker } from "@/lib/marker-positions";

interface ImagePreviewProps {
  imageSrc: string | null | undefined;
  markers: CheckMarker[];
  paintMode: boolean;
  onPaintModeToggle: () => void;
  onMarkerClick: (patternId: string) => void;
  onAnnotationSave?: (annotations: any[], comment: string) => void;
  label?: string;
  noDataMessage?: string;
  overlay?: React.ReactNode;
}

export default function ImagePreview({
  imageSrc, markers, paintMode, onPaintModeToggle, onMarkerClick, onAnnotationSave, label, noDataMessage, overlay,
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
      <div ref={imageContainerRef} className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
        {imageSrc ? (
          <img src={imageSrc} alt="Preview" className="w-full" onLoad={handleImageLoad} />
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
            {noDataMessage || "プレビューなし"}
          </div>
        )}

        {/* Auto-generated check markers */}
        <TooltipProvider>
          {markers.map((m) => (
            <Tooltip key={m.item.pattern_id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-125 z-10",
                    m.item.status === "NG" ? "check-marker-ng" : "check-marker-warning",
                    paintMode && "opacity-40"
                  )}
                  style={{ left: `${m.position.x}%`, top: `${m.position.y}%` }}
                  onClick={(e) => { e.stopPropagation(); onMarkerClick(m.item.pattern_id); }}
                >
                  {m.number}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                <span className="font-bold">{m.item.pattern_id}</span>: {m.item.item}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>

        <AnnotationCanvas active={paintMode} width={imageSize.width || 800} height={imageSize.height || 400} onSaveAnnotations={onAnnotationSave} />

        {overlay}
      </div>
    </div>
  );
}
