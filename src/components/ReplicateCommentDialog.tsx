import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReplicateComment } from "@/hooks/useReplicateComment";
import { useReplicationTargets } from "@/hooks/useReplicationTargets";

export interface ReplicateCommentData {
  id: string;
  content: string;
  author_name: string;
  author_email: string;
  status: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  mentions?: string[] | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  comment: ReplicateCommentData | null;
  currentCheckResultId: string;
  productCode: string;
  processType: string;
}

export function ReplicateCommentDialog({
  open,
  onClose,
  comment,
  currentCheckResultId,
  productCode,
  processType,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: targets = [], isLoading } = useReplicationTargets({
    currentCheckResultId,
    productCode,
    processType,
    enabled: open,
  });
  const replicate = useReplicateComment();

  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  const toggleAll = () => {
    if (selectedIds.size === targets.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(targets.map((t) => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReplicate = async () => {
    if (!comment || selectedIds.size === 0) return;
    await replicate.mutateAsync({
      sourceComment: {
        content: comment.content,
        author_name: comment.author_name,
        author_email: comment.author_email,
        status: comment.status,
        attachment_url: comment.attachment_url,
        attachment_type: comment.attachment_type,
        attachment_name: comment.attachment_name,
        mentions: comment.mentions,
      },
      targetCheckResultIds: Array.from(selectedIds),
    });
    onClose();
  };

  if (!comment) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>📋 このコメントを他のファイルにも反映</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase">反映するコメント</p>
            <div className="mt-1 p-3 bg-muted/40 border border-border rounded text-sm whitespace-pre-wrap">
              {comment.content}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ※ タイムスタンプや画面位置情報は複製されません
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                複製先 (同じ商材・同じ工程・直近30日)
              </p>
              {targets.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {selectedIds.size === targets.length ? "全解除" : "全選択"}
                </button>
              )}
            </div>

            {isLoading && (
              <div className="text-center py-8 text-sm text-muted-foreground">読み込み中...</div>
            )}

            {!isLoading && targets.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                同じ工程の他のファイルが見つかりません
                <br />
                (直近30日・同じ商材・同じ工程で検索)
              </div>
            )}

            {!isLoading && targets.length > 0 && (
              <div className="border border-border rounded divide-y divide-border max-h-80 overflow-y-auto">
                {targets.map((target) => {
                  const checked = selectedIds.has(target.id);
                  return (
                    <label
                      key={target.id}
                      className="flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleOne(target.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{target.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {target.process_type}
                          {target.created_at && (
                            <> · {new Date(target.created_at).toLocaleDateString("ja-JP")}</>
                          )}
                          {target.overall_status && <> · {target.overall_status}</>}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={replicate.isPending}>
            キャンセル
          </Button>
          <Button onClick={handleReplicate} disabled={selectedIds.size === 0 || replicate.isPending}>
            {replicate.isPending ? "複製中..." : `${selectedIds.size}件に複製`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
