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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { Target, CheckCircle, TrendingUp, Calendar, Settings2, Save, Download, FileSpreadsheet, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { exportReportExcel, exportReportPdf } from "@/lib/export-report";
import QualityGapSection from "@/components/report/QualityGapSection";

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
  check_result_id: string | null;
  pattern_id: string | null;
  created_at: string | null;
}

interface CheckResultMini {
  id: string;
  ng_count: number | null;
  warning_count: number | null;
  ok_count: number | null;
  overall_status: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  product_id: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  client_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
}

interface KpiTarget {
  id: string;
  key: string;
  label: string;
  target_value: number;
}

type ViewMode = "all" | "by_project" | "by_process" | "by_client";

const DRAFT_KEYS = [
  { version: 1, key: "first_draft_pass", label: "初稿" },
  { version: 2, key: "second_draft_pass", label: "第2稿" },
  { version: 3, key: "third_draft_pass", label: "第3稿" },
];

export default function ReportPage() {
  const { user, isAdmin } = useAuth();
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [checkResultsMini, setCheckResultsMini] = useState<CheckResultMini[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  const targetMap = useMemo(() => {
    const m = new Map<string, number>();
    targets.forEach((t) => m.set(t.key, t.target_value));
    return m;
  }, [targets]);

  const getTarget = (key: string, fallback: number) => targetMap.get(key) ?? fallback;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes, prodRes, clientRes, targetRes, crRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, deadline, updated_at"),
          supabase.from("project_files").select("id, project_id, process_type, status, version_number, parent_file_id, check_result_id, pattern_id, created_at"),
          supabase.from("projects").select("id, name, product_id"),
          supabase.from("products").select("id, name, client_id"),
          supabase.from("clients").select("id, name"),
          supabase.from("kpi_targets").select("*"),
          supabase.from("check_results").select("id, ng_count, warning_count, ok_count, overall_status"),
        ]);
        if (cancelled) return;
        handleSupabaseError(procRes.error, "project_processes");
        handleSupabaseError(fileRes.error, "project_files");
        handleSupabaseError(projRes.error, "projects");
        setProcesses(procRes.data ?? []);
        setFiles(fileRes.data ?? []);
        setCheckResultsMini((crRes.data ?? []) as CheckResultMini[]);
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
    fetch();
    return () => { cancelled = true; };
  }, [user]);

  // Helpers
  const getMonthKey = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const isOnTime = (p: ProcessRow) => {
    const completed = new Date(p.updated_at);
    const deadline = new Date(p.deadline + "T23:59:59");
    return completed <= deadline;
  };

  const isPassedFile = (f: FileRow) => f.status === "fixed" || f.status === "approved";
  const isCheckedFile = (f: FileRow) => f.status && f.status !== "uploaded";

  // Project → product → client mapping
  const projectProductMap = useMemo(() => new Map(projects.map((p) => [p.id, p.product_id])), [projects]);
  const productClientMap = useMemo(() => new Map(products.map((p) => [p.id, p.client_id])), [products]);
  const projectNameMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const productNameMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const clientNameMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const getClientIdForProject = (projectId: string) => {
    const productId = projectProductMap.get(projectId);
    return productId ? productClientMap.get(productId) : null;
  };

  // Compute draft rates for a set of files
  const computeDraftRates = (fileSet: FileRow[]) => {
    const result: Record<number, { total: number; passed: number; rate: number | null }> = {};
    for (const draft of DRAFT_KEYS) {
      const draftFiles = fileSet.filter((f) => (f.version_number ?? 1) === draft.version && isCheckedFile(f));
      const passed = draftFiles.filter(isPassedFile).length;
      result[draft.version] = {
        total: draftFiles.length,
        passed,
        rate: draftFiles.length > 0 ? Math.round((passed / draftFiles.length) * 100) : null,
      };
    }
    return result;
  };

  // Compute deadline rate for a set of processes
  const computeDeadlineRate = (procSet: ProcessRow[]) => {
    const withDeadline = procSet.filter((p) => p.status === "completed" && p.deadline);
    const onTime = withDeadline.filter(isOnTime).length;
    return {
      total: withDeadline.length,
      onTime,
      rate: withDeadline.length > 0 ? Math.round((onTime / withDeadline.length) * 100) : null,
    };
  };

  // Monthly data
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { deadlineTotal: number; deadlineOnTime: number; drafts: Record<number, { total: number; passed: number }> }>();

    const ensure = (key: string) => {
      if (!monthMap.has(key)) {
        monthMap.set(key, { deadlineTotal: 0, deadlineOnTime: 0, drafts: { 1: { total: 0, passed: 0 }, 2: { total: 0, passed: 0 }, 3: { total: 0, passed: 0 } } });
      }
      return monthMap.get(key)!;
    };

    processes.filter((p) => p.status === "completed" && p.deadline).forEach((p) => {
      const entry = ensure(getMonthKey(p.updated_at));
      entry.deadlineTotal++;
      if (isOnTime(p)) entry.deadlineOnTime++;
    });

    files.filter(isCheckedFile).forEach((f) => {
      const v = f.version_number ?? 1;
      if (v > 3 || !f.created_at) return;
      const entry = ensure(getMonthKey(f.created_at));
      entry.drafts[v].total++;
      if (isPassedFile(f)) entry.drafts[v].passed++;
    });

    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        monthLabel: `${month.split("-")[0]}/${month.split("-")[1]}`,
        deadlineRate: data.deadlineTotal > 0 ? Math.round((data.deadlineOnTime / data.deadlineTotal) * 100) : null,
        firstDraftRate: data.drafts[1].total > 0 ? Math.round((data.drafts[1].passed / data.drafts[1].total) * 100) : null,
        secondDraftRate: data.drafts[2].total > 0 ? Math.round((data.drafts[2].passed / data.drafts[2].total) * 100) : null,
        thirdDraftRate: data.drafts[3].total > 0 ? Math.round((data.drafts[3].passed / data.drafts[3].total) * 100) : null,
        deadlineTotal: data.deadlineTotal,
        ...Object.fromEntries(DRAFT_KEYS.map((d) => [`draft${d.version}Total`, data.drafts[d.version].total])),
      }));
  }, [processes, files]);

  // Current month stats
  const currentMonthStats = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthlyData.find((d) => d.month === key);
  }, [monthlyData]);

  // Breakdown by project
  const projectBreakdown = useMemo(() => {
    const pids = [...new Set([...processes.map((p) => p.project_id), ...files.map((f) => f.project_id).filter(Boolean)])];
    return pids.map((pid) => {
      const dl = computeDeadlineRate(processes.filter((p) => p.project_id === pid));
      const drafts = computeDraftRates(files.filter((f) => f.project_id === pid));
      return { id: pid, name: projectNameMap.get(pid) || "不明", deadline: dl, drafts };
    }).filter((b) => b.deadline.total > 0 || Object.values(b.drafts).some((d) => d.total > 0));
  }, [processes, files, projectNameMap]);

  // Breakdown by process
  const processBreakdown = useMemo(() => {
    const keys = [...new Set(files.map((f) => f.process_type))];
    return keys.map((key) => {
      const dl = computeDeadlineRate(processes.filter((p) => p.process_key === key));
      const drafts = computeDraftRates(files.filter((f) => f.process_type === key));
      return { key, label: getProcessLabel(key), deadline: dl, drafts };
    }).filter((b) => b.deadline.total > 0 || Object.values(b.drafts).some((d) => d.total > 0));
  }, [processes, files]);

  // Breakdown by client
  const clientBreakdown = useMemo(() => {
    return clients.map((client) => {
      const clientProductIds = products.filter((p) => p.client_id === client.id).map((p) => p.id);
      const clientProjectIds = projects.filter((p) => p.product_id && clientProductIds.includes(p.product_id)).map((p) => p.id);
      const clientProcs = processes.filter((p) => clientProjectIds.includes(p.project_id));
      const clientFiles = files.filter((f) => clientProjectIds.includes(f.project_id));
      const dl = computeDeadlineRate(clientProcs);
      const drafts = computeDraftRates(clientFiles);
      return { id: client.id, name: client.name, deadline: dl, drafts };
    }).filter((b) => b.deadline.total > 0 || Object.values(b.drafts).some((d) => d.total > 0));
  }, [clients, products, projects, processes, files]);

  const chartConfig = {
    deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
    firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
    secondDraftRate: { label: "第2稿合格率", color: "hsl(210, 80%, 55%)" },
    thirdDraftRate: { label: "第3稿合格率", color: "hsl(270, 70%, 55%)" },
  };

  const rateColor = (rate: number | null, target: number) => {
    if (rate === null) return "";
    if (rate >= target) return "text-status-ok";
    if (rate >= target * 0.7) return "text-status-warning";
    return "text-status-ng";
  };

  const viewModeLabels: Record<ViewMode, string> = { all: "全体推移", by_project: "案件別", by_process: "工程別", by_client: "クライアント別" };

  const buildExportData = () => {
    const currentBreakdown = viewMode === "by_project" ? projectBreakdown.map((b) => ({ name: b.name, deadlineRate: b.deadline.rate, deadlineTotal: b.deadline.total, draft1Rate: b.drafts[1]?.rate ?? null, draft1Total: b.drafts[1]?.total ?? 0, draft2Rate: b.drafts[2]?.rate ?? null, draft2Total: b.drafts[2]?.total ?? 0, draft3Rate: b.drafts[3]?.rate ?? null, draft3Total: b.drafts[3]?.total ?? 0 }))
      : viewMode === "by_process" ? processBreakdown.map((b) => ({ name: b.label, deadlineRate: b.deadline.rate, deadlineTotal: b.deadline.total, draft1Rate: b.drafts[1]?.rate ?? null, draft1Total: b.drafts[1]?.total ?? 0, draft2Rate: b.drafts[2]?.rate ?? null, draft2Total: b.drafts[2]?.total ?? 0, draft3Rate: b.drafts[3]?.rate ?? null, draft3Total: b.drafts[3]?.total ?? 0 }))
      : viewMode === "by_client" ? clientBreakdown.map((b) => ({ name: b.name, deadlineRate: b.deadline.rate, deadlineTotal: b.deadline.total, draft1Rate: b.drafts[1]?.rate ?? null, draft1Total: b.drafts[1]?.total ?? 0, draft2Rate: b.drafts[2]?.rate ?? null, draft2Total: b.drafts[2]?.total ?? 0, draft3Rate: b.drafts[3]?.rate ?? null, draft3Total: b.drafts[3]?.total ?? 0 }))
      : [];
    const breakdownTitles: Record<ViewMode, string> = { all: "", by_project: "案件別KPI", by_process: "工程別KPI", by_client: "クライアント別KPI" };
    return {
      viewMode: viewModeLabels[viewMode],
      monthlyData: monthlyData.map((d) => ({ monthLabel: d.monthLabel, deadlineRate: d.deadlineRate, deadlineTotal: d.deadlineTotal, firstDraftRate: d.firstDraftRate, draft1Total: (d as any).draft1Total ?? 0, secondDraftRate: d.secondDraftRate, draft2Total: (d as any).draft2Total ?? 0, thirdDraftRate: d.thirdDraftRate, draft3Total: (d as any).draft3Total ?? 0 })),
      breakdownData: currentBreakdown,
      breakdownTitle: breakdownTitles[viewMode],
      targets: { deadline: getTarget("deadline_compliance", 100), first: getTarget("first_draft_pass", 80), second: getTarget("second_draft_pass", 90), third: getTarget("third_draft_pass", 95) },
      exportDate: new Date().toLocaleString("ja-JP"),
    };
  };

  const handleExportExcel = async () => {
    try {
      await exportReportExcel(buildExportData(), `report_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excelファイルをダウンロードしました");
    } catch (e) { console.error(e); toast.error("エクスポートに失敗しました"); }
  };

  const handleExportPdf = () => {
    try {
      exportReportPdf(buildExportData());
    } catch (e) { console.error(e); toast.error("エクスポートに失敗しました"); }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-6 space-y-3">
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
              <div className="h-20 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
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
                <TargetEditor targets={targets} onSaved={(updated) => { setTargets(updated); setTargetDialogOpen(false); }} />
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
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
                <FileText className="h-4 w-4" />PDF (印刷)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全体推移</SelectItem>
              <SelectItem value="by_project">案件別</SelectItem>
              <SelectItem value="by_process">工程別</SelectItem>
              <SelectItem value="by_client">クライアント別</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Current month summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={Target}
            label="今月の納期遵守率"
            rate={currentMonthStats?.deadlineRate ?? null}
            target={getTarget("deadline_compliance", 100)}
            total={currentMonthStats?.deadlineTotal ?? 0}
            color="text-primary"
          />
          {DRAFT_KEYS.map((draft) => {
            const rateKey = `${draft.label.replace("第", "").replace("稿", "")}`;
            const monthRate = currentMonthStats
              ? (draft.version === 1 ? currentMonthStats.firstDraftRate
                : draft.version === 2 ? currentMonthStats.secondDraftRate
                : currentMonthStats.thirdDraftRate)
              : null;
            const total = currentMonthStats ? (currentMonthStats as any)[`draft${draft.version}Total`] ?? 0 : 0;
            return (
              <KpiCard
                key={draft.version}
                icon={CheckCircle}
                label={`今月の${draft.label}合格率`}
                rate={monthRate ?? null}
                target={getTarget(draft.key, draft.version === 1 ? 80 : 90)}
                total={total}
                color="text-status-ok"
              />
            );
          })}
        </div>

        {viewMode === "all" && (
          <>
            {/* Monthly trend chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />月別推移
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">データがありません</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[320px] w-full">
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="monthLabel" className="text-xs" />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                        const labels: Record<string, string> = { deadlineRate: "納期遵守率", firstDraftRate: "初稿合格率", secondDraftRate: "第2稿合格率", thirdDraftRate: "第3稿合格率" };
                        return [`${value}%`, labels[name as string] || name];
                      }} />} />
                      <ReferenceLine y={getTarget("deadline_compliance", 100)} stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <ReferenceLine y={getTarget("first_draft_pass", 80)} stroke="hsl(var(--status-ok))" strokeDasharray="3 3" strokeOpacity={0.3} />
                      <Line type="monotone" dataKey="deadlineRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="firstDraftRate" stroke="hsl(var(--status-ok))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="secondDraftRate" stroke="hsl(210, 80%, 55%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="thirdDraftRate" stroke="hsl(270, 70%, 55%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Legend formatter={(value) => {
                        const labels: Record<string, string> = { deadlineRate: "納期遵守率", firstDraftRate: "初稿合格率", secondDraftRate: "第2稿合格率", thirdDraftRate: "第3稿合格率" };
                        return labels[value] || value;
                      }} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Monthly detail table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />月別詳細</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="px-4 py-2 font-medium">月</th>
                      <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                      {DRAFT_KEYS.map((d) => (
                        <th key={d.version} className="px-4 py-2 font-medium text-right">{d.label}合格率</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                    ) : (
                      [...monthlyData].reverse().map((d) => (
                        <tr key={d.month} className="border-b border-border/50">
                          <td className="px-4 py-2 font-medium">{d.monthLabel}</td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.deadlineRate} target={getTarget("deadline_compliance", 100)} total={d.deadlineTotal} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.firstDraftRate} target={getTarget("first_draft_pass", 80)} total={(d as any).draft1Total} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.secondDraftRate} target={getTarget("second_draft_pass", 90)} total={(d as any).draft2Total} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <RateCell rate={d.thirdDraftRate} target={getTarget("third_draft_pass", 95)} total={(d as any).draft3Total} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {viewMode === "by_project" && (
          <BreakdownTable
            title="案件別KPI"
            rows={projectBreakdown.map((b) => ({ key: b.id, name: b.name, deadline: b.deadline, drafts: b.drafts }))}
            targets={targetMap}
          />
        )}

        {viewMode === "by_process" && (
          <BreakdownTable
            title="工程別KPI"
            rows={processBreakdown.map((b) => ({ key: b.key, name: b.label, deadline: b.deadline, drafts: b.drafts }))}
            targets={targetMap}
          />
        )}

        {viewMode === "by_client" && (
          <BreakdownTable
            title="クライアント別KPI"
            rows={clientBreakdown.map((b) => ({ key: b.id, name: b.name, deadline: b.deadline, drafts: b.drafts }))}
            targets={targetMap}
          />
        )}

        {/* Quality Gap Analysis - shown in all view modes */}
        <QualityGapSection
          files={files}
          checkResults={checkResultsMini}
          projectNameMap={projectNameMap}
          getProcessLabel={getProcessLabel}
        />
      </div>
    </div>
  );
}

// --- Sub-components ---

function KpiCard({ icon: Icon, label, rate, target, total, color }: {
  icon: React.ElementType; label: string; rate: number | null; target: number; total: number; color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} />
          {label}
          <Badge variant="outline" className="ml-auto text-[10px]">目標: {target}%</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <div className="space-y-1.5">
            <div className={cn("text-2xl font-bold", rate !== null && rate >= target ? "text-status-ok" : rate !== null && rate >= target * 0.7 ? "text-status-warning" : "text-status-ng")}>
              {rate}%
            </div>
            <Progress value={rate ?? 0} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground">{total} 件中</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">データなし</p>
        )}
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

function BreakdownTable({ title, rows, targets }: {
  title: string;
  rows: { key: string; name: string; deadline: { total: number; onTime: number; rate: number | null }; drafts: Record<number, { total: number; passed: number; rate: number | null }> }[];
  targets: Map<string, number>;
}) {
  const getTarget = (key: string, fallback: number) => targets.get(key) ?? fallback;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
              {DRAFT_KEYS.map((d) => (
                <th key={d.version} className="px-4 py-2 font-medium text-right">{d.label}合格率</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">データなし</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="border-b border-border/50">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    <RateCell rate={r.deadline.rate} target={getTarget("deadline_compliance", 100)} total={r.deadline.total} />
                  </td>
                  {DRAFT_KEYS.map((d) => (
                    <td key={d.version} className="px-4 py-2 text-right">
                      <RateCell rate={r.drafts[d.version]?.rate ?? null} target={getTarget(d.key, d.version === 1 ? 80 : 90)} total={r.drafts[d.version]?.total ?? 0} />
                    </td>
                  ))}
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
    Object.fromEntries(targets.map((t) => [t.key, t.target_value]))
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {targets.map((t) => (
        <div key={t.key} className="flex items-center gap-3">
          <label className="text-sm font-medium flex-1">{t.label}</label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20 text-right"
              value={values[t.key] ?? t.target_value}
              onChange={(e) => setValues((v) => ({ ...v, [t.key]: parseInt(e.target.value) || 0 }))}
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
