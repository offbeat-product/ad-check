import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckItem } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import CheckItemCard from "./CheckItemCard";

interface AICheckPanelProps {
  items: CheckItem[];
  markers: CheckMarker[];
  productCode: string;
  commentCounts: Record<string, number>;
  highlightCard: string | null;
  onCommentClick: (patternId: string) => void;
}

export default function AICheckPanel({ items, markers, productCode, commentCounts, highlightCard, onCommentClick }: AICheckPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    setSelectedItems(new Set(items.filter((i) => i.status !== "OK").map((i) => i.pattern_id)));
  };

  const handleApplyCorrections = async () => {
    if (!user || selectedItems.size === 0) return;

    for (const patternId of selectedItems) {
      const item = items.find((i) => i.pattern_id === patternId);
      if (!item) continue;

      const { data: existing } = await supabase
        .from("correction_patterns").select("id, frequency")
        .eq("product_code", productCode).eq("rule_id", item.pattern_id).limit(1);

      if (existing && existing.length > 0) {
        await supabase.from("correction_patterns")
          .update({ frequency: (existing[0] as any).frequency + 1, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing[0] as any).id);
      } else {
        await supabase.from("correction_patterns").insert({
          user_id: user.id,
          product_code: productCode,
          rule_id: item.pattern_id,
          rule_title: item.item,
          original_content: item.detail,
          corrected_content: item.suggestion || "",
          category: item.severity,
        } as any);
      }
      setResolvedItems((s) => new Set(s).add(patternId));
    }
    toast({ title: "保存しました", description: `${selectedItems.size}件の修正パターンを保存しました` });
    setSelectedItems(new Set());
  };

  // Expose scrollToCard via a callback ref pattern
  const scrollToCard = (patternId: string) => {
    cardRefs.current[patternId]?.scrollIntoView({ behavior: "smooth", block: "center" });
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
          disabled={selectedItems.size === 0}
          onClick={handleApplyCorrections}
        >
          チェックしたコメントを反映 ({selectedItems.size})
        </Button>
      </div>
    </>
  );
}

// Export scrollToCard helper for parent components
export function useScrollToCard() {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToCard = (patternId: string) => {
    setTimeout(() => {
      cardRefs.current[patternId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return { cardRefs, scrollToCard };
}
