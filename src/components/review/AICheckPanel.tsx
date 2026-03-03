import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getSubmitLabel, getSubmitBadgeClass, STATUS_LABEL, STATUS_FILTER_OPTIONS, getEffectiveSubmitLabel, getCheckItemId } from "@/lib/check-display";
import { cn } from "@/lib/utils";
import CheckItemCard from "./CheckItemCard";
import ReferenceStatusIndicator from "@/components/reference/ReferenceStatusIndicator";
import { CalendarDays } from "lucide-react";

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
  checkedAt?: string | null;
  productId?: string;
  projectId?: string;
  processKey?: string;
  onSeekMedia?: (seconds: number) => void;
  onMarkerClick?: (patternId: string) => void;
}

export default function AICheckPanel({ items, markers, productCode, commentCounts, highlightCard, onCommentClick, checkResultId, onTabChange, overallStatus, checkedAt, productId, projectId, processKey, onSeekMedia, onMarkerClick }: AICheckPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["NG", "WARNING"]));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load persisted resolved_items from DB
  useEffect(() => {
    if (!checkResultId) return;
    let cancelled = false;
    supabase.from("check_results").select("resolved_items").eq("id", checkResultId).maybeSingle().then(({ data }) => {
      if (cancelled || !data?.resolved_items) return;
      const ids = Array.isArray(data.resolved_items) ? data.resolved_items as string[] : [];
      if (ids.length > 0) setResolvedItems(new Set(ids));
    });
    return () => { cancelled = true; };
  }, [checkResultId]);

  // Persist resolved_items to DB when changed
  const persistResolved = useCallback(async (newSet: Set<string>) => {
    if (!checkResultId) return;
    await supabase.from("check_results").update({ resolved_items: [...newSet] }).eq("id", checkResultId);
  }, [checkResultId]);

  const toggleResolved = useCallback((patternId: string) => {
    setResolvedItems((s) => {
      const next = new Set(s);
      next.has(patternId) ? next.delete(patternId) : next.add(patternId);
      persistResolved(next);
      return next;
    });
  }, [persistResolved]);

  const toggleFilter = (key: string) => {
    setActiveFilters((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
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

  // Dynamic GO/NG using effective label
  const effectiveSubmit = useMemo(() => {
    return getEffectiveSubmitLabel(overallStatus, items, [...resolvedItems]);
  }, [overallStatus, items, resolvedItems]);

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    setSelectedItems(new Set(filteredItems.filter((i) => i.status !== "OK" && !appliedItems.has(getCheckItemId(i))).map((i) => getCheckItemId(i))));
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
      setResolvedItems((s) => { const next = new Set(s); patternIds.forEach((id) => next.add(id)); persistResolved(next); return next; });
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
    <div className="flex flex-col h-full min-h-0">
      {/* Summary bar */}
      <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
        {productId && projectId && (
          <ReferenceStatusIndicator projectId={projectId} productId={productId} processKey={processKey} />
        )}
        {checkedAt && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            <span>チェック実行日時: {format(new Date(checkedAt), "yyyy/MM/dd HH:mm")}</span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("text-xs font-bold px-2.5 py-1", effectiveSubmit.isOk ? "bg-status-ok text-white border-status-ok" : "bg-status-ng text-white border-status-ng")}>
            {effectiveSubmit.label}
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

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Non-OK items */}
        {filteredItems.filter((item) => item.status !== "OK").map((item, i) => {
          const itemId = getCheckItemId(item);
          const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
          return (
            <CheckItemCard
              key={itemId}
              ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
              item={item}
              index={i}
              marker={marker}
              isResolved={resolvedItems.has(itemId)}
              isSelected={selectedItems.has(itemId)}
              isHighlighted={highlightCard === item.pattern_id}
              isApplied={appliedItems.has(itemId)}
              commentCount={commentCounts[item.pattern_id] || 0}
              productCode={productCode}
              onToggleSelect={() => toggleSelectItem(itemId)}
              onToggleResolved={() => toggleResolved(itemId)}
              onCommentClick={() => onCommentClick(item.pattern_id)}
              onSeekMedia={onSeekMedia}
              onMarkerClick={onMarkerClick}
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
              onToggleResolved={(id) => toggleResolved(id)}
              onCommentClick={onCommentClick}
              onSeekMedia={onSeekMedia}
              onMarkerClick={onMarkerClick}
            />
          );
        })()}

        {filteredItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">該当する項目がありません</p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border p-3 space-y-2 bg-card">
        {/* Bulk resolve all NG items */}
        {(() => {
          const unresolvedNg = items.filter(i => i.status === "NG" && !resolvedItems.has(getCheckItemId(i)));
          return unresolvedNg.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1 border-status-ng/30 text-status-ng hover:bg-status-ng/10"
              onClick={() => {
                const next = new Set(resolvedItems);
                unresolvedNg.forEach(i => next.add(getCheckItemId(i)));
                setResolvedItems(next);
                persistResolved(next);
              }}
            >
              NG項目を一括で修正済みにする ({unresolvedNg.length})
            </Button>
          ) : null;
        })()}

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
    </div>
  );
}

/* Collapsible section for OK items */
function OkItemsSection({ okItems, markers, resolvedItems, selectedItems, highlightCard, appliedItems, commentCounts, productCode, cardRefs, onToggleSelect, onToggleResolved, onCommentClick, onSeekMedia, onMarkerClick }: {
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
  onSeekMedia?: (seconds: number) => void;
  onMarkerClick?: (patternId: string) => void;
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
        const itemId = getCheckItemId(item);
        const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
        return (
          <CheckItemCard
            key={itemId}
            ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
            item={item}
            index={i}
            marker={marker}
            isResolved={resolvedItems.has(itemId)}
            isSelected={selectedItems.has(itemId)}
            isHighlighted={highlightCard === item.pattern_id}
            isApplied={appliedItems.has(itemId)}
            commentCount={commentCounts[item.pattern_id] || 0}
            productCode={productCode}
            onToggleSelect={() => onToggleSelect(itemId)}
            onToggleResolved={() => onToggleResolved(itemId)}
              onCommentClick={() => onCommentClick(item.pattern_id)}
              onSeekMedia={onSeekMedia}
              onMarkerClick={onMarkerClick}
          />
        );
      })}
    </div>
  );
}
