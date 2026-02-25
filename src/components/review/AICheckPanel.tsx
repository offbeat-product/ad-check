import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { handleSupabaseError } from "@/lib/supabase-helpers";
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
}

export default function AICheckPanel({ items, markers, productCode, commentCounts, highlightCard, onCommentClick, checkResultId, onTabChange }: AICheckPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    setSelectedItems(new Set(items.filter((i) => i.status !== "OK" && !appliedItems.has(i.pattern_id)).map((i) => i.pattern_id)));
  };

  const handleApplyCorrections = async () => {
    if (!user || selectedItems.size === 0) return;
    setApplying(true);

    try {
      // Batch: fetch all existing patterns for this product in one query
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

      // Separate into updates and inserts
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
            user_id: user.id,
            product_code: productCode,
            rule_id: item.pattern_id,
            rule_title: item.item,
            original_content: item.detail,
            corrected_content: item.suggestion || "",
            category: item.severity,
          });
        }
      }

      // Execute batch operations
      const promises: Promise<unknown>[] = [];

      if (toInsert.length > 0) {
        promises.push(
          (async () => {
            const { error } = await supabase.from("correction_patterns").insert(toInsert);
            if (error) console.error("[correction_patterns insert]", error.message);
          })()
        );
      }

      for (const u of toUpdate) {
        promises.push(
          (async () => {
            const { error } = await supabase.from("correction_patterns")
              .update({ frequency: u.frequency, updated_at: new Date().toISOString() })
              .eq("id", u.id);
            if (error) console.error("[correction_patterns update]", error.message);
          })()
        );
      }

      // BUG 2 FIX: Also create comments for each selected item
      if (checkResultId) {
        const commentInserts = patternIds.map((patternId) => {
          const item = items.find((i) => i.pattern_id === patternId);
          if (!item) return null;
          return {
            check_result_id: checkResultId,
            check_item_id: item.pattern_id,
            author_name: "AIチェック",
            author_email: user.email || "",
            content: `【${item.pattern_id}】${item.item}\n\n${item.detail}\n\n💡 修正案: ${item.suggestion || "なし"}`,
            status: "open" as const,
          };
        }).filter(Boolean);

        if (commentInserts.length > 0) {
          promises.push(
            (async () => {
              const { error } = await supabase.from("comments").insert(commentInserts);
              if (error) console.error("[comments insert]", error.message);
            })()
          );
        }
      }

      await Promise.all(promises);

      // Mark as applied
      setAppliedItems((s) => {
        const next = new Set(s);
        patternIds.forEach((id) => next.add(id));
        return next;
      });

      // Mark all as resolved
      setResolvedItems((s) => {
        const next = new Set(s);
        patternIds.forEach((id) => next.add(id));
        return next;
      });

      toast({ title: `✅ ${selectedItems.size}件の修正パターンを保存しました` });
      setSelectedItems(new Set());

      // Switch to comments tab to show newly created comments
      if (onTabChange) {
        onTabChange("comments");
      }
    } catch (err) {
      console.error("[handleApplyCorrections]", err);
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.map((item, i) => {
          const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
          return (
            <CheckItemCard
              key={i}
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
      </div>

      {/* Bottom sticky */}
      <div className="shrink-0 border-t border-border p-3 space-y-2 bg-card">
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
