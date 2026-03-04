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

interface ProjectRow { id: string; name: string; product_id: string | null; overall_deadline: string | null; }
interface ProductRow { id: string; name: string; client_id: string | null; }
interface ClientRow { id: string; name: string; }
interface KpiTarget { id: string; key: string; label: string; target_value: number; }

/* ─── Helpers ──────────────────────────────────────── */

function toMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateMonthOptions(procs: ProcessRow[], files: FileRow[]): string[] {
  let min = new Date();
  const max = new Date();
  for (const p of procs) { const d = new Date(p.updated_at); if (d < min) min = d; }
  for (const f of files) { if (f.created_at) { const d = new Date(f.created_at); if (d < min) min = d; } }
  const months: string[] = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cursor <= max) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthLabel(m: string) { const [y, mo] = m.split("-"); return `${y}/${mo}`; }

/* ─── Metric computations (client only) ────────────── */

interface MetricSet {
  deadlineRate: number | null;
  deadlineTotal: number;
  deadlineOnTime: number;
  firstDraftRate: number | null;
  firstDraftTotal: number;
  firstDraftPassed: number;
  avgRevisions: number | null;
  revisionSequences: number;
}

/**
 * Project-level deadline: 案件の overall_deadline までに全工程の全クリエイティブが
 * クライアント提出済み（submission_type === "client"）になっているか
 */
function computeProjectDeadlineRate(
  projectList: ProjectRow[],
  allFiles: FileRow[],
  procs: ProcessRow[],
): { total: number; onTime: number; rate: number | null } {
  let total = 0;
  let onTime = 0;
  for (const proj of projectList) {
    if (!proj.overall_deadline) continue;
    total++;
    const deadlineDate = new Date(proj.overall_deadline + "T23:59:59");
    const projectProcs = procs.filter(p => p.project_id === proj.id);
    const activeProcessKeys = new Set(projectProcs.map(p => p.process_key));
    const projectFiles = allFiles.filter(f => f.project_id === proj.id && activeProcessKeys.has(f.process_type));
    if (projectFiles.length === 0) continue;
    const allSubmitted = projectFiles.every(f => {
      if (f.submission_type !== "client") return false;
      const submittedAt = f.created_at;
      return submittedAt && new Date(submittedAt) <= deadlineDate;
    });
    if (allSubmitted) onTime++;
  }
  return { total, onTime, rate: total > 0 ? Math.round((onTime / total) * 100) : null };
}

/**
 * Process-level deadline: 各工程の client_deadline までに全クリエイティブが
 * クライアント提出済み（submission_type === "client"）になっているか
 */
function computeProcessDeadlineRate(
  procs: ProcessRow[],
  allFiles: FileRow[],
): { total: number; onTime: number; rate: number | null } {
  let total = 0;
  let onTime = 0;
  for (const p of procs) {
    if (!p.client_deadline) continue;
    total++;
    const deadlineDate = new Date(p.client_deadline + "T23:59:59");
    const processFiles = allFiles.filter(f => f.project_id === p.project_id && f.process_type === p.process_key);
    if (processFiles.length === 0) continue;
    const allSubmitted = processFiles.every(f => {
      if (f.submission_type !== "client") return false;
      const submittedAt = f.created_at;
      return submittedAt && new Date(submittedAt) <= deadlineDate;
    });
    if (allSubmitted) onTime++;
  }
  return { total, onTime, rate: total > 0 ? Math.round((onTime / total) * 100) : null };
}

function computeMetrics(procs: ProcessRow[], allFiles: FileRow[], projectList?: ProjectRow[]): MetricSet {
  // ── 納期遵守率 ──
  let deadlineTotal: number, deadlineOnTime: number, deadlineRate: number | null;
  if (projectList) {
    // 全体/クライアント/商材/案件レベル → 案件納期ベース
    const dr = computeProjectDeadlineRate(projectList, allFiles, procs);
    deadlineTotal = dr.total; deadlineOnTime = dr.onTime; deadlineRate = dr.rate;
  } else {
    // 工程レベル → 工程期限ベース
    const dr = computeProcessDeadlineRate(procs, allFiles);
    deadlineTotal = dr.total; deadlineOnTime = dr.onTime; deadlineRate = dr.rate;
  }

  // ── 初稿合格率: クライアント提出v1がFIX済みか ──
  const clientFirstDrafts = allFiles.filter(f => f.submission_type === "client" && (f.version_number ?? 1) === 1);
  const firstDraftTotal = clientFirstDrafts.length;
  const firstDraftPassed = clientFirstDrafts.filter(f => f.status === "fixed").length;

  // ── 修正回数: 全ファイルのバージョン数ベース ──
  const chains = new Map<string, number>();
  for (const f of allFiles) {
    const key = `${f.project_id}::${f.process_type}`;
    const ver = f.version_number ?? 1;
    chains.set(key, Math.max(chains.get(key) ?? 0, ver));
  }
  let revTotal = 0, revCount = 0;
  for (const [, maxVer] of chains) { revTotal += maxVer - 1; revCount++; }

  return {
    deadlineRate, deadlineTotal, deadlineOnTime,
    firstDraftRate: firstDraftTotal > 0 ? Math.round((firstDraftPassed / firstDraftTotal) * 100) : null,
    firstDraftTotal, firstDraftPassed,
    avgRevisions: revCount > 0 ? Math.round((revTotal / revCount) * 10) / 10 : null,
    revisionSequences: revCount,
  };
}

/* ─── Process breakdown (uses process-level deadline) ─ */

interface ProcessBreakdown {
  processKey: string;
  processLabel: string;
  deadlineRate: number | null;
  deadlineTotal: number;
  firstDraftRate: number | null;
  firstDraftTotal: number;
  avgRevisions: number | null;
}

function computeProcessBreakdown(procs: ProcessRow[], allFiles: FileRow[]): ProcessBreakdown[] {
  const grouped = new Map<string, { label: string; procs: ProcessRow[]; files: FileRow[] }>();
  for (const p of procs) {
    if (!grouped.has(p.process_key)) grouped.set(p.process_key, { label: p.process_label, procs: [], files: [] });
    grouped.get(p.process_key)!.procs.push(p);
  }
  for (const f of allFiles) {
    if (grouped.has(f.process_type)) grouped.get(f.process_type)!.files.push(f);
  }

  return [...grouped.entries()].map(([key, data]) => {
    const m = computeMetrics(data.procs, data.files);
    return {
      processKey: key, processLabel: data.label,
      deadlineRate: m.deadlineRate, deadlineTotal: m.deadlineTotal,
      firstDraftRate: m.firstDraftRate, firstDraftTotal: m.firstDraftTotal,
      avgRevisions: m.avgRevisions,
    };
  });
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
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [periodFrom, setPeriodFrom] = useState(currentMonth);
  const [periodTo, setPeriodTo] = useState(currentMonth);

  const [filterClientId, setFilterClientId] = useState<string>("all");
  const [filterProductId, setFilterProductId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");

  const targetMap = useMemo(() => new Map(targets.map(t => [t.key, t.target_value])), [targets]);
  const getTarget = (key: string, fallback: number) => targetMap.get(key) ?? fallback;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes, prodRes, clientRes, targetRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, client_deadline, updated_at"),
          supabase.from("project_files").select("id, project_id, process_type, status, version_number, parent_file_id, fixed_at, created_at, submission_type"),
          supabase.from("projects").select("id, name, product_id, overall_deadline"),
          supabase.from("products").select("id, name, client_id"),
          supabase.from("clients").select("id, name"),
          supabase.from("kpi_targets").select("*"),
        ]);
        if (cancelled) return;
        handleSupabaseError(procRes.error, "project_processes");
        handleSupabaseError(fileRes.error, "project_files");
        setProcesses((procRes.data ?? []) as ProcessRow[]);
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

  const monthOptions = useMemo(() => generateMonthOptions(processes, files), [processes, files]);

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

  const handleClientChange = (v: string) => { setFilterClientId(v); setFilterProductId("all"); setFilterProjectId("all"); };
  const handleProductChange = (v: string) => { setFilterProductId(v); setFilterProjectId("all"); };

  const scopeProjectIds = useMemo(() => {
    if (filterProjectId !== "all") return new Set([filterProjectId]);
    return new Set(filteredProjects.map(p => p.id));
  }, [filterProjectId, filteredProjects]);

  const isInPeriod = (dateStr: string) => { const mk = toMonthKey(dateStr); return mk >= periodFrom && mk <= periodTo; };

  const periodProcesses = useMemo(() =>
    processes.filter(p => scopeProjectIds.has(p.project_id) && isInPeriod(p.updated_at)),
    [processes, scopeProjectIds, periodFrom, periodTo]
  );

  const periodFiles = useMemo(() =>
    files.filter(f => f.created_at && f.project_id && scopeProjectIds.has(f.project_id) && isInPeriod(f.created_at)),
    [files, scopeProjectIds, periodFrom, periodTo]
  );

  const scopeProjects = useMemo(() =>
    filteredProjects.filter(p => scopeProjectIds.has(p.id)),
    [filteredProjects, scopeProjectIds]
  );

  const summary = useMemo(() => computeMetrics(periodProcesses, periodFiles, scopeProjects), [periodProcesses, periodFiles, scopeProjects]);

  const processBreakdown = useMemo(() => computeProcessBreakdown(periodProcesses, periodFiles), [periodProcesses, periodFiles]);

  // Monthly trend chart
  const monthlyChartData = useMemo(() => {
    const monthMap = new Map<string, { procs: ProcessRow[]; files: FileRow[] }>();
    const ensure = (k: string) => { if (!monthMap.has(k)) monthMap.set(k, { procs: [], files: [] }); return monthMap.get(k)!; };
    periodProcesses.forEach(p => ensure(toMonthKey(p.updated_at)).procs.push(p));
    periodFiles.filter(f => f.created_at).forEach(f => ensure(toMonthKey(f.created_at!)).files.push(f));

    return [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
      const m = computeMetrics(data.procs, data.files, scopeProjects);
      return {
        month, monthLabel: monthLabel(month),
        deadlineRate: m.deadlineRate, firstDraftRate: m.firstDraftRate, avgRevisions: m.avgRevisions,
        deadlineTotal: m.deadlineTotal, firstDraftTotal: m.firstDraftTotal,
      };
    });
  }, [periodProcesses, periodFiles, scopeProjects]);

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

  const deadlineTarget = getTarget("client_deadline_compliance", 100);
  const firstDraftTarget = getTarget("client_first_draft_pass", 80);

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
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">期間:</span>
            <Select value={periodFrom} onValueChange={v => { setPeriodFrom(v); if (v > periodTo) setPeriodTo(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">〜</span>
            <Select value={periodTo} onValueChange={v => { setPeriodTo(v); if (v < periodFrom) setPeriodFrom(v); }}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions.map(m => <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>)}</SelectContent>
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard icon={Target} label="納期遵守率" value={summary.deadlineRate !== null ? `${summary.deadlineRate}%` : "—"} rate={summary.deadlineRate} target={deadlineTarget} detail={`${summary.deadlineOnTime}/${summary.deadlineTotal}件`} color="text-primary" />
          <KpiCard icon={CheckCircle} label="初稿合格率" value={summary.firstDraftRate !== null ? `${summary.firstDraftRate}%` : "—"} rate={summary.firstDraftRate} target={firstDraftTarget} detail={`${summary.firstDraftPassed}/${summary.firstDraftTotal}件`} color="text-status-ok" />
          <KpiCard icon={RotateCcw} label="平均修正回数" value={summary.avgRevisions !== null ? `${summary.avgRevisions}回` : "—"} rate={null} target={null} detail={`${summary.revisionSequences}シーケンス`} color="text-status-warning" isRevision />
        </div>

        {/* Chart */}
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
                deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
                firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
              }} className="h-[300px] w-full">
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="monthLabel" className="text-xs" />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                    const labels: Record<string, string> = { deadlineRate: "納期遵守率", firstDraftRate: "初稿合格率" };
                    return [`${value}%`, labels[name as string] || name];
                  }} />} />
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

        {/* Process Breakdown Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />工程別内訳</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">工程</th>
                  <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                  <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                  <th className="px-4 py-2 font-medium text-right">平均修正回数</th>
                </tr>
              </thead>
              <tbody>
                {processBreakdown.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                ) : processBreakdown.map(pb => (
                  <tr key={pb.processKey} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">{pb.processLabel}</td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={pb.deadlineRate} target={deadlineTarget} total={pb.deadlineTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={pb.firstDraftRate} target={firstDraftTarget} total={pb.firstDraftTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {pb.avgRevisions !== null ? <span className="font-bold">{pb.avgRevisions}回</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Monthly Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />月別数値</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">月</th>
                  <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                  <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                  <th className="px-4 py-2 font-medium text-right">修正回数</th>
                </tr>
              </thead>
              <tbody>
                {monthlyChartData.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                ) : [...monthlyChartData].reverse().map(d => (
                  <tr key={d.month} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">{d.monthLabel}</td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={d.deadlineRate} target={deadlineTarget} total={d.deadlineTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RateCell rate={d.firstDraftRate} target={firstDraftTarget} total={d.firstDraftTotal} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {d.avgRevisions !== null ? <span className="font-bold">{d.avgRevisions}回</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Definitions */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />集計ロジック・定義
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">各KPIの算出方法と判定基準の詳細です。</p>
          </CardHeader>
          <CardContent className="space-y-6 text-sm leading-relaxed">
            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                ① 納期遵守率（目標: {deadlineTarget}%）
              </h4>
              <div className="pl-4 border-l-[3px] border-primary/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-muted-foreground font-medium text-foreground">■ 全体/クライアント/商材/案件レベル</p>
                  <p className="text-muted-foreground">案件の<span className="font-medium text-foreground">「案件納期」</span>までに、その案件内の全工程の全クリエイティブが<span className="font-medium text-foreground">クライアント提出済み</span>になっているかで判定します。</p>
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: 納期内に納品完了した案件数 ÷ 納期設定済み案件数 × 100</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-muted-foreground font-medium text-foreground">■ 工程レベル</p>
                  <p className="text-muted-foreground">各工程に設定された<span className="font-medium text-foreground">「クライアント期限」</span>までに、その工程内の全クリエイティブが<span className="font-medium text-foreground">クライアント提出済み</span>になっているかで判定します。</p>
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: 遵守工程数 ÷ 期限設定済み工程数 × 100</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-status-ok" />
                ② 初稿合格率（目標: {firstDraftTarget}%）
              </h4>
              <div className="pl-4 border-l-[3px] border-status-ok/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground">クライアントに提出した初稿（v1, submission_type=client）が<span className="font-medium text-foreground">FIX済み</span>になっているかで判定します。</p>
                  <p className="text-muted-foreground mt-1">→ クライアントからの修正指示なく一発でFIXされれば合格。</p>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: FIX済み初稿数 ÷ クライアント提出済み初稿数 × 100</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-status-warning" />
                ③ 修正回数
              </h4>
              <div className="pl-4 border-l-[3px] border-status-warning/30 space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground">各工程シーケンスにおける最大バージョン数から1を引いた平均値です。修正が多い工程のボトルネックを特定できます。</p>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 font-mono">計算式: Σ(最大バージョン番号 - 1) ÷ シーケンス数</p>
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
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(clientTargets.map(t => [t.key, t.target_value]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of clientTargets) {
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

  return (
    <div className="space-y-4">
      {clientTargets.length === 0 ? (
        <p className="text-sm text-muted-foreground">目標が未設定です</p>
      ) : clientTargets.map(t => (
        <div key={t.key} className="flex items-center gap-3">
          <label className="text-sm font-medium flex-1">{t.label.replace(/^クライアント提出\s*/, '')}</label>
          <div className="flex items-center gap-1">
            <Input type="number" min={0} max={100} className="w-20 text-right"
              value={values[t.key] ?? t.target_value}
              onChange={e => setValues(v => ({ ...v, [t.key]: parseInt(e.target.value) || 0 }))}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">※ 修正回数は目標値ではなく実績のみ表示します</p>
      <Button onClick={handleSave} disabled={saving || clientTargets.length === 0} className="w-full gap-2">
        <Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
