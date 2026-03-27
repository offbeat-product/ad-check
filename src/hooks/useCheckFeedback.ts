import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getCheckItemId } from "@/lib/check-display";
import type { CheckItem } from "@/lib/types";

export interface CheckFeedbackRow {
  rule_pattern_id: string | null;
  item_description: string;
}

function matchesFeedbackRow(item: CheckItem, row: CheckFeedbackRow): boolean {
  return (
    (row.rule_pattern_id != null && row.rule_pattern_id === item.pattern_id) ||
    row.item_description === item.item
  );
}

export function useCheckFeedback(options: {
  checkResultId: string | null | undefined;
  productId: string | undefined;
  projectId: string | undefined;
  processType: string | undefined;
}) {
  const { checkResultId, productId, projectId, processType } = options;
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<CheckFeedbackRow[]>([]);
  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOptimisticIds(new Set());
  }, [checkResultId]);

  useEffect(() => {
    if (!checkResultId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("check_feedback")
        .select("rule_pattern_id, item_description")
        .eq("check_result_id", checkResultId)
        .eq("is_active", true);
      if (cancelled) return;
      if (error) {
        console.error("[check_feedback load]", error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as CheckFeedbackRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [checkResultId]);

  const itemHasFeedback = useCallback(
    (item: CheckItem) => {
      const id = getCheckItemId(item);
      if (optimisticIds.has(id)) return true;
      return rows.some((r) => matchesFeedbackRow(item, r));
    },
    [rows, optimisticIds],
  );

  const feedbackEligible =
    !!user &&
    !!productId &&
    !!checkResultId &&
    !!processType &&
    processType.length > 0;

  const submitFalsePositive = useCallback(
    async (item: CheckItem, reason: string | null, scope: "product" | "project") => {
      if (!user || !productId || !checkResultId || !processType) {
        toast({
          title: "エラー",
          description: "フィードバックを送信できません。",
          variant: "destructive",
        });
        return;
      }
      const trimmed = reason?.trim() ?? "";
      const { error } = await supabase.from("check_feedback").insert({
        product_id: productId,
        process_type: processType,
        check_result_id: checkResultId,
        rule_pattern_id: item.pattern_id,
        item_description: item.item,
        ai_judgment: item.status,
        human_judgment: "OK",
        feedback_type: "false_positive",
        reason: trimmed.length > 0 ? trimmed : null,
        scope,
        project_id: scope === "project" ? projectId ?? null : null,
        created_by: user.id,
      });
      if (error) {
        toast({ title: "エラー", description: error.message, variant: "destructive" });
        return;
      }
      const itemId = getCheckItemId(item);
      setOptimisticIds((s) => new Set(s).add(itemId));
      setRows((r) => [...r, { rule_pattern_id: item.pattern_id, item_description: item.item }]);
      toast({
        title: "誤検知フィードバックを記録しました。次回のAIチェックに反映されます。",
      });
    },
    [user, productId, checkResultId, processType, projectId, toast],
  );

  return { itemHasFeedback, submitFalsePositive, feedbackEligible };
}
