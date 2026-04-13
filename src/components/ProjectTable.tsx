import { useMemo } from "react";
import { format, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { Project } from "@/lib/db-types";
import { PROJECT_STATUS_CONFIG } from "@/lib/process-config";
import { extractBracketProjectId, stripProjectListNamePrefix, effectiveProjectDeadline, isProjectActiveForCount } from "@/lib/project-display";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectProgress {
  total: number;
  done: number;
}

interface ProjectTableProps {
  projects: Project[];
  progressByProjectId: Record<string, ProjectProgress>;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
  onRowNavigate: (projectId: string) => void;
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

function getObPm(project: Project): string {
  const raw = project as Record<string, unknown>;
  const v = raw.ob_pm;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

export function ProjectTable({
  projects,
  progressByProjectId,
  hideCompleted,
  onHideCompletedChange,
  onRowNavigate,
}: ProjectTableProps) {
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
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-16">ID</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground min-w-[140px]">案件名</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap">ステータス</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap">納品日</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap w-36">進捗</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground whitespace-nowrap">担当</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const st = PROJECT_STATUS_CONFIG[p.status || "in_progress"] || PROJECT_STATUS_CONFIG.in_progress;
              const eff = effectiveProjectDeadline(p.deadline, p.overall_deadline);
              const idStr = extractBracketProjectId(p.name) || "—";
              const label = stripProjectListNamePrefix(p.name);
              const prog = progressByProjectId[p.id] || { total: 0, done: 0 };
              const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer border-b border-border/50"
                  onClick={() => onRowNavigate(p.id)}
                >
                  <TableCell className="text-xs font-mono text-muted-foreground">{idStr}</TableCell>
                  <TableCell className="text-xs font-medium max-w-[280px] truncate">{label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] h-5 shrink-0", st.badgeClass)}>
                      {st.label}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("text-xs whitespace-nowrap", deadlineClass(eff))}>
                    {eff ? format(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`), "yyyy/MM/dd") : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {prog.done}/{prog.total}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{getObPm(p)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
