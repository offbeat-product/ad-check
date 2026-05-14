import { cn } from "@/lib/utils";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { checkItemStr } from "@/lib/check-display";
import { useMemo } from "react";

interface ScriptDisplayProps {
  text: string;
  items: CheckItem[];
  markers: CheckMarker[];
  onItemClick: (id: string) => void;
}

interface InlineHighlight {
  start: number;
  end: number;
  marker: CheckMarker;
  status: "NG" | "WARNING";
}

/**
 * Extract quoted phrases from detail/item text that might appear in the script.
 * Looks for 「…」 quotes, "…" quotes, and key phrases.
 */
function extractPhrases(item: CheckItem): string[] {
  const phrases: string[] = [];
  const sources = [item.detail, item.item, item.suggestion];

  for (const src of sources) {
    const s = checkItemStr(src);
    if (!s) continue;
    // Japanese quotes 「…」
    const jpQuotes = s.match(/「([^」]+)」/g);
    if (jpQuotes) {
      jpQuotes.forEach((q) => {
        const inner = q.slice(1, -1);
        if (inner.length >= 2) phrases.push(inner);
      });
    }
    // Double quotes "…"
    const dblQuotes = s.match(/"([^"]+)"/g);
    if (dblQuotes) {
      dblQuotes.forEach((q) => {
        const inner = q.slice(1, -1);
        if (inner.length >= 2) phrases.push(inner);
      });
    }
  }

  // Deduplicate and sort longest first for greedy matching
  return [...new Set(phrases)].sort((a, b) => b.length - a.length);
}

/**
 * For a given line, find all inline highlights from check items.
 */
function findInlineHighlights(
  line: string,
  ngMarkers: { item: CheckItem; marker: CheckMarker }[],
  warnMarkers: { item: CheckItem; marker: CheckMarker }[]
): InlineHighlight[] {
  const highlights: InlineHighlight[] = [];
  const used = new Set<string>(); // track occupied ranges

  const allEntries = [
    ...ngMarkers.map((m) => ({ ...m, status: "NG" as const })),
    ...warnMarkers.map((m) => ({ ...m, status: "WARNING" as const })),
  ];

  for (const entry of allEntries) {
    const phrases = extractPhrases(entry.item);
    for (const phrase of phrases) {
      const idx = line.indexOf(phrase);
      if (idx === -1) continue;
      const rangeKey = `${idx}-${idx + phrase.length}`;
      // Check overlap
      let overlaps = false;
      for (const h of highlights) {
        if (idx < h.end && idx + phrase.length > h.start) { overlaps = true; break; }
      }
      if (overlaps) continue;
      highlights.push({ start: idx, end: idx + phrase.length, marker: entry.marker, status: entry.status });
      break; // one highlight per item per line
    }
  }

  return highlights.sort((a, b) => a.start - b.start);
}

const sectionKeywords = ["冒頭", "前半", "中盤", "後半", "締め"];

export default function ScriptDisplay({ text, items, markers, onItemClick }: ScriptDisplayProps) {
  const ngItems = items.filter((i) => i.status === "NG");
  const warnItems = items.filter((i) => i.status === "WARNING");
  const lines = text.split("\n");

  // Build marker lookup
  const markerMap = useMemo(() => {
    const map = new Map<string, CheckMarker>();
    markers.forEach((m) => map.set(m.item.pattern_id, m));
    return map;
  }, [markers]);

  const ngWithMarkers = ngItems.map((item) => ({ item, marker: markerMap.get(item.pattern_id)! })).filter((e) => e.marker);
  const warnWithMarkers = warnItems.map((item) => ({ item, marker: markerMap.get(item.pattern_id)! })).filter((e) => e.marker);

  return (
    <div className="space-y-0.5 font-mono text-sm border border-border rounded-lg p-3 bg-card">
      {lines.map((line, i) => {
        // Section-level matching (existing logic)
        const ngMatch = ngItems.find((n) => {
          const locRaw = checkItemStr(n.location);
          if (!locRaw) return false;
          const loc = locRaw.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        });
        const warnMatch = !ngMatch ? warnItems.find((w) => {
          const locRaw = checkItemStr(w.location);
          if (!locRaw) return false;
          const loc = locRaw.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        }) : null;
        const sectionMatch = ngMatch || warnMatch;
        const sectionMarker = sectionMatch ? markerMap.get(sectionMatch.pattern_id) : null;

        // Inline phrase highlighting
        const inlineHighlights = findInlineHighlights(line, ngWithMarkers, warnWithMarkers);
        const hasInline = inlineHighlights.length > 0;

        // Determine line-level styling
        const hasIssue = sectionMatch || hasInline;
        const isNG = !!ngMatch || inlineHighlights.some((h) => h.status === "NG");

        // Collect all pattern IDs matched to this line for data attribute
        const linePatternIds = [
          ...(sectionMatch ? [sectionMatch.pattern_id] : []),
          ...inlineHighlights.map((h) => h.marker.item.pattern_id),
        ];

        return (
          <div
            key={i}
            data-pattern-id={linePatternIds[0] || undefined}
            className={cn(
              "px-3 py-1.5 rounded-md flex items-start gap-2 leading-relaxed transition-all",
              hasIssue && isNG && "bg-destructive/5 border-l-2 border-status-ng",
              hasIssue && !isNG && "bg-status-warning/5 border-l-2 border-status-warning",
              !hasIssue && "text-foreground/80"
            )}
          >
            {/* Section-level marker badge */}
            {sectionMarker && !hasInline && (
              <span
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 cursor-pointer mt-0.5",
                  sectionMatch?.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
                )}
                onClick={() => sectionMatch && onItemClick(sectionMatch.pattern_id)}
              >
                {sectionMarker.number}
              </span>
            )}
            {/* Render line with inline highlights */}
            {hasInline ? (
              <span className="flex-1 flex flex-wrap items-center gap-0">
                {renderHighlightedLine(line, inlineHighlights, onItemClick)}
              </span>
            ) : (
              <span
                className={cn(hasIssue && "cursor-pointer")}
                onClick={() => sectionMatch && onItemClick(sectionMatch.pattern_id)}
              >
                {line || "\u00A0"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderHighlightedLine(
  line: string,
  highlights: InlineHighlight[],
  onItemClick: (id: string) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const hl of highlights) {
    // Text before this highlight
    if (hl.start > cursor) {
      parts.push(<span key={`t-${cursor}`}>{line.slice(cursor, hl.start)}</span>);
    }
    // Highlighted segment
    const isNG = hl.status === "NG";
    parts.push(
      <span
        key={`h-${hl.start}`}
        className={cn(
          "inline-flex items-center gap-0.5 cursor-pointer rounded-sm px-0.5 transition-colors",
          isNG
            ? "bg-status-ng/20 border-b-2 border-status-ng text-foreground hover:bg-status-ng/30"
            : "bg-status-warning/20 border-b-2 border-status-warning text-foreground hover:bg-status-warning/30"
        )}
        onClick={() => onItemClick(hl.marker.item.pattern_id)}
      >
        <span
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0",
            isNG ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
          )}
        >
          {hl.marker.number}
        </span>
        <span className={cn("font-semibold", isNG ? "text-status-ng" : "text-status-warning")}>
          {line.slice(hl.start, hl.end)}
        </span>
      </span>
    );
    cursor = hl.end;
  }

  // Remaining text
  if (cursor < line.length) {
    parts.push(<span key={`t-${cursor}`}>{line.slice(cursor)}</span>);
  }

  return parts;
}
