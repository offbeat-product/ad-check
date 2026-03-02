import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Target, CheckCircle, TrendingUp, Calendar, Settings2, Save, Download, FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
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
interface SubmissionLog { id: string; file_id: string; project_id: string | null; product_id: string | null; process_type: string; action_type: string; version_number: number; created_at: string; }


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
  /** ログベースのアクション回数 */
  logClientSubmitCount: number;
  logInternalRevisionCount: number;
}

function computeMetrics(procs: ProcessRow[], allFiles: FileRow[], submissionType: "internal" | "client", logs?: SubmissionLog[]): MetricSet {
  // ── 納期遵守率 ──
  let deadlineTotal = 0;
  let deadlineOnTime = 0;

  for (const p of procs) {
    const processFiles = allFiles.filter(f => f.project_id === p.project_id && f.process_type === p.process_key);

    if (submissionType === "internal") {
      // 社内: 社内期限までに初稿アップロードが完了しているか
      const dl = p.internal_deadline;
      if (dl) {
        deadlineTotal++;
        const deadlineDate = new Date(dl + "T23:59:59");
        const internalFirstDrafts = processFiles.filter(f => f.submission_type === "internal" && (f.version_number ?? 1) === 1 && !f.parent_file_id);
        if (internalFirstDrafts.length > 0) {
          const allOnTime = internalFirstDrafts.every(f => f.created_at && new Date(f.created_at) <= deadlineDate);
          if (allOnTime) deadlineOnTime++;
        }
      }
    } else {
      // クライアント: クライアント期限までにチェック・クライアント提出が完了し、FIX済みか
      const dl = p.client_deadline;
      if (dl) {
        deadlineTotal++;
        const deadlineDate = new Date(dl + "T23:59:59");
        const clientFiles = processFiles.filter(f => f.submission_type === "client");
        if (clientFiles.length > 0) {
          const allFixedOnTime = clientFiles.every(f => {
            const isFixed = f.status === "fixed" || f.status === "approved";
            // fixed_at がある場合はそれを使い、なければ updated_at で判定
            const completedAt = f.fixed_at || f.created_at;
            return isFixed && completedAt && new Date(completedAt) <= deadlineDate;
          });
          if (allFixedOnTime) deadlineOnTime++;
        }
      }
    }
  }

  // ── 初稿合格率 ──
  let firstDraftTotal = 0;
  let firstDraftPassed = 0;

  if (submissionType === "client") {
    // クライアント初稿合格率: クライアントに提出した初稿(v1, submission_type=client)がFIX済みか
    const clientFirstDrafts = allFiles.filter(f => f.submission_type === "client" && (f.version_number ?? 1) === 1);
    firstDraftTotal = clientFirstDrafts.length;
    firstDraftPassed = clientFirstDrafts.filter(f => f.status === "fixed" || f.status === "approved").length;
  } else {
    // 社内初稿合格率: 社内に提出した初稿(v1)がクライアント提出済みになっているか
    // v1ファイル全体から、client_submitログがあるものを合格とする
    const v1Files = allFiles.filter(f => (f.version_number ?? 1) === 1 && !f.parent_file_id);
    firstDraftTotal = v1Files.length;
    if (logs && logs.length > 0) {
      firstDraftPassed = v1Files.filter(f =>
        logs.some(l => l.file_id === f.id && l.action_type === "client_submit")
      ).length;
    } else {
      // Fallback: submission_type が client に変わっているかで判定
      firstDraftPassed = v1Files.filter(f => f.submission_type === "client").length;
    }
  }

  // ── 修正回数 ──
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

  const allRev = computeRevForType(allFiles);
  const internalFiles = allFiles.filter(f => f.submission_type === "internal");
  const clientFiles = allFiles.filter(f => f.submission_type === "client");
  const internalRev = computeRevForType(internalFiles);
  const clientRev = computeRevForType(clientFiles);

  // ログベースのアクション回数
  const logClientSubmitCount = logs ? logs.filter(l => l.action_type === "client_submit").length : 0;
  const logInternalRevisionCount = logs ? logs.filter(l => l.action_type === "internal_revision").length : 0;

  return {
    deadlineRate: deadlineTotal > 0 ? Math.round((deadlineOnTime / deadlineTotal) * 100) : null,
    deadlineTotal,
    deadlineOnTime,
    firstDraftRate: firstDraftTotal > 0 ? Math.round((firstDraftPassed / firstDraftTotal) * 100) : null,
    firstDraftTotal,
    firstDraftPassed,
    avgRevisions: allRev.count > 0 ? Math.round((allRev.total / allRev.count) * 10) / 10 : null,
    revisionSequences: allRev.count,
    totalRevisions: allRev.total,
    internalRevisions: internalRev.count > 0 ? Math.round((internalRev.total / internalRev.count) * 10) / 10 : null,
    internalRevSequences: internalRev.count,
    clientRevisions: clientRev.count > 0 ? Math.round((clientRev.total / clientRev.count) * 10) / 10 : null,
    clientRevSequences: clientRev.count,
    logClientSubmitCount,
    logInternalRevisionCount,
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
  const [submissionLogs, setSubmissionLogs] = useState<SubmissionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  // Period filter: start/end month (YYYY-MM)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [periodFrom, setPeriodFrom] = useState(currentMonth);
  const [periodTo, setPeriodTo] = useState(currentMonth);

  // Drill-down filters
  const [filterClientId, setFilterClientId] = useState<string>("all");
  const [filterProductId, setFilterProductId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");

  const targetMap = useMemo(() => new Map(targets.map(t => [t.key, t.target_value])), [targets]);
  const getTarget = (key: string, fallback: number) => targetMap.get(key) ?? fallback;
  const getClientTarget = (base: string, fallback: number) => targetMap.get(`client_${base}`) ?? targetMap.get(base) ?? fallback;
  const getInternalTarget = (base: string, fallback: number) => targetMap.get(`internal_${base}`) ?? targetMap.get(base) ?? fallback;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes, prodRes, clientRes, targetRes, logRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, deadline, internal_deadline, client_deadline, updated_at"),
          supabase.from("project_files").select("id, project_id, process_type, status, version_number, parent_file_id, fixed_at, created_at, submission_type"),
          supabase.from("projects").select("id, name, product_id"),
          supabase.from("products").select("id, name, client_id"),
          supabase.from("clients").select("id, name"),
          supabase.from("kpi_targets").select("*"),
          supabase.from("submission_logs").select("id, file_id, project_id, product_id, process_type, action_type, version_number, created_at") as any,
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
        setSubmissionLogs((logRes.data ?? []) as SubmissionLog[]);
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

  // Cascading filter options
  const filteredProducts = useMemo(() => {
    if (filterClientId === "all") return products;
    return products.filter(p => p.client_id === filterClientId);
  }, [products, filterClientId]);

  const filteredProjects = useMemo(() => {
    let filtered = projects;
    if (filterProductId !== "all") {
      filtered = filtered.filter(p => p.product_id === filterProductId);
    } else if (filterClientId !== "all") {
      const productIds = new Set(filteredProducts.map(p => p.id));
      filtered = filtered.filter(p => p.product_id && productIds.has(p.product_id));
    }
    return filtered;
  }, [projects, filterClientId, filterProductId, filteredProducts]);

  // Reset dependent filters on parent change
  const handleClientChange = (v: string) => {
    setFilterClientId(v);
    setFilterProductId("all");
    setFilterProjectId("all");
  };
  const handleProductChange = (v: string) => {
    setFilterProductId(v);
    setFilterProjectId("all");
  };

  // Determine which project IDs are in scope
  const scopeProjectIds = useMemo(() => {
    if (filterProjectId !== "all") return new Set([filterProjectId]);
    return new Set(filteredProjects.map(p => p.id));
  }, [filterProjectId, filteredProjects]);

  // Period-filtered data
  const isInPeriod = (dateStr: string) => {
    const mk = toMonthKey(dateStr);
    return mk >= periodFrom && mk <= periodTo;
  };

  const periodProcesses = useMemo(() =>
    processes.filter(p => scopeProjectIds.has(p.project_id) && isInPeriod(p.updated_at)),
    [processes, scopeProjectIds, periodFrom, periodTo]
  );

  const periodFiles = useMemo(() =>
    files.filter(f => f.created_at && f.project_id && scopeProjectIds.has(f.project_id) && isInPeriod(f.created_at)),
    [files, scopeProjectIds, periodFrom, periodTo]
  );

  // Filter submission logs by period and scope
  const periodLogs = useMemo(() =>
    submissionLogs.filter(l => l.created_at && l.project_id && scopeProjectIds.has(l.project_id) && isInPeriod(l.created_at)),
    [submissionLogs, scopeProjectIds, periodFrom, periodTo]
  );

  // Submission type summary
  const submissionSummary = useMemo(() => {
    return {
      internal: computeMetrics(periodProcesses, periodFiles, "internal", periodLogs),
      client: computeMetrics(periodProcesses, periodFiles, "client", periodLogs),
    };
  }, [periodProcesses, periodFiles, periodLogs]);

  const chartConfig = {
    deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
    firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
  };


  // Monthly trend for chart (using all files, not filtered by submission type)
  const monthlyChartData = useMemo(() => {
    const monthMap = new Map<string, { procs: ProcessRow[]; files: FileRow[]; logs: SubmissionLog[] }>();
    const ensure = (k: string) => { if (!monthMap.has(k)) monthMap.set(k, { procs: [], files: [], logs: [] }); return monthMap.get(k)!; };

    periodProcesses.forEach(p => {
      ensure(toMonthKey(p.updated_at)).procs.push(p);
    });
    periodFiles.filter(f => f.created_at).forEach(f => {
      ensure(toMonthKey(f.created_at!)).files.push(f);
    });
    periodLogs.filter(l => l.created_at).forEach(l => {
      ensure(toMonthKey(l.created_at)).logs.push(l);
    });

    return [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
      const clientM = computeMetrics(data.procs, data.files, "client", data.logs);
      const internalM = computeMetrics(data.procs, data.files, "internal", data.logs);
      return {
        month,
        monthLabel: monthLabel(month),
        clientDeadlineRate: clientM.deadlineRate,
        clientFirstDraftRate: clientM.firstDraftRate,
        clientAvgRevisions: clientM.avgRevisions,
        clientDeadlineTotal: clientM.deadlineTotal,
        clientFirstDraftTotal: clientM.firstDraftTotal,
        clientSubmitCount: clientM.logClientSubmitCount,
        internalRevCount: clientM.logInternalRevisionCount,
        internalDeadlineRate: internalM.deadlineRate,
        internalFirstDraftRate: internalM.firstDraftRate,
        internalAvgRevisions: internalM.avgRevisions,
        internalDeadlineTotal: internalM.deadlineTotal,
        internalFirstDraftTotal: internalM.firstDraftTotal,
      };
    });
  }, [periodProcesses, periodFiles, periodLogs]);

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
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">期間:</span>
            <Select value={periodFrom} onValueChange={v => { setPeriodFrom(v); if (v > periodTo) setPeriodTo(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">〜</span>
            <Select value={periodTo} onValueChange={v => { setPeriodTo(v); if (v < periodFrom) setPeriodFrom(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">クライアント:</span>
            <Select value={filterClientId} onValueChange={handleClientChange}>
              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">すべて</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">商材:</span>
            <Select value={filterProductId} onValueChange={handleProductChange}>
              <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">すべて</SelectItem>
                {filteredProducts.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">案件:</span>
            <Select value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectTrigger className="w-44 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">すべて</SelectItem>
                {filteredProjects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* クライアント提出 KPI */}
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">クライアント提出</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Target}
              label="納期遵守率"
              value={submissionSummary.client.deadlineRate !== null ? `${submissionSummary.client.deadlineRate}%` : "—"}
              rate={submissionSummary.client.deadlineRate}
              target={getClientTarget("deadline_compliance", 100)}
              detail={`${submissionSummary.client.deadlineOnTime}/${submissionSummary.client.deadlineTotal}件`}
              color="text-primary"
            />
            <KpiCard
              icon={CheckCircle}
              label="初稿合格率"
              value={submissionSummary.client.firstDraftRate !== null ? `${submissionSummary.client.firstDraftRate}%` : "—"}
              rate={submissionSummary.client.firstDraftRate}
              target={getClientTarget("first_draft_pass", 80)}
              detail={`${submissionSummary.client.firstDraftPassed}/${submissionSummary.client.firstDraftTotal}件`}
              color="text-status-ok"
            />
            <KpiCard
              icon={RotateCcw}
              label="平均修正回数"
              value={submissionSummary.client.clientRevisions !== null ? `${submissionSummary.client.clientRevisions}回` : "—"}
              rate={null}
              target={null}
              detail={`${submissionSummary.client.clientRevSequences}シーケンス`}
              color="text-status-warning"
              isRevision
            />
          </div>
        </div>

        {/* 社内提出 KPI */}
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">社内提出</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Target}
              label="納期遵守率"
              value={submissionSummary.internal.deadlineRate !== null ? `${submissionSummary.internal.deadlineRate}%` : "—"}
              rate={submissionSummary.internal.deadlineRate}
              target={getInternalTarget("deadline_compliance", 100)}
              detail={`${submissionSummary.internal.deadlineOnTime}/${submissionSummary.internal.deadlineTotal}件`}
              color="text-primary"
            />
            <KpiCard
              icon={CheckCircle}
              label="初稿合格率"
              value={submissionSummary.internal.firstDraftRate !== null ? `${submissionSummary.internal.firstDraftRate}%` : "—"}
              rate={submissionSummary.internal.firstDraftRate}
              target={getInternalTarget("first_draft_pass", 80)}
              detail={`${submissionSummary.internal.firstDraftPassed}/${submissionSummary.internal.firstDraftTotal}件`}
              color="text-status-ok"
            />
            <KpiCard
              icon={RotateCcw}
              label="平均修正回数"
              value={submissionSummary.internal.internalRevisions !== null ? `${submissionSummary.internal.internalRevisions}回` : "—"}
              rate={null}
              target={null}
              detail={`${submissionSummary.internal.internalRevSequences}シーケンス`}
              color="text-status-warning"
              isRevision
            />
          </div>
        </div>

        {/* グラフ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />月別推移
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">データがありません</p>
            ) : (
              <ChartContainer config={{
                clientDeadlineRate: { label: "クライアント 納期遵守率", color: "hsl(var(--primary))" },
                clientFirstDraftRate: { label: "クライアント 初稿合格率", color: "hsl(var(--status-ok))" },
                internalDeadlineRate: { label: "社内 納期遵守率", color: "hsl(var(--primary) / 0.5)" },
                internalFirstDraftRate: { label: "社内 初稿合格率", color: "hsl(var(--status-ok) / 0.5)" },
              }} className="h-[300px] w-full">
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="monthLabel" className="text-xs" />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      clientDeadlineRate: "クライアント 納期遵守率",
                      clientFirstDraftRate: "クライアント 初稿合格率",
                      internalDeadlineRate: "社内 納期遵守率",
                      internalFirstDraftRate: "社内 初稿合格率",
                    };
                    return [`${value}%`, labels[name as string] || name];
                  }} />} />
                  <Line type="monotone" dataKey="clientDeadlineRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="clientFirstDraftRate" stroke="hsl(var(--status-ok))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="internalDeadlineRate" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="internalFirstDraftRate" stroke="hsl(var(--status-ok))" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
                  <Legend formatter={value => {
                    const labels: Record<string, string> = {
                      clientDeadlineRate: "クライアント 納期遵守率",
                      clientFirstDraftRate: "クライアント 初稿合格率",
                      internalDeadlineRate: "社内 納期遵守率",
                      internalFirstDraftRate: "社内 初稿合格率",
                    };
                    return labels[value] || value;
                  }} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* 月別数値 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />月別数値</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium" rowSpan={2}>月</th>
                  <th className="px-4 py-2 font-medium text-center border-l border-border" colSpan={5}>クライアント提出</th>
                  <th className="px-4 py-2 font-medium text-center border-l border-border" colSpan={3}>社内提出</th>
                </tr>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium text-right border-l border-border">納期遵守率</th>
                  <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                  <th className="px-4 py-2 font-medium text-right">修正回数</th>
                  <th className="px-4 py-2 font-medium text-right">提出回数</th>
                  <th className="px-4 py-2 font-medium text-right">社内修正回数</th>
                  <th className="px-4 py-2 font-medium text-right border-l border-border">納期遵守率</th>
                  <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                  <th className="px-4 py-2 font-medium text-right">修正回数</th>
                </tr>
              </thead>
              <tbody>
                {monthlyChartData.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                ) : (
                  [...monthlyChartData].reverse().map(d => (
                    <tr key={d.month} className="border-b border-border/50">
                      <td className="px-4 py-2 font-medium">{d.monthLabel}</td>
                      <td className="px-4 py-2 text-right border-l border-border">
                        <RateCell rate={d.clientDeadlineRate} target={getClientTarget("deadline_compliance", 100)} total={d.clientDeadlineTotal} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <RateCell rate={d.clientFirstDraftRate} target={getClientTarget("first_draft_pass", 80)} total={d.clientFirstDraftTotal} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {d.clientAvgRevisions !== null ? <span className="font-bold">{d.clientAvgRevisions}回</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-bold">{d.clientSubmitCount ?? 0}</span><span className="text-muted-foreground text-[10px]">回</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={cn("font-bold", (d.internalRevCount ?? 0) > 0 ? "text-status-warning" : "")}>{d.internalRevCount ?? 0}</span><span className="text-muted-foreground text-[10px]">回</span>
                      </td>
                      <td className="px-4 py-2 text-right border-l border-border">
                        <RateCell rate={d.internalDeadlineRate} target={getInternalTarget("deadline_compliance", 100)} total={d.internalDeadlineTotal} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <RateCell rate={d.internalFirstDraftRate} target={getInternalTarget("first_draft_pass", 80)} total={d.internalFirstDraftTotal} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {d.internalAvgRevisions !== null ? <span className="font-bold">{d.internalAvgRevisions}回</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* 集計ロジック・定義 */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              集計ロジック・定義
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">各KPIの算出方法と判定基準の詳細です。</p>
          </CardHeader>
           <CardContent className="space-y-6 text-sm leading-relaxed">
            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                ① 納期遵守率（目標: クライアント {getClientTarget("deadline_compliance", 100)}% / 社内 {getInternalTarget("deadline_compliance", 100)}%）
              </h4>
              <div className="pl-4 border-l-[3px] border-primary/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📤 クライアント提出の判定</p>
                  <p className="text-muted-foreground">各工程に設定された<span className="font-medium text-foreground">「クライアント期限」</span>までに、各クリエイティブのチェック・クライアント提出が完了し、<span className="font-medium text-foreground">FIX済み</span>（fixed / approved）となっているかで判定します。</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📋 社内提出の判定</p>
                  <p className="text-muted-foreground">各工程に設定された<span className="font-medium text-foreground">「社内期限」</span>までに、各クリエイティブのアップロードが完了しているかで判定します。</p>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: 遵守工程数 ÷ 期限設定済み工程数 × 100</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-status-ok" />
                ② 初稿合格率（目標: クライアント {getClientTarget("first_draft_pass", 80)}% / 社内 {getInternalTarget("first_draft_pass", 80)}%）
              </h4>
              <div className="pl-4 border-l-[3px] border-status-ok/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📤 クライアント提出の判定</p>
                  <p className="text-muted-foreground">クライアントに提出した初稿（version_number=1, submission_type=client）が<span className="font-medium text-foreground">FIX済み</span>（fixed / approved）になっているかで判定します。</p>
                  <p className="text-muted-foreground mt-1">→ クライアントからの修正指示なく一発でFIXされれば合格。</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📋 社内提出の判定</p>
                  <p className="text-muted-foreground">社内に提出した初稿（version_number=1）が<span className="font-medium text-foreground">クライアント提出済み</span>になっているかで判定します。</p>
                  <p className="text-muted-foreground mt-1">→ 社内修正なくクライアントに提出できれば合格。</p>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">クライアント: FIX済み初稿数 ÷ クライアント提出済み初稿数 × 100</p>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">社内: クライアント提出済み初稿数 ÷ 全初稿数 × 100</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-status-warning" />
                ③ 修正回数
              </h4>
              <div className="pl-4 border-l-[3px] border-status-warning/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📤 クライアント提出</p>
                  <p className="text-muted-foreground">クライアントに提出した制作物が何回修正が発生しているか。submission_type=client のファイルのバージョン数で集計します。</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-semibold text-foreground mb-1">📋 社内提出</p>
                  <p className="text-muted-foreground">社内に提出した制作物が何回修正が発生しているか。submission_type=internal のファイルのバージョン数で集計します。</p>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: Σ(最大バージョン番号 - 1) ÷ シーケンス数</p>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-border">
              <h4 className="text-base font-bold text-foreground">📌 補足：完了条件</h4>
              <div className="pl-4 border-l-[3px] border-border space-y-2">
                <p className="text-muted-foreground"><span className="font-medium text-foreground">工程の完了:</span> 全ファイルが「クライアント提出済み」または「FIX済み」でなければ完了ステータスに変更不可。</p>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">案件の完了:</span> 全ファイルが「FIX済み」でなければ完了ステータスに変更不可。完了日が納期を超過している場合は「遅延」、間に合っている場合は「納期遵守OK」と表示。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
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

function TargetEditor({ targets, onSaved }: { targets: KpiTarget[]; onSaved: (updated: KpiTarget[]) => void }) {
  const clientTargets = targets.filter(t => t.key.startsWith("client_"));
  const internalTargets = targets.filter(t => t.key.startsWith("internal_"));
  const allEditable = [...clientTargets, ...internalTargets];
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(allEditable.map(t => [t.key, t.target_value]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of allEditable) {
        const newVal = values[t.key];
        if (newVal !== undefined && newVal !== t.target_value) {
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

  const renderGroup = (groupLabel: string, items: KpiTarget[]) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold border-b border-border pb-1">{groupLabel}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">目標が未設定です</p>
      ) : (
        items.map(t => (
          <div key={t.key} className="flex items-center gap-3">
            <label className="text-sm font-medium flex-1">{t.label.replace(/^(クライアント提出|社内提出)\s*/, '')}</label>
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
    </div>
  );

  return (
    <div className="space-y-5">
      {renderGroup("クライアント提出", clientTargets)}
      {renderGroup("社内提出", internalTargets)}
      <p className="text-[11px] text-muted-foreground">※ 修正回数は目標値ではなく実績のみ表示します</p>
      <Button onClick={handleSave} disabled={saving || allEditable.length === 0} className="w-full gap-2">
        <Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
