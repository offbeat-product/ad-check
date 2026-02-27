import { cn } from "@/lib/utils";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";

interface ScriptDisplayProps {
  text: string;
  items: CheckItem[];
  markers: CheckMarker[];
  onItemClick: (id: string) => void;
}

/**
 * Build inline redline segments for a line.
 * If the matched item has both original_text and suggestion, replace the
 * first occurrence of original_text inside the line with strikethrough + red text.
 */
function buildRedlineSegments(
  line: string,
  match: CheckItem | null
): { text: string; type: "normal" | "strike" | "correction" }[] {
  if (!match?.original_text || !match?.suggestion) {
    return [{ text: line || "\u00A0", type: "normal" }];
  }

  const orig = match.original_text;
  const idx = line.indexOf(orig);
  if (idx === -1) {
    // original_text not found in line – show suggestion appended
    return [
      { text: line, type: "normal" },
      { text: ` → ${match.suggestion}`, type: "correction" },
    ];
  }

  const segments: { text: string; type: "normal" | "strike" | "correction" }[] = [];
  if (idx > 0) segments.push({ text: line.slice(0, idx), type: "normal" });
  segments.push({ text: orig, type: "strike" });
  segments.push({ text: match.suggestion, type: "correction" });
  const after = line.slice(idx + orig.length);
  if (after) segments.push({ text: after, type: "normal" });
  return segments;
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

        const segments = buildRedlineSegments(line, match ?? null);
        const hasRedline = segments.some((s) => s.type !== "normal");

        return (
          <div
            key={i}
            className={cn(
              "px-3 py-1.5 rounded-md flex items-start gap-2",
              ngMatch && "bg-destructive/5 border-l-2 border-status-ng cursor-pointer hover:bg-destructive/10",
              warnMatch && "bg-status-warning/5 border-l-2 border-status-warning cursor-pointer hover:bg-status-warning/10",
              !match && "text-foreground/80"
            )}
            onClick={() => match && onItemClick(match.pattern_id)}
          >
            {marker && (
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5",
                match?.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
              )}>
                {marker.number}
              </span>
            )}
            <span className="flex-1 flex-wrap">
              {hasRedline
                ? segments.map((seg, j) => {
                    if (seg.type === "strike") {
                      return (
                        <span
                          key={j}
                          className="line-through text-muted-foreground/60 decoration-status-ng decoration-2"
                        >
                          {seg.text}
                        </span>
                      );
                    }
                    if (seg.type === "correction") {
                      return (
                        <span key={j} className="text-status-ng font-bold">
                          {seg.text}
                        </span>
                      );
                    }
                    return <span key={j}>{seg.text}</span>;
                  })
                : (line || "\u00A0")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
