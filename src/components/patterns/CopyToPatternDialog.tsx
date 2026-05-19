import { useState } from "react";
import type { Pattern } from "@/hooks/usePatterns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pattern the file was just uploaded to */
  sourcePattern: Pattern;
  /** All available patterns (source excluded automatically) */
  allPatterns: Pattern[];
  processLabel: string;
  onConfirm: (targetPatternIds: string[]) => Promise<void>;
}

export default function CopyToPatternDialog({
  open, onOpenChange, sourcePattern, allPatterns, processLabel, onConfirm,
}: Props) {
  const otherPatterns = allPatterns.filter(p => p.id !== sourcePattern.id);
  const [selected, setSelected] = useState<Set<string>>(new Set(otherPatterns.map(p => p.id)));
  const [copying, setCopying] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === otherPatterns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(otherPatterns.map(p => p.id)));
    }
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setCopying(true);
    await onConfirm(Array.from(selected));
    setCopying(false);
    onOpenChange(false);
  };

  if (otherPatterns.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Copy className="h-4 w-4" />
            他パターンにも反映
          </DialogTitle>
          <DialogDescription className="text-xs">
            「{sourcePattern.name}」の{processLabel}を他のパターンにもコピーします。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">反映先を選択</Label>
            <button
              onClick={toggleAll}
              className="text-[10px] text-primary hover:underline"
            >
              {selected.size === otherPatterns.length ? "すべて解除" : "すべて選択"}
            </button>
          </div>

          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {otherPatterns.map(p => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selected.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                />
                <div className="min-w-0">
                  <span className="text-sm">{p.name}</span>
                  {p.description ? <span className="block text-[10px] text-muted-foreground truncate">{p.description}</span> : null}
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onOpenChange(false)}
              disabled={copying}
            >
              スキップ
            </Button>
            <Button
              className="flex-1 text-xs"
              onClick={handleConfirm}
              disabled={selected.size === 0 || copying}
            >
              {copying ? "コピー中..." : `${selected.size}件に反映`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
