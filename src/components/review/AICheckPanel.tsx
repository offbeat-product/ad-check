import { useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getSubmitLabel, getSubmitBadgeClass, STATUS_LABEL, STATUS_FILTER_OPTIONS } from "@/lib/check-display";
import { cn } from "@/lib/utils";
import CheckItemCard from "./CheckItemCard";

interface AICheckPanelProps {
  items: CheckItem[];
  markers: CheckMarker[];
  productCode: string;
  commentCounts: Record<string, number>;
  highlightCard: string | null;
  onCommentClick: (patternId: string) => void;
  checkResultId?: string | null;
  onTabChange?: (tab: string) => void;
  overallStatus?: string | null;
}

export default function AICheckPanel({ items, markers, productCode, commentCounts, highlightCard, onCommentClick, checkResultId, onTabChange, overallStatus }: AICheckPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["NG", "WARNING"]));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleFilter = (key: string) => {
    setActiveFilters((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
        // If all removed, show all
        if (next.size === 0) {
          STATUS_FILTER_OPTIONS.forEach((o) => next.add(o.key));
        }
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAll = () => {
    setActiveFilters(new Set(STATUS_FILTER_OPTIONS.map((o) => o.key)));
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => activeFilters.has(item.status));
  }, [items, activeFilters]);

  // Counts per status
  const counts = useMemo(() => {
    const c: Record<string, number> = { NG: 0, WARNING: 0, OK: 0, MANUAL: 0 };
    items.forEach((item) => { c[item.status] = (c[item.status] || 0) + 1; });
    return c;
  }, [items]);

  const submit = getSubmitLabel(overallStatus);

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    setSelectedItems(new Set(filteredItems.filter((i) => i.status !== "OK" && !appliedItems.has(i.pattern_id)).map((i) => i.pattern_id)));
  };

  const handleApplyCorrections = async () => {
    if (!user || selectedItems.size === 0) return;
    setApplying(true);

    try {
      const patternIds = [...selectedItems];
      const { data: existing, error: fetchErr } = await supabase
        .from("correction_patterns")
        .select("id, rule_id, frequency")
        .eq("product_code", productCode)
        .in("rule_id", patternIds);

      if (fetchErr) {
        toast({ title: "エラー", description: fetchErr.message, variant: "destructive" });
        setApplying(false);
        return;
      }

      const existingMap = new Map((existing ?? []).map((e) => [e.rule_id, e]));

      const toUpdate: { id: string; frequency: number }[] = [];
      const toInsert: Array<{
        user_id: string; product_code: string; rule_id: string;
        rule_title: string; original_content: string; corrected_content: string; category: string;
      }> = [];

      for (const patternId of patternIds) {
        const item = items.find((i) => i.pattern_id === patternId);
        if (!item) continue;
        const ex = existingMap.get(patternId);
        if (ex) {
          toUpdate.push({ id: ex.id, frequency: (ex.frequency ?? 0) + 1 });
        } else {
          toInsert.push({
            user_id: user.id, product_code: productCode, rule_id: item.pattern_id,
            rule_title: item.item, original_content: item.detail,
            corrected_content: item.suggestion || "", category: item.severity,
          });
        }
      }

      const promises: Promise<unknown>[] = [];
      if (toInsert.length > 0) {
        promises.push((async () => {
          const { error } = await supabase.from("correction_patterns").insert(toInsert);
          if (error) console.error("[correction_patterns insert]", error.message);
        })());
      }
      for (const u of toUpdate) {
        promises.push((async () => {
          const { error } = await supabase.from("correction_patterns")
            .update({ frequency: u.frequency, updated_at: new Date().toISOString() }).eq("id", u.id);
          if (error) console.error("[correction_patterns update]", error.message);
        })());
      }

      if (checkResultId) {
        const commentInserts = patternIds.map((patternId) => {
          const item = items.find((i) => i.pattern_id === patternId);
          if (!item) return null;
          return {
            check_result_id: checkResultId, check_item_id: item.pattern_id,
            author_name: "AIチェック", author_email: user.email || "",
            content: `【${item.pattern_id}】${item.item}\n\n${item.detail}\n\n💡 修正案: ${item.suggestion || "なし"}`,
            status: "open" as const,
          };
        }).filter(Boolean);
        if (commentInserts.length > 0) {
          promises.push((async () => {
            const { error } = await supabase.from("comments").insert(commentInserts);
            if (error) console.error("[comments insert]", error.message);
          })());
        }
      }

      await Promise.all(promises);
      setAppliedItems((s) => { const next = new Set(s); patternIds.forEach((id) => next.add(id)); return next; });
      setResolvedItems((s) => { const next = new Set(s); patternIds.forEach((id) => next.add(id)); return next; });
      toast({ title: `✅ ${selectedItems.size}件の修正パターンを保存しました` });
      setSelectedItems(new Set());
      if (onTabChange) onTabChange("comments");
    } catch (err) {
      console.error("[handleApplyCorrections]", err);
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      {/* Summary bar */}
      <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("text-xs font-bold px-2.5 py-1", getSubmitBadgeClass(overallStatus))}>
            {submit.label}
          </Badge>
          <span className="text-[10px] text-status-ng font-bold">修正必須 {counts.NG}</span>
          <span className="text-[10px] text-status-warning font-bold">要確認 {counts.WARNING}</span>
          <span className="text-[10px] text-status-ok font-bold">問題なし {counts.OK}</span>
          {counts.MANUAL > 0 && <span className="text-[10px] text-status-manual font-bold">手動確認 {counts.MANUAL}</span>}
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilters.has(opt.key);
            const count = counts[opt.key] || 0;
            return (
              <button
                key={opt.key}
                onClick={() => toggleFilter(opt.key)}
                className={cn(
                  "text-[10px] font-medium px-2 py-1 rounded-full border transition-colors",
                  isActive ? opt.color : "bg-muted/30 text-muted-foreground/50 border-transparent"
                )}
              >
                {opt.label} ({count})
              </button>
            );
          })}
          <button onClick={showAll} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5">全て</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Non-OK items */}
        {filteredItems.filter((item) => item.status !== "OK").map((item, i) => {
          const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
          return (
            <CheckItemCard
              key={item.pattern_id}
              ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
              item={item}
              index={i}
              marker={marker}
              isResolved={resolvedItems.has(item.pattern_id)}
              isSelected={selectedItems.has(item.pattern_id)}
              isHighlighted={highlightCard === item.pattern_id}
              isApplied={appliedItems.has(item.pattern_id)}
              commentCount={commentCounts[item.pattern_id] || 0}
              productCode={productCode}
              onToggleSelect={() => toggleSelectItem(item.pattern_id)}
              onToggleResolved={() => setResolvedItems((s) => { const next = new Set(s); next.has(item.pattern_id) ? next.delete(item.pattern_id) : next.add(item.pattern_id); return next; })}
              onCommentClick={() => onCommentClick(item.pattern_id)}
            />
          );
        })}

        {/* OK items - collapsed by default */}
        {(() => {
          const okItems = filteredItems.filter((item) => item.status === "OK");
          if (okItems.length === 0) return null;
          return (
            <OkItemsSection
              okItems={okItems}
              markers={markers}
              resolvedItems={resolvedItems}
              selectedItems={selectedItems}
              highlightCard={highlightCard}
              appliedItems={appliedItems}
              commentCounts={commentCounts}
              productCode={productCode}
              cardRefs={cardRefs}
              onToggleSelect={toggleSelectItem}
              onToggleResolved={(id) => setResolvedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              onCommentClick={onCommentClick}
            />
          );
        })()}

        {filteredItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">該当する項目がありません</p>
        )}
      </div>

      {/* Bottom sticky action bar */}
      <div className="sticky bottom-0 shrink-0 border-t border-border p-3 space-y-2 bg-card z-10">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{selectedItems.size}件選択済み</span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-primary hover:underline text-xs">全て選択</button>
            <button onClick={() => setSelectedItems(new Set())} className="text-muted-foreground hover:underline text-xs">クリア</button>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full text-xs bg-status-warning text-black hover:bg-status-warning/90"
          disabled={selectedItems.size === 0 || applying}
          onClick={handleApplyCorrections}
        >
          {applying ? "保存中..." : `チェックしたコメントを反映 (${selectedItems.size})`}
        </Button>
      </div>
    </>
  );
}

/* Collapsible section for OK items */
function OkItemsSection({ okItems, markers, resolvedItems, selectedItems, highlightCard, appliedItems, commentCounts, productCode, cardRefs, onToggleSelect, onToggleResolved, onCommentClick }: {
  okItems: CheckItem[];
  markers: import("@/lib/marker-positions").CheckMarker[];
  resolvedItems: Set<string>;
  selectedItems: Set<string>;
  highlightCard: string | null;
  appliedItems: Set<string>;
  commentCounts: Record<string, number>;
  productCode: string;
  cardRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onToggleSelect: (id: string) => void;
  onToggleResolved: (id: string) => void;
  onCommentClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        <span className={cn("transition-transform", open && "rotate-90")}>▶</span>
        <span>問題なし ({okItems.length}件)</span>
      </button>
      {open && okItems.map((item, i) => {
        const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
        return (
          <CheckItemCard
            key={item.pattern_id}
            ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
            item={item}
            index={i}
            marker={marker}
            isResolved={resolvedItems.has(item.pattern_id)}
            isSelected={selectedItems.has(item.pattern_id)}
            isHighlighted={highlightCard === item.pattern_id}
            isApplied={appliedItems.has(item.pattern_id)}
            commentCount={commentCounts[item.pattern_id] || 0}
            productCode={productCode}
            onToggleSelect={() => onToggleSelect(item.pattern_id)}
            onToggleResolved={() => onToggleResolved(item.pattern_id)}
            onCommentClick={() => onCommentClick(item.pattern_id)}
          />
        );
      })}
    </div>
  );
}
