import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCheckFeedback } from "@/hooks/useCheckFeedback";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getSubmitLabel, getSubmitBadgeClass, STATUS_LABEL, STATUS_FILTER_OPTIONS, getEffectiveSubmitLabel, getCheckItemId, checkItemStr } from "@/lib/check-display";
import { cn } from "@/lib/utils";
import CheckItemCard from "./CheckItemCard";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import ReferenceStatusIndicator from "@/components/reference/ReferenceStatusIndicator";


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
  onActiveCheckItemChange?: (item: CheckItem | null) => void;
}

export default function AICheckPanel({ items, markers, productCode, commentCounts, highlightCard, onCommentClick, checkResultId, onTabChange, overallStatus, checkedAt, productId, projectId, processKey, onSeekMedia, onMarkerClick, onActiveCheckItemChange }: AICheckPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { itemHasFeedback, submitFalsePositive, feedbackEligible } = useCheckFeedback({
    checkResultId: checkResultId ?? null,
    productId,
    projectId,
    processType: processKey,
  });
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["NG", "WARNING"]));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Store the original NG status (C/D) before any resolved-based overrides
  const originalStatusRef = useRef<string | null>(null);
  if (overallStatus && (overallStatus === "C" || overallStatus === "D")) {
    originalStatusRef.current = overallStatus;
  }

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

  // Persist resolved_items to DB and sync effective overall_status
  const persistResolved = useCallback(async (newSet: Set<string>) => {
    if (!checkResultId) return;
    const arr = [...newSet];
    const ngItems = items.filter(i => i.status === "NG");
    const allNgResolved = ngItems.length > 0 && ngItems.every(i => {
      const id = getCheckItemId(i);
      return id ? newSet.has(id) : false;
    });
    // Use original NG status for revert, not potentially-overridden prop
    const revertStatus = originalStatusRef.current || overallStatus;
    const effectiveStatus = allNgResolved ? "B" : revertStatus;
    await supabase.from("check_results").update({ resolved_items: arr, overall_status: effectiveStatus }).eq("id", checkResultId);
  }, [checkResultId, items, overallStatus]);

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

  // Deduplicate similar items: group by normalized item+detail text
  const { deduped, dupeCounts } = useMemo(() => {
    const filtered = items.filter((item) => activeFilters.has(item.status));
    const seen = new Map<string, { representative: CheckItem; count: number; dupeIds: string[] }>();
    const result: CheckItem[] = [];
    const counts: Record<string, number> = {};

    for (const item of filtered) {
      // Normalize: lowercase, strip whitespace/punctuation for comparison
      const normItem = checkItemStr(item.item).replace(/[\s\u3000]/g, "").toLowerCase();
      const normDetail = checkItemStr(item.detail).replace(/[\s\u3000]/g, "").toLowerCase();
      // Use a similarity key: same title OR very similar detail (first 60 chars)
      const key = `${item.status}::${normItem}::${normDetail.slice(0, 60)}`;

      const existing = seen.get(key);
      if (existing) {
        existing.count++;
        existing.dupeIds.push(getCheckItemId(item));
      } else {
        seen.set(key, { representative: item, count: 1, dupeIds: [getCheckItemId(item)] });
        result.push(item);
      }
    }

    for (const [, v] of seen) {
      counts[getCheckItemId(v.representative)] = v.count;
    }

    return { deduped: result, dupeCounts: counts };
  }, [items, activeFilters]);

  const filteredItems = deduped;

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
      const selectedIds = [...selectedItems];
      // Build a map from checkItemId -> item for lookup
      const itemByCheckId = new Map<string, CheckItem>();
      items.forEach(i => { itemByCheckId.set(getCheckItemId(i), i); });

      const matchedItems = selectedIds.map(id => itemByCheckId.get(id)).filter(Boolean) as CheckItem[];
      const rawPatternIds = matchedItems.map((i) => checkItemStr(i.pattern_id)).filter(Boolean);

      const { data: existing, error: fetchErr } = await supabase
        .from("correction_patterns")
        .select("id, rule_id, frequency")
        .eq("product_code", productCode)
        .in("rule_id", rawPatternIds);

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

      for (const item of matchedItems) {
        const pid = checkItemStr(item.pattern_id);
        if (!pid) continue;
        const ex = existingMap.get(pid);
        if (ex) {
          toUpdate.push({ id: ex.id, frequency: (ex.frequency ?? 0) + 1 });
        } else {
          toInsert.push({
            user_id: user.id, product_code: productCode, rule_id: pid,
            rule_title: checkItemStr(item.item) || "—", original_content: checkItemStr(item.detail) || "—",
            corrected_content: checkItemStr(item.suggestion), category: item.severity,
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
        const commentInserts = matchedItems
          .filter((item) => checkItemStr(item.pattern_id))
          .map((item) => ({
            check_result_id: checkResultId, check_item_id: checkItemStr(item.pattern_id),
            author_name: "AIチェック", author_email: user.email || "",
            content: `【${checkItemStr(item.pattern_id)}】${checkItemStr(item.item) || "—"}\n\n${checkItemStr(item.detail) || "—"}\n\n💡 修正案: ${checkItemStr(item.suggestion) || "なし"}`,
            status: "open" as const,
          }));
        if (commentInserts.length > 0) {
          promises.push((async () => {
            const { error } = await supabase.from("comments").insert(commentInserts);
            if (error) console.error("[comments insert]", error.message);
          })());
        }
      }

      await Promise.all(promises);
      setAppliedItems((s) => { const next = new Set(s); selectedIds.forEach((id) => next.add(id)); return next; });
      setResolvedItems((s) => { const next = new Set(s); selectedIds.forEach((id) => next.add(id)); persistResolved(next); return next; });
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
      {/* Compact summary bar */}
      <div className="shrink-0 border-b border-border px-3 py-1.5 space-y-1">
        {productId && projectId && (
          <ReferenceStatusIndicator projectId={projectId} productId={productId} processKey={processKey} />
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={cn("text-[10px] font-bold px-2 py-0.5", effectiveSubmit.isOk ? "bg-status-ok text-white border-status-ok" : "bg-status-ng text-white border-status-ng")}>
            {effectiveSubmit.label}
          </Badge>
          {/* Inline filter chips */}
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilters.has(opt.key);
            const count = counts[opt.key] || 0;
            if (count === 0 && !isActive) return null;
            return (
              <button
                key={opt.key}
                onClick={() => toggleFilter(opt.key)}
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors",
                  isActive ? opt.color : "bg-muted/30 text-muted-foreground/50 border-transparent"
                )}
              >
                {opt.label} {count}
              </button>
            );
          })}
          <button onClick={showAll} className="text-[10px] text-muted-foreground hover:text-foreground px-1">全て</button>
          {checkedAt && (
            <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">{format(new Date(checkedAt), "MM/dd HH:mm")}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Non-OK items */}
        {filteredItems.filter((item) => item.status !== "OK").map((item, i) => {
          const itemId = getCheckItemId(item);
          const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
          const dupeCount = dupeCounts[itemId] || 1;
          const showFpSection =
            (item.status === "NG" || item.status === "WARNING") &&
            (feedbackEligible || itemHasFeedback(item));
          const fpProps =
            showFpSection
              ? {
                  alreadyReported: itemHasFeedback(item),
                  onSubmit: async (payload: { reason: string | null; scope: "product" | "project" }) => {
                    await submitFalsePositive(item, payload.reason, payload.scope);
                  },
                }
              : null;
          return (
            <SectionErrorBoundary
              key={item.pattern_id ?? `${item.status}-${item.item}`}
              label="チェック項目"
            >
              <CheckItemCard
                ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
                item={item}
                index={i}
                marker={marker}
                isResolved={resolvedItems.has(itemId)}
                isSelected={selectedItems.has(itemId)}
                isHighlighted={highlightCard === item.pattern_id}
                isApplied={appliedItems.has(itemId)}
                commentCount={commentCounts[checkItemStr(item.pattern_id)] || 0}
                productCode={productCode}
                dupeCount={dupeCount}
                onToggleSelect={() => toggleSelectItem(itemId)}
                onToggleResolved={() => toggleResolved(itemId)}
                onCommentClick={() => onCommentClick(item.pattern_id)}
                onSeekMedia={onSeekMedia}
                onMarkerClick={onMarkerClick}
                onMouseEnter={() => onActiveCheckItemChange?.(item)}
                onMouseLeave={() => onActiveCheckItemChange?.(null)}
                falsePositiveFeedback={fpProps}
              />
            </SectionErrorBoundary>
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
          <SectionErrorBoundary
            key={item.pattern_id ?? `${item.status}-${item.item}`}
            label="チェック項目"
          >
            <CheckItemCard
              ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
              item={item}
              index={i}
              marker={marker}
              isResolved={resolvedItems.has(itemId)}
              isSelected={selectedItems.has(itemId)}
              isHighlighted={highlightCard === item.pattern_id}
              isApplied={appliedItems.has(itemId)}
              commentCount={commentCounts[checkItemStr(item.pattern_id)] || 0}
              productCode={productCode}
              onToggleSelect={() => onToggleSelect(itemId)}
              onToggleResolved={() => onToggleResolved(itemId)}
              onCommentClick={() => onCommentClick(item.pattern_id)}
              onSeekMedia={onSeekMedia}
              onMarkerClick={onMarkerClick}
            />
          </SectionErrorBoundary>
        );
      })}
    </div>
  );
}
