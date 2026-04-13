import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CreatorPattern } from "@/hooks/useCreatorPatterns";
import { prepareFileForUpload } from "@/lib/file-upload";
import { getProcessFileUploadConfig } from "@/lib/process-config";
import { validateFileSize } from "@/lib/file-validation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FolderPlus, RefreshCw } from "lucide-react";

type UploadStep = "select_type" | "select_pattern" | "select_parent" | "upload";
type UploadType = "new" | "revision";

export interface CreatorUploadParentCandidate {
  rootId: string;
  fileName: string;
  versionNumber: number;
  fileType: string;
  patternId: string | null;
}

interface CreatorUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareToken: string;
  projectId: string;
  processType: string;
  processLabel: string;
  parentCandidates: CreatorUploadParentCandidate[];
  patterns?: CreatorPattern[];
  onUploaded: (newFileId: string) => void;
  defaultUploadType?: UploadType;
  defaultParentFileId?: string | null;
  defaultPatternId?: string | null;
  skipTypeSelection?: boolean;
  skipParentSelection?: boolean;
  skipPatternSelection?: boolean;
}

export function CreatorUploadModal({
  open,
  onOpenChange,
  shareToken,
  projectId,
  processType,
  processLabel,
  parentCandidates,
  patterns = [],
  onUploaded,
  defaultUploadType,
  defaultParentFileId,
  defaultPatternId,
  skipTypeSelection = false,
  skipParentSelection = false,
  skipPatternSelection = false,
}: CreatorUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<UploadType | null>(defaultUploadType ?? null);
  const [selectedParentFileId, setSelectedParentFileId] = useState<string | null>(defaultParentFileId ?? null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(defaultPatternId ?? null);
  const [step, setStep] = useState<UploadStep>(
    skipTypeSelection ? (skipParentSelection ? "upload" : "select_parent") : "select_type"
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentParent = useMemo(
    () => parentCandidates.find((p) => p.rootId === selectedParentFileId) ?? null,
    [parentCandidates, selectedParentFileId]
  );
  const hasPatterns = patterns.length > 0;

  const resetState = () => {
    setUploadType(defaultUploadType ?? null);
    setSelectedParentFileId(defaultParentFileId ?? null);
    setSelectedPatternId(defaultPatternId ?? null);
    setSelectedFile(null);
    setUploading(false);
    setProgress(0);
    setStep(skipTypeSelection ? (skipParentSelection ? "upload" : "select_parent") : "select_type");
  };

  const closeModal = () => {
    onOpenChange(false);
    resetState();
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    const sizeError = validateFileSize(file, processType);
    if (sizeError) {
      toast({ title: "アップロードに失敗しました", description: sizeError, variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadType) return;
    if (uploadType === "revision" && !selectedParentFileId) {
      toast({ title: "親ファイルを選択してください", variant: "destructive" });
      return;
    }
    if (uploadType === "new" && hasPatterns && !selectedPatternId) {
      toast({ title: "パターンを選択してください", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(5);
    try {
      const prepared = await prepareFileForUpload({
        file: selectedFile,
        processType,
        projectId,
        fileNamePrefix: "creator",
        onProgress: (p) => setProgress(Math.max(10, Math.min(90, p))),
      });

      const { data, error } = await supabase.rpc("upload_file_as_creator", {
        p_share_token: shareToken,
        p_file_name: selectedFile.name,
        p_file_type: prepared.fileType,
        p_process_type: processType,
        p_file_data: prepared.fileData,
        p_file_size_bytes: prepared.fileSizeBytes,
        p_parent_file_id: uploadType === "revision" ? selectedParentFileId : null,
        p_pattern_id:
          uploadType === "revision"
            ? currentParent?.patternId ?? null
            : (hasPatterns ? selectedPatternId : null),
      });
      if (error) throw error;
      const newFileId = typeof data === "string" ? data : "";
      if (!newFileId) throw new Error("アップロード結果の file_id が取得できませんでした");

      setProgress(100);
      toast({ title: uploadType === "revision" ? "修正版をアップロードしました" : "ファイルをアップロードしました" });
      onUploaded(newFileId);
      closeModal();
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "不明なエラー";
      toast({ title: "アップロードに失敗しました", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (uploading) return;
        if (!next) {
          closeModal();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ファイルをアップロード
            <Badge variant="outline" className="text-[10px]">
              {processLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {step === "select_type" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">どのようなファイルをアップロードしますか?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="border border-border rounded-lg p-4 text-left hover:border-primary/40 hover:bg-accent/40 transition-colors"
                onClick={() => {
                  setUploadType("new");
                  setSelectedParentFileId(null);
                  if (hasPatterns && !skipPatternSelection) {
                    setStep("select_pattern");
                    return;
                  }
                  setStep("upload");
                }}
              >
                <FolderPlus className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">新規ファイル</p>
              </button>
              <button
                type="button"
                disabled={parentCandidates.length === 0}
                title={parentCandidates.length === 0 ? "まず新規ファイルをアップロードしてください" : undefined}
                className={cn(
                  "border border-border rounded-lg p-4 text-left transition-colors",
                  parentCandidates.length === 0
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-primary/40 hover:bg-accent/40"
                )}
                onClick={() => {
                  if (parentCandidates.length === 0) return;
                  setUploadType("revision");
                  setStep("select_parent");
                }}
              >
                <RefreshCw className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">修正版</p>
              </button>
            </div>
          </div>
        )}

        {step === "select_pattern" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">どのパターンにアップロードしますか?</p>
            <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-md p-2">
              {patterns.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "w-full text-left border rounded-md px-3 py-2 text-sm",
                    selectedPatternId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                  )}
                  onClick={() => setSelectedPatternId(p.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{selectedPatternId === p.id ? "●" : "○"}</span>
                    <span className="truncate flex-1">{p.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "select_parent" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">どのファイルの修正版ですか?</p>
            <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-md p-2">
              {parentCandidates.map((p) => (
                <button
                  key={p.rootId}
                  type="button"
                  className={cn(
                    "w-full text-left border rounded-md px-3 py-2 text-sm",
                    selectedParentFileId === p.rootId ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                  )}
                  onClick={() => setSelectedParentFileId(p.rootId)}
                >
                  <div className="flex items-center gap-2">
                    <span>{selectedParentFileId === p.rootId ? "●" : "○"}</span>
                    <span className="truncate flex-1">{p.fileName}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">v{p.versionNumber || 1}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-3">
            {uploadType === "revision" && currentParent && (
              <p className="text-xs text-muted-foreground">
                親ファイル: {currentParent.fileName} v{currentParent.versionNumber || 1}
              </p>
            )}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                uploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/40"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploading) return;
                onPickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {selectedFile ? selectedFile.name : "クリックまたはドラッグ&ドロップで選択"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">{getProcessFileUploadConfig(processType).accept}</p>
              <Input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={uploading}
                accept={getProcessFileUploadConfig(processType).accept}
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {uploading && <Progress value={progress} className="h-2" />}
          </div>
        )}

        <DialogFooter>
          {step === "select_type" && (
            <Button type="button" variant="outline" onClick={closeModal} disabled={uploading}>
              キャンセル
            </Button>
          )}

          {step === "select_parent" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(skipTypeSelection ? "upload" : "select_type")}
                disabled={uploading}
              >
                戻る
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSelectedPatternId(currentParent?.patternId ?? null);
                  setStep("upload");
                }}
                disabled={!selectedParentFileId || uploading}
              >
                次へ: ファイル選択
              </Button>
            </>
          )}

          {step === "select_pattern" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("select_type")}
                disabled={uploading}
              >
                戻る
              </Button>
              <Button
                type="button"
                onClick={() => setStep("upload")}
                disabled={!selectedPatternId || uploading}
              >
                次へ: ファイル選択
              </Button>
            </>
          )}

          {step === "upload" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (uploading) return;
                  if (uploadType === "revision" && !skipParentSelection) setStep("select_parent");
                  else if (uploadType === "new" && hasPatterns && !skipPatternSelection) setStep("select_pattern");
                  else if (!skipTypeSelection) setStep("select_type");
                  else closeModal();
                }}
                disabled={uploading}
              >
                戻る
              </Button>
              <Button type="button" onClick={() => void handleUpload()} disabled={!selectedFile || uploading}>
                {uploading ? "アップロード中..." : "アップロード"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
