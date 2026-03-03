import { useState, useEffect } from "react";
import type { ProjectFile } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface VersionItem {
  version_number: number;
  content_text?: string | null;
  image_url?: string | null;
  file_type: string;
}

interface CompareViewProps {
  projectFileId?: string;
  projectFiles?: ProjectFile[];
  processType: string;
  originalText?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CompareView({ projectFileId, projectFiles, processType, originalText, open, onOpenChange }: CompareViewProps) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [leftVersion, setLeftVersion] = useState(1);
  const [rightVersion, setRightVersion] = useState(2);
  const isImage = processType === "sf" || processType === "styleframe";

  const fetchVersions = () => {
    if (!projectFileId || !projectFiles || projectFiles.length === 0) return;
    const vList: VersionItem[] = projectFiles.map((pf) => ({
      version_number: pf.version_number ?? 1,
      content_text: pf.file_type === "text" ? pf.file_data : null,
      image_url: pf.file_type === "image" ? pf.file_data : null,
      file_type: pf.file_type,
    }));
    setVersions(vList);
    if (vList.length >= 2) {
      setLeftVersion(1);
      setRightVersion(vList[vList.length - 1].version_number);
    }
  };

  useEffect(() => {
    if (open) fetchVersions();
  }, [open, projectFileId, projectFiles]);

  const getVersion = (num: number) => versions.find((v) => v.version_number === num);

  const leftData = getVersion(leftVersion);
  const rightData = getVersion(rightVersion);

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

        <div className="flex items-center gap-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">左:</span>
            <Select value={String(leftVersion)} onValueChange={(v) => setLeftVersion(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version_number} value={String(v.version_number)}>v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {versions.length < 1 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">バージョンがまだありません</p>
            </div>
          ) : versions.length < 2 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">比較するには2つ以上のバージョンが必要です</p>
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
