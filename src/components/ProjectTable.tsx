import { useMemo, useState, useCallback } from "react";
import { format, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/db-types";
import { PROJECT_STATUS_CONFIG } from "@/lib/process-config";
import { effectiveProjectDeadline, isProjectActiveForCount } from "@/lib/project-display";
import { PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectProgress {
  total: number;
  done: number;
}

const STATUS_OPTIONS = [
  "preparing",
  "in_progress",
  "revision",
  "internal_revision",
  "client_review",
  "completed",
  "on_hold",
  "cancelled",
] as const;

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

function statusCfgFor(status: string | null) {
  const s = status === "active" ? "in_progress" : status;
  return PROJECT_STATUS_CONFIG[s || "in_progress"] || PROJECT_STATUS_CONFIG.in_progress;
}

interface ProjectTableProps {
  projects: Project[];
  progressByProjectId: Record<string, ProjectProgress>;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
  onRowNavigate: (projectId: string) => void;
  onProjectUpdated?: (projectId: string, patch: Partial<Project>) => void;
}

export function ProjectTable({
  projects,
  progressByProjectId,
  hideCompleted,
  onHideCompletedChange,
  onRowNavigate,
  onProjectUpdated,
}: ProjectTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deadlineOpenId, setDeadlineOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = hideCompleted ? projects.filter((p) => isProjectActiveForCount(p.status)) : [...projects];
    return list.sort((a, b) => {
      const da = effectiveProjectDeadline(a.deadline, a.overall_deadline);
      const db = effectiveProjectDeadline(b.deadline, b.overall_deadline);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [projects, hideCompleted]);

  const patchProject = useCallback(
    (projectId: string, patch: Partial<Project>) => {
      onProjectUpdated?.(projectId, patch);
    },
    [onProjectUpdated]
  );

  const invalidateTrees = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["upcoming-deadlines"] });
  }, [queryClient]);

  const handleStatusChange = useCallback(
    async (project: Project, newStatus: string) => {
      const prev = project.status;
      patchProject(project.id, { status: newStatus });
      const { error } = await supabase
        .from("projects")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (error) {
        patchProject(project.id, { status: prev ?? null });
        toast({ title: "ステータスの更新に失敗しました", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "ステータスを更新しました" });
      invalidateTrees();
    },
    [patchProject, toast, invalidateTrees]
  );

  const handleDeadlineChange = useCallback(
    async (project: Project, newDate: Date | undefined) => {
      if (!newDate) return;
      const prevDeadline = project.deadline;
      const ymd = format(newDate, "yyyy-MM-dd");
      patchProject(project.id, { deadline: ymd });
      setDeadlineOpenId(null);
      const { error } = await supabase
        .from("projects")
        .update({ deadline: ymd, updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (error) {
        patchProject(project.id, { deadline: prevDeadline });
        toast({ title: "納品日の更新に失敗しました", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "納品日を更新しました" });
      invalidateTrees();
    },
    [patchProject, toast, invalidateTrees]
  );

  if (sorted.length === 0) {
    const emptyMsg =
      projects.length > 0 && hideCompleted
        ? "表示できる進行中の案件がありません。完了済みを表示するにはトグルを切り替えてください。"
        : "案件はまだありません";
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onHideCompletedChange(!hideCompleted)}
            className={cn(
              "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-colors",
              hideCompleted ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {hideCompleted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {hideCompleted ? "完了済みを非表示中" : "完了済みも表示中"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground text-center py-12">{emptyMsg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onHideCompletedChange(!hideCompleted)}
          className={cn(
            "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-colors",
            hideCompleted ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          {hideCompleted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {hideCompleted ? "完了済みを非表示中" : "完了済みも表示中"}
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="text-xs font-medium text-muted-foreground min-w-[200px]">案件名</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-[130px]">ステータス</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-[100px]">納品日</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-36">進捗</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const rawStatus = p.status === "active" ? "in_progress" : (p.status || "in_progress");
              const statusValue = (STATUS_OPTIONS as readonly string[]).includes(rawStatus) ? rawStatus : "in_progress";
              const eff = effectiveProjectDeadline(p.deadline, p.overall_deadline);
              const prog = progressByProjectId[p.id] || { total: 0, done: 0 };
              const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
              const dateLabel = eff
                ? format(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`), "M/d")
                : "—";
              const calSelected = eff ? parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`) : undefined;

              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer border-b border-border/50"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-interactive]")) return;
                    onRowNavigate(p.id);
                  }}
                >
                  <TableCell className="text-xs font-medium max-w-[min(480px,40vw)]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate">{p.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md break-all">
                        {p.name}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell data-interactive onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={statusValue}
                      onValueChange={(v) => void handleStatusChange(p, v)}
                    >
                      <SelectTrigger className="h-7 text-[10px] px-2 w-[124px]" data-interactive>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {statusCfgFor(key).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell data-interactive className={cn("text-xs whitespace-nowrap", deadlineClass(eff))} onClick={(e) => e.stopPropagation()}>
                    <Popover open={deadlineOpenId === p.id} onOpenChange={(o) => setDeadlineOpenId(o ? p.id : null)}>
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
                          onSelect={(d) => void handleDeadlineChange(p, d)}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {prog.done}/{prog.total}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
