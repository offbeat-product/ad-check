import { useCallback, useEffect, useMemo, useState, type ElementType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Calendar, CheckCircle, Clock, MessageSquare, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReportProjectProcessMatrixRow {
  project_id: string;
  project_name: string;
  client_name: string;
  product_name: string;
  nouhin_date: string | null;
  nouhin_month: string;
  sort_order: number;
  process_key: string;
  process_label: string;
  client_deadline: string | null;
  first_client_submit_date: string | null;
  submit_on_time: boolean | null;
  fix_draft_no: number | null;
  fix_date: string | null;
  revision_leadtime_days: number | null;
  fb_comment_count: number;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  clientName: string;
  productName: string;
  processes: ReportProjectProcessMatrixRow[];
  maxRevisionLeadtime: number | null;
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${y}/${mo}`;
}

function formatDateMMDD(dateStr: string | null): string {
  if (!dateStr) return "-";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length < 3) return "-";
  return `${parts[1]}-${parts[2]}`;
}

function computeMonthSummary(rows: ReportProjectProcessMatrixRow[]) {
  const judgeable = rows.filter((r) => r.submit_on_time !== null);
  const onTimeCount = judgeable.filter((r) => r.submit_on_time === true).length;
  const submitRate =
    judgeable.length > 0 ? Math.round((onTimeCount / judgeable.length) * 100) : null;

  const leadtimes = rows
    .map((r) => r.revision_leadtime_days)
    .filter((v): v is number => v != null);
  const avgLeadtime =
    leadtimes.length > 0
      ? Math.round((leadtimes.reduce((a, b) => a + b, 0) / leadtimes.length) * 10) / 10
      : null;

  const fixDrafts = rows.map((r) => r.fix_draft_no).filter((v): v is number => v != null);
  const avgFixDraft =
    fixDrafts.length > 0
      ? Math.round((fixDrafts.reduce((a, b) => a + b, 0) / fixDrafts.length) * 10) / 10
      : null;

  const totalFb = rows.reduce((sum, r) => sum + (r.fb_comment_count ?? 0), 0);

  return { submitRate, submitJudgeable: judgeable.length, onTimeCount, avgLeadtime, avgFixDraft, totalFb };
}

function groupByProject(rows: ReportProjectProcessMatrixRow[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();

  for (const row of rows) {
    let group = map.get(row.project_id);
    if (!group) {
      group = {
        projectId: row.project_id,
        projectName: row.project_name,
        clientName: row.client_name,
        productName: row.product_name,
        processes: [],
        maxRevisionLeadtime: null,
      };
      map.set(row.project_id, group);
    }
    group.processes.push(row);
  }

  for (const group of map.values()) {
    group.processes.sort((a, b) => a.sort_order - b.sort_order);
    const leadtimes = group.processes
      .map((p) => p.revision_leadtime_days)
      .filter((v): v is number => v != null);
    group.maxRevisionLeadtime =
      leadtimes.length > 0 ? Math.max(...leadtimes) : null;
  }

  return [...map.values()].sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "ja")
  );
}

function SubmitOnTimeBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <Badge className="bg-status-ok/15 text-status-ok border-status-ok/30 text-[11px] px-1.5">
        ○
      </Badge>
    );
  }
  if (value === false) {
    return (
      <Badge className="bg-status-ng/15 text-status-ng border-status-ng/30 text-[11px] px-1.5">
        ×
      </Badge>
    );
  }
  return <span className="text-muted-foreground">-</span>;
}

function RevisionLeadtimeCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        days >= 14 && "text-status-ng",
        days >= 7 && days <= 13 && "text-status-warning",
        days <= 6 && "text-foreground"
      )}
    >
      {days}日
    </span>
  );
}

function MatrixSummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  valueClassName,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail?: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1.5 pt-3 px-3">
        <CardTitle className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className={cn("text-xl font-bold tabular-nums", valueClassName)}>{value}</div>
        {detail ? <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function ProcessMatrixTable({ processes }: { processes: ReportProjectProcessMatrixRow[] }) {
  return (
    <div className="overflow-x-auto border-t border-border/50 bg-muted/20">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground text-left">
            <th className="px-3 py-2 font-medium whitespace-nowrap">工程</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">CL締切</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">初回提出</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">提出納期</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">FIX稿</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">FIX日</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">修正LT</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap text-right">FB</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => (
            <tr
              key={`${p.project_id}-${p.process_key}`}
              className="border-b border-border/30 last:border-0"
            >
              <td className="px-3 py-2 font-medium whitespace-nowrap">{p.process_label}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                {formatDateMMDD(p.client_deadline)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                {formatDateMMDD(p.first_client_submit_date)}
              </td>
              <td className="px-3 py-2">
                <SubmitOnTimeBadge value={p.submit_on_time} />
              </td>
              <td className="px-3 py-2 tabular-nums">
                {p.fix_draft_no != null ? p.fix_draft_no : <span className="text-muted-foreground">-</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                {formatDateMMDD(p.fix_date)}
              </td>
              <td className="px-3 py-2">
                <RevisionLeadtimeCell days={p.revision_leadtime_days} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span
                  className={cn(
                    "font-medium",
                    (p.fb_comment_count ?? 0) === 0 && "text-muted-foreground"
                  )}
                >
                  {p.fb_comment_count ?? 0}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectBreakdownSection() {
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [matrixRows, setMatrixRows] = useState<ReportProjectProcessMatrixRow[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);

  const fetchMonthOptions = useCallback(async () => {
    setLoadingMonths(true);
    try {
      const { data, error } = await supabase
        .from("report_project_process_matrix")
        .select("nouhin_month")
        .order("nouhin_month", { ascending: false });
      if (handleSupabaseError(error, "report_project_process_matrix months")) return;

      const unique = [...new Set((data ?? []).map((r) => String(r.nouhin_month)).filter(Boolean))];
      setMonthOptions(unique);
      setSelectedMonth((prev) => {
        if (prev && unique.includes(prev)) return prev;
        return unique[0] ?? "";
      });
    } finally {
      setLoadingMonths(false);
    }
  }, []);

  const fetchMatrixRows = useCallback(async (month: string) => {
    if (!month) {
      setMatrixRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from("report_project_process_matrix")
        .select("*")
        .eq("nouhin_month", month)
        .order("project_name", { ascending: true })
        .order("sort_order", { ascending: true });
      if (handleSupabaseError(error, "report_project_process_matrix")) return;
      setMatrixRows((data ?? []) as ReportProjectProcessMatrixRow[]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonthOptions();
  }, [fetchMonthOptions]);

  useEffect(() => {
    if (selectedMonth) void fetchMatrixRows(selectedMonth);
  }, [selectedMonth, fetchMatrixRows]);

  const summary = useMemo(() => computeMonthSummary(matrixRows), [matrixRows]);
  const projectGroups = useMemo(() => groupByProject(matrixRows), [matrixRows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            案件別内訳
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">納品月:</span>
            <Select
              value={selectedMonth || undefined}
              onValueChange={setSelectedMonth}
              disabled={loadingMonths || monthOptions.length === 0}
            >
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue placeholder="月を選択" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {loadingMonths || loadingRows ? (
          <div className="h-24 bg-muted/40 animate-pulse rounded-lg" />
        ) : monthOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MatrixSummaryCard
                icon={CheckCircle}
                label="提出納期遵守率"
                value={summary.submitRate != null ? `${summary.submitRate}%` : "—"}
                detail={
                  summary.submitJudgeable > 0
                    ? `${summary.onTimeCount}/${summary.submitJudgeable}工程`
                    : undefined
                }
              />
              <MatrixSummaryCard
                icon={Clock}
                label="平均修正リードタイム"
                value={summary.avgLeadtime != null ? `${summary.avgLeadtime}日` : "—"}
                valueClassName="text-status-ng"
              />
              <MatrixSummaryCard
                icon={RotateCcw}
                label="平均FIX稿"
                value={summary.avgFixDraft != null ? `${summary.avgFixDraft}稿` : "—"}
              />
              <MatrixSummaryCard
                icon={MessageSquare}
                label="FBコメント総数"
                value={`${summary.totalFb}件`}
              />
            </div>

            {projectGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                この月の案件データがありません
              </p>
            ) : (
              <Accordion type="multiple" className="rounded-lg border border-border/50">
                {projectGroups.map((group) => (
                  <AccordionItem
                    key={group.projectId}
                    value={group.projectId}
                    className="border-b border-border/50 last:border-b-0 px-1"
                  >
                    <AccordionTrigger className="px-3 py-3 hover:no-underline hover:bg-muted/30 rounded-md text-xs [&>svg]:text-muted-foreground">
                      <div className="flex flex-1 items-center justify-between gap-3 min-w-0 text-left">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{group.projectName}</p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {group.clientName} / {group.productName}
                          </p>
                        </div>
                        {group.maxRevisionLeadtime != null ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            修正LT{" "}
                            <span
                              className={cn(
                                "font-semibold",
                                group.maxRevisionLeadtime >= 14 && "text-status-ng",
                                group.maxRevisionLeadtime >= 7 &&
                                  group.maxRevisionLeadtime <= 13 &&
                                  "text-status-warning"
                              )}
                            >
                              {group.maxRevisionLeadtime}日
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <ProcessMatrixTable processes={group.processes} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
              <p>
                ※ FIX稿は現状ほぼ全案件で「1」です（版番号運用が未徹底のため）。修正の重さは修正LT（日数）でご判断ください。
              </p>
              <p>
                ※ FBコメント数は Ad Check 上に記録された分のみ。メール/Slack 等ツール外のFBは含まれません。
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
