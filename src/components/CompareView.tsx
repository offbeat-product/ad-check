import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FileVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Plus } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";

interface CompareViewProps {
  checkResultId: string;
  processType: string;
  originalText?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CompareView({ checkResultId, processType, originalText, open, onOpenChange }: CompareViewProps) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [leftVersion, setLeftVersion] = useState(1);
  const [rightVersion, setRightVersion] = useState(2);
  const [showUpload, setShowUpload] = useState(false);
  const [newText, setNewText] = useState("");
  const isImage = processType === "sf";

  const fetchVersions = async () => {
    const { data } = await supabase
      .from("file_versions")
      .select("*")
      .eq("check_result_id", checkResultId)
      .order("version_number", { ascending: true });
    const vList = (data as any as FileVersion[]) || [];

    // Auto-create v1 if none exists
    if (vList.length === 0 && originalText) {
      await supabase.from("file_versions").insert({
        check_result_id: checkResultId,
        version_number: 1,
        file_type: isImage ? "image" : "text",
        content_text: isImage ? null : originalText,
      } as any);
      fetchVersions();
      return;
    }
    setVersions(vList);
    if (vList.length >= 2) {
      setLeftVersion(1);
      setRightVersion(vList[vList.length - 1].version_number);
    }
  };

  useEffect(() => {
    if (open) fetchVersions();
  }, [open, checkResultId]);

  const getVersion = (num: number) => versions.find((v) => v.version_number === num);

  const handleUploadNewVersion = async () => {
    const nextNum = versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) + 1 : 2;
    if (isImage) {
      // Image upload handled separately
      return;
    }
    if (!newText.trim()) return;
    await supabase.from("file_versions").insert({
      check_result_id: checkResultId,
      version_number: nextNum,
      file_type: "text",
      content_text: newText,
    } as any);
    setNewText("");
    setShowUpload(false);
    fetchVersions();
    toast({ title: `v${nextNum} を保存しました` });
  };

  const handleImageUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const nextNum = versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) + 1 : 2;
      await supabase.from("file_versions").insert({
        check_result_id: checkResultId,
        version_number: nextNum,
        file_type: "image",
        image_url: `data:${compressed.mediaType};base64,${compressed.base64}`,
      } as any);
      setShowUpload(false);
      fetchVersions();
      toast({ title: `v${nextNum} を保存しました` });
    } catch {
      toast({ title: "エラー", description: "画像の処理に失敗しました", variant: "destructive" });
    }
  };

  const leftData = getVersion(leftVersion);
  const rightData = getVersion(rightVersion);

  // Simple diff for text
  const renderDiff = (original: string, revised: string) => {
    const origLines = original.split("\n");
    const revLines = revised.split("\n");
    const maxLen = Math.max(origLines.length, revLines.length);
    const rows = [];
    for (let i = 0; i < maxLen; i++) {
      const l = origLines[i] || "";
      const r = revLines[i] || "";
      const changed = l !== r;
      rows.push(
        <div key={i} className="flex border-b border-border/50">
          <div className={`flex-1 px-3 py-1 text-sm font-mono ${changed && l ? "bg-destructive/10" : ""}`}>
            {l || <span className="text-muted-foreground/30">—</span>}
          </div>
          <div className="w-px bg-border" />
          <div className={`flex-1 px-3 py-1 text-sm font-mono ${changed && r ? "bg-status-ok/10" : ""}`}>
            {r || <span className="text-muted-foreground/30">—</span>}
          </div>
        </div>
      );
    }
    return rows;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>修正前/後を比較</DialogTitle>
        </DialogHeader>

        {/* Version selectors */}
        <div className="flex items-center gap-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">左:</span>
            <Select value={String(leftVersion)} onValueChange={(v) => setLeftVersion(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version_number} value={String(v.version_number)}>v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">右:</span>
            <Select value={String(rightVersion)} onValueChange={(v) => setRightVersion(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version_number} value={String(v.version_number)}>v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => setShowUpload(!showUpload)} className="text-xs">
              <Plus className="h-3 w-3 mr-1" />
              新しいバージョン
            </Button>
          </div>
        </div>

        {/* Upload new version */}
        {showUpload && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            {isImage ? (
              <div>
                <label className="block text-sm font-medium mb-2">修正後の画像をアップロード</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                  className="text-sm"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium">修正後のテキスト</label>
                <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} className="min-h-[120px] text-sm font-mono" />
                <Button size="sm" onClick={handleUploadNewVersion}>保存</Button>
              </div>
            )}
          </div>
        )}

        {/* Compare area */}
        <div className="flex-1 overflow-auto">
          {versions.length < 1 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">バージョンがまだありません</p>
              <p className="text-xs mt-1">新しいバージョンをアップロードしてください</p>
            </div>
          ) : versions.length < 2 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">比較するには2つ以上のバージョンが必要です</p>
              <Button size="sm" variant="outline" onClick={() => setShowUpload(true)} className="mt-3">
                <Plus className="h-3 w-3 mr-1" />
                修正版をアップロード
              </Button>
            </div>
          ) : isImage ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">修正前 (v{leftVersion})</div>
                {leftData?.image_url ? (
                  <img src={leftData.image_url} alt="v1" className="w-full rounded-lg border border-border" />
                ) : (
                  <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">画像なし</div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">修正後 (v{rightVersion})</div>
                {rightData?.image_url ? (
                  <img src={rightData.image_url} alt="v2" className="w-full rounded-lg border border-border" />
                ) : (
                  <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">画像なし</div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex border-b border-border">
                <div className="flex-1 px-3 py-2 text-xs font-semibold text-muted-foreground">修正前 (v{leftVersion})</div>
                <div className="w-px bg-border" />
                <div className="flex-1 px-3 py-2 text-xs font-semibold text-muted-foreground">修正後 (v{rightVersion})</div>
              </div>
              <div className="border border-border rounded-b-lg overflow-hidden">
                {renderDiff(leftData?.content_text || "", rightData?.content_text || "")}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
