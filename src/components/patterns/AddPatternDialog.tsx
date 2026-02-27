import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (name: string, description?: string) => Promise<void>;
}

export default function AddPatternDialog({ open, onOpenChange, onAdd }: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onAdd(name.trim(), desc.trim() || undefined);
    setSaving(false);
    setName("");
    setDesc("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>パターン追加</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>パターン名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: A1" />
          </div>
          <div className="space-y-2">
            <Label>説明（任意）</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="例: 台本A × トンマナ1" className="min-h-[60px]" />
          </div>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving} className="w-full">
            {saving ? "追加中..." : "追加"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
