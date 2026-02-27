import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import type { Pattern } from "@/hooks/usePatterns";
import type { ProjectProcess } from "@/hooks/useProjectProcesses";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";

// Commonly shared processes (shown in a separate section above the matrix)
const COMMON_PROCESS_KEYS = new Set(["na_script", "bgm", "narration"]);

interface Props {
  projectId: string;
  patterns: Pattern[];
  processes: ProjectProcess[];
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>;
  onUpload: (processKey: string, patternId: string | null) => void;
}

function getCellStatus(file: ProjectFile | undefined, checkResults: Props["checkResults"]): {
  label: string;
  colorClass: string;
} {
  if (!file) return { label: "未着手", colorClass: "bg-muted/50 text-muted-foreground/60" };
  const status = file.status || "uploaded";
  if (status === "fixed") return { label: "✅ FIX", colorClass: "bg-status-ok/15 text-status-ok border border-status-ok/30" };
  if (status === "checking") return { label: "チェック中", colorClass: "bg-primary/10 text-primary animate-pulse" };
  if (status === "checked" && file.check_result_id) {
    const cr = checkResults[file.check_result_id];
    if (cr) {
      const isNg = (cr.ng_count ?? 0) > 0;
      if (isNg) return { label: "NG", colorClass: "bg-status-ng/15 text-status-ng border border-status-ng/30" };
      return { label: "チェック済", colorClass: "bg-status-warning/15 text-status-warning" };
    }
  }
  if (status === "uploaded") return { label: "未チェック", colorClass: "bg-primary/10 text-primary" };
  const cfg = FILE_STATUS_CONFIG[status];
  return { label: cfg?.label || status, colorClass: cfg?.class || "bg-muted" };
}

export default function PatternMatrix({ projectId, patterns, processes, files, checkResults, onUpload }: Props) {
  const navigate = useNavigate();

  // Split processes into common and pattern-specific
  const activeProcesses = processes.filter(p => p.is_active);
  const commonProcesses = activeProcesses.filter(p => COMMON_PROCESS_KEYS.has(p.process_key));
  const patternProcesses = activeProcesses.filter(p => !COMMON_PROCESS_KEYS.has(p.process_key));

  // Common files (pattern_id is null)
  const commonFiles = useMemo(() =>
    files.filter(f => !f.pattern_id && COMMON_PROCESS_KEYS.has(f.process_type)),
    [files]
  );

  // Build a lookup: pattern_id -> process_type -> latest file
  const matrixData = useMemo(() => {
    const map = new Map<string, Map<string, ProjectFile>>();
    // Init patterns
    for (const p of patterns) {
      map.set(p.id, new Map());
    }
    // Fill with files that have pattern_id
    const patternFiles = files
      .filter(f => f.pattern_id && !COMMON_PROCESS_KEYS.has(f.process_type))
      .sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());

    for (const f of patternFiles) {
      const patMap = map.get(f.pattern_id!);
      if (patMap && !patMap.has(f.process_type)) {
        patMap.set(f.process_type, f);
      }
    }
    return map;
  }, [patterns, files]);

  return (
    <div className="space-y-4">
      {/* Common materials section */}
      {commonProcesses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">■ 共通素材</h3>
          <div className="flex flex-wrap gap-2">
            {commonProcesses.map(proc => {
              const f = commonFiles.find(cf => cf.process_type === proc.process_key);
              const cell = getCellStatus(f, checkResults);
              return (
                <button
                  key={proc.id}
                  onClick={() => f ? navigate(`/project/${projectId}/file/${f.id}`) : onUpload(proc.process_key, null)}
                  className={cn(
                    "glass-card px-3 py-2 text-left transition-colors hover:border-primary/30 min-w-[120px]",
                  )}
                >
                  <p className="text-xs font-medium mb-1">{proc.process_label}</p>
                  <Badge variant="outline" className={cn("text-[10px]", cell.colorClass)}>{cell.label}</Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pattern matrix */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">■ パターン別進捗</h3>
        <ScrollArea className="w-full">
          <div className="min-w-[600px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-20 sticky left-0 bg-background z-10">パターン</th>
                  {patternProcesses.map(proc => (
                    <th key={proc.id} className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[80px]">
                      {proc.process_label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patterns.map(pattern => {
                  const patMap = matrixData.get(pattern.id);
                  return (
                    <tr key={pattern.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-2 font-medium sticky left-0 bg-background z-10">
                        <div>
                          <span>{pattern.name}</span>
                          {pattern.description && (
                            <span className="block text-[10px] text-muted-foreground truncate max-w-[100px]">{pattern.description}</span>
                          )}
                        </div>
                      </td>
                      {patternProcesses.map(proc => {
                        const f = patMap?.get(proc.process_key);
                        const cell = getCellStatus(f, checkResults);
                        return (
                          <td key={proc.id} className="px-1 py-1 text-center">
                            <button
                              onClick={() => f ? navigate(`/project/${projectId}/file/${f.id}`) : onUpload(proc.process_key, pattern.id)}
                              className={cn(
                                "w-full rounded-md px-2 py-1.5 transition-colors text-[10px] font-medium",
                                f ? cell.colorClass : "bg-muted/30 text-muted-foreground/40 hover:bg-muted/60",
                              )}
                            >
                              {f ? cell.label : (
                                <Plus className="h-3 w-3 mx-auto opacity-40" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
