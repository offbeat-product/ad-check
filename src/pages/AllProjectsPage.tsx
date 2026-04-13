import { useMemo, useCallback, useEffect, type ElementType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfDay, addDays } from "date-fns";
import { ClipboardList, FolderKanban, Layers, Loader2, Search, AlertTriangle, CalendarDays, Eye, EyeOff } from "lucide-react";
import { useAllProjects, ALL_PROJECTS_QUERY_KEY, type EnrichedProjectRow } from "@/hooks/useAllProjects";
import { ProjectTable, type ProjectTableDirectoryEntry } from "@/components/ProjectTable";
import { effectiveProjectDeadline, isProjectActiveForCount } from "@/lib/project-display";
import {
  PROJECT_STATUS_CONFIG,
  canonicalProjectStatusForSelect,
  isProjectOpenForSummaryKpi,
  isProjectStatusCancelledLike,
  isProjectStatusCompletedLike,
} from "@/lib/process-config";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import type { Project } from "@/lib/db-types";

const PAGE_SIZE = 50;
const ALL_SENTINEL = "__all__";

function deadlineYmd(project: Project): string | null {
  const eff = effectiveProjectDeadline(project.deadline, project.overall_deadline);
  if (!eff) return null;
  try {
    return format(startOfDay(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`)), "yyyy-MM-dd");
  } catch {
    return null;
  }
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
    if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("gap");
    out.push(arr[i]);
  }
  return out;
}

export default function AllProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, error } = useAllProjects();

  const clientId = searchParams.get("client") ?? "";
  const productId = searchParams.get("product") ?? "";
  const statusKey = searchParams.get("status") ?? "";
  const assignee = searchParams.get("assignee") ?? "";
  const q = searchParams.get("q") ?? "";
  const hideCompleted = searchParams.get("hide_completed") !== "0";
  const pageRaw = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const setFilters = useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === "") n.delete(k);
            else n.set(k, v);
          });
          if (resetPage) n.delete("page");
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (p: number) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (p <= 1) n.delete("page");
          else n.set("page", String(p));
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(startOfDay(new Date()), 1), "yyyy-MM-dd");
  const weekEndStr = format(addDays(startOfDay(new Date()), 7), "yyyy-MM-dd");

  const summary = useMemo(() => {
    const totalCount = rows.length;
    const inProgressCount = rows.filter((r) => isProjectOpenForSummaryKpi(r.project.status)).length;
    const todayCount = rows.filter((r) => {
      const d = deadlineYmd(r.project);
      if (d !== todayStr) return false;
      return !isProjectStatusCompletedLike(r.project.status) && !isProjectStatusCancelledLike(r.project.status);
    }).length;
    const thisWeekCount = rows.filter((r) => {
      const d = deadlineYmd(r.project);
      if (!d) return false;
      if (d < tomorrowStr || d > weekEndStr) return false;
      return !isProjectStatusCompletedLike(r.project.status) && !isProjectStatusCancelledLike(r.project.status);
    }).length;
    return { totalCount, inProgressCount, todayCount, thisWeekCount };
  }, [rows, todayStr, tomorrowStr, weekEndStr]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.clientId) m.set(r.clientId, r.clientName);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [rows]);

  const productOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (!r.productId) return;
      if (clientId && r.clientId !== clientId) return;
      m.set(r.productId, r.productName);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [rows, clientId]);

  const assigneeOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (r.obPm) s.add(r.obPm);
    });
    return [...s].sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  useEffect(() => {
    if (!productId) return;
    const ok = rows.some((r) => r.productId === productId && (!clientId || r.clientId === clientId));
    if (!ok) setFilters({ product: undefined }, true);
  }, [rows, productId, clientId, setFilters]);

  const filtered = useMemo(() => {
    let list: EnrichedProjectRow[] = rows;
    const qv = q.trim().toLowerCase();
    if (qv) {
      list = list.filter((r) => {
        const blob = `${r.project.name} ${r.clientName} ${r.productName}`.toLowerCase();
        return blob.includes(qv);
      });
    }
    if (clientId) list = list.filter((r) => r.clientId === clientId);
    if (productId) list = list.filter((r) => r.productId === productId);
    if (statusKey) list = list.filter((r) => canonicalProjectStatusForSelect(r.project.status) === statusKey);
    if (assignee) list = list.filter((r) => (r.obPm || "") === assignee);
    if (hideCompleted) list = list.filter((r) => isProjectActiveForCount(r.project.status));
    return list;
  }, [rows, q, clientId, productId, statusKey, assignee, hideCompleted]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = effectiveProjectDeadline(a.project.deadline, a.project.overall_deadline);
      const db = effectiveProjectDeadline(b.project.deadline, b.project.overall_deadline);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(pageRaw, totalPages);

  useEffect(() => {
    if (pageRaw !== currentPage) {
      setPage(currentPage);
    }
  }, [pageRaw, currentPage, setPage]);

  const pageSlice = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  const pageProjects = useMemo(() => pageSlice.map((r) => r.project), [pageSlice]);

  const progressByProjectId = useMemo(() => {
    return Object.fromEntries(pageSlice.map((r) => [r.project.id, r.progress]));
  }, [pageSlice]);

  const directoryByProjectId = useMemo(() => {
    const out: Record<string, ProjectTableDirectoryEntry> = {};
    pageSlice.forEach((r) => {
      out[r.project.id] = {
        clientId: r.clientId,
        clientName: r.clientName,
        productId: r.productId,
        productName: r.productName,
      };
    });
    return out;
  }, [pageSlice]);

  const visiblePages = useMemo(() => getVisiblePages(currentPage, totalPages), [currentPage, totalPages]);

  const patchAllProjectsCache = useCallback(
    (projectId: string, patch: Partial<Project>) => {
      queryClient.setQueryData<EnrichedProjectRow[]>(ALL_PROJECTS_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        return prev.map((row) =>
          row.project.id === projectId ? { ...row, project: { ...row.project, ...patch } } : row
        );
      });
    },
    [queryClient]
  );

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "読み込みに失敗しました"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border px-4 md:px-6 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <h1 className="text-sm font-semibold truncate">全案件一覧</h1>
        </div>
        <NotificationBell />
      </header>

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            読み込み中...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryStat icon={Layers} label="全案件" value={summary.totalCount} iconTone="text-primary" />
              <SummaryStat icon={FolderKanban} label="進行中" value={summary.inProgressCount} iconTone="text-primary" />
              <SummaryStat icon={AlertTriangle} label="本日締切" value={summary.todayCount} iconTone="text-destructive" />
              <SummaryStat icon={CalendarDays} label="今週締切" value={summary.thisWeekCount} iconTone="text-status-warning" />
            </div>

            <div className="glass-card p-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                <div className="flex-1 min-w-[200px] max-w-md">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">検索</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <Input
                      className="pl-8 h-9 text-xs"
                      placeholder="案件名・クライアント・商材"
                      value={q}
                      onChange={(e) => setFilters({ q: e.target.value || undefined }, true)}
                    />
                  </div>
                </div>
                <div className="w-full sm:w-[200px]">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">クライアント</Label>
                  <Select
                    value={clientId || ALL_SENTINEL}
                    onValueChange={(v) => {
                      if (v === ALL_SENTINEL) setFilters({ client: undefined, product: undefined }, true);
                      else setFilters({ client: v, product: undefined }, true);
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
                    onValueChange={(v) => setFilters({ product: v === ALL_SENTINEL ? undefined : v }, true)}
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
                  <Select
                    value={statusKey || ALL_SENTINEL}
                    onValueChange={(v) => setFilters({ status: v === ALL_SENTINEL ? undefined : v }, true)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="すべて" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SENTINEL} className="text-xs">
                        すべて
                      </SelectItem>
                      {Object.keys(PROJECT_STATUS_CONFIG).map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {PROJECT_STATUS_CONFIG[key]?.label ?? key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-[200px]">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">担当 (PM)</Label>
                  <Select
                    value={assignee || ALL_SENTINEL}
                    onValueChange={(v) => setFilters({ assignee: v === ALL_SENTINEL ? undefined : v }, true)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="すべて" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SENTINEL} className="text-xs">
                        すべて
                      </SelectItem>
                      {assigneeOptions.map((name) => (
                        <SelectItem key={name} value={name} className="text-xs">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <Checkbox
                    id="hide-completed"
                    checked={hideCompleted}
                    onCheckedChange={(c) => setFilters({ hide_completed: c === true ? undefined : "0" }, true)}
                  />
                  <Label htmlFor="hide-completed" className="text-xs font-normal cursor-pointer flex items-center gap-1.5">
                    {hideCompleted ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                    完了済みを非表示
                  </Label>
                </div>
              </div>
            </div>

            <ProjectTable
              projects={pageProjects}
              progressByProjectId={progressByProjectId}
              hideCompleted={false}
              onHideCompletedChange={() => {}}
              onRowNavigate={(projectId) => navigate(`/project/${projectId}`)}
              onProjectUpdated={patchAllProjectsCache}
              showClientColumn
              showProductColumn
              directoryByProjectId={directoryByProjectId}
              showHideCompletedToggle={false}
            />

            {totalPages > 1 && (
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
