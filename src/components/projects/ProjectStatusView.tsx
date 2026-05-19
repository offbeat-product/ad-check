import { useMemo, useState, useEffect, useCallback, type ElementType } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, parseISO, startOfDay, isToday } from "date-fns";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Search,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectStatusSummary, type ProjectStatusSummary } from "@/hooks/useProjectStatusSummary";
import { CLSubmitDialog } from "@/components/projects/CLSubmitDialog";
import { FixConfirmDialog } from "@/components/projects/FixConfirmDialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { ALL_PROJECTS_QUERY_KEY } from "@/hooks/useAllProjects";
import { PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { PROJECT_AUDIT_LOG_QUERY_KEY } from "@/components/ProjectAuditLog";
import { effectiveProjectDeadline } from "@/lib/project-display";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const ALL_SENTINEL = "__all__";

type SectionKey = "initial_check_pending" | "cl_submit_ready" | "fix_ready" | "completed";

/** ステータスバッジ・進捗バー・件数・アクションを行ごとに統一 */
const SECTION_ROW_STYLE: Record<
  SectionKey,
  {
    label: string;
    emoji: string;
    badgeClass: string;
    progressIndicator: string;
    progressCount: string;
    clButtonClass: string;
    fixButtonClass: string;
    idleDashClass: string;
  }
> = {
  initial_check_pending: {
    label: "初稿チェック前",
    emoji: "⚪",
    badgeClass: "bg-muted text-muted-foreground border border-border",
    progressIndicator: "bg-muted-foreground/45",
    progressCount: "text-muted-foreground",
    clButtonClass:
      "border border-border bg-background text-foreground hover:bg-muted/60 h-8 text-xs px-3",
    fixButtonClass:
      "border border-border bg-background text-foreground hover:bg-muted/60 h-8 text-xs px-3",
    idleDashClass: "text-muted-foreground",
  },
  cl_submit_ready: {
    label: "CL提出可能",
    emoji: "🔵",
    badgeClass: "bg-primary/10 text-primary border border-primary/30 font-medium",
    progressIndicator: "bg-primary",
    progressCount: "text-primary",
    clButtonClass: "bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs px-3 shadow-none",
    fixButtonClass:
      "border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 h-8 text-xs px-3 shadow-none",
    idleDashClass: "text-primary/70",
  },
  fix_ready: {
    label: "FIX確定可能",
    emoji: "🟣",
    badgeClass:
      "bg-[hsl(264,100%,58%)]/12 text-[hsl(264,100%,42%)] border border-[hsl(264,100%,58%)]/35 font-medium",
    progressIndicator: "bg-[hsl(264,100%,58%)]",
    progressCount: "text-[hsl(264,100%,45%)]",
    clButtonClass:
      "border border-[hsl(264,100%,58%)]/45 bg-[hsl(264,100%,58%)]/12 text-[hsl(264,100%,38%)] hover:bg-[hsl(264,100%,58%)]/22 h-8 text-xs px-3 shadow-none",
    fixButtonClass:
      "bg-[hsl(264,100%,48%)] text-white hover:bg-[hsl(264,100%,42%)] h-8 text-xs px-3 shadow-none",
    idleDashClass: "text-[hsl(264,100%,45%)]/80",
  },
  completed: {
    label: "FIX済",
    emoji: "🟢",
    badgeClass: "bg-status-ok/10 text-status-ok border border-status-ok/40 font-medium",
    progressIndicator: "bg-status-ok",
    progressCount: "text-status-ok",
    clButtonClass:
      "border border-status-ok/40 bg-status-ok/10 text-status-ok hover:bg-status-ok/20 h-8 text-xs px-3 shadow-none",
    fixButtonClass:
      "border border-status-ok/40 bg-status-ok/10 text-status-ok hover:bg-status-ok/20 h-8 text-xs px-3 shadow-none",
    idleDashClass: "text-status-ok/70",
  },
};

function StatusProgressBar({ value, indicatorClass }: { value: number; indicatorClass: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full transition-all", indicatorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function categorizeProject(p: ProjectStatusSummary): SectionKey {
  if (p.total > 0 && p.count_fixed === p.total) return "completed";
  if (p.count_client_review > 0) return "fix_ready";
  if (p.count_checked > 0) return "cl_submit_ready";
  return "initial_check_pending";
}

function sortProjects(projects: ProjectStatusSummary[]): ProjectStatusSummary[] {
  return [...projects].sort((a, b) => {
    const dateA = effectiveProjectDeadline(a.deadline, a.overall_deadline);
    const dateB = effectiveProjectDeadline(b.deadline, b.overall_deadline);
    if (dateA && dateB) {
      if (dateA !== dateB) return dateA.localeCompare(dateB);
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }
    return a.project_name.localeCompare(b.project_name, "ja");
  });
}

function deadlineClass(deadlineStr: string | null): string {
  if (!deadlineStr) return "text-muted-foreground";
  let d: Date;
  try {
    d = startOfDay(parseISO(deadlineStr.length > 10 ? deadlineStr : `${deadlineStr}T00:00:00`));
  } catch {
    return "text-muted-foreground";
  }
  const days = differenceInCalendarDays(d, startOfDay(new Date()));
  if (days < 0) return "text-status-ng font-medium";
  if (days === 0) return "text-destructive font-medium";
  if (days <= 3) return "text-status-warning font-medium";
  return "text-muted-foreground";
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  iconTone,
}: {
  icon: ElementType;
  label: string;
  value: number | string;
  iconTone: string;
}) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={cn("p-2.5 rounded-lg bg-muted", iconTone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function getVisiblePages(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const s = new Set([1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total));
  const arr = [...s].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i]! - arr[i - 1]! > 1) out.push("gap");
    out.push(arr[i]!);
  }
  return out;
}

function rowDeadlineValue(p: ProjectStatusSummary, patch: Record<string, string>): string | null {
  if (Object.prototype.hasOwnProperty.call(patch, p.project_id)) {
    return patch[p.project_id] ?? null;
  }
  return p.deadline ?? null;
}

export function ProjectStatusView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, loading, error, refetch } = useProjectStatusSummary();
  const [clSubmitTarget, setClSubmitTarget] = useState<ProjectStatusSummary | null>(null);
  const [fixTarget, setFixTarget] = useState<ProjectStatusSummary | null>(null);

  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("");
  const [productId, setProductId] = useState("");
  const [sectionKey, setSectionKey] = useState("");
  const [hideFixCompleted, setHideFixCompleted] = useState(true);
  const [page, setPage] = useState(1);
  const [deadlineOpenId, setDeadlineOpenId] = useState<string | null>(null);
  const [deadlinePatch, setDeadlinePatch] = useState<Record<string, string>>({});

  const summary = useMemo(() => {
    const totalCount = data.length;
    const todayDue = data.filter((p) => {
      const eff = effectiveProjectDeadline(p.deadline, p.overall_deadline);
      if (!eff) return false;
      try {
        return isToday(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`));
      } catch {
        return false;
      }
    }).length;
    const clSubmitCount = data.filter((p) => p.ready_for_cl_submit > 0).length;
    const fixReadyCount = data.filter((p) => p.ready_for_fix > 0).length;
    return { totalCount, todayDue, clSubmitCount, fixReadyCount };
  }, [data]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => {
      if (r.client_id) m.set(r.client_id, r.client_name || "");
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [data]);

  const productOptions = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => {
      if (!r.product_id) return;
      if (clientId && r.client_id !== clientId) return;
      m.set(r.product_id, r.product_name || "");
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [data, clientId]);

  useEffect(() => {
    if (!productId) return;
    const ok = data.some((r) => r.product_id === productId && (!clientId || r.client_id === clientId));
    if (!ok) setProductId("");
  }, [data, productId, clientId]);

  const filteredSorted = useMemo(() => {
    let list = [...data];
    if (hideFixCompleted) {
      list = list.filter((p) => categorizeProject(p) !== "completed");
    }
    const qv = q.trim().toLowerCase();
    if (qv) {
      list = list.filter((r) => {
        const blob = `${r.project_name} ${r.client_name ?? ""} ${r.product_name ?? ""}`.toLowerCase();
        return blob.includes(qv);
      });
    }
    if (clientId) list = list.filter((r) => r.client_id === clientId);
    if (productId) list = list.filter((r) => r.product_id === productId);
    if (sectionKey) list = list.filter((r) => categorizeProject(r) === sectionKey);
    return sortProjects(list);
  }, [data, hideFixCompleted, q, clientId, productId, sectionKey]);

  useEffect(() => {
    setPage(1);
  }, [hideFixCompleted, q, clientId, productId, sectionKey]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, currentPage]);

  const visiblePages = useMemo(() => getVisiblePages(currentPage, totalPages), [currentPage, totalPages]);

  const handleDeadlineChange = useCallback(
    async (projectId: string, newDate: Date | undefined) => {
      if (!newDate) return;
      const ymd = format(newDate, "yyyy-MM-dd");
      setDeadlinePatch((prev) => ({ ...prev, [projectId]: ymd }));
      setDeadlineOpenId(null);
      const { error: upErr } = await supabase
        .from("projects")
        .update({ deadline: ymd, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (upErr) {
        setDeadlinePatch((prev) => {
          const n = { ...prev };
          delete n[projectId];
          return n;
        });
        toast({
          title: "納品日の更新に失敗しました",
          description: upErr.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "納品日を更新しました" });
      void queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ALL_PROJECTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [PROJECT_AUDIT_LOG_QUERY_KEY] });
      await refetch();
      setDeadlinePatch((prev) => {
        const n = { ...prev };
        delete n[projectId];
        return n;
      });
    },
    [queryClient, refetch, toast]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-destructive py-4">{error}</div>;
  }

  if (data.length === 0) {
    return <div className="text-sm text-muted-foreground py-12 text-center">案件がありません</div>;
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStat icon={Layers} label="全案件" value={summary.totalCount} iconTone="text-primary" />
          <SummaryStat icon={AlertTriangle} label="本日締切" value={summary.todayDue} iconTone="text-destructive" />
          <SummaryStat icon={Send} label="CL提出可能" value={summary.clSubmitCount} iconTone="text-primary" />
          <SummaryStat
            icon={CheckCircle}
            label="FIX確定可能"
            value={summary.fixReadyCount}
            iconTone="text-[hsl(264,100%,58%)]"
          />
        </div>

        <div className="glass-card p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex-1 min-w-[200px] max-w-md">
              <Label className="text-[10px] text-muted-foreground mb-1 block">
                検索（クライアント・商材・案件名）
              </Label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="クライアント名・商材名・案件名のいずれかに一致"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:w-[200px]">
              <Label className="text-[10px] text-muted-foreground mb-1 block">クライアント</Label>
              <Select
                value={clientId || ALL_SENTINEL}
                onValueChange={(v) => {
                  if (v === ALL_SENTINEL) {
                    setClientId("");
                    setProductId("");
                  } else {
                    setClientId(v);
                    setProductId("");
                  }
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL} className="text-xs">
                    すべて
                  </SelectItem>
                  {clientOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[200px]">
              <Label className="text-[10px] text-muted-foreground mb-1 block">商材</Label>
              <Select
                value={productId || ALL_SENTINEL}
                onValueChange={(v) => setProductId(v === ALL_SENTINEL ? "" : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL} className="text-xs">
                    すべて
                  </SelectItem>
                  {productOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Label className="text-[10px] text-muted-foreground mb-1 block">ステータス</Label>
              <Select value={sectionKey || ALL_SENTINEL} onValueChange={(v) => setSectionKey(v === ALL_SENTINEL ? "" : v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL} className="text-xs">
                    すべて
                  </SelectItem>
                  <SelectItem value="initial_check_pending" className="text-xs">
                    ⚪ 初稿チェック前
                  </SelectItem>
                  <SelectItem value="cl_submit_ready" className="text-xs">
                    🔵 CL提出可能
                  </SelectItem>
                  <SelectItem value="fix_ready" className="text-xs">
                    🟣 FIX確定可能
                  </SelectItem>
                  <SelectItem value="completed" className="text-xs">
                    🟢 FIX済
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox
                id="hide-fix-completed"
                checked={hideFixCompleted}
                onCheckedChange={(c) => setHideFixCompleted(c === true)}
              />
              <Label
                htmlFor="hide-fix-completed"
                className="text-xs font-normal cursor-pointer flex items-center gap-1.5"
              >
                {hideFixCompleted ? (
                  <EyeOff className="h-3 w-3 text-muted-foreground" aria-hidden />
                ) : (
                  <Eye className="h-3 w-3 text-muted-foreground" aria-hidden />
                )}
                FIX済を非表示
              </Label>
            </div>
          </div>
        </div>

        {filteredSorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            条件に一致する案件がありません。フィルタを変更してください。
          </p>
        ) : (
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground min-w-[100px] max-w-[140px]">
                    クライアント
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground min-w-[100px] max-w-[160px]">
                    商材
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground min-w-[200px]">案件名</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-[140px]">
                    ステータス
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-[100px]">
                    納品日
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-36">進捗</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right min-w-[180px]">
                    アクション
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSlice.map((p) => {
                  const section = categorizeProject(p);
                  const rowStyle = SECTION_ROW_STYLE[section];
                  const dLine = rowDeadlineValue(p, deadlinePatch);
                  const eff = effectiveProjectDeadline(dLine, p.overall_deadline);
                  const dateLabel = eff
                    ? format(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`), "M/d")
                    : "—";
                  const calSelected = eff ? parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`) : undefined;
                  const done = p.count_fixed;
                  const total = p.total;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <TableRow
                      key={p.project_id}
                      className="cursor-pointer border-b border-border/50"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-interactive]")) return;
                        navigate(`/project/${p.project_id}`);
                      }}
                    >
                      <TableCell
                        className="text-xs align-middle max-w-[140px]"
                        data-interactive
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.client_id ? (
                          <button
                            type="button"
                            className="text-left w-full truncate text-primary hover:underline font-medium"
                            onClick={() => navigate(`/client/${p.client_id}`)}
                          >
                            {p.client_name || "—"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-xs align-middle max-w-[160px]"
                        data-interactive
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.product_id ? (
                          <button
                            type="button"
                            className="text-left w-full truncate text-primary hover:underline font-medium"
                            onClick={() => navigate(`/product/${p.product_id}`)}
                          >
                            {p.product_name || "—"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium max-w-[280px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{p.project_name}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-md break-all">
                            {p.project_name}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs",
                            rowStyle.badgeClass
                          )}
                        >
                          {rowStyle.emoji} {rowStyle.label}
                        </span>
                      </TableCell>
                      <TableCell
                        data-interactive
                        className={cn("text-xs whitespace-nowrap", deadlineClass(eff))}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Popover
                          open={deadlineOpenId === p.project_id}
                          onOpenChange={(o) => setDeadlineOpenId(o ? p.project_id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60 transition-colors tabular-nums",
                                deadlineClass(eff)
                              )}
                              data-interactive
                            >
                              <span>{dateLabel}</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={calSelected}
                              onSelect={(d) => void handleDeadlineChange(p.project_id, d)}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="text-xs">
                        {total === 0 ? (
                          <span className={cn("text-[10px] tabular-nums", rowStyle.progressCount)}>ファイルなし</span>
                        ) : (
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <StatusProgressBar value={pct} indicatorClass={rowStyle.progressIndicator} />
                            <span
                              className={cn("text-[10px] tabular-nums shrink-0 font-medium", rowStyle.progressCount)}
                            >
                              {done}/{total}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right" data-interactive onClick={(e) => e.stopPropagation()}>
                        {p.ready_for_cl_submit === 0 && p.ready_for_fix === 0 ? (
                          <span className={cn("text-xs", rowStyle.idleDashClass)}>-</span>
                        ) : (
                          <div className="flex items-center gap-2 justify-end flex-wrap">
                            {p.ready_for_cl_submit > 0 && (
                              <Button
                                type="button"
                                variant="secondary"
                                className={rowStyle.clButtonClass}
                                onClick={() => setClSubmitTarget(p)}
                              >
                                CL提出 {p.ready_for_cl_submit}
                              </Button>
                            )}
                            {p.ready_for_fix > 0 && (
                              <Button
                                type="button"
                                variant="secondary"
                                className={rowStyle.fixButtonClass}
                                onClick={() => setFixTarget(p)}
                              >
                                FIX確定 {p.ready_for_fix}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && filteredSorted.length > 0 && (
          <div className="shrink-0 pt-2 border-t border-border">
            <Pagination>
              <PaginationContent className="flex-wrap gap-1">
                <PaginationItem>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    &lt;
                  </Button>
                </PaginationItem>
                {visiblePages.map((item, idx) =>
                  item === "gap" ? (
                    <PaginationItem key={`g-${idx}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item}>
                      <Button
                        type="button"
                        variant={item === currentPage ? "outline" : "ghost"}
                        size="sm"
                        className="min-w-9"
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </Button>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    &gt;
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {clSubmitTarget ? <CLSubmitDialog
          projectId={clSubmitTarget.project_id}
          projectName={clSubmitTarget.project_name}
          open
          onClose={() => setClSubmitTarget(null)}
          onSuccess={() => void refetch()}
        /> : null}
      {fixTarget ? <FixConfirmDialog
          projectId={fixTarget.project_id}
          projectName={fixTarget.project_name}
          open
          onClose={() => setFixTarget(null)}
          onSuccess={() => void refetch()}
        /> : null}
    </>
  );
}
