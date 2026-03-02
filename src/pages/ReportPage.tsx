import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { getProcessLabel } from "@/lib/process-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, ReferenceLine } from "recharts";
import { Target, CheckCircle, TrendingUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

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
  pattern_id: string | null;
  created_at: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  product_id: string | null;
}

type ViewMode = "all" | "by_project" | "by_process";

export default function ReportPage() {
  const { user } = useAuth();
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const [procRes, fileRes, projRes] = await Promise.all([
          supabase.from("project_processes").select("id, project_id, process_key, process_label, status, deadline, updated_at"),
          supabase.from("project_files").select("id, project_id, process_type, status, version_number, pattern_id, created_at"),
          supabase.from("projects").select("id, name, product_id"),
        ]);
        if (cancelled) return;
        handleSupabaseError(procRes.error, "project_processes");
        handleSupabaseError(fileRes.error, "project_files");
        handleSupabaseError(projRes.error, "projects");
        setProcesses(procRes.data ?? []);
        setFiles(fileRes.data ?? []);
        setProjects(projRes.data ?? []);
      } catch (e) {
        console.error("[Report] fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [user]);

  // Compute monthly data
  const monthlyData = useMemo(() => {
    // 納期遵守率: completed processes with deadline
    const completedWithDeadline = processes.filter(
      (p) => p.status === "completed" && p.deadline
    );

    // 初稿合格率: version_number=1 files that have been checked (status != 'uploaded')
    const firstDraftFiles = files.filter(
      (f) => (f.version_number ?? 1) === 1 && f.status && f.status !== "uploaded"
    );

    // Group by month
    const monthMap = new Map<string, { deadlineTotal: number; deadlineOnTime: number; firstDraftTotal: number; firstDraftFixed: number }>();

    const getMonthKey = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    completedWithDeadline.forEach((p) => {
      const monthKey = getMonthKey(p.updated_at);
      const entry = monthMap.get(monthKey) || { deadlineTotal: 0, deadlineOnTime: 0, firstDraftTotal: 0, firstDraftFixed: 0 };
      entry.deadlineTotal++;
      // Compare completion date with deadline
      const completedDate = new Date(p.updated_at);
      const deadlineDate = new Date(p.deadline + "T23:59:59");
      if (completedDate <= deadlineDate) entry.deadlineOnTime++;
      monthMap.set(monthKey, entry);
    });

    firstDraftFiles.forEach((f) => {
      const monthKey = f.created_at ? getMonthKey(f.created_at) : null;
      if (!monthKey) return;
      const entry = monthMap.get(monthKey) || { deadlineTotal: 0, deadlineOnTime: 0, firstDraftTotal: 0, firstDraftFixed: 0 };
      entry.firstDraftTotal++;
      if (f.status === "fixed" || f.status === "approved") entry.firstDraftFixed++;
      monthMap.set(monthKey, entry);
    });

    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        monthLabel: formatMonthLabel(month),
        deadlineRate: data.deadlineTotal > 0 ? Math.round((data.deadlineOnTime / data.deadlineTotal) * 100) : null,
        firstDraftRate: data.firstDraftTotal > 0 ? Math.round((data.firstDraftFixed / data.firstDraftTotal) * 100) : null,
        deadlineTotal: data.deadlineTotal,
        deadlineOnTime: data.deadlineOnTime,
        firstDraftTotal: data.firstDraftTotal,
        firstDraftFixed: data.firstDraftFixed,
      }));
  }, [processes, files]);

  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const breakdown: { projectId: string; projectName: string; deadlineRate: number | null; firstDraftRate: number | null; deadlineTotal: number; firstDraftTotal: number }[] = [];

    const projectIds = [...new Set([...processes.map((p) => p.project_id), ...files.map((f) => f.project_id).filter(Boolean)])];

    projectIds.forEach((pid) => {
      const projProcesses = processes.filter((p) => p.project_id === pid && p.status === "completed" && p.deadline);
      const projFiles = files.filter((f) => f.project_id === pid && (f.version_number ?? 1) === 1 && f.status && f.status !== "uploaded");

      const deadlineOnTime = projProcesses.filter((p) => {
        const completedDate = new Date(p.updated_at);
        const deadlineDate = new Date(p.deadline + "T23:59:59");
        return completedDate <= deadlineDate;
      }).length;

      const firstDraftFixed = projFiles.filter((f) => f.status === "fixed" || f.status === "approved").length;

      breakdown.push({
        projectId: pid,
        projectName: projectMap.get(pid) || "不明",
        deadlineRate: projProcesses.length > 0 ? Math.round((deadlineOnTime / projProcesses.length) * 100) : null,
        firstDraftRate: projFiles.length > 0 ? Math.round((firstDraftFixed / projFiles.length) * 100) : null,
        deadlineTotal: projProcesses.length,
        firstDraftTotal: projFiles.length,
      });
    });

    return breakdown.filter((b) => b.deadlineTotal > 0 || b.firstDraftTotal > 0);
  }, [processes, files, projects]);

  // Process breakdown
  const processBreakdown = useMemo(() => {
    const processKeys = [...new Set(files.map((f) => f.process_type))];

    return processKeys.map((key) => {
      const procFiles = files.filter((f) => f.process_type === key && (f.version_number ?? 1) === 1 && f.status && f.status !== "uploaded");
      const fixed = procFiles.filter((f) => f.status === "fixed" || f.status === "approved").length;

      const procProcesses = processes.filter((p) => p.process_key === key && p.status === "completed" && p.deadline);
      const onTime = procProcesses.filter((p) => {
        const completedDate = new Date(p.updated_at);
        const deadlineDate = new Date(p.deadline + "T23:59:59");
        return completedDate <= deadlineDate;
      }).length;

      return {
        processKey: key,
        processLabel: getProcessLabel(key),
        deadlineRate: procProcesses.length > 0 ? Math.round((onTime / procProcesses.length) * 100) : null,
        firstDraftRate: procFiles.length > 0 ? Math.round((fixed / procFiles.length) * 100) : null,
        deadlineTotal: procProcesses.length,
        firstDraftTotal: procFiles.length,
      };
    }).filter((b) => b.deadlineTotal > 0 || b.firstDraftTotal > 0);
  }, [processes, files]);

  // Current month stats
  const currentMonthStats = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const found = monthlyData.find((d) => d.month === currentMonthKey);
    return found || { deadlineRate: null, firstDraftRate: null, deadlineTotal: 0, firstDraftTotal: 0 };
  }, [monthlyData]);

  const chartConfig = {
    deadlineRate: { label: "納期遵守率", color: "hsl(var(--primary))" },
    firstDraftRate: { label: "初稿合格率", color: "hsl(var(--status-ok))" },
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass-card p-6 space-y-3">
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
              <div className="h-40 bg-muted animate-pulse rounded" />
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
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全体推移</SelectItem>
            <SelectItem value="by_project">案件別</SelectItem>
            <SelectItem value="by_process">工程別</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Current month summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                今月の納期遵守率
                <Badge variant="outline" className="ml-auto text-[10px]">目標: 100%</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentMonthStats.deadlineTotal > 0 ? (
                <div className="space-y-2">
                  <div className="text-3xl font-bold">{currentMonthStats.deadlineRate}%</div>
                  <Progress value={currentMonthStats.deadlineRate ?? 0} className="h-2" />
                  <p className="text-xs text-muted-foreground">{currentMonthStats.deadlineTotal} 件中</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">今月の完了データなし</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-status-ok" />
                今月の初稿合格率
                <Badge variant="outline" className="ml-auto text-[10px]">目標: 80%</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentMonthStats.firstDraftTotal > 0 ? (
                <div className="space-y-2">
                  <div className="text-3xl font-bold">{currentMonthStats.firstDraftRate}%</div>
                  <Progress value={currentMonthStats.firstDraftRate ?? 0} className="h-2" />
                  <p className="text-xs text-muted-foreground">{currentMonthStats.firstDraftTotal} 件中</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">今月のチェックデータなし</p>
              )}
            </CardContent>
          </Card>
        </div>

        {viewMode === "all" && (
          <>
            {/* Monthly trend chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  月別推移
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
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [`${value}%`, name === "deadlineRate" ? "納期遵守率" : "初稿合格率"]} />} />
                      <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={80} stroke="hsl(var(--status-ok))" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Line type="monotone" dataKey="deadlineRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="deadlineRate" connectNulls />
                      <Line type="monotone" dataKey="firstDraftRate" stroke="hsl(var(--status-ok))" strokeWidth={2} dot={{ r: 4 }} name="firstDraftRate" connectNulls />
                      <Legend formatter={(value) => value === "deadlineRate" ? "納期遵守率" : "初稿合格率"} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Monthly breakdown table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  月別詳細
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="px-4 py-2 font-medium">月</th>
                      <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                      <th className="px-4 py-2 font-medium text-right">対象件数</th>
                      <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                      <th className="px-4 py-2 font-medium text-right">対象件数</th>
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
                            {d.deadlineRate !== null ? (
                              <span className={cn("font-bold", d.deadlineRate >= 100 ? "text-status-ok" : d.deadlineRate >= 80 ? "text-status-warning" : "text-status-ng")}>{d.deadlineRate}%</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{d.deadlineTotal || "—"}</td>
                          <td className="px-4 py-2 text-right">
                            {d.firstDraftRate !== null ? (
                              <span className={cn("font-bold", d.firstDraftRate >= 80 ? "text-status-ok" : d.firstDraftRate >= 50 ? "text-status-warning" : "text-status-ng")}>{d.firstDraftRate}%</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{d.firstDraftTotal || "—"}</td>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">案件別KPI</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">案件名</th>
                    <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                    <th className="px-4 py-2 font-medium text-right">件数</th>
                    <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                    <th className="px-4 py-2 font-medium text-right">件数</th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                  ) : (
                    projectBreakdown.map((b) => (
                      <tr key={b.projectId} className="border-b border-border/50">
                        <td className="px-4 py-2 font-medium">{b.projectName}</td>
                        <td className="px-4 py-2 text-right">
                          {b.deadlineRate !== null ? (
                            <span className={cn("font-bold", b.deadlineRate >= 100 ? "text-status-ok" : "text-status-warning")}>{b.deadlineRate}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{b.deadlineTotal || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          {b.firstDraftRate !== null ? (
                            <span className={cn("font-bold", b.firstDraftRate >= 80 ? "text-status-ok" : "text-status-warning")}>{b.firstDraftRate}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{b.firstDraftTotal || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {viewMode === "by_process" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">工程別KPI</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">工程</th>
                    <th className="px-4 py-2 font-medium text-right">納期遵守率</th>
                    <th className="px-4 py-2 font-medium text-right">件数</th>
                    <th className="px-4 py-2 font-medium text-right">初稿合格率</th>
                    <th className="px-4 py-2 font-medium text-right">件数</th>
                  </tr>
                </thead>
                <tbody>
                  {processBreakdown.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">データなし</td></tr>
                  ) : (
                    processBreakdown.map((b) => (
                      <tr key={b.processKey} className="border-b border-border/50">
                        <td className="px-4 py-2 font-medium">{b.processLabel}</td>
                        <td className="px-4 py-2 text-right">
                          {b.deadlineRate !== null ? (
                            <span className={cn("font-bold", b.deadlineRate >= 100 ? "text-status-ok" : "text-status-warning")}>{b.deadlineRate}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{b.deadlineTotal || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          {b.firstDraftRate !== null ? (
                            <span className={cn("font-bold", b.firstDraftRate >= 80 ? "text-status-ok" : "text-status-warning")}>{b.firstDraftRate}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{b.firstDraftTotal || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}/${month}`;
}
