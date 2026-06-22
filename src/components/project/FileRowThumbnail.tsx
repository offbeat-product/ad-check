import { Film, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileRowThumbnailProps {
  fileType: string | null | undefined;
  processKey: string;
  thumbnailData: string | null | undefined;
  className?: string;
}

export function FileRowThumbnail({ fileType, processKey, thumbnailData, className }: FileRowThumbnailProps) {
  const isImageFile = fileType === "image";
  const isVideoProcess = fileType === "video" || processKey.includes("video") || processKey === "vcon";
  const isAudioProcess = fileType === "audio" || processKey === "na_narration" || processKey === "bgm";
  const isScriptProcess = processKey.includes("script") || processKey === "na_script";
  const canRenderImageByUrl =
    !!thumbnailData &&
    (thumbnailData.startsWith("data:image") || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(thumbnailData));

  return (
    <div className={cn("h-16 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden", className)}>
      {isImageFile && canRenderImageByUrl ? (
        <img src={thumbnailData} alt="" className="w-full h-full object-cover" />
      ) : isVideoProcess && thumbnailData ? (
        <video src={thumbnailData} className="w-full h-full object-cover" muted preload="metadata" />
      ) : isVideoProcess ? (
        <Film className="h-8 w-8 text-muted-foreground/30" />
      ) : isAudioProcess ? (
        <FileText className="h-8 w-8 text-muted-foreground/30" />
      ) : isScriptProcess ? (
        <FileText className="h-8 w-8 text-muted-foreground/30" />
      ) : canRenderImageByUrl ? (
        <img src={thumbnailData || ""} alt="" className="w-full h-full object-cover" />
      ) : (
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      )}
    </div>
  );
}
