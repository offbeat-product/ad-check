import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CheckItem } from "@/lib/types";
import { getCheckMarkers } from "@/lib/marker-positions";
import { handleSupabaseError } from "@/lib/supabase-helpers";

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export function useReviewState(checkResultId: string | null | undefined, checkItems: CheckItem[] | null | undefined) {
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [paintMode, setPaintMode] = useState(false);
  const [highlightCard, setHighlightCard] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<string>("ai-check");
  const [commentFilter, setCommentFilter] = useState<string | null>(null);

  const items = (checkItems || []).sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
  const markers = getCheckMarkers(items);

  useEffect(() => {
    if (!checkResultId) return;
    let cancelled = false;
    supabase.from("comments").select("check_item_id").eq("check_result_id", checkResultId).then(({ data, error }) => {
      if (cancelled) return;
      if (handleSupabaseError(error, "comments count")) return;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => {
        if (c.check_item_id) counts[c.check_item_id] = (counts[c.check_item_id] || 0) + 1;
      });
      setCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [checkResultId]);

  const scrollToCard = useCallback((patternId: string) => {
    setRightTab("ai-check");
    setHighlightCard(patternId);
    setTimeout(() => setHighlightCard(null), 2000);
  }, []);

  const handleCommentClick = useCallback((patternId: string) => {
    setCommentFilter(patternId);
    setRightTab("comments");
  }, []);

  return {
    items,
    markers,
    commentCounts,
    paintMode,
    setPaintMode,
    highlightCard,
    rightTab,
    setRightTab,
    commentFilter,
    scrollToCard,
    handleCommentClick,
  };
}

export function useDownload() {
  const downloadFile = (data: string, filename: string, isBase64: boolean) => {
    const a = document.createElement("a");
    if (isBase64) {
      a.href = data;
      a.download = filename;
      a.click();
    } else {
      const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return { downloadFile };
}

export function useExportCsv() {
  const exportCsv = (items: CheckItem[], filename: string) => {
    const header = "pattern_id,item,status,severity,location,detail,suggestion";
    const rows = items.map((ci) =>
      [ci.pattern_id, ci.item, ci.status, ci.severity, ci.location || "", ci.detail, ci.suggestion || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { exportCsv };
}
