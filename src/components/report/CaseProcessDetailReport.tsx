import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ReportCaseProcessDetailRow {
  process_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  client_name: string;
  product_name: string;
  nouhin_month: string;
  sort_order: number;
  process_key: string;
  process_label: string;
  start_date: string | null;
  first_draft_date: string | null;
  planned_deadline: string | null;
  planned_biz_days: number | null;
  actual_deadline: string | null;
  actual_biz_days: number | null;
  on_time: boolean | null;
  deadline_diff_biz_days: number | null;
  fix_draft_no: number | null;
  internal_fb_count: number;
  cl_fb_count: number;
  total_fb_count: number;
  cl_fb_rate_pct: number | null;
}

type DateField = "start_date" | "first_draft_date" | "fixed_date";

interface ProjectGroup {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  productName: string;
  processes: ReportCaseProcessDetailRow[];
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${y}/${mo}`;
}

function formatMMDD(dateStr: string | null): string {
  if (!dateStr) return "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length < 3) return "";
  return `${parts[1]}/${parts[2]}`;
}

function countMissingDates(rows: ReportCaseProcessDetailRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (!row.start_date) count++;
    if (!row.first_draft_date) count++;
    if (!row.actual_deadline) count++;
  }
  return count;
}

function groupByProject(rows: ReportCaseProcessDetailRow[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const row of rows) {
    let group = map.get(row.project_id);
    if (!group) {
      group = {
        projectId: row.project_id,
        projectCode: row.project_code,
        projectName: row.project_name,
        clientName: row.client_name,
        productName: row.product_name,
        processes: [],
      };
      map.set(row.project_id, group);
    }
    group.processes.push(row);
  }
  for (const group of map.values()) {
    group.processes.sort((a, b) => a.sort_order - b.sort_order);
  }
  return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName, "ja"));
}

function OnTimeBadge({ value }: { value: boolean | null }) {
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
  return <span className="text-muted-foreground">−</span>;
}

function DeadlineDiffCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">−</span>;
  if (days > 0) {
    return <span className="font-semibold text-status-ng tabular-nums">+{days}日</span>;
  }
  return <span className="tabular-nums">{days}日</span>;
}

function BizDaysCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">−</span>;
  return <span className="tabular-nums">{days}日</span>;
}

function CountCell({ value }: { value: number | null }) {
  const n = value ?? 0;
  return (
    <span className={cn("tabular-nums font-medium", n === 0 && "text-muted-foreground")}>{n}</span>
  );
}

function EditableDateCell({
  value,
  processId,
  field,
  onSaved,
  emphasizeMissing = false,
}: {
  value: string | null;
  processId: string;
  field: DateField;
  onSaved: () => void;
  emphasizeMissing?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (raw: string) => {
    const nextValue = raw.trim() || null;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_processes")
        .update({ [field]: nextValue } as Record<string, string | null>)
        .eq("id", processId);
      if (handleSupabaseError(error, "project_processes")) return;
      toast.success("日付を更新しました");
      onSaved();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        type="date"
        className="h-7 text-[12px] px-1 min-w-[108px]"
        defaultValue={value?.slice(0, 10) ?? ""}
        disabled={saving}
        autoFocus
        onBlur={(e) => void save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => setEditing(true)}
      className={cn(
        "w-full min-w-[52px] text-left px-1.5 py-1 rounded text-[12px] tabular-nums transition-colors",
        "hover:bg-primary/5 hover:ring-1 hover:ring-primary/20",
        !value && "bg-destructive/10 text-destructive font-medium",
        !value && emphasizeMissing && "ring-1 ring-destructive/50 bg-destructive/15 font-semibold"
      )}
      title={value ? undefined : "未入力 — クリックして入力"}
    >
      {value ? formatMMDD(value) : "—"}
    </button>
  );
}

function ProcessRow({
  row,
  onSaved,
}: {
  row: ReportCaseProcessDetailRow;
  onSaved: () => void;
}) {
  return (
    <tr className="border-b border-border/40 hover:bg-muted/20">
      <td className="px-2 py-1.5" />
      <td className="px-2 py-1.5 pl-4 whitespace-nowrap">
        <div className="text-[12px] font-medium">{row.process_label}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground shrink-0">初稿</span>
          <EditableDateCell
            value={row.first_draft_date}
            processId={row.process_id}
            field="first_draft_date"
            onSaved={onSaved}
          />
        </div>
      </td>
      <td className="px-1 py-1">
        <EditableDateCell
          value={row.start_date}
          processId={row.process_id}
          field="start_date"
          onSaved={onSaved}
          emphasizeMissing
        />
      </td>
      <td className="px-2 py-1.5 text-[12px] tabular-nums whitespace-nowrap">
        {formatMMDD(row.planned_deadline) || <span className="text-muted-foreground">−</span>}
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <BizDaysCell days={row.planned_biz_days} />
      </td>
      <td className="px-1 py-1">
        <EditableDateCell
          value={row.actual_deadline}
          processId={row.process_id}
          field="fixed_date"
          onSaved={onSaved}
        />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <BizDaysCell days={row.actual_biz_days} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <OnTimeBadge value={row.on_time} />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <DeadlineDiffCell days={row.deadline_diff_biz_days} />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <CountCell value={row.fix_draft_no} />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <CountCell value={row.internal_fb_count} />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center">
        <CountCell value={row.cl_fb_count} />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-center tabular-nums">
        {row.cl_fb_rate_pct != null ? (
          <span>{row.cl_fb_rate_pct}%</span>
        ) : (
          <span className="text-muted-foreground">−</span>
        )}
      </td>
    </tr>
  );
}

export function CaseProcessDetailReport() {
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [rows, setRows] = useState<ReportCaseProcessDetailRow[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);

  const fetchMonthOptions = useCallback(async () => {
    setLoadingMonths(true);
    try {
      const { data, error } = await supabase
        .from("report_case_process_detail")
        .select("nouhin_month")
        .not("nouhin_month", "is", null);
      if (handleSupabaseError(error, "report_case_process_detail months")) return;

      const months = [...new Set((data ?? []).map((r) => String(r.nouhin_month)).filter(Boolean))].sort().reverse();
      setMonthOptions(months);
      setSelectedMonth((prev) => (prev && months.includes(prev) ? prev : months[0] ?? ""));
    } finally {
      setLoadingMonths(false);
    }
  }, []);

  const fetchRows = useCallback(async (month: string) => {
    if (!month) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const { data, error } = await supabase
        .from("report_case_process_detail")
        .select("*")
        .eq("nouhin_month", month)
        .order("project_name", { ascending: true })
        .order("sort_order", { ascending: true });
      if (handleSupabaseError(error, "report_case_process_detail")) return;
      setRows((data ?? []) as ReportCaseProcessDetailRow[]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonthOptions();
  }, [fetchMonthOptions]);

  useEffect(() => {
    if (selectedMonth) void fetchRows(selectedMonth);
  }, [selectedMonth, fetchRows]);

  const projectGroups = useMemo(() => groupByProject(rows), [rows]);
  const missingCount = useMemo(() => countMissingDates(rows), [rows]);

  const handleDateSaved = useCallback(() => {
    if (selectedMonth) void fetchRows(selectedMonth);
  }, [selectedMonth, fetchRows]);

  const isLoading = loadingMonths || loadingRows;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">納品月:</span>
          <Select
            value={selectedMonth || undefined}
            onValueChange={setSelectedMonth}
            disabled={loadingMonths || monthOptions.length === 0}
          >
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="月を選択" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m} className="text-sm">
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isLoading && rows.length > 0 ? (
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border",
              missingCount > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-status-ok/40 bg-status-ok/10 text-status-ok"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {missingCount > 0 ? (
              <span>
                未入力 <strong className="font-bold">{missingCount}</strong> 件
              </span>
            ) : (
              <span>日付入力 完了</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-48 bg-muted/40 animate-pulse rounded-lg border border-border/50" />
      ) : monthOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">データがありません</p>
      ) : projectGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">この月の案件データがありません</p>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                <th rowSpan={2} className="px-2 py-2 font-medium text-left whitespace-nowrap align-middle min-w-[140px]">
                  案件名
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-left whitespace-nowrap align-middle min-w-[80px]">
                  工程
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-left whitespace-nowrap align-middle min-w-[72px]">
                  着手日
                </th>
                <th colSpan={2} className="px-2 py-1.5 font-medium text-center border-b border-border/30 text-primary/80">
                  計画
                </th>
                <th colSpan={2} className="px-2 py-1.5 font-medium text-center border-b border-border/30 text-[#7C7AFF]">
                  実績
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  納期遵守
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  納期差分
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  FIX稿数
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  社内FB
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  CL FB
                </th>
                <th rowSpan={2} className="px-2 py-2 font-medium text-center whitespace-nowrap align-middle">
                  CL FB率
                </th>
              </tr>
              <tr className="border-b border-border/50 bg-muted/20 text-muted-foreground text-[11px]">
                <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">納期予定日</th>
                <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">予定営業日</th>
                <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">実納期日</th>
                <th className="px-2 py-1.5 font-medium text-center whitespace-nowrap">実営業日</th>
              </tr>
            </thead>
            <tbody>
              {projectGroups.map((group) => (
                <Fragment key={group.projectId}>
                  <tr className="bg-muted/40 border-b border-border/50">
                    <td colSpan={13} className="px-3 py-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-muted-foreground">{group.projectCode}</span>
                        <span className="text-sm font-semibold">{group.projectName}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {group.clientName} / {group.productName}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.processes.map((proc) => (
                    <ProcessRow key={proc.process_id} row={proc} onSaved={handleDateSaved} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
        <p>
          ※ 納期遵守＝実納期(FIX)が納期予定(CL締切)以内か。営業日は土日＋日本の祝日を除外して計算。
        </p>
        <p>※ 初稿提出日・FIX日は操作から自動で入り、手動修正も可能。着手日は手動入力。</p>
        <p>
          ※ 社内FB＝@offbeat-inc.co.jp のコメント数、CL FB＝社外＋ゲストのコメント数。ツール外（メール/Slack）のFBは含みません。
        </p>
      </div>
    </div>
  );
}
