import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, Loader2, Bot, History, CheckCircle2 } from "lucide-react";
import { runComparisonCheck } from "@/lib/webhook";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getSubmitLabel, getSubmitBadgeClass, STATUS_FILTER_OPTIONS, getEffectiveSubmitLabel, getCheckItemId } from "@/lib/check-display";
import type { CheckItem, CheckResult } from "@/lib/types";
import type { CheckMarker } from "@/lib/marker-positions";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import CheckItemCard from "./CheckItemCard";

export interface ComparisonHistoryEntry {
  id: string;
  created_at: string;
  overall_status: string;
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
  comparison_round: number;
  check_items: CheckItem[];
}

interface ComparisonCheckPanelProps {
  file: { file_data: string | null; file_type: string; process_type: string };
  productId: string;
  projectId: string;
  fileId?: string;
  checkResultId?: string | null;
  clientName?: string;
  productCode?: string;
  productName?: string;
  comparisonBeforeData: string | null;
  comparisonAfterData: string | null;
  comparisonAfterText: string;
  comparisonRoundLabel: string;
  onOpenComparisonMode: () => void;
  onCheckComplete?: (result: CheckResult) => void;
  onComparisonSaved?: (savedRecord: ComparisonHistoryEntry) => void;
  onClearAfterData?: () => void;
  commentCounts?: Record<string, number>;
  highlightCard?: string | null;
  onCommentClick?: (patternId: string) => void;
  onTabChange?: (tab: string) => void;
  onSeekMedia?: (seconds: number) => void;
  onMarkerClick?: (patternId: string) => void;
  lockedByUser?: string | null;
  onAcquireLock?: () => Promise<boolean>;
  onReleaseLock?: () => Promise<void>;
  submissionType?: string;
  onSubmitToClient?: () => void;
  onInternalRevision?: () => void;
  autoRun?: boolean;
  /** Initial AI check items (shown when no comparison result selected) */
  initialItems?: CheckItem[];
  initialOverallStatus?: string | null;
  initialCheckedAt?: string | null;
}

export default function ComparisonCheckPanel({
  file, productId, projectId, fileId, checkResultId, clientName, productCode, productName,
  comparisonBeforeData, comparisonAfterData, comparisonAfterText, comparisonRoundLabel,
  onOpenComparisonMode, onCheckComplete, onComparisonSaved, onClearAfterData,
  commentCounts = {}, highlightCard, onCommentClick, onTabChange, onSeekMedia, onMarkerClick,
  lockedByUser, onAcquireLock, onReleaseLock,
  submissionType, onSubmitToClient, onInternalRevision, autoRun,
}: ComparisonCheckPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [history, setHistory] = useState<ComparisonHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // For the interactive result view
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["NG", "WARNING"]));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Persist resolved_items to DB
  const persistResolved = useCallback(async (newSet: Set<string>, crId?: string | null) => {
    const targetId = crId || checkResultId;
    if (!targetId) return;
    await supabase.from("check_results").update({ resolved_items: [...newSet] }).eq("id", targetId);
  }, [checkResultId]);

  const toggleResolved = useCallback((patternId: string) => {
    setResolvedItems((s) => {
      const next = new Set(s);
      next.has(patternId) ? next.delete(patternId) : next.add(patternId);
      // For comparison, persist to the selected history entry or parent check result
      const targetId = selectedHistoryId || checkResultId;
      persistResolved(next, targetId);
      return next;
    });
  }, [persistResolved, selectedHistoryId, checkResultId]);

  // Reset state when navigating to a different file
  useEffect(() => {
    setChecking(false);
    setResult(null);
    setHistory([]);
    setSelectedHistoryId(null);
    setResolvedItems(new Set());
    setSelectedItems(new Set());
    setAppliedItems(new Set());
    setActiveFilters(new Set(["NG", "WARNING"]));
  }, [fileId]);

  // Load persisted resolved_items from DB
  useEffect(() => {
    const targetId = selectedHistoryId || checkResultId;
    if (!targetId) return;
    let cancelled = false;
    supabase.from("check_results").select("resolved_items").eq("id", targetId).maybeSingle().then(({ data }) => {
      if (cancelled || !data?.resolved_items) return;
      const ids = Array.isArray(data.resolved_items) ? data.resolved_items as string[] : [];
      if (ids.length > 0) setResolvedItems(new Set(ids));
    });
    return () => { cancelled = true; };
  }, [selectedHistoryId, checkResultId]);

  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const isImage = aiCfg?.inputMode === "image";
  const enabled = aiCfg?.enabled ?? false;

  const hasNewContent = isImage ? !!comparisonAfterData : !!(comparisonAfterText || comparisonAfterData);

  // Fetch comparison history
  useEffect(() => {
    if (!checkResultId) return;
    const fetchHistory = async () => {
      const { data, error } = await (supabase as any)
        .from("check_results")
        .select("id, created_at, overall_status, ng_count, warning_count, ok_count, total_checks, check_items")
        .eq("parent_check_result_id", checkResultId)
        .eq("check_type", "comparison")
        .order("created_at", { ascending: true });
      if (!error && data) {
        setHistory(data.map((d: any) => ({
          ...d,
          ng_count: d.ng_count ?? 0,
          warning_count: d.warning_count ?? 0,
          ok_count: d.ok_count ?? 0,
          total_checks: d.total_checks ?? 0,
          comparison_round: (d as any).comparison_round ?? 0,
          check_items: (d.check_items as unknown as CheckItem[]) || [],
        })));
      }
    };
    fetchHistory();
  }, [checkResultId]);

  // Auto-run comparison check when autoRun prop is set
  const autoRunTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoRun && !autoRunTriggeredRef.current && hasNewContent && enabled && !checking) {
      autoRunTriggeredRef.current = true;
      const timer = setTimeout(() => handleRunComparison(), 1000);
      return () => clearTimeout(timer);
    }
  }, [autoRun, hasNewContent, enabled, checking]);

  // Reset auto-run flag when fileId changes
  useEffect(() => {
    autoRunTriggeredRef.current = false;
  }, [fileId]);

  const handleRunComparison = async () => {
    if (!enabled || !user) return;
    // Acquire lock before comparison check
    if (onAcquireLock) {
      const locked = await onAcquireLock();
      if (!locked) return;
    }
    setChecking(true);
    try {
      const refMaterials = await gatherReferenceMaterials(projectId, productId, file.process_type);
      const referenceContext = JSON.stringify(refMaterials);

      // Fetch correction comments for this creative to include in the comparison check
      let correctionComments: { content: string; status: string; check_item_id?: string | null }[] = [];
      if (checkResultId) {
        const { data: commentsData } = await supabase
          .from("comments")
          .select("content, status, check_item_id")
          .eq("check_result_id", checkResultId)
          .is("parent_id", null)
          .order("created_at", { ascending: true });
        if (commentsData && commentsData.length > 0) {
          correctionComments = commentsData.map(c => ({
            content: c.content,
            status: c.status,
            check_item_id: c.check_item_id,
          }));
          console.log("[ComparisonCheck] Including", correctionComments.length, "comments for check");
        }
      }

      let data: Parameters<typeof runComparisonCheck>[2];
      if (isImage) {
        const newBase64 = comparisonAfterData?.replace(/^data:[^;]+;base64,/, "") || "";
        const origBase64 = comparisonBeforeData?.replace(/^data:[^;]+;base64,/, "") || "";
        const mediaType = comparisonAfterData?.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
        data = {
          image_base64: newBase64,
          media_type: mediaType,
          original_image_base64: origBase64,
        };
      } else {
        data = {
          script_text: comparisonAfterText || comparisonAfterData || "",
          original_text: comparisonBeforeData || "",
        };
      }

      const res = await runComparisonCheck(productId, file.process_type, data, referenceContext, correctionComments);
      setResult(res);
      onCheckComplete?.(res);

      // Save comparison result to DB
      const nextRound = history.length + 1;
      // Persist the after-data so it can be restored when revisiting
      const savedInputData: Record<string, unknown> = {};
      if (isImage) {
        savedInputData.after_image = comparisonAfterData;
        savedInputData.before_image = comparisonBeforeData;
      } else {
        savedInputData.after_text = comparisonAfterText || comparisonAfterData;
        savedInputData.before_text = comparisonBeforeData;
      }

      const { data: crData, error: insertErr } = await supabase.from("check_results").insert([{
        user_id: user.id,
        client_name: clientName || "",
        product_code: productCode || "",
        product_name: productName || "",
        process_type: file.process_type,
        input_type: isImage ? "image" : "text",
        input_text: isImage ? null : (comparisonAfterText || comparisonAfterData),
        overall_status: res.overall_status,
        detected_case: res.detected_case,
        ng_count: res.ng_count,
        warning_count: res.warning_count,
        ok_count: res.ok_count,
        total_checks: res.total_checks,
        check_items: res.check_items as unknown as Json,
        raw_response: res as unknown as Json,
        input_data: savedInputData as unknown as Json,
        status: "completed",
        check_type: "comparison",
        comparison_round: nextRound,
        parent_check_result_id: checkResultId || null,
      } as any]).select("id, created_at").single();

      if (!handleSupabaseError(insertErr, "comparison result save") && crData) {
        const entry: ComparisonHistoryEntry = {
          id: crData.id,
          created_at: crData.created_at ?? new Date().toISOString(),
          overall_status: res.overall_status,
          ng_count: res.ng_count,
          warning_count: res.warning_count,
          ok_count: res.ok_count,
          total_checks: res.total_checks,
          comparison_round: nextRound,
          check_items: res.check_items,
        };
        setHistory(prev => [...prev, entry]);
        setSelectedHistoryId(crData.id);

        if (fileId) {
          await supabase.from("project_files").update({ status: "checked" }).eq("id", fileId);
        }

        onComparisonSaved?.(entry);
        // Clear after-data so user must upload new draft for next round
        onClearAfterData?.();
      }

      // Reset selection state for new result
      setResolvedItems(new Set());
      setSelectedItems(new Set());
      setAppliedItems(new Set());
      setActiveFilters(new Set(["NG", "WARNING"]));

      toast({ title: "比較チェック完了", description: `Grade: ${res.overall_status}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      toast({ title: "チェックエラー", description: message, variant: "destructive" });
    } finally {
      setChecking(false);
      if (onReleaseLock) await onReleaseLock();
    }
  };

  // Determine which result to show: selected history or latest
  const displayResult: CheckResult | null = selectedHistoryId
    ? (() => {
        const h = history.find(h => h.id === selectedHistoryId);
        return h ? { overall_status: h.overall_status as any, ng_count: h.ng_count, warning_count: h.warning_count, ok_count: h.ok_count, total_checks: h.total_checks, check_items: h.check_items } : result;
      })()
    : result;

  const displayItems = displayResult?.check_items || [];

  // Filter logic
  const toggleFilter = (key: string) => {
    setActiveFilters((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) STATUS_FILTER_OPTIONS.forEach((o) => next.add(o.key));
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => displayItems.filter((item) => activeFilters.has(item.status)), [displayItems, activeFilters]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { NG: 0, WARNING: 0, OK: 0, MANUAL: 0 };
    displayItems.forEach((item) => { c[item.status] = (c[item.status] || 0) + 1; });
    return c;
  }, [displayItems]);

  // Dynamic GO/NG using effective label
  const submit = useMemo(() => {
    return getEffectiveSubmitLabel(displayResult?.overall_status, displayItems, [...resolvedItems]);
  }, [displayResult?.overall_status, displayItems, resolvedItems]);

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    setSelectedItems(new Set(filteredItems.filter((i) => i.status !== "OK" && !appliedItems.has(getCheckItemId(i))).map((i) => getCheckItemId(i))));
  };

  // Apply corrections (same logic as AICheckPanel)
  const handleApplyCorrections = async () => {
    if (!user || selectedItems.size === 0) return;
    setApplying(true);
    try {
      const patternIds = [...selectedItems];
      const pCode = productCode || "";

      const { data: existing, error: fetchErr } = await supabase
        .from("correction_patterns")
        .select("id, rule_id, frequency")
        .eq("product_code", pCode)
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
        const item = displayItems.find((i) => i.pattern_id === patternId);
        if (!item) continue;
        const ex = existingMap.get(patternId);
        if (ex) {
          toUpdate.push({ id: ex.id, frequency: (ex.frequency ?? 0) + 1 });
        } else {
          toInsert.push({
            user_id: user.id, product_code: pCode, rule_id: item.pattern_id,
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

      // Also insert as comments, using the check_result_id (parent or comparison)
      const targetCheckResultId = selectedHistoryId || checkResultId;
      if (targetCheckResultId) {
        const commentInserts = patternIds.map((patternId) => {
          const item = displayItems.find((i) => i.pattern_id === patternId);
          if (!item) return null;
          return {
            check_result_id: targetCheckResultId, check_item_id: item.pattern_id,
            author_name: "比較チェック", author_email: user.email || "",
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

  // Build markers for comparison items (numbered NG/WARNING items)
  const markers: CheckMarker[] = useMemo(() => {
    let num = 0;
    return displayItems
      .filter((item) => item.status === "NG" || item.status === "WARNING")
      .map((item) => {
        num++;
        return { number: num, item, position: { x: 0, y: 0, source: "none" as const } };
      });
  }, [displayItems]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* History timeline */}
      {history.length > 0 && (
        <div className="shrink-0 border-b border-border px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">比較チェック履歴</span>
          </div>
          <div className="space-y-0.5">
            {history.map((h, i) => {
              const isGo = h.overall_status === "A" || h.overall_status === "B";
              const isSelected = selectedHistoryId === h.id;
              return (
                <button
                  key={h.id}
                  onClick={() => {
                    const newId = isSelected ? null : h.id;
                    setSelectedHistoryId(newId);
                    if (!isSelected) {
                      setResult({
                        overall_status: h.overall_status as any,
                        ng_count: h.ng_count, warning_count: h.warning_count,
                        ok_count: h.ok_count, total_checks: h.total_checks,
                        check_items: h.check_items,
                      });
                      // Reset selection state
                      setResolvedItems(new Set());
                      setSelectedItems(new Set());
                      setAppliedItems(new Set());
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1 rounded text-xs transition-colors text-left",
                    isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
                  )}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0",
                    isGo ? "bg-[hsl(var(--status-ok))]" : "bg-[hsl(var(--status-ng))]"
                  )}>
                    {i + 1}
                  </span>
                  <span className="truncate flex-1">第{i + 2}稿チェック</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                    isGo ? "text-status-ok bg-status-ok/10" : "text-status-ng bg-status-ng/10"
                  )}>
                    {isGo ? "GO" : "NG"}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(h.created_at), "MM/dd HH:mm")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result summary bar (when result exists) */}
      {displayResult && (
        <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-xs font-bold px-2.5 py-1", submit.isOk ? "bg-status-ok text-white border-status-ok" : "bg-status-ng text-white border-status-ng")}>
              {submit.label}
            </Badge>
            <span className="text-[10px] text-status-ng font-bold">修正必須 {counts.NG}</span>
            <span className="text-[10px] text-status-warning font-bold">要確認 {counts.WARNING}</span>
            <span className="text-[10px] text-status-ok font-bold">問題なし {counts.OK}</span>
            {counts.MANUAL > 0 && <span className="text-[10px] text-status-manual font-bold">手動確認 {counts.MANUAL}</span>}
          </div>
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
            <button onClick={() => setActiveFilters(new Set(STATUS_FILTER_OPTIONS.map((o) => o.key)))} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5">全て</button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {!hasNewContent && !displayResult && history.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[300px]">
            <GitCompare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">比較チェック</p>
            <p className="text-xs text-center mb-4">修正前後のファイルを比較して<br />変更点をAIがチェックします</p>
            <Button size="sm" variant="outline" onClick={onOpenComparisonMode} className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />比較モードを開く
            </Button>
          </div>
        ) : !displayResult && !hasNewContent ? (
          null
        ) : !displayResult ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-6 h-full min-h-[200px]">
            <GitCompare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium mb-1">修正後ファイルがセットされました</p>
            <p className="text-xs text-center mb-3">下の「比較チェック実行」ボタンを押してください</p>
          </div>
        ) : (
          <>
            {/* Non-OK items with CheckItemCard */}
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
                  productCode={productCode || ""}
                  onToggleSelect={() => toggleSelectItem(itemId)}
                  onToggleResolved={() => toggleResolved(itemId)}
                  onCommentClick={() => onCommentClick?.(item.pattern_id)}
                  onSeekMedia={onSeekMedia}
                  onMarkerClick={onMarkerClick}
                  sourceLabel="比較チェック"
                />
              );
            })}

            {/* OK items collapsed */}
            {(() => {
              const okItems = filteredItems.filter((item) => item.status === "OK");
              if (okItems.length === 0) return null;
              return <OkItemsCollapsed items={okItems} markers={markers} resolvedItems={resolvedItems} selectedItems={selectedItems} highlightCard={highlightCard} appliedItems={appliedItems} commentCounts={commentCounts} productCode={productCode || ""} cardRefs={cardRefs} onToggleSelect={toggleSelectItem} onToggleResolved={(id) => toggleResolved(id)} onCommentClick={(id) => onCommentClick?.(id)} onSeekMedia={onSeekMedia} onMarkerClick={onMarkerClick} />;
            })()}

            {filteredItems.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">該当する項目がありません</p>
            )}
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border p-3 bg-card space-y-2">
        {/* Apply corrections bar (when result exists) */}
        {displayResult && (
          <>
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
          </>
        )}

        {/* Comparison mode buttons */}
        {!hasNewContent && !displayResult && history.length === 0 && (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenComparisonMode}>
            <GitCompare className="h-3 w-3 mr-1" />比較モードを開く
          </Button>
        )}
        {(history.length > 0 || displayResult) && !hasNewContent && (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={onOpenComparisonMode}>
            <GitCompare className="h-3 w-3 mr-1" />次の稿をチェック
          </Button>
        )}
        {hasNewContent && enabled && (
          <Button size="sm" className="w-full text-xs" onClick={handleRunComparison} disabled={checking || !!lockedByUser}>
            {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitCompare className="h-3 w-3 mr-1" />}
            {checking ? "比較チェック中..." : lockedByUser ? `${lockedByUser}さんがチェック中` : `比較チェック実行（${comparisonRoundLabel}）`}
          </Button>
        )}
        {hasNewContent && !enabled && (
          <Button size="sm" variant="outline" className="w-full text-xs opacity-50" disabled>
            <Bot className="h-3 w-3 mr-1" />比較チェック（準備中）
          </Button>
        )}

        {/* Submit to client button */}
        {submissionType !== "client" && onSubmitToClient && (displayResult || history.length > 0) && (
          <div className="space-y-2">
            <Button
              size="sm"
              className="w-full text-xs gap-1.5"
              onClick={onSubmitToClient}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              クライアントに提出する
            </Button>
            {onInternalRevision && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={onInternalRevision}
              >
                社内修正する
              </Button>
            )}
          </div>
        )}
        {submissionType === "client" && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              クライアント提出済み
            </div>
            {onInternalRevision && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={onInternalRevision}
              >
                社内修正する
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OkItemsCollapsed({ items, markers, resolvedItems, selectedItems, highlightCard, appliedItems, commentCounts, productCode, cardRefs, onToggleSelect, onToggleResolved, onCommentClick, onSeekMedia, onMarkerClick }: {
  items: CheckItem[];
  markers: CheckMarker[];
  resolvedItems: Set<string>;
  selectedItems: Set<string>;
  highlightCard?: string | null;
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
        <span>問題なし ({items.length}件)</span>
      </button>
      {open && items.map((item, i) => {
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
            sourceLabel="比較チェック"
          />
        );
      })}
    </div>
  );
}
