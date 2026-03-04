import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings, GripVertical, Trash2, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ProjectProcess } from "@/hooks/useProjectProcesses";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processes: ProjectProcess[];
  onUpdate: (id: string, updates: Partial<ProjectProcess>) => Promise<boolean>;
  onReorder: (reordered: ProjectProcess[]) => void;
  onAdd: (label: string) => void;
  onDelete: (id: string) => void;
  onReset: () => void;
}

export default function ProcessManagementModal({ open, onOpenChange, processes, onUpdate, onReorder, onAdd, onDelete, onReset }: Props) {
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOver.current = index;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...processes];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    onReorder(reordered);
    dragItem.current = null;
    dragOver.current = null;
    setDragOverIndex(null);
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAdd(newLabel.trim());
    setNewLabel("");
    toast({ title: "工程を追加しました" });
  };

  const handleReset = () => {
    if (!confirm("現在の工程設定がリセットされます。よろしいですか？")) return;
    onReset();
    toast({ title: "デフォルトに戻しました" });
  };

  const handleDelete = (id: string) => {
    if (!confirm("この工程を削除しますか？")) return;
    onDelete(id);
  };

  const startEdit = (p: ProjectProcess) => {
    setEditingId(p.id);
    setEditLabel(p.process_label);
  };

  const finishEdit = async (p: ProjectProcess) => {
    if (editLabel.trim() && editLabel.trim() !== p.process_label) {
      await onUpdate(p.id, { process_label: editLabel.trim() });
    }
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />工程管理
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          この案件の工程を管理します。ドラッグで並び替え、トグルでON/OFF、＋で追加できます。
        </p>

        <div className="space-y-1 mt-2">
          {processes.map((p, index) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                dragOverIndex === index ? "border-primary bg-primary/5" : "border-border",
                !p.is_active && "opacity-50"
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
              <Switch
                checked={p.is_active}
                onCheckedChange={(v) => onUpdate(p.id, { is_active: v })}
                className="shrink-0"
              />
              <span className="text-xs text-muted-foreground w-5 shrink-0">
                {String.fromCodePoint(0x2460 + index)}
              </span>
              {editingId === p.id ? (
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => finishEdit(p)}
                  onKeyDown={(e) => e.key === "Enter" && finishEdit(p)}
                  className="h-7 text-xs flex-1"
                  autoFocus
                />
              ) : (
                <span
                  className="text-sm flex-1 cursor-pointer truncate"
                  onDoubleClick={() => startEdit(p)}
                >
                  {p.process_label}
                </span>
              )}
              <div className="flex flex-col gap-0.5 shrink-0 text-[10px] text-muted-foreground text-right">
                {p.client_deadline && <span>期限: {new Date(p.client_deadline).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })}</span>}
                {!p.client_deadline && !p.is_active && <span>(無効)</span>}
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleDelete(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="カスタム工程名"
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={!newLabel.trim()} className="text-xs shrink-0">
            <Plus className="h-3 w-3 mr-1" />追加
          </Button>
        </div>

        <div className="flex justify-between mt-4 pt-3 border-t border-border">
          <Button size="sm" variant="ghost" onClick={handleReset} className="text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3 mr-1" />デフォルトに戻す
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
