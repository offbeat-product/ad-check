import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize } from "@/lib/file-validation";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type ProjectFileUpdate = Database["public"]["Tables"]["project_files"]["Update"];

interface FixConfirmDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EligibleFile {
  id: string;
  file_name: string;
  process_type: string;
  file_size_bytes: number | null;
}

export function FixConfirmDialog({ projectId, projectName, open, onClose, onSuccess }: FixConfirmDialogProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<EligibleFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("project_files")
        .select("id, file_name, process_type, file_size_bytes")
        .eq("project_id", projectId)
        .eq("status", "client_review")
        .is("parent_file_id", null)
        .order("process_type", { ascending: true })
        .order("file_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: "取得エラー", description: error.message, variant: "destructive" });
        setFiles([]);
        setSelectedIds(new Set());
        setLoading(false);
        return;
      }
      const list = (data ?? []) as EligibleFile[];
      setFiles(list);
      setSelectedIds(new Set(list.map((f) => f.id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, toast]);

  const toggleAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    const ids = Array.from(selectedIds);
    const now = new Date().toISOString();
    const fixBy = user?.email ?? user?.id ?? null;
    const patch: ProjectFileUpdate = { status: "fixed", fixed_at: now, fixed_by: fixBy };
    const { error } = await supabase.from("project_files").update(patch).in("id", ids);
    setSubmitting(false);
    if (error) {
      toast({ title: "FIX確定に失敗しました", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${ids.length}件を FIX 確定しました` });
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>FIX確定</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            案件「{projectName}」の以下のファイルを FIX 確定します。対象を選択してください。
          </p>
          {loading ? (
            <div className="text-sm text-muted-foreground">読み込み中...</div>
          ) : files.length === 0 ? (
            <div className="text-sm text-muted-foreground">対象ファイルがありません</div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">
                  {files.length}件中 {selectedIds.size}件選択
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedIds.size === files.length ? "全選択解除" : "全選択"}
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent cursor-pointer"
                    role="presentation"
                    onClick={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        return next;
                      });
                    }}
                  >
                    <Checkbox
                      checked={selectedIds.has(f.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(f.id);
                          else next.delete(f.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <a
                      href={`/project/${projectId}/file/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-sm hover:underline truncate min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {f.file_name}
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0">{f.process_type}</span>
                    <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                      {f.file_size_bytes != null ? formatFileSize(f.file_size_bytes) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={selectedIds.size === 0 || submitting}>
            {submitting ? "処理中..." : `${selectedIds.size}件を FIX 確定 →`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
