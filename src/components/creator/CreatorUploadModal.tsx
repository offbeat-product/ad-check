import { useMemo, useRef, useState, type DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CreatorPattern } from "@/hooks/useCreatorPatterns";
import { prepareFileForUpload } from "@/lib/file-upload";
import { getProcessFileUploadConfig } from "@/lib/process-config";
import { validateFileSize, formatFileSize } from "@/lib/file-validation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FolderPlus, RefreshCw } from "lucide-react";

type UploadStep = "select_type" | "select_parent" | "upload";
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
  /** 単一アップロード時は string、複数時は ID の配列 */
  onUploaded: (newFileId: string | string[]) => void;
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
  const [step, setStep] = useState<UploadStep>(
    skipTypeSelection ? (skipParentSelection ? "upload" : "select_parent") : "select_type"
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadPatternMode, setUploadPatternMode] = useState<"common" | "specific">("common");
  const [uploadPatternId, setUploadPatternId] = useState<string | null>(defaultPatternId ?? null);
  const [filePatternAssignments, setFilePatternAssignments] = useState<Record<number, string | null>>({});

  const currentParent = useMemo(
    () => parentCandidates.find((p) => p.rootId === selectedParentFileId) ?? null,
    [parentCandidates, selectedParentFileId]
  );
  const hasPatterns = patterns.length > 0;
  const accept = getProcessFileUploadConfig(processType).accept;

  const resetState = () => {
    setUploadType(defaultUploadType ?? null);
    setSelectedParentFileId(defaultParentFileId ?? null);
    setSelectedFiles([]);
    setUploading(false);
    setProgress(0);
    setIsDragOver(false);
    setUploadPatternMode("common");
    setUploadPatternId(defaultPatternId ?? null);
    setFilePatternAssignments({});
    setStep(skipTypeSelection ? (skipParentSelection ? "upload" : "select_parent") : "select_type");
  };

  const closeModal = () => {
    onOpenChange(false);
    resetState();
  };

  const filterDroppedFiles = (files: File[]): File[] => {
    const exts = accept.split(",").map((x) => x.trim().toLowerCase());
    const valid = files.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return exts.length === 0 || exts.includes(ext);
    });
    if (files.length > 0 && valid.length === 0) {
      toast({ title: "エラー", description: "対応していないファイル形式です", variant: "destructive" });
      return [];
    }
    if (valid.length < files.length) {
      toast({ title: "一部のファイルをスキップしました", description: `対応形式: ${accept}` });
    }
    return valid;
  };

  const applySelectedFiles = (files: File[]) => {
    const filtered = filterDroppedFiles(files);
    if (filtered.length === 0) return;
    const next = uploadType === "revision" ? filtered.slice(0, 1) : filtered;
    for (const file of next) {
      const sizeError = validateFileSize(file, processType);
      if (sizeError) {
        toast({ title: "アップロードに失敗しました", description: sizeError, variant: "destructive" });
        return;
      }
    }
    setSelectedFiles(next);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (uploading) return;
    const list = e.dataTransfer.files;
    if (!list?.length) return;
    applySelectedFiles(Array.from(list));
  };

  const resolvePatternIdForIndex = (index: number): string | null => {
    if (!uploadType) return null;
    if (uploadType === "revision") {
      return currentParent?.patternId ?? null;
    }
    if (!hasPatterns || skipPatternSelection) {
      return null;
    }
    const usePerFilePatterns =
      patterns.length > 0 && selectedFiles.length > 1 && Object.keys(filePatternAssignments).length > 0;
    if (usePerFilePatterns) {
      return filePatternAssignments[index] ?? null;
    }
    return uploadPatternMode === "specific" ? uploadPatternId : null;
  };

  const validatePatternBeforeUpload = (): boolean => {
    if (!uploadType || uploadType === "revision") return true;
    if (!hasPatterns || skipPatternSelection) return true;
    if (selectedFiles.length <= 1 && uploadPatternMode === "specific" && !uploadPatternId) {
      toast({ title: "パターンを選択してください", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !uploadType) return;
    if (uploadType === "revision" && !selectedParentFileId) {
      toast({ title: "親ファイルを選択してください", variant: "destructive" });
      return;
    }
    if (uploadType === "revision" && selectedFiles.length !== 1) {
      toast({ title: "修正版は1ファイルずつアップロードしてください", variant: "destructive" });
      return;
    }
    if (!validatePatternBeforeUpload()) return;

    setUploading(true);
    setProgress(5);
    const uploadedIds: string[] = [];
    const total = selectedFiles.length;

    try {
      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i];
        const sizeError = validateFileSize(file, processType);
        if (sizeError) {
          toast({ title: "エラー", description: `${file.name}: ${sizeError}`, variant: "destructive" });
          continue;
        }

        const prepared = await prepareFileForUpload({
          file,
          processType,
          projectId,
          fileNamePrefix: "creator",
          onProgress: (p) => {
            const fileProgress = p / 100;
            setProgress(Math.round(5 + ((i + fileProgress) / total) * 90));
          },
        });

        const patternId = resolvePatternIdForIndex(i);

        const { data, error } = await supabase.rpc("upload_file_as_creator", {
          p_share_token: shareToken,
          p_file_name: file.name,
          p_file_type: prepared.fileType,
          p_process_type: processType,
          p_file_data: prepared.fileData,
          p_file_size_bytes: prepared.fileSizeBytes,
          p_parent_file_id: uploadType === "revision" ? selectedParentFileId : null,
          p_pattern_id: patternId,
        });
        if (error) throw error;
        const newFileId = typeof data === "string" ? data : "";
        if (!newFileId) throw new Error("アップロード結果の file_id が取得できませんでした");
        uploadedIds.push(newFileId);
        setProgress(Math.round(5 + ((i + 1) / total) * 90));
      }

      if (uploadedIds.length === 0) {
        toast({ title: "アップロードできたファイルがありません", variant: "destructive" });
        return;
      }

      setProgress(100);
      if (uploadedIds.length === 1) {
        toast({
          title: uploadType === "revision" ? "修正版をアップロードしました" : "ファイルをアップロードしました",
        });
        onUploaded(uploadedIds[0]!);
      } else {
        toast({ title: `${uploadedIds.length}件アップロードしました` });
        onUploaded(uploadedIds);
      }
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

  const showPatternRadios =
    uploadType === "new" && hasPatterns && !skipPatternSelection && selectedFiles.length <= 1;
  const showPerFilePatterns =
    uploadType === "new" && hasPatterns && !skipPatternSelection && selectedFiles.length > 1;

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
      <DialogContent className={cn("max-w-md", showPerFilePatterns && "max-w-lg")}>
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
                  setSelectedFiles([]);
                  setFilePatternAssignments({});
                  setUploadPatternMode("common");
                  setUploadPatternId(defaultPatternId ?? null);
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
                  setSelectedFiles([]);
                  setFilePatternAssignments({});
                  setStep("select_parent");
                }}
              >
                <RefreshCw className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">修正版</p>
              </button>
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
                    <Badge variant="secondary" className="text-[10px] h-5">
                      v{p.versionNumber || 1}
                    </Badge>
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

            {showPatternRadios && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">対象</Label>
                <RadioGroup
                  value={uploadPatternMode}
                  onValueChange={(v) => setUploadPatternMode(v as "common" | "specific")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="common" id="creator-pattern-common" />
                    <Label htmlFor="creator-pattern-common" className="text-xs">
                      全パターン共通
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="creator-pattern-specific" />
                    <Label htmlFor="creator-pattern-specific" className="text-xs">
                      特定パターン
                    </Label>
                  </div>
                </RadioGroup>
                {uploadPatternMode === "specific" && (
                  <Select value={uploadPatternId || ""} onValueChange={setUploadPatternId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="パターンを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {patterns.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name}
                          {p.description ? ` — ${p.description}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {showPerFilePatterns && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">パターン割り当て</Label>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2"
                      type="button"
                      onClick={() => {
                        const assignments: Record<number, string | null> = {};
                        selectedFiles.forEach((_, idx) => {
                          assignments[idx] = null;
                        });
                        setFilePatternAssignments(assignments);
                      }}
                    >
                      全て共通
                    </Button>
                    {patterns.map((p) => (
                      <Button
                        key={p.id}
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2"
                        type="button"
                        onClick={() => {
                          const assignments: Record<number, string | null> = {};
                          selectedFiles.forEach((_, idx) => {
                            assignments[idx] = p.id;
                          });
                          setFilePatternAssignments(assignments);
                        }}
                      >
                        全て{p.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {selectedFiles.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-xs truncate flex-1 min-w-0" title={file.name}>
                        {file.name}
                      </span>
                      <Select
                        value={filePatternAssignments[i] ?? "__common__"}
                        onValueChange={(v) => {
                          setFilePatternAssignments((prev) => ({
                            ...prev,
                            [i]: v === "__common__" ? null : v,
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-[140px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__common__" className="text-xs">
                            共通
                          </SelectItem>
                          {patterns.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                isDragOver ? "border-primary bg-primary/5" : "border-border",
                uploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/40"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <Upload
                className={cn("h-7 w-7 mx-auto mb-2", isDragOver ? "text-primary" : "text-muted-foreground")}
              />
              <p className="text-sm text-muted-foreground">
                {selectedFiles.length > 0 ? (
                  selectedFiles.length === 1 ? (
                    <span>
                      {selectedFiles[0]!.name}{" "}
                      <span className="text-muted-foreground/60">({formatFileSize(selectedFiles[0]!.size)})</span>
                    </span>
                  ) : (
                    <span>{selectedFiles.length}件のファイルを選択中</span>
                  )
                ) : isDragOver ? (
                  "ドロップしてアップロード"
                ) : uploadType === "revision" ? (
                  "クリックまたはドラッグ&ドロップで選択"
                ) : (
                  "クリックまたはドラッグ＆ドロップ（複数可）"
                )}
              </p>
              {selectedFiles.length > 1 && (
                <div className="mt-2 text-xs text-muted-foreground/60 space-y-0.5">
                  {selectedFiles.map((f, idx) => (
                    <p key={`${f.name}-${idx}`}>
                      {f.name} ({formatFileSize(f.size)})
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground/70 mt-1">{accept}</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={uploading}
                accept={accept}
                multiple={uploadType === "new"}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    applySelectedFiles(Array.from(files));
                  }
                  e.target.value = "";
                }}
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
                  setSelectedFiles([]);
                  setStep("upload");
                }}
                disabled={!selectedParentFileId || uploading}
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
                  else if (!skipTypeSelection) setStep("select_type");
                  else closeModal();
                }}
                disabled={uploading}
              >
                戻る
              </Button>
              <Button type="button" onClick={() => void handleUpload()} disabled={selectedFiles.length === 0 || uploading}>
                {uploading ? "アップロード中..." : "アップロード"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
