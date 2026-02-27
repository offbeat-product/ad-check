import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerate: (items: { name: string; description: string }[]) => Promise<void>;
}

export default function BulkPatternDialog({ open, onOpenChange, onGenerate }: Props) {
  const [scriptCount, setScriptCount] = useState(3);
  const [toneCount, setToneCount] = useState(2);
  const [saving, setSaving] = useState(false);

  const generated = useMemo(() => {
    const items: { name: string; description: string }[] = [];
    for (let s = 0; s < scriptCount; s++) {
      const letter = String.fromCharCode(65 + s); // A, B, C...
      for (let t = 0; t < toneCount; t++) {
        items.push({
          name: `${letter}${t + 1}`,
          description: `台本${letter} × トンマナ${t + 1}`,
        });
      }
    }
    return items;
  }, [scriptCount, toneCount]);

  const handleSubmit = async () => {
    setSaving(true);
    await onGenerate(generated);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>パターン一括生成</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>台本パターン数</Label>
              <Input type="number" min={1} max={10} value={scriptCount}
                onChange={(e) => setScriptCount(Math.max(1, Math.min(10, Number(e.target.value))))} />
            </div>
            <div className="space-y-2">
              <Label>トンマナパターン数</Label>
              <Input type="number" min={1} max={10} value={toneCount}
                onChange={(e) => setToneCount(Math.max(1, Math.min(10, Number(e.target.value))))} />
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">生成されるパターン:</p>
            <p className="text-sm font-medium">{generated.map(g => g.name).join(", ")}</p>
          </div>
          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? "生成中..." : `${generated.length}パターン生成`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
