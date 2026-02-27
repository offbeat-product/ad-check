import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import type { Pattern } from "@/hooks/usePatterns";
import type { ProjectProcess } from "@/hooks/useProjectProcesses";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

// Commonly shared processes (shown in a separate section above the matrix)
const COMMON_PROCESS_KEYS = new Set(["na_script", "bgm", "narration"]);

interface Props {
  projectId: string;
  patterns: Pattern[];
  processes: ProjectProcess[];
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>;
  onUpload: (processKey: string, patternId: string | null) => void;
  onUpdatePattern?: (id: string, updates: Partial<Pick<Pattern, "name" | "description">>) => Promise<void>;
  onDeletePattern?: (id: string) => Promise<void>;
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

export default function PatternMatrix({ projectId, patterns, processes, files, checkResults, onUpload, onUpdatePattern, onDeletePattern }: Props) {
  const navigate = useNavigate();
  const [editPattern, setEditPattern] = useState<Pattern | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletePatternTarget, setDeletePatternTarget] = useState<Pattern | null>(null);

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
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground w-28 sticky left-0 bg-background z-10">パターン</th>
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
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <span>{pattern.name}</span>
                            {pattern.description && (
                              <span className="block text-[10px] text-muted-foreground truncate max-w-[100px]">{pattern.description}</span>
                            )}
                          </div>
                          {(onUpdatePattern || onDeletePattern) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="shrink-0 p-0.5 rounded hover:bg-muted/60 text-muted-foreground">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-32">
                                {onUpdatePattern && (
                                  <DropdownMenuItem onClick={() => {
                                    setEditPattern(pattern);
                                    setEditName(pattern.name);
                                    setEditDesc(pattern.description || "");
                                  }}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" />編集
                                  </DropdownMenuItem>
                                )}
                                {onDeletePattern && (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletePatternTarget(pattern)}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />削除
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      {/* Edit pattern dialog */}
      <Dialog open={!!editPattern} onOpenChange={(o) => { if (!o) setEditPattern(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>パターン編集</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>パターン名 *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>説明（任意）</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="min-h-[60px]" />
            </div>
            <Button
              onClick={async () => {
                if (!editPattern || !editName.trim() || !onUpdatePattern) return;
                setEditSaving(true);
                await onUpdatePattern(editPattern.id, { name: editName.trim(), description: editDesc.trim() || null });
                setEditSaving(false);
                setEditPattern(null);
              }}
              disabled={!editName.trim() || editSaving}
              className="w-full"
            >
              {editSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete pattern confirm */}
      <AlertDialog open={!!deletePatternTarget} onOpenChange={(o) => { if (!o) setDeletePatternTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>パターンを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deletePatternTarget?.name}」を削除します。このパターンに紐づくファイルは共通素材に変更されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletePatternTarget && onDeletePattern) {
                  await onDeletePattern(deletePatternTarget.id);
                }
                setDeletePatternTarget(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
