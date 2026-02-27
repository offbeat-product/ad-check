import { cn } from "@/lib/utils";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Pencil } from "lucide-react";

interface ScriptDisplayProps {
  text: string;
  items: CheckItem[];
  markers: CheckMarker[];
  onItemClick: (id: string) => void;
}

export default function ScriptDisplay({ text, items, markers, onItemClick }: ScriptDisplayProps) {
  const sectionKeywords = ["冒頭", "前半", "中盤", "後半", "締め"];
  const ngItems = items.filter((i) => i.status === "NG" && i.location);
  const warnItems = items.filter((i) => i.status === "WARNING" && i.location);
  const lines = text.split("\n");

  return (
    <div className="space-y-1 font-mono text-sm border border-border rounded-lg p-3 bg-card">
      {lines.map((line, i) => {
        const ngMatch = ngItems.find((n) => {
          const loc = n.location!.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        });
        const warnMatch = !ngMatch ? warnItems.find((w) => {
          const loc = w.location!.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        }) : null;
        const match = ngMatch || warnMatch;
        const marker = match ? markers.find((m) => m.item.pattern_id === match.pattern_id) : null;

        return (
          <div key={i} className="group">
            <div
              className={cn(
                "px-3 py-1.5 rounded-md flex items-center gap-2",
                ngMatch && "bg-destructive/5 border-l-2 border-status-ng cursor-pointer hover:bg-destructive/10",
                warnMatch && "bg-status-warning/5 border-l-2 border-status-warning cursor-pointer hover:bg-status-warning/10",
                !match && "text-foreground/80"
              )}
              onClick={() => match && onItemClick(match.pattern_id)}
            >
              {marker && (
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
                  match?.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
                )}>
                  {marker.number}
                </span>
              )}
              <span>{line || "\u00A0"}</span>
            </div>
            {/* Inline red correction for NG/WARNING items with suggestions */}
            {match?.suggestion && (
              <div
                className={cn(
                  "ml-8 pl-3 py-1.5 flex items-start gap-1.5 rounded-md text-xs cursor-pointer",
                  match.status === "NG"
                    ? "border-l-2 border-status-ng/50 bg-status-ng/5"
                    : "border-l-2 border-status-warning/50 bg-status-warning/5"
                )}
                onClick={() => onItemClick(match.pattern_id)}
              >
                <Pencil className="h-3 w-3 text-status-ng shrink-0 mt-0.5" />
                <span className="text-status-ng font-bold whitespace-pre-wrap">
                  修正 → {match.suggestion}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
