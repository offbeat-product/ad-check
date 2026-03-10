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
import { Plus, MoreHorizontal, Pencil, Trash2, ArrowRightLeft } from "lucide-react";

interface Props {
  projectId: string;
  patterns: Pattern[];
  processes: ProjectProcess[];
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>;
  onUpload: (processKey: string, patternId: string | null) => void;
  onUpdatePattern?: (id: string, updates: Partial<Pick<Pattern, "name" | "description">>) => Promise<void>;
  onDeletePattern?: (id: string) => Promise<void>;
  onToggleProcessCommon?: (processId: string, isCommon: boolean) => Promise<boolean>;
  onChangeFilePattern?: (fileId: string, newPatternId: string | null) => Promise<void>;
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

export default function PatternMatrix({ projectId, patterns, processes, files, checkResults, onUpload, onUpdatePattern, onDeletePattern, onToggleProcessCommon, onChangeFilePattern }: Props) {
  const navigate = useNavigate();
  const [editPattern, setEditPattern] = useState<Pattern | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletePatternTarget, setDeletePatternTarget] = useState<Pattern | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Split processes into common and pattern-specific using DB flag
  const activeProcesses = processes.filter(p => p.is_active);
  const commonProcessKeys = useMemo(() => new Set(activeProcesses.filter(p => p.is_common).map(p => p.process_key)), [activeProcesses]);
  const commonProcesses = activeProcesses.filter(p => p.is_common);
  const patternProcesses = activeProcesses.filter(p => !p.is_common);

  // Common files (pattern_id is null)
  const commonFiles = useMemo(() =>
    files.filter(f => !f.pattern_id && commonProcessKeys.has(f.process_type)),
    [files, commonProcessKeys]
  );

  // Build a lookup: pattern_id -> process_type -> latest file
  const { matrixData, fileCounts } = useMemo(() => {
    const map = new Map<string, Map<string, ProjectFile>>();
    const counts = new Map<string, Map<string, number>>();
    for (const p of patterns) {
      map.set(p.id, new Map());
      counts.set(p.id, new Map());
    }
    const patternFiles = files
      .filter(f => f.pattern_id && !commonProcessKeys.has(f.process_type))
      .sort((a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime());

    for (const f of patternFiles) {
      const patMap = map.get(f.pattern_id!);
      const cntMap = counts.get(f.pattern_id!);
      if (patMap && !patMap.has(f.process_type)) {
        patMap.set(f.process_type, f);
      }
      if (cntMap) {
        cntMap.set(f.process_type, (cntMap.get(f.process_type) || 0) + 1);
      }
    }
    return { matrixData: map, fileCounts: counts };
  }, [patterns, files, commonProcessKeys]);

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
                <div key={proc.id} className="glass-card px-3 py-2 text-left min-w-[120px] relative group">
                  <button
                    onClick={() => f ? navigate(`/project/${projectId}/file/${f.id}`) : onUpload(proc.process_key, null)}
                    className="w-full text-left"
                  >
                    <p className="text-xs font-medium mb-1">{proc.process_label}</p>
                    <Badge variant="outline" className={cn("text-[10px]", cell.colorClass)}>{cell.label}</Badge>
                  </button>
                  {onToggleProcessCommon && (
                    <button
                      onClick={() => onToggleProcessCommon(proc.id, false)}
                      title="パターン別に移動"
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                    </button>
                  )}
                </div>
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
                    <th key={proc.id} className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[80px] group/th">
                      <div className="flex items-center justify-center gap-0.5">
                        <span>{proc.process_label}</span>
                        {onToggleProcessCommon && (
                          <button
                            onClick={() => onToggleProcessCommon(proc.id, true)}
                            title="共通素材に移動"
                            className="opacity-0 group-hover/th:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        )}
                      </div>
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
                        const count = fileCounts.get(pattern.id)?.get(proc.process_key) || 0;
                        return (
                          <td key={proc.id} className="px-1 py-1 text-center"
                            onDragOver={(e) => { e.preventDefault(); setDragOverCell(`${pattern.id}-${proc.process_key}`); }}
                            onDragLeave={() => setDragOverCell(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverCell(null);
                              const fileId = e.dataTransfer.getData("text/file-id");
                              if (fileId && onChangeFilePattern) {
                                onChangeFilePattern(fileId, pattern.id);
                              }
                            }}
                          >
                            <button
                              draggable={!!f && !!onChangeFilePattern}
                              onDragStart={(e) => {
                                if (f) {
                                  e.dataTransfer.setData("text/file-id", f.id);
                                  e.dataTransfer.effectAllowed = "move";
                                }
                              }}
                              onClick={() => f ? navigate(`/project/${projectId}/file/${f.id}`) : onUpload(proc.process_key, pattern.id)}
                              className={cn(
                                "w-full rounded-md px-2 py-1.5 transition-colors text-[10px] font-medium relative",
                                f ? cell.colorClass : "bg-muted/30 text-muted-foreground/40 hover:bg-muted/60",
                                dragOverCell === `${pattern.id}-${proc.process_key}` && "ring-2 ring-primary bg-primary/10",
                                f && onChangeFilePattern && "cursor-grab active:cursor-grabbing",
                              )}
                            >
                              {f ? cell.label : (
                                <Plus className="h-3 w-3 mx-auto opacity-40" />
                              )}
                              {count > 1 && (
                                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                  {count}
                                </span>
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
