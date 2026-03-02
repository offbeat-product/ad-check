import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getProcessLabel } from "@/lib/process-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine } from "recharts";
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
}

function computeMetrics(procs: ProcessRow[], fileSet: FileRow[]): MetricSet {
  // Deadline
  const withDeadline = procs.filter(p => p.status === "completed" && p.deadline);
  const onTime = withDeadline.filter(p => {
    const completed = new Date(p.updated_at);
    const deadline = new Date(p.deadline + "T23:59:59");
    return completed <= deadline;
  }).length;

  // First draft pass rate
  const isChecked = (f: FileRow) => f.status && f.status !== "uploaded";
  const isPassed = (f: FileRow) => f.status === "fixed" || f.status === "approved";
  const firstDraftFiles = fileSet.filter(f => (f.version_number ?? 1) === 1 && isChecked(f));
  const firstDraftPassed = firstDraftFiles.filter(isPassed).length;

  // Revision count: group by (project_id, process_type, parent chain root)
  // We count distinct version chains and their max version
  const chains = new Map<string, number>(); // chain key → max version
  for (const f of fileSet) {
    // Use root grouping: project_id + process_type
    // Files with parent_file_id=null are roots (version 1)
    // We track max version_number per root group
    const key = `${f.project_id}::${f.process_type}`;
    const ver = f.version_number ?? 1;
    chains.set(key, Math.max(chains.get(key) ?? 0, ver));
  }
  // Revision count = version - 1 for each chain
  let totalRevisions = 0;
  let sequenceCount = 0;
  for (const [, maxVer] of chains) {
    totalRevisions += maxVer - 1;
    sequenceCount++;
  }

  return {
    deadlineRate: withDeadline.length > 0 ? Math.round((onTime / withDeadline.length) * 100) : null,
    deadlineTotal: withDeadline.length,
    deadlineOnTime: onTime,
    firstDraftRate: firstDraftFiles.length > 0 ? Math.round((firstDraftPassed / firstDraftFiles.length) * 100) : null,
    firstDraftTotal: firstDraftFiles.length,
    firstDraftPassed,
    avgRevisions: sequenceCount > 0 ? Math.round((totalRevisions / sequenceCount) * 10) / 10 : null,
    revisionSequences: sequenceCount,
    totalRevisions,
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
  const [drillTab, setDrillTab] = useState<DrillTab>("overview");
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  const targetMap = useMemo(() => new Map(targets.map(t => [t.key, t.target_value])), [targets]);
  const getTarget = (key: string, fallback: number) => targetMap.get(key) ?? fallback;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes, prodRes, clientRes, targetRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, deadline, updated_at"),
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

  // Mapping helpers
  const projectProductMap = useMemo(() => new Map(projects.map(p => [p.id, p.product_id])), [projects]);
  const productClientMap = useMemo(() => new Map(products.map(p => [p.id, p.client_id])), [products]);
  const projectNameMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const clientNameMap = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients]);

  const getClientIdForProject = (pid: string) => {
    const prodId = projectProductMap.get(pid);
    return prodId ? productClientMap.get(prodId) : null;
  };

  // Filter files by submission type
  const filteredFiles = useMemo(() => {
    if (submissionFilter === "all") return files;
    return files.filter(f => f.submission_type === submissionFilter);
  }, [files, submissionFilter]);

  // Overall metrics
  const overall = useMemo(() => computeMetrics(processes, filteredFiles), [processes, filteredFiles]);

  // Monthly trend
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { procs: ProcessRow[]; files: FileRow[] }>();
    const getMonth = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; };
    const ensure = (k: string) => { if (!monthMap.has(k)) monthMap.set(k, { procs: [], files: [] }); return monthMap.get(k)!; };

    processes.filter(p => p.status === "completed" && p.deadline).forEach(p => {
      ensure(getMonth(p.updated_at)).procs.push(p);
    });
    filteredFiles.filter(f => f.created_at).forEach(f => {
      ensure(getMonth(f.created_at!)).files.push(f);
    });

    return [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
      const m = computeMetrics(data.procs, data.files);
      return { month, monthLabel: `${month.split("-")[0]}/${month.split("-")[1]}`, ...m };
    });
  }, [processes, filteredFiles]);

  // Breakdowns
  const clientBreakdown = useMemo(() => {
    return clients.map(client => {
      const clientProductIds = products.filter(p => p.client_id === client.id).map(p => p.id);
      const clientProjectIds = projects.filter(p => p.product_id && clientProductIds.includes(p.product_id)).map(p => p.id);
      const procs = processes.filter(p => clientProjectIds.includes(p.project_id));
      const fls = filteredFiles.filter(f => clientProjectIds.includes(f.project_id));
      return { id: client.id, name: client.name, ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [clients, products, projects, processes, filteredFiles]);

  const projectBreakdown = useMemo(() => {
    const pids = [...new Set([...processes.map(p => p.project_id), ...filteredFiles.map(f => f.project_id).filter(Boolean)])];
    return pids.map(pid => {
      const procs = processes.filter(p => p.project_id === pid);
      const fls = filteredFiles.filter(f => f.project_id === pid);
      return { id: pid, name: projectNameMap.get(pid) || "不明", clientId: getClientIdForProject(pid), ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [processes, filteredFiles, projectNameMap]);

  const processBreakdown = useMemo(() => {
    const keys = [...new Set(filteredFiles.map(f => f.process_type))];
    return keys.map(key => {
      const procs = processes.filter(p => p.process_key === key);
      const fls = filteredFiles.filter(f => f.process_type === key);
      return { key, label: getProcessLabel(key), ...computeMetrics(procs, fls) };
    }).filter(b => b.deadlineTotal > 0 || b.firstDraftTotal > 0 || b.revisionSequences > 0);
  }, [processes, filteredFiles]);

  // Submission type summary (always shows both)
  const submissionSummary = useMemo(() => {
    const internal = files.filter(f => f.submission_type === "internal");
    const client = files.filter(f => f.submission_type === "client");
    return {
      internal: computeMetrics(processes, internal),
      client: computeMetrics(processes, client),
    };
  }, [processes, files]);

  const chartConfig = {
    deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
    firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
    avgRevisions: { label: "平均修正回数", color: "hsl(var(--status-warning))" },
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
        {/* Submission filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">提出タイプ:</span>
          {(["all", "internal", "client"] as SubmissionFilter[]).map(f => (
            <Button
              key={f}
              variant={submissionFilter === f ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSubmissionFilter(f)}
            >
              {submissionLabels[f]}
            </Button>
          ))}
        </div>

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
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">提出タイプ</th>
                    <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                    <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                    <th className="px-4 py-2 font-medium text-right">平均修正回数</th>
                  </tr>
                </thead>
                <tbody>
                  <SubmissionRow label="社内提出" metrics={submissionSummary.internal} targets={targetMap} />
                  <SubmissionRow label="クライアント提出" metrics={submissionSummary.client} targets={targetMap} />
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
            {/* Monthly trend chart */}
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

            {/* Monthly detail table */}
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
            <MetricsTable
              title="クライアント別"
              rows={clientBreakdown.map(b => ({ key: b.id, name: b.name, ...b }))}
              targets={targetMap}
            />
          </TabsContent>

          <TabsContent value="by_project" className="mt-4">
            <MetricsTable
              title="案件別"
              rows={projectBreakdown.map(b => ({ key: b.id, name: b.name, ...b }))}
              targets={targetMap}
            />
          </TabsContent>

          <TabsContent value="by_process" className="mt-4">
            <MetricsTable
              title="工程別"
              rows={processBreakdown.map(b => ({ key: b.key, name: b.label, ...b }))}
              targets={targetMap}
            />
          </TabsContent>
        </Tabs>
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
          {target !== null && (
            <Badge variant="outline" className="ml-auto text-[10px]">目標: {target}%</Badge>
          )}
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

function SubmissionRow({ label, metrics, targets }: { label: string; metrics: MetricSet; targets: Map<string, number> }) {
  const getTarget = (key: string, fallback: number) => targets.get(key) ?? fallback;
  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-2 font-medium">{label}</td>
      <td className="px-4 py-2 text-right">
        <RateCell rate={metrics.deadlineRate} target={getTarget("deadline_compliance", 100)} total={metrics.deadlineTotal} />
      </td>
      <td className="px-4 py-2 text-right">
        <RateCell rate={metrics.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={metrics.firstDraftTotal} />
      </td>
      <td className="px-4 py-2 text-right">
        {metrics.avgRevisions !== null ? (
          <span className="font-bold">{metrics.avgRevisions}回</span>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

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
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(targets.map(t => [t.key, t.target_value]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of targets) {
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
      {targets.map(t => (
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
      ))}
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        <Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
