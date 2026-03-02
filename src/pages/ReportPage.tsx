import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getProcessLabel } from "@/lib/process-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { Target, CheckCircle, TrendingUp, Calendar, Settings2, Save, Download, FileSpreadsheet, FileText, RotateCcw, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─── Types ────────────────────────────────────────── */

interface ProcessRow {
  id: string;
  project_id: string;
  process_key: string;
  process_label: string;
  status: string;
  deadline: string | null;
  internal_deadline: string | null;
  client_deadline: string | null;
  updated_at: string;
}

interface FileRow {
  id: string;
  project_id: string;
  process_type: string;
  status: string | null;
  version_number: number | null;
  parent_file_id: string | null;
  fixed_at: string | null;
  created_at: string | null;
  submission_type: string;
}

interface ProjectRow { id: string; name: string; product_id: string | null; }
interface ProductRow { id: string; name: string; client_id: string | null; }
interface ClientRow { id: string; name: string; }
interface KpiTarget { id: string; key: string; label: string; target_value: number; }

type SubmissionFilter = "all" | "internal" | "client";
type DrillTab = "overview" | "by_client" | "by_project" | "by_process";

/* ─── Helpers ──────────────────────────────────────── */

function toMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Generate list of YYYY-MM from earliest data to now */
function generateMonthOptions(procs: ProcessRow[], files: FileRow[]): string[] {
  let min = new Date();
  let max = new Date();
  for (const p of procs) {
    const d = new Date(p.updated_at);
    if (d < min) min = d;
  }
  for (const f of files) {
    if (f.created_at) {
      const d = new Date(f.created_at);
      if (d < min) min = d;
    }
  }
  const months: string[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cursor <= max) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${y}/${mo}`;
}

/* ─── Metric computations ──────────────────────────── */

interface MetricSet {
  deadlineRate: number | null;
  deadlineTotal: number;
  deadlineOnTime: number;
  firstDraftRate: number | null;
  firstDraftTotal: number;
  firstDraftPassed: number;
  avgRevisions: number | null;
  revisionSequences: number;
  totalRevisions: number;
  internalRevisions: number | null;
  internalRevSequences: number;
  clientRevisions: number | null;
  clientRevSequences: number;
}

function computeMetrics(procs: ProcessRow[], fileSet: FileRow[], submissionType?: "internal" | "client"): MetricSet {
  // 納期遵守率:
  // 社内: 社内期限までに全パターンの初稿(version_number=1, submission_type=internal)がアップロードされているか
  // クライアント: クライアント期限までに全パターンがチェック完了&クライアント提出済みか

  let deadlineTotal = 0;
  let deadlineOnTime = 0;

  for (const p of procs) {
    const processFiles = fileSet.filter(f => f.project_id === p.project_id && f.process_type === p.process_key);

    if (submissionType === "internal" || (!submissionType)) {
      const dl = p.internal_deadline;
      if (dl) {
        deadlineTotal++;
        const deadlineDate = new Date(dl + "T23:59:59");
        // Check: all first-draft internal files uploaded before deadline
        const internalFirstDrafts = processFiles.filter(f => f.submission_type === "internal" && (f.version_number ?? 1) === 1 && !f.parent_file_id);
        if (internalFirstDrafts.length > 0) {
          const allOnTime = internalFirstDrafts.every(f => f.created_at && new Date(f.created_at) <= deadlineDate);
          if (allOnTime) deadlineOnTime++;
        }
      }
    }

    if (submissionType === "client" || (!submissionType && !p.internal_deadline)) {
      const dl = p.client_deadline;
      if (dl && submissionType === "client") {
        // Don't double-count if we already counted internal above for "all" mode
        if (submissionType === "client") deadlineTotal++;
        const deadlineDate = new Date(dl + "T23:59:59");
        // Check: all files checked & submitted to client before deadline
        const clientFiles = processFiles.filter(f => f.submission_type === "client");
        if (clientFiles.length > 0) {
          const allSubmittedOnTime = clientFiles.every(f => {
            const isCheckedOrFixed = f.status === "checked" || f.status === "fixed" || f.status === "approved";
            return isCheckedOrFixed && f.created_at && new Date(f.created_at) <= deadlineDate;
          });
          if (allSubmittedOnTime) deadlineOnTime++;
        }
      }
    }
  }

  // 初稿合格率: version_number=1 のファイルで、status が fixed/approved の割合
  const isChecked = (f: FileRow) => f.status && f.status !== "uploaded";
  const isPassed = (f: FileRow) => f.status === "fixed" || f.status === "approved";
  const firstDraftFiles = fileSet.filter(f => (f.version_number ?? 1) === 1 && isChecked(f));
  const firstDraftPassed = firstDraftFiles.filter(isPassed).length;

  // 修正稿数: 提出タイプごとにバージョン数をカウント
  const computeRevForType = (files: FileRow[]) => {
    const chains = new Map<string, number>();
    for (const f of files) {
      const key = `${f.project_id}::${f.process_type}`;
      const ver = f.version_number ?? 1;
      chains.set(key, Math.max(chains.get(key) ?? 0, ver));
    }
    let total = 0, count = 0;
    for (const [, maxVer] of chains) { total += maxVer - 1; count++; }
    return { total, count };
  };

  const allRev = computeRevForType(fileSet);
  const internalFiles = fileSet.filter(f => f.submission_type === "internal");
  const clientFiles = fileSet.filter(f => f.submission_type === "client");
  const internalRev = computeRevForType(internalFiles);
  const clientRev = computeRevForType(clientFiles);

  return {
    deadlineRate: deadlineTotal > 0 ? Math.round((deadlineOnTime / deadlineTotal) * 100) : null,
    deadlineTotal,
    deadlineOnTime,
    firstDraftRate: firstDraftFiles.length > 0 ? Math.round((firstDraftPassed / firstDraftFiles.length) * 100) : null,
    firstDraftTotal: firstDraftFiles.length,
    firstDraftPassed,
    avgRevisions: allRev.count > 0 ? Math.round((allRev.total / allRev.count) * 10) / 10 : null,
    revisionSequences: allRev.count,
    totalRevisions: allRev.total,
    internalRevisions: internalRev.count > 0 ? Math.round((internalRev.total / internalRev.count) * 10) / 10 : null,
    internalRevSequences: internalRev.count,
    clientRevisions: clientRev.count > 0 ? Math.round((clientRev.total / clientRev.count) * 10) / 10 : null,
    clientRevSequences: clientRev.count,
  };
}

/* ─── Main Component ───────────────────────────────── */

export default function ReportPage() {
  const { user, isAdmin } = useAuth();
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>("all");
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [drillTab, setDrillTab] = useState<DrillTab>("overview");
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  // Period filter: start/end month (YYYY-MM)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sixMonthsAgo = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const [periodFrom, setPeriodFrom] = useState(sixMonthsAgo);
  const [periodTo, setPeriodTo] = useState(currentMonth);

  const targetMap = useMemo(() => new Map(targets.map(t => [t.key, t.target_value])), [targets]);
  const getTarget = (key: string, fallback: number) => targetMap.get(key) ?? fallback;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes, prodRes, clientRes, targetRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, deadline, internal_deadline, client_deadline, updated_at"),
          supabase.from("project_files").select("id, project_id, process_type, status, version_number, parent_file_id, fixed_at, created_at, submission_type"),
          supabase.from("projects").select("id, name, product_id"),
          supabase.from("products").select("id, name, client_id"),
          supabase.from("clients").select("id, name"),
          supabase.from("kpi_targets").select("*"),
        ]);
        if (cancelled) return;
        handleSupabaseError(procRes.error, "project_processes");
        handleSupabaseError(fileRes.error, "project_files");
        setProcesses(procRes.data ?? []);
        setFiles(fileRes.data ?? []);
        setProjects(projRes.data ?? []);
        setProducts(prodRes.data ?? []);
        setClients(clientRes.data ?? []);
        setTargets((targetRes.data ?? []) as KpiTarget[]);
      } catch (e) {
        console.error("[Report] fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  // Available month options
  const monthOptions = useMemo(() => generateMonthOptions(processes, files), [processes, files]);

  // Mapping helpers
  const projectProductMap = useMemo(() => new Map(projects.map(p => [p.id, p.product_id])), [projects]);
  const productClientMap = useMemo(() => new Map(products.map(p => [p.id, p.client_id])), [products]);
  const projectNameMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);

  const getClientIdForProject = (pid: string) => {
    const prodId = projectProductMap.get(pid);
    return prodId ? productClientMap.get(prodId) : null;
  };

  // Period-filtered data
  const isInPeriod = (dateStr: string) => {
    const mk = toMonthKey(dateStr);
    return mk >= periodFrom && mk <= periodTo;
  };

  const periodProcesses = useMemo(() =>
    processes.filter(p => isInPeriod(p.updated_at)),
    [processes, periodFrom, periodTo]
  );

  const periodFiles = useMemo(() =>
    files.filter(f => f.created_at && isInPeriod(f.created_at)),
    [files, periodFrom, periodTo]
  );

  // Submission filter
  const filteredFiles = useMemo(() => {
    if (submissionFilter === "all") return periodFiles;
    return periodFiles.filter(f => f.submission_type === submissionFilter);
  }, [periodFiles, submissionFilter]);

  // Overall metrics
  const overall = useMemo(() => computeMetrics(periodProcesses, filteredFiles, submissionFilter !== "all" ? submissionFilter : undefined), [periodProcesses, filteredFiles, submissionFilter]);

  // Monthly trend
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { procs: ProcessRow[]; files: FileRow[] }>();
    const ensure = (k: string) => { if (!monthMap.has(k)) monthMap.set(k, { procs: [], files: [] }); return monthMap.get(k)!; };

    periodProcesses.filter(p => p.status === "completed" && p.deadline).forEach(p => {
      ensure(toMonthKey(p.updated_at)).procs.push(p);
    });
    filteredFiles.filter(f => f.created_at).forEach(f => {
      ensure(toMonthKey(f.created_at!)).files.push(f);
    });

    return [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
      const m = computeMetrics(data.procs, data.files);
      return { month, monthLabel: monthLabel(month), ...m };
    });
  }, [periodProcesses, filteredFiles]);

  // Breakdowns
  const clientBreakdown = useMemo(() => {
    return clients.map(client => {
      const clientProductIds = products.filter(p => p.client_id === client.id).map(p => p.id);
      const clientProjectIds = projects.filter(p => p.product_id && clientProductIds.includes(p.product_id)).map(p => p.id);
      const procs = periodProcesses.filter(p => clientProjectIds.includes(p.project_id));
      const fls = filteredFiles.filter(f => clientProjectIds.includes(f.project_id));
      return { id: client.id, name: client.name, ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [clients, products, projects, periodProcesses, filteredFiles]);

  const projectBreakdown = useMemo(() => {
    const pids = [...new Set([...periodProcesses.map(p => p.project_id), ...filteredFiles.map(f => f.project_id).filter(Boolean)])];
    return pids.map(pid => {
      const procs = periodProcesses.filter(p => p.project_id === pid);
      const fls = filteredFiles.filter(f => f.project_id === pid);
      return { id: pid, name: projectNameMap.get(pid) || "不明", ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [periodProcesses, filteredFiles, projectNameMap]);

  const processBreakdown = useMemo(() => {
    const keys = [...new Set(filteredFiles.map(f => f.process_type))];
    return keys.map(key => {
      const procs = periodProcesses.filter(p => p.process_key === key);
      const fls = filteredFiles.filter(f => f.process_type === key);
      return { key, label: getProcessLabel(key), ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [periodProcesses, filteredFiles]);

  // Submission type summary
  const submissionSummary = useMemo(() => {
    const internal = periodFiles.filter(f => f.submission_type === "internal");
    const client = periodFiles.filter(f => f.submission_type === "client");
    return {
      internal: computeMetrics(periodProcesses, internal, "internal"),
      client: computeMetrics(periodProcesses, client, "client"),
    };
  }, [periodProcesses, periodFiles]);

  const chartConfig = {
    deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
    firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
  };

  const submissionLabels: Record<SubmissionFilter, string> = { all: "全体", internal: "社内提出", client: "クライアント提出" };
  const drillTabLabels: Record<DrillTab, string> = { overview: "全体推移", by_client: "クライアント別", by_project: "案件別", by_process: "工程別" };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <h1 className="text-lg font-bold">レポート</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" />目標設定
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>KPI 目標値の設定</DialogTitle></DialogHeader>
                <TargetEditor targets={targets} onSaved={updated => { setTargets(updated); setTargetDialogOpen(false); }} />
              </DialogContent>
            </Dialog>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />エクスポート
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2 opacity-50" disabled>
                <FileSpreadsheet className="h-4 w-4" />Excel（準備中）
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 opacity-50" disabled>
                <FileText className="h-4 w-4" />PDF（準備中）
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Filters row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">期間:</span>
            <Select value={periodFrom} onValueChange={v => { setPeriodFrom(v); if (v > periodTo) setPeriodTo(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">〜</span>
            <Select value={periodTo} onValueChange={v => { setPeriodTo(v); if (v < periodFrom) setPeriodFrom(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Submission filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">提出:</span>
            {(["all", "internal", "client"] as SubmissionFilter[]).map(f => (
              <Button
                key={f}
                variant={submissionFilter === f ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setSubmissionFilter(f)}
              >
                {submissionLabels[f]}
              </Button>
            ))}
          </div>
        </div>

        {/* KPI定義セクション */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 cursor-pointer select-none" onClick={() => setShowDefinitions(v => !v)}>
              <FileText className="h-3.5 w-3.5" />
              集計ロジック・定義
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDefinitions && "rotate-180")} />
            </CardTitle>
          </CardHeader>
          {showDefinitions && (
            <CardContent className="pt-0 space-y-4 text-xs text-muted-foreground leading-relaxed">
              <div>
                <h4 className="font-semibold text-foreground mb-1">① 納期遵守率</h4>
                <p className="mb-1">目標: {getTarget("deadline_compliance", 100)}%</p>
                <div className="pl-3 border-l-2 border-border space-y-1">
                  <p><span className="font-medium text-foreground">社内提出:</span> 各工程に設定された「社内期限」までに、全パターンのクリエイティブ初稿（version_number=1, submission_type=internal）がアップロードされているかで判定。</p>
                  <p><span className="font-medium text-foreground">クライアント提出:</span> 各工程に設定された「クライアント期限」までに、全パターンのクリエイティブがチェック完了済み（checked / fixed / approved）かつクライアント提出済み（submission_type=client）になっているかで判定。</p>
                  <p className="text-[10px]">計算式: 遵守工程数 ÷ 期限設定済み工程数 × 100</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">② 初稿合格率</h4>
                <p className="mb-1">目標: {getTarget("first_draft_pass", 80)}%</p>
                <div className="pl-3 border-l-2 border-border space-y-1">
                  <p>初稿（version_number=1）のファイルのうち、修正を挟まずに「FIX済」または「承認済」に到達した割合。</p>
                  <p className="text-[10px]">計算式: FIX済み初稿数 ÷ チェック済み初稿数 × 100</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">③ 平均修正回数</h4>
                <div className="pl-3 border-l-2 border-border space-y-1">
                  <p>提出タイプごとに、各案件×工程のシーケンスにおける最大バージョン番号から1を引いた値の平均。</p>
                  <p className="text-[10px]">計算式: Σ(最大バージョン番号 - 1) ÷ シーケンス数</p>
                  <p><span className="font-medium text-foreground">社内修正:</span> submission_type=internal のファイルのみで集計</p>
                  <p><span className="font-medium text-foreground">クライアント修正:</span> submission_type=client のファイルのみで集計</p>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <h4 className="font-semibold text-foreground mb-1">補足：完了条件</h4>
                <div className="pl-3 border-l-2 border-border space-y-1">
                  <p><span className="font-medium text-foreground">工程の完了:</span> 全ファイルが「クライアント提出済み」または「FIX済み」でなければ完了ステータスに変更不可。</p>
                  <p><span className="font-medium text-foreground">案件の完了:</span> 全ファイルが「FIX済み」でなければ完了ステータスに変更不可。完了日が納期を超過している場合は「遅延」、間に合っている場合は「納期遵守OK」と表示。</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 3 KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            icon={Target}
            label="納期遵守率"
            value={overall.deadlineRate !== null ? `${overall.deadlineRate}%` : "—"}
            rate={overall.deadlineRate}
            target={getTarget("deadline_compliance", 100)}
            detail={`${overall.deadlineOnTime}/${overall.deadlineTotal}件`}
            color="text-primary"
          />
          <KpiCard
            icon={CheckCircle}
            label="初稿合格率"
            value={overall.firstDraftRate !== null ? `${overall.firstDraftRate}%` : "—"}
            rate={overall.firstDraftRate}
            target={getTarget("first_draft_pass", 80)}
            detail={`${overall.firstDraftPassed}/${overall.firstDraftTotal}件`}
            color="text-status-ok"
          />
          <KpiCard
            icon={RotateCcw}
            label="平均修正回数"
            value={overall.avgRevisions !== null ? `${overall.avgRevisions}回` : "—"}
            rate={null}
            target={null}
            detail={`${overall.revisionSequences}シーケンス`}
            color="text-status-warning"
            isRevision
          />
        </div>

        {/* Submission type comparison */}
        {submissionFilter === "all" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium">社内 / クライアント提出別</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">提出タイプ</th>
                    <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                    <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                    <th className="px-4 py-2 font-medium text-right">平均修正回数</th>
                    <th className="px-4 py-2 font-medium text-right">期限基準</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">社内提出</td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={submissionSummary.internal.deadlineRate} target={getTarget("deadline_compliance", 100)} total={submissionSummary.internal.deadlineTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={submissionSummary.internal.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={submissionSummary.internal.firstDraftTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {submissionSummary.internal.internalRevisions !== null ? (
                        <span className="font-bold">{submissionSummary.internal.internalRevisions}回</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-[10px] text-muted-foreground">社内期限</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">クライアント提出</td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={submissionSummary.client.deadlineRate} target={getTarget("deadline_compliance", 100)} total={submissionSummary.client.deadlineTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={submissionSummary.client.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={submissionSummary.client.firstDraftTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {submissionSummary.client.clientRevisions !== null ? (
                        <span className="font-bold">{submissionSummary.client.clientRevisions}回</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-[10px] text-muted-foreground">クライアント期限</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Drill-down tabs */}
        <Tabs value={drillTab} onValueChange={v => setDrillTab(v as DrillTab)}>
          <TabsList>
            {(Object.entries(drillTabLabels) as [DrillTab, string][]).map(([k, v]) => (
              <TabsTrigger key={k} value={k} className="text-xs">{v}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />月別推移
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">データがありません</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="monthLabel" className="text-xs" />
                      <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                        const labels: Record<string, string> = { deadlineRate: "納期遵守率", firstDraftRate: "初稿合格率" };
                        return [`${value}%`, labels[name as string] || name];
                      }} />} />
                      <ReferenceLine y={getTarget("deadline_compliance", 100)} stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <ReferenceLine y={getTarget("first_draft_pass", 80)} stroke="hsl(var(--status-ok))" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <Line type="monotone" dataKey="deadlineRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="firstDraftRate" stroke="hsl(var(--status-ok))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Legend formatter={value => {
                        const labels: Record<string, string> = { deadlineRate: "納期遵守率", firstDraftRate: "初稿合格率" };
                        return labels[value] || value;
                      }} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />月別詳細</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="px-4 py-2 font-medium">月</th>
                      <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                      <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                      <th className="px-4 py-2 font-medium text-right">平均修正回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                    ) : (
                      [...monthlyData].reverse().map(d => (
                        <tr key={d.month} className="border-b border-border/50">
                          <td className="px-4 py-2 font-medium">{d.monthLabel}</td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.deadlineRate} target={getTarget("deadline_compliance", 100)} total={d.deadlineTotal} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={d.firstDraftTotal} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            {d.avgRevisions !== null ? (
                              <span className="font-bold">{d.avgRevisions}回</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="by_client" className="mt-4">
            <MetricsTable title="クライアント別" rows={clientBreakdown.map(b => ({ key: b.id, name: b.name, ...b }))} targets={targetMap} />
          </TabsContent>

          <TabsContent value="by_project" className="mt-4">
            <MetricsTable title="案件別" rows={projectBreakdown.map(b => ({ key: b.id, name: b.name, ...b }))} targets={targetMap} />
          </TabsContent>

          <TabsContent value="by_process" className="mt-4">
            <MetricsTable title="工程別" rows={processBreakdown.map(b => ({ key: b.key, name: b.label, ...b }))} targets={targetMap} />
          </TabsContent>
        </Tabs>

        {/* Logic explanation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">集計ロジック</CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground space-y-2">
            <div>
              <p className="font-medium text-foreground">① 納期遵守率（目標: {getTarget("deadline_compliance", 100)}%）</p>
              <p>工程（project_processes）のステータスが「完了」になった日時（updated_at）と、設定された期限を比較。</p>
              <p>• 社内提出: <code className="bg-muted px-1 rounded">internal_deadline</code>で判定</p>
              <p>• クライアント提出: <code className="bg-muted px-1 rounded">client_deadline</code>で判定</p>
              <p className="text-[10px]">計算式: 期限内完了工程数 ÷ 完了済み工程数（該当期限設定あり） × 100</p>
            </div>
            <div>
              <p className="font-medium text-foreground">② 初稿合格率（目標: {getTarget("first_draft_pass", 80)}%）</p>
              <p>version_number = 1（初稿）のファイルのうち、チェック済み（status ≠ uploaded）かつ status が「fixed」または「approved」のものを「合格」とカウント。</p>
              <p className="text-[10px]">計算式: 初稿合格ファイル数 ÷ 初稿チェック済みファイル数 × 100</p>
            </div>
            <div>
              <p className="font-medium text-foreground">③ 平均修正回数</p>
              <p>提出タイプ（submission_type）ごとにバージョン数をカウント。</p>
              <p>• 社内修正回数 = submission_type=internal のファイルの最大version - 1</p>
              <p>• クライアント修正回数 = submission_type=client のファイルの最大version - 1</p>
              <p className="text-[10px]">計算式: Σ(各シーケンスの最大version - 1) ÷ シーケンス数</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────── */

function KpiCard({ icon: Icon, label, value, rate, target, detail, color, isRevision }: {
  icon: React.ElementType; label: string; value: string; rate: number | null; target: number | null; detail: string; color: string; isRevision?: boolean;
}) {
  const getColor = () => {
    if (isRevision) return "text-foreground";
    if (rate === null || target === null) return "text-muted-foreground";
    if (rate >= target) return "text-status-ok";
    if (rate >= target * 0.7) return "text-status-warning";
    return "text-status-ng";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} />
          {label}
          {target !== null && <Badge variant="outline" className="ml-auto text-[10px]">目標: {target}%</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          <div className={cn("text-2xl font-bold", getColor())}>{value}</div>
          {rate !== null && target !== null && <Progress value={rate} className="h-1.5" />}
          <p className="text-[10px] text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RateCell({ rate, target, total }: { rate: number | null; target: number; total: number }) {
  if (rate === null || total === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("font-bold", rate >= target ? "text-status-ok" : rate >= target * 0.7 ? "text-status-warning" : "text-status-ng")}>
        {rate}%
      </span>
      <span className="text-muted-foreground text-[10px]">({total})</span>
    </span>
  );
}

// SubmissionRow removed - inlined in the submission comparison table above

function MetricsTable({ title, rows, targets }: {
  title: string;
  rows: { key: string; name: string; deadlineRate: number | null; deadlineTotal: number; firstDraftRate: number | null; firstDraftTotal: number; avgRevisions: number | null; revisionSequences: number }[];
  targets: Map<string, number>;
}) {
  const getTarget = (key: string, fallback: number) => targets.get(key) ?? fallback;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
              <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
              <th className="px-4 py-2 font-medium text-right">平均修正回数</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">データなし</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.key} className="border-b border-border/50">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    <RateCell rate={r.deadlineRate} target={getTarget("deadline_compliance", 100)} total={r.deadlineTotal} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RateCell rate={r.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={r.firstDraftTotal} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.avgRevisions !== null ? (
                      <span className="font-bold">{r.avgRevisions}回</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TargetEditor({ targets, onSaved }: { targets: KpiTarget[]; onSaved: (updated: KpiTarget[]) => void }) {
  // Only show relevant KPIs (deadline_compliance, first_draft_pass)
  const relevantTargets = targets.filter(t => ["deadline_compliance", "first_draft_pass"].includes(t.key));
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(relevantTargets.map(t => [t.key, t.target_value]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of relevantTargets) {
        const newVal = values[t.key];
        if (newVal !== t.target_value) {
          const { error } = await supabase.from("kpi_targets").update({ target_value: newVal, updated_at: new Date().toISOString() }).eq("id", t.id);
          if (error) throw error;
        }
      }
      const { data } = await supabase.from("kpi_targets").select("*");
      onSaved((data ?? []) as KpiTarget[]);
      toast.success("目標値を更新しました");
    } catch (e) {
      console.error(e);
      toast.error("更新に失敗しました");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {relevantTargets.length === 0 ? (
        <p className="text-sm text-muted-foreground">設定可能なKPIがありません</p>
      ) : (
        relevantTargets.map(t => (
          <div key={t.key} className="flex items-center gap-3">
            <label className="text-sm font-medium flex-1">{t.label}</label>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} className="w-20 text-right"
                value={values[t.key] ?? t.target_value}
                onChange={e => setValues(v => ({ ...v, [t.key]: parseInt(e.target.value) || 0 }))}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">※ 修正回数は目標値ではなく実績のみ表示します</p>
      <Button onClick={handleSave} disabled={saving || relevantTargets.length === 0} className="w-full gap-2">
        <Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
