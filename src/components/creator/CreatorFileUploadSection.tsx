import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { CreatorProjectFile } from "@/hooks/useCreatorProject";
import type { CreatorProcess } from "@/hooks/useCreatorProcesses";
import type { CreatorPattern } from "@/hooks/useCreatorPatterns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, FileImage, FileAudio2, FileVideo, Layers3 } from "lucide-react";
import { FileRowThumbnail } from "@/components/project/FileRowThumbnail";
import { CreatorUploadModal, type CreatorUploadParentCandidate } from "@/components/creator/CreatorUploadModal";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";

interface CreatorFileUploadSectionProps {
  shareToken: string;
  projectId: string;
  files: CreatorProjectFile[];
  processes: CreatorProcess[];
  patterns: CreatorPattern[];
  onUploadComplete: () => void;
}

interface FileGroup {
  rootId: string;
  latest: CreatorProjectFile;
  draftCount: number;
}

function formatDeadline(value: string | null): string | null {
  if (!value) return null;
  try {
    return format(new Date(value), "MM/dd", { locale: ja });
  } catch {
    return value;
  }
}

function groupFilesByRoot(items: CreatorProjectFile[]): FileGroup[] {
  const map = new Map<string, CreatorProjectFile[]>();
  for (const file of items) {
    const rootId = file.parent_file_id ?? file.file_id;
    if (!map.has(rootId)) map.set(rootId, []);
    map.get(rootId)!.push(file);
  }
  const groups: FileGroup[] = [];
  for (const [rootId, list] of map.entries()) {
    const latest = [...list].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0];
    groups.push({ rootId, latest, draftCount: list.length });
  }
  return groups.sort((a, b) => {
    const av = a.latest.version_number ?? 0;
    const bv = b.latest.version_number ?? 0;
    if (bv !== av) return bv - av;
    return (b.latest.created_at || "").localeCompare(a.latest.created_at || "");
  });
}

function fileTypeIcon(fileType: string) {
  const t = (fileType || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "image"].includes(t)) return FileImage;
  if (["mp4", "mov", "avi", "webm", "mkv", "video"].includes(t)) return FileVideo;
  if (["mp3", "wav", "m4a", "aac", "ogg", "audio"].includes(t)) return FileAudio2;
  return FileText;
}

export function CreatorFileUploadSection({
  shareToken,
  projectId,
  files,
  processes,
  patterns,
  onUploadComplete,
}: CreatorFileUploadSectionProps) {
  const navigate = useNavigate();
  const [targetProcess, setTargetProcess] = useState<CreatorProcess | null>(null);
  const [parentCandidates, setParentCandidates] = useState<CreatorUploadParentCandidate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const interactionLocked = dialogOpen;

  const filesByProcess = useMemo(() => {
    const map = new Map<string, CreatorProjectFile[]>();
    for (const proc of processes) map.set(proc.process_key, []);
    for (const file of files) {
      if (!map.has(file.process_type)) map.set(file.process_type, []);
      map.get(file.process_type)!.push(file);
    }
    for (const [k, list] of map.entries()) {
      map.set(
        k,
        [...list].sort((a, b) => {
          const av = a.version_number ?? 0;
          const bv = b.version_number ?? 0;
          if (bv !== av) return bv - av;
          return (b.created_at || "").localeCompare(a.created_at || "");
        })
      );
    }
    return map;
  }, [files, processes]);

  const openUploadModal = (proc: CreatorProcess) => {
    if (interactionLocked) return;
    setTargetProcess(proc);
    const inProcess = filesByProcess.get(proc.process_key) ?? [];
    const groups = groupFilesByRoot(inProcess);
    setParentCandidates(
      groups.map((g) => ({
        rootId: g.rootId,
        fileName: g.latest.file_name,
        versionNumber: g.latest.version_number || 1,
        fileType: g.latest.file_type,
        patternId: g.latest.pattern_id,
      }))
    );
    setDialogOpen(true);
  };

  return (
    <section className="glass-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">ファイル</h2>
      <div className="space-y-4">
        {processes.map((proc, idx) => {
          const inProcess = filesByProcess.get(proc.process_key) ?? [];
          const groups = groupFilesByRoot(inProcess);
          return (
            <div key={proc.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {idx + 1}. {proc.process_label}
                </div>
                {formatDeadline(proc.client_deadline) && (
                  <Badge variant="outline" className="text-[10px]">
                    期限: {formatDeadline(proc.client_deadline)}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={interactionLocked}
                onClick={() => openUploadModal(proc)}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                アップロード
              </Button>

              {(() => {
                const hasPatterns = patterns.length > 0;
                if (!hasPatterns) {
                  if (groups.length === 0) {
                    return <p className="text-xs text-muted-foreground py-1">ファイルがありません</p>;
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      {groups.map((group) => {
                        const latest = group.latest;
                        const st = FILE_STATUS_CONFIG[latest.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                        const draftLabel = group.draftCount === 1 ? "初稿" : `第${group.draftCount}稿`;
                        const TypeIcon = fileTypeIcon(latest.file_type);
                        return (
                          <div
                            key={group.rootId}
                            className="glass-card p-2 text-left w-full relative overflow-hidden cursor-pointer hover:bg-accent/40 transition-colors"
                            onClick={() => navigate(`/creator/${shareToken}/file/${group.latest.file_id}`)}
                          >
                            <div className="min-w-0">
                              <FileRowThumbnail
                                fileType={latest.file_type}
                                processKey={proc.process_key}
                                thumbnailData={latest.file_data}
                                className="mb-1.5"
                              />
                              <div className="min-w-0">
                                <p className="text-sm truncate flex items-center gap-1">
                                  <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{latest.file_name}</span>
                                </p>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${st.class}`}>
                                    {st.label}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                                    <Layers3 className="h-2.5 w-2.5" />
                                    {draftLabel}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                                    v{latest.version_number || 1}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                const renderGroupList = (items: CreatorProjectFile[]) => {
                  const rootGroups = groupFilesByRoot(items);
                  if (rootGroups.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      {rootGroups.map((group) => {
                        const latest = group.latest;
                        const st = FILE_STATUS_CONFIG[latest.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                        const draftLabel = group.draftCount === 1 ? "初稿" : `第${group.draftCount}稿`;
                        const TypeIcon = fileTypeIcon(latest.file_type);
                        return (
                          <div
                            key={group.rootId}
                            className="glass-card p-2 text-left w-full relative overflow-hidden cursor-pointer hover:bg-accent/40 transition-colors"
                            onClick={() => navigate(`/creator/${shareToken}/file/${group.latest.file_id}`)}
                          >
                            <div className="min-w-0">
                              <FileRowThumbnail
                                fileType={latest.file_type}
                                processKey={proc.process_key}
                                thumbnailData={latest.file_data}
                                className="mb-1.5"
                              />
                              <div className="min-w-0">
                                <p className="text-sm truncate flex items-center gap-1">
                                  <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{latest.file_name}</span>
                                </p>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${st.class}`}>
                                    {st.label}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                                    <Layers3 className="h-2.5 w-2.5" />
                                    {draftLabel}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                                    v{latest.version_number || 1}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                };

                const unclassified = inProcess.filter((f) => !f.pattern_id);
                const hasAnyFile = inProcess.length > 0;
                if (!hasAnyFile) {
                  return <p className="text-xs text-muted-foreground py-1">ファイルがありません</p>;
                }

                return (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {patterns.map((pattern) => {
                      const filesInPattern = inProcess.filter((f) => f.pattern_id === pattern.id);
                      const rootGroups = groupFilesByRoot(filesInPattern);
                      if (rootGroups.length === 0) return null;
                      return (
                        <div key={pattern.id} className="min-w-[180px] max-w-[220px] flex-shrink-0">
                          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] font-bold">{pattern.name}</Badge>
                            <span className="text-[9px] text-muted-foreground/60">{rootGroups.length}件</span>
                          </h4>
                          {renderGroupList(filesInPattern)}
                        </div>
                      );
                    })}
                    {unclassified.length > 0 && (
                      <div className="min-w-[180px] max-w-[220px] flex-shrink-0">
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] font-bold">未分類</Badge>
                          <span className="text-[9px] text-muted-foreground/60">{groupFilesByRoot(unclassified).length}件</span>
                        </h4>
                        {renderGroupList(unclassified)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {targetProcess && (
        <CreatorUploadModal
          open={dialogOpen}
          onOpenChange={(next) => {
            setDialogOpen(next);
            if (!next) {
              setParentCandidates([]);
              setTargetProcess(null);
            }
          }}
          shareToken={shareToken}
          projectId={projectId}
          processType={targetProcess.process_key}
          processLabel={targetProcess.process_label}
          parentCandidates={parentCandidates}
          patterns={patterns}
          onUploaded={(newFileId) => {
            onUploadComplete();
            navigate(`/creator/${shareToken}/file/${newFileId}`);
          }}
        />
      )}
    </section>
  );
}
