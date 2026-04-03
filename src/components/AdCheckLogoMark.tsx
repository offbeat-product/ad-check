import { CircleCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdCheckLogoMarkSize = "sm" | "md" | "lg";

/** lucide のデフォルト 24 に対するピクセルサイズ（md はサイドバー展開時と揃える） */
const pixelSize: Record<AdCheckLogoMarkSize, number> = {
  sm: 22,
  md: 28,
  lg: 36,
};

interface AdCheckLogoMarkProps {
  size?: AdCheckLogoMarkSize;
  className?: string;
  iconClassName?: string;
}

/**
 * 広告クリエイティブのAI検品（品質チェック）を表すロゴマーク。
 */
export function AdCheckLogoMark({ size = "md", className, iconClassName }: AdCheckLogoMarkProps) {
  return (
    <CircleCheckBig
      size={pixelSize[size]}
      className={cn("shrink-0 text-primary", iconClassName, className)}
      strokeWidth={2.5}
      aria-hidden
    />
  );
}
