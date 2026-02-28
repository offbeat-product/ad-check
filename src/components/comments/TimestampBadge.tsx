import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimestampBadgeProps {
  seconds: number;
  onClick?: () => void;
  className?: string;
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TimestampBadge({ seconds, onClick, className }: TimestampBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono font-medium hover:bg-primary/20 transition-colors",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {formatTimestamp(seconds)}
    </button>
  );
}
