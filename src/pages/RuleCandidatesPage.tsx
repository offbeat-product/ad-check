import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Brain, Sparkles, Loader2, ChevronDown, Pencil, Check, X, AlertTriangle, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type RuleCandidate = Tables<"rule_candidates">;
type Product = Tables<"products">;
type CorrectionLog = Tables<"correction_logs">;

const SEVERITY_CONFIG: Record<string, { label: string; class: string }> = {
  high: { label: "高", class: "bg-destructive/10 text-destructive border-destructive/30" },
  medium: { label: "中", class: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  low: { label: "低", class: "bg-muted text-muted-foreground border-border" },
};

const PROCESS_LABELS: Record<string, string> = {
  script: "構成/字コンテ", na_script: "NA原稿", narration: "ナレーション",
  bgm: "BGM", vcon: "Vコン", styleframe: "スタイルフレーム",
  storyboard: "絵コンテ", video_horizontal: "横動画", video_vertical: "縦動画",
};

const PREFIX_MAP: Record<string, string> = {
  script: "P", na_script: "NA", bgm: "BGM", narration: "NAR",
  vcon: "VC", styleframe: "SFC", storyboard: "SB",
  video_horizontal: "VH", video_vertical: "VV",
};

export default function RuleCandidatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [candidates, setCandidates] = useState<RuleCandidate[]>([]);
  const [correctionMap, setCorrectionMap] = useState<Record<string, CorrectionLog[]>>({});
  const [similarRuleMap, setSimilarRuleMap] = useState<Record<string, { rule_id: string; description: string }>>({});
  const [allCorrectionLogs, setAllCorrectionLogs] = useState<CorrectionLog[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedProcess, setSelectedProcess] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("corrections");

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Summary counts
  const [totalCorrections, setTotalCorrections] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  // Per-card state
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load products
  useEffect(() => {
    supabase.from("products").select("*").order("sort_order").then(({ data }) => {
      if (data) setProducts(data);
    });
  }, []);

  // Load candidates and counts
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Build query — skip rule_candidates query when viewing corrections tab
      if (statusFilter !== "corrections") {
        let query = supabase.from("rule_candidates").select("*").eq("status", statusFilter).order("created_at", { ascending: false });
        if (selectedProduct !== "all") query = query.eq("product_id", selectedProduct);
        if (selectedProcess !== "all") query = query.eq("process_type", selectedProcess);
        const { data } = await query;
        setCandidates(data || []);

        // Load correction logs for source_correction_ids
        if (data && data.length > 0) {
          const allIds = data.flatMap((c) => (c.source_correction_ids as string[]) || []).filter(Boolean);
          if (allIds.length > 0) {
            const { data: logs } = await supabase.from("correction_logs").select("*").in("id", allIds);
            const map: Record<string, CorrectionLog[]> = {};
            data.forEach((c) => {
              const ids = (c.source_correction_ids as string[]) || [];
              map[c.id] = (logs || []).filter((l) => ids.includes(l.id));
            });
            setCorrectionMap(map);
          }

          // Load similar rules
          const similarIds = data.map((c) => c.similar_existing_rule_id).filter(Boolean) as string[];
          if (similarIds.length > 0) {
            const { data: rules } = await supabase.from("check_rules").select("id, rule_id, description").in("id", similarIds);
            const rMap: Record<string, { rule_id: string; description: string }> = {};
            (rules || []).forEach((r) => { rMap[r.id] = { rule_id: r.rule_id, description: r.description }; });
            setSimilarRuleMap(rMap);
          }
        }
      }

      // Counts
      const productFilter = selectedProduct !== "all" ? selectedProduct : undefined;
      const countQuery = (status: string) => {
        let q = supabase.from("rule_candidates").select("*", { count: "exact", head: true }).eq("status", status);
        if (productFilter) q = q.eq("product_id", productFilter);
        return q;
      };
      const [pRes, aRes, rRes] = await Promise.all([countQuery("pending"), countQuery("approved"), countQuery("rejected")]);
      setPendingCount(pRes.count || 0);
      setApprovedCount(aRes.count || 0);
      setRejectedCount(rRes.count || 0);
      setTotalCandidates((pRes.count || 0) + (aRes.count || 0) + (rRes.count || 0));

      let cq = supabase.from("correction_logs").select("*", { count: "exact", head: true });
      if (productFilter) cq = cq.eq("product_id", productFilter);
      const { count: cCount } = await cq;
      setTotalCorrections(cCount || 0);

      // Load all correction logs for display
      let clQuery = supabase.from("correction_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (productFilter) clQuery = clQuery.eq("product_id", productFilter);
      if (selectedProcess !== "all") clQuery = clQuery.eq("process_type", selectedProcess);
      const { data: clData } = await clQuery;
      setAllCorrectionLogs(clData || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedProduct, selectedProcess]);

  useEffect(() => { loadData(); }, [loadData]);

  // Generate candidates via webhook
  const handleGenerate = async () => {
    if (selectedProduct === "all") return;
    setGenerating(true);
    try {
      const res = await fetch("https://offbeat-checkgoai.app.n8n.cloud/webhook/generate-rule-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProduct,
          process_type: selectedProcess !== "all" ? selectedProcess : undefined,
          force: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "ルール候補の生成が完了しました" });
      await loadData();
    } catch (e) {
      toast({ title: "ルール候補の生成に失敗しました", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Approve as new rule
  const handleApproveAsNew = async (candidate: RuleCandidate) => {
    if (!user) return;
    setActionLoading(candidate.id);
    try {
      const prefix = PREFIX_MAP[candidate.process_type] || "X";
      const { data: existingRules } = await supabase
        .from("check_rules").select("rule_id")
        .eq("product_id", candidate.product_id).eq("process_type", candidate.process_type)
        .like("rule_id", `COR-${prefix}-%`).order("rule_id", { ascending: false }).limit(1);

      let nextNum = 1;
      if (existingRules?.length) {
        const match = existingRules[0].rule_id.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      const ruleId = `COR-${prefix}-${String(nextNum).padStart(2, "0")}`;

      const { data: newRule, error: ruleError } = await supabase.from("check_rules").insert({
        product_id: candidate.product_id,
        process_type: candidate.process_type,
        rule_id: ruleId,
        title: ruleId,
        category: candidate.category || "その他",
        description: candidate.rule_text,
        severity: candidate.severity || "medium",
        sort_order: 999,
        is_active: true,
        source_type: "correction",
        source_correction_count: candidate.source_count || 1,
      }).select().single();

      if (ruleError) throw ruleError;

      await supabase.from("rule_candidates").update({
        status: "approved", approved_rule_id: newRule.id,
        admin_notes: adminNotes[candidate.id] || null,
        reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq("id", candidate.id);

      const srcIds = (candidate.source_correction_ids as string[]) || [];
      if (srcIds.length > 0) {
        await supabase.from("correction_logs").update({
          rule_status: "active", approved_rule_id: newRule.id,
          approved_at: new Date().toISOString(), approved_by: user.id,
        }).in("id", srcIds);
      }

      toast({ title: `✅ ルール ${ruleId} を追加しました` });
      await loadData();
    } catch (e: any) {
      toast({ title: "ルール追加に失敗しました", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Update existing rule
  const handleUpdateExisting = async (candidate: RuleCandidate) => {
    if (!user || !candidate.similar_existing_rule_id) return;
    setActionLoading(candidate.id);
    try {
      const { error } = await supabase.from("check_rules").update({
        description: candidate.rule_text,
        source_type: "correction",
        source_correction_count: candidate.source_count || 1,
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.similar_existing_rule_id);
      if (error) throw error;

      await supabase.from("rule_candidates").update({
        status: "approved", approved_rule_id: candidate.similar_existing_rule_id,
        admin_notes: adminNotes[candidate.id] || null,
        reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq("id", candidate.id);

      const srcIds = (candidate.source_correction_ids as string[]) || [];
      if (srcIds.length > 0) {
        await supabase.from("correction_logs").update({
          rule_status: "active", approved_rule_id: candidate.similar_existing_rule_id,
          approved_at: new Date().toISOString(), approved_by: user.id,
        }).in("id", srcIds);
      }

      toast({ title: "🔄 既存ルールを更新しました" });
      await loadData();
    } catch (e: any) {
      toast({ title: "更新に失敗しました", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Reject
  const handleReject = async (candidate: RuleCandidate) => {
    if (!user) return;
    setActionLoading(candidate.id);
    try {
      await supabase.from("rule_candidates").update({
        status: "rejected", admin_notes: adminNotes[candidate.id] || null,
        reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq("id", candidate.id);

      const srcIds = (candidate.source_correction_ids as string[]) || [];
      if (srcIds.length > 0) {
        await supabase.from("correction_logs").update({ rule_status: "rejected" }).in("id", srcIds);
      }

      toast({ title: "❌ 却下しました" });
      await loadData();
    } catch {
      toast({ title: "却下に失敗しました", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Edit rule text
  const handleSaveEdit = async (candidateId: string) => {
    await supabase.from("rule_candidates").update({
      rule_text: editText, updated_at: new Date().toISOString(),
    }).eq("id", candidateId);
    setEditingId(null);
    await loadData();
  };

  // Direct promote correction log to check_rule
  const handleDirectPromote = async (log: CorrectionLog) => {
    if (!user) return;
    setActionLoading(log.id);
    try {
      const prefix = PREFIX_MAP[log.process_type] || "X";
      const { data: existingRules } = await supabase
        .from("check_rules").select("rule_id")
        .eq("product_id", log.product_id).eq("process_type", log.process_type)
        .like("rule_id", `COR-${prefix}-%`).order("rule_id", { ascending: false }).limit(1);

      let nextNum = 1;
      if (existingRules?.length) {
        const match = existingRules[0].rule_id.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      const ruleId = `COR-${prefix}-${String(nextNum).padStart(2, "0")}`;

      const { data: newRule, error: ruleError } = await supabase.from("check_rules").insert({
        product_id: log.product_id,
        process_type: log.process_type,
        rule_id: ruleId,
        title: ruleId,
        category: log.correction_category || "その他",
        description: log.correction_text,
        severity: log.ai_severity || "medium",
        sort_order: 999,
        is_active: true,
        source_type: "correction",
        source_correction_count: 1,
        source_correction_id: log.id,
      }).select().single();

      if (ruleError) throw ruleError;

      await supabase.from("correction_logs").update({
        rule_status: "active",
        approved_rule_id: newRule.id,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      }).eq("id", log.id);

      toast({ title: `✅ ルール ${ruleId} を追加しました` });
      await loadData();
    } catch (e: any) {
      toast({ title: "ルール追加に失敗しました", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Direct reject correction log
  const handleDirectReject = async (log: CorrectionLog) => {
    if (!user) return;
    setActionLoading(log.id);
    try {
      await supabase.from("correction_logs").update({ rule_status: "rejected" }).eq("id", log.id);
      toast({ title: "❌ 却下しました" });
      await loadData();
    } catch {
      toast({ title: "却下に失敗しました", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const getProductName = (id: string) => products.find((p) => p.id === id)?.name || "不明";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            ルール学習
          </h1>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">商材:</span>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">工程:</span>
              <Select value={selectedProcess} onValueChange={setSelectedProcess}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  {Object.entries(PROCESS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm" onClick={handleGenerate}
                    disabled={selectedProduct === "all" || generating}
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    ルール候補を生成
                  </Button>
                </span>
              </TooltipTrigger>
              {selectedProduct === "all" && <TooltipContent>商材を選択してください</TooltipContent>}
            </Tooltip>
          </div>

          {/* Summary */}
          <div className="mt-3 text-sm text-muted-foreground flex items-center gap-1">
            📊 蓄積状況: 修正指示 <span className="font-medium text-foreground">{totalCorrections}件</span> → ルール候補 <span className="font-medium text-foreground">{totalCandidates}件</span>（未承認 <span className="font-medium text-foreground">{pendingCount}件</span>）
          </div>
        </div>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="corrections">修正指示 ({totalCorrections})</TabsTrigger>
            <TabsTrigger value="pending">未承認 ({pendingCount})</TabsTrigger>
            <TabsTrigger value="approved">承認済み ({approvedCount})</TabsTrigger>
            <TabsTrigger value="rejected">却下 ({rejectedCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Correction Logs List */}
        {statusFilter === "corrections" ? (
          loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> 読み込み中...
            </div>
          ) : allCorrectionLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              修正指示はまだ記録されていません
            </div>
          ) : (
            <div className="space-y-3">
              {allCorrectionLogs.map((log) => {
                const isLoading = actionLoading === log.id;
                return (
                <Card key={log.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>工程: {PROCESS_LABELS[log.process_type] || log.process_type}</span>
                        <span>|</span>
                        <span>商材: {getProductName(log.product_id)}</span>
                        {log.created_at && (
                          <>
                            <span>|</span>
                            <span>{new Date(log.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </>
                        )}
                      </div>
                      <Badge variant="outline" className={cn("text-xs shrink-0", log.rule_status === "active" ? "bg-primary/10 text-primary border-primary/30" : log.rule_status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-muted text-muted-foreground border-border")}>
                        {log.rule_status === "active" ? "ルール化済" : log.rule_status === "rejected" ? "却下" : "未処理"}
                      </Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{log.correction_text}</p>
                    {log.rule_status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => handleDirectPromote(log)} disabled={isLoading}>
                          {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                          ルール化する
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDirectReject(log)} disabled={isLoading}>
                          <X className="h-3 w-3 mr-1" /> 却下
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> 読み込み中...
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            該当するルール候補はありません
          </div>
        ) : (
          <div className="space-y-4">
            {candidates.map((c) => {
              const sev = SEVERITY_CONFIG[c.severity || "medium"] || SEVERITY_CONFIG.medium;
              const corrections = correctionMap[c.id] || [];
              const similarRule = c.similar_existing_rule_id ? similarRuleMap[c.similar_existing_rule_id] : null;
              const isLoading = actionLoading === c.id;

              return (
                <Card key={c.id} className="relative">
                  <CardContent className="p-5 space-y-3">
                    {/* Top meta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>📋 ルール候補</span>
                        <span>|</span>
                        <span>工程: {PROCESS_LABELS[c.process_type] || c.process_type}</span>
                        <span>|</span>
                        <span>商材: {getProductName(c.product_id)}</span>
                        <span>|</span>
                        <span>適用: {c.scope === "product" ? "商材共通" : "案件のみ"}</span>
                      </div>
                      <Badge variant="outline" className={cn("text-xs shrink-0", sev.class)}>
                        {sev.label}
                      </Badge>
                    </div>

                    {/* Rule title */}
                    {c.rule_title && (
                      <p className="font-semibold text-sm">🏷️ {c.rule_title}</p>
                    )}

                    {/* Rule text */}
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      {editingId === c.id ? (
                        <div className="space-y-2">
                          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleSaveEdit(c.id)}>
                              <Check className="h-3 w-3 mr-1" /> 保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap">{c.rule_text}</p>
                          {statusFilter === "pending" && (
                            <Button size="sm" variant="ghost" className="shrink-0"
                              onClick={() => { setEditingId(c.id); setEditText(c.rule_text); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Source corrections */}
                    {corrections.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
                          📊 根拠: 修正指示 {corrections.length}件
                          <ChevronDown className="h-3 w-3" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-1 pl-4 border-l-2 border-muted">
                          {corrections.slice(0, 3).map((log) => (
                            <p key={log.id} className="text-xs text-muted-foreground">
                              ・「{log.correction_text.slice(0, 40)}{log.correction_text.length > 40 ? "..." : ""}」
                              {log.created_at && <span className="ml-1">({new Date(log.created_at).toLocaleDateString("ja-JP")})</span>}
                            </p>
                          ))}
                          {corrections.length > 3 && (
                            <p className="text-xs text-muted-foreground">他{corrections.length - 3}件</p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Similar rule */}
                    {similarRule && (
                      <div className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>類似ルール: {similarRule.rule_id}「{similarRule.description.slice(0, 50)}...」→ 既存ルールをより具体化した内容です</span>
                      </div>
                    )}

                    {/* Approved rule ID (for approved tab) */}
                    {statusFilter === "approved" && c.approved_rule_id && (
                      <div className="text-xs text-muted-foreground">
                        追加ルールID: <span className="font-mono text-foreground">{c.approved_rule_id}</span>
                      </div>
                    )}

                    {/* Admin notes (show for rejected) */}
                    {statusFilter === "rejected" && c.admin_notes && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                        管理者メモ: {c.admin_notes}
                      </div>
                    )}

                    {/* Admin notes input + actions (pending only) */}
                    {statusFilter === "pending" && (
                      <>
                        <div>
                          <Textarea
                            placeholder="管理者メモ（任意）"
                            className="text-xs min-h-[40px] h-10"
                            value={adminNotes[c.id] || ""}
                            onChange={(e) => setAdminNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => handleApproveAsNew(c)} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                            承認（新規ルール追加）
                          </Button>
                          {similarRule && (
                            <Button size="sm" variant="secondary" onClick={() => handleUpdateExisting(c)} disabled={isLoading}>
                              🔄 既存ルール更新
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleReject(c)} disabled={isLoading}>
                            <X className="h-3 w-3 mr-1" /> 却下
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
