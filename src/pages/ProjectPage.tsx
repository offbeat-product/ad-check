import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { validateFileSize, formatFileSize, MAX_UPLOAD_LABEL, getFileCategory, getUploadLimitLabel } from "@/lib/file-validation";
import { prepareFileForUpload } from "@/lib/file-upload";
import { getLatestVersionId } from "@/lib/project-file-versions";
import type { Project, Product, Client, ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { useProjectProcesses, type ProjectProcess } from "@/hooks/useProjectProcesses";
import { PROJECT_STATUS_CONFIG, PROCESS_STATUS_CONFIG, getProcessFileUploadConfig, getProcessWebhookPath, AI_CHECK_CONFIG } from "@/lib/process-config";
import { PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { useProcessTypes } from "@/hooks/useProcessTypes";
import {
  buildProcessLabelLookup,
  buildMixedBannerProcessKeys,
  buildMixedVideoLaneProcessKeys,
  projectProcessMatchesMixedTab,
  mergeMixedProcessesAfterLaneReorder,
} from "@/lib/process-types";
import { usePatterns } from "@/hooks/usePatterns";
import { AD_BRAIN_URL } from "@/lib/constants";
import ProcessManagementModal from "@/components/ProcessManagementModal";
import ProcessTimeline from "@/components/ProcessTimeline";
import PatternMatrix from "@/components/patterns/PatternMatrix";
import AddPatternDialog from "@/components/patterns/AddPatternDialog";
import BulkPatternDialog from "@/components/patterns/BulkPatternDialog";
import CopyToPatternDialog from "@/components/patterns/CopyToPatternDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import CheckRulesTab from "@/components/product/CheckRulesTab";
import {
  Upload, ImageIcon, MessageCircle, Plus, Settings, GripVertical,
  ChevronDown, ChevronRight, CalendarIcon, AlertTriangle, Trash2, Grid3X3, List, Bot, Loader2, Pencil, Lock, CheckSquare, Send, MoreHorizontal, Layers, ArrowRightLeft,
  ExternalLink,
  Video,
  LayoutGrid,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isPast } from "date-fns";
import { useBatchCheck } from "@/hooks/useBatchCheck";
import { useAutoCheck } from "@/providers/AutoCheckProvider";
import { ProcessAiAutoCheckBadge } from "@/components/project/ProcessAiAutoCheckBadge";
import { getSubmitBadgeClass, getSubmitLabel } from "@/lib/check-display";
import { ProjectAuditLog, PROJECT_AUDIT_LOG_QUERY_KEY } from "@/components/ProjectAuditLog";
import { CreatorInviteModal } from "@/components/project/CreatorInviteModal";
import { ProjectCreatorCollaboratorsSection } from "@/components/project/ProjectCreatorCollaboratorsSection";
import { FileRowThumbnail } from "@/components/project/FileRowThumbnail";

function hasFinalOverallStatus(status: string | null | undefined): boolean {
  const s = (status || "").toUpperCase();
  return s === "A" || s === "B" || s === "C" || s === "D";
}

function toEpoch(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function pickCanonicalProcessByKey(a: ProjectProcess, b: ProjectProcess): ProjectProcess {
  const aUpdated = toEpoch(a.updated_at);
  const bUpdated = toEpoch(b.updated_at);
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? a : b;
  const aCreated = toEpoch(a.created_at);
  const bCreated = toEpoch(b.created_at);
  if (aCreated !== bCreated) return aCreated > bCreated ? a : b;
  if (a.sort_order !== b.sort_order) return a.sort_order < b.sort_order ? a : b;
  return a;
}

async function removeStorageFileFromPublicUrl(fileData: string | null | undefined): Promise<void> {
  if (!fileData || fileData.startsWith("data:")) return;

  try {
    const url = new URL(fileData);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (!pathMatch) return;

    const bucket = decodeURIComponent(pathMatch[1]);
    if (!["audios", "videos", "deliverables"].includes(bucket)) return;

    await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[2])]);
  } catch {
    void 0;
  }
}

function dedupeProcessesByKey(rows: ProjectProcess[]): ProjectProcess[] {
  const byKey = new Map<string, ProjectProcess>();
  for (const row of rows) {
    const prev = byKey.get(row.process_key);
    if (!prev) {
      byKey.set(row.process_key, row);
      continue;
    }
    byKey.set(row.process_key, pickCanonicalProcessByKey(prev, row));
  }
  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
}

function DeadlineDisplay({ deadline, className, isCompleted, label }: { deadline: string | null; className?: string; isCompleted?: boolean; label?: string }) {
  const prefix = label || "納期";
  if (!deadline) return <span className={cn("text-xs text-muted-foreground/50", className)}>{prefix}未設定</span>;
  const d = new Date(deadline);
  const daysUntil = differenceInDays(d, new Date());
  const past = isPast(d) && daysUntil < 0;
  const soon = daysUntil >= 0 && daysUntil <= 3;
  const dateStr = format(d, "MM/dd");

  if (isCompleted) {
    return <span className={cn("text-xs text-muted-foreground", className)}>{prefix}: {dateStr}</span>;
  }

  return (
    <span className={cn("text-xs flex items-center gap-1", className,
      past ? "text-status-ng font-medium" : soon ? "text-status-warning font-medium" : "text-muted-foreground"
    )}>
      {(past || soon) ? <AlertTriangle className="h-3 w-3" /> : null}
      {past ? `${prefix}超過 (${dateStr})` : `${prefix}: ${dateStr}`}
    </span>
  );
}

function DeadlinePicker({ deadline, onChange, isCompleted, label }: { deadline: string | null; onChange: (d: string | null) => void; isCompleted?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const selected = deadline ? new Date(deadline) : undefined;
  const prefix = label || "納期";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="hover:bg-muted/50 rounded px-1 py-0.5 transition-colors">
          <DeadlineDisplay deadline={deadline} isCompleted={isCompleted} label={label} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          className="p-3 pointer-events-auto"
        />
        {deadline ? <div className="px-3 pb-3">
            <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => { onChange(null); setOpen(false); }}>
              {prefix}をクリア
            </Button>
          </div> : null}
      </PopoverContent>
    </Popover>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isStaff } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<string | null>(null);
  const [uploadPatternId, setUploadPatternId] = useState<string | null>(null);
  const [uploadPatternMode, setUploadPatternMode] = useState<"common" | "specific">("common");
  const [uploadSubmissionType, setUploadSubmissionType] = useState<"internal" | "client">("internal");
  const [uploadTextInput, setUploadTextInput] = useState("");
  const [useTextInput, setUseTextInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePatternAssignments, setFilePatternAssignments] = useState<Record<number, string | null>>({});
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ file: ProjectFile; hasCheck: boolean } | null>(null);
  const [submissionChangeTarget, setSubmissionChangeTarget] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [addPatternOpen, setAddPatternOpen] = useState(false);
  const [bulkPatternOpen, setBulkPatternOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"matrix" | "list">("list");
  const [mixedProcessTab, setMixedProcessTab] = useState<"banner" | "video">("banner");
  const [copyToPatternInfo, setCopyToPatternInfo] = useState<{
    sourcePatternId: string;
    processType: string;
    fileData: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  } | null>(null);
  const [creatorInviteOpen, setCreatorInviteOpen] = useState(false);
  const [creatorCollabRefreshKey, setCreatorCollabRefreshKey] = useState(0);

  const { patterns, addPattern, addPatternsBulk, deletePattern, updatePattern, refetch: refetchPatterns } = usePatterns(id);

  const { processes, updateProcess, reorderProcesses, addProcess, deleteProcess, resetToDefaults } = useProjectProcesses(id);
  const dedupedProcesses = useMemo(() => dedupeProcessesByKey(processes), [processes]);

  useEffect(() => {
    setMixedProcessTab("banner");
  }, [id]);

  const { data: processTypeRows = [] } = useProcessTypes();
  const processLabelByKey = useMemo(() => {
    const fromDb = buildProcessLabelLookup(processTypeRows);
    return {
      script: "構成/字コンテ",
      na_script: "NA原稿",
      narration: "ナレーション",
      bgm: "BGM",
      vcon: "Vコン",
      styleframe: "スタイルフレーム",
      storyboard: "絵コンテ",
      video_horizontal: "横動画",
      video_vertical: "縦動画",
      ...fromDb,
    };
  }, [processTypeRows]);

  const processCreativeByCode = useMemo(() => {
    const m = new Map<string, string>();
    processTypeRows.forEach((r) => m.set(r.code, r.creative_type));
    return m;
  }, [processTypeRows]);

  const mixedBannerProcessKeys = useMemo(
    () => buildMixedBannerProcessKeys(processTypeRows),
    [processTypeRows]
  );

  const mixedVideoLaneProcessKeys = useMemo(
    () => buildMixedVideoLaneProcessKeys(processTypeRows),
    [processTypeRows]
  );

  const uploadProcessOptions = useMemo(() => {
    let base = [...dedupedProcesses].filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const ct = project?.creative_type ?? "video";
    if (ct === "mixed") {
      base = base.filter((p) =>
        projectProcessMatchesMixedTab(
          p,
          mixedProcessTab,
          processCreativeByCode,
          mixedBannerProcessKeys,
          mixedVideoLaneProcessKeys
        )
      );
    }
    return base;
  }, [
    dedupedProcesses,
    project?.creative_type,
    mixedProcessTab,
    processCreativeByCode,
    mixedBannerProcessKeys,
    mixedVideoLaneProcessKeys,
  ]);

  const displayActiveProcesses = useMemo(() => {
    const act = dedupedProcesses.filter((p) => p.is_active);
    const ct = project?.creative_type ?? "video";
    if (ct !== "mixed") return act;
    return act.filter((p) =>
      projectProcessMatchesMixedTab(
        p,
        mixedProcessTab,
        processCreativeByCode,
        mixedBannerProcessKeys,
        mixedVideoLaneProcessKeys
      )
    );
  }, [
    dedupedProcesses,
    project?.creative_type,
    mixedProcessTab,
    processCreativeByCode,
    mixedBannerProcessKeys,
    mixedVideoLaneProcessKeys,
  ]);

  const processesForPatternMatrix = useMemo(() => {
    const ct = project?.creative_type ?? "video";
    if (ct !== "mixed") return dedupedProcesses;
    return dedupedProcesses.filter(
      (p) =>
        !p.is_active ||
        projectProcessMatchesMixedTab(
          p,
          mixedProcessTab,
          processCreativeByCode,
          mixedBannerProcessKeys,
          mixedVideoLaneProcessKeys
        )
    );
  }, [
    dedupedProcesses,
    project?.creative_type,
    mixedProcessTab,
    processCreativeByCode,
    mixedBannerProcessKeys,
    mixedVideoLaneProcessKeys,
  ]);

  const processesForManagementModal = useMemo(() => {
    if (project?.creative_type !== "mixed") {
      return [...dedupedProcesses].sort((a, b) => a.sort_order - b.sort_order);
    }
    return [...dedupedProcesses]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((p) =>
        projectProcessMatchesMixedTab(
          p,
          mixedProcessTab,
          processCreativeByCode,
          mixedBannerProcessKeys,
          mixedVideoLaneProcessKeys
        )
      );
  }, [
    dedupedProcesses,
    project?.creative_type,
    mixedProcessTab,
    processCreativeByCode,
    mixedBannerProcessKeys,
    mixedVideoLaneProcessKeys,
  ]);

  const handleProcessManagementReorder = useCallback(
    (reordered: ProjectProcess[]) => {
      if (project?.creative_type !== "mixed") {
        void reorderProcesses(reordered);
        return;
      }
      const merged = mergeMixedProcessesAfterLaneReorder(
        dedupedProcesses,
        reordered,
        mixedProcessTab,
        processCreativeByCode,
        mixedBannerProcessKeys,
        mixedVideoLaneProcessKeys
      );
      void reorderProcesses(merged);
    },
    [
      project?.creative_type,
      dedupedProcesses,
      mixedProcessTab,
      processCreativeByCode,
      mixedBannerProcessKeys,
      mixedVideoLaneProcessKeys,
      reorderProcesses,
    ]
  );

  const handleProcessManagementAdd = useCallback(
    (label: string) => {
      if (project?.creative_type === "mixed") {
        void addProcess(label, { mixedLane: mixedProcessTab });
      } else {
        void addProcess(label);
      }
    },
    [project?.creative_type, mixedProcessTab, addProcess]
  );

  const { runBatchCheck } = useBatchCheck();
  const { badgeFlashProjectId, bulkSequentialProgress } = useAutoCheck();

  const renderProcessAiExtra = useCallback(
    (processKey: string) => (
      <ProcessAiAutoCheckBadge
        processKey={processKey}
        files={files}
        showAllComplete={Boolean(id && badgeFlashProjectId === id)}
      />
    ),
    [files, badgeFlashProjectId, id]
  );

  const [batchFixing, setBatchFixing] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [collapsedProcesses, setCollapsedProcesses] = useState<Set<string>>(new Set());
  const [changePatternTarget, setChangePatternTarget] = useState<ProjectFile | null>(null);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [editingProcessId, setEditingProcessId] = useState<string | null>(null);
  const [processLabelDraft, setProcessLabelDraft] = useState("");
  const savingProjectNameRef = useRef(false);
  const savingProcessLabelRef = useRef(false);

  const handleSaveProjectName = useCallback(async () => {
    if (savingProjectNameRef.current) return;
    savingProjectNameRef.current = true;
    setEditingProjectName(false);
    try {
      if (!project || !projectNameDraft.trim() || projectNameDraft.trim() === project.name) return;
      const newName = projectNameDraft.trim();
      const { error } = await supabase.from("projects").update({ name: newName }).eq("id", project.id);
      if (!handleSupabaseError(error, "rename project")) {
        setProject(prev => prev ? { ...prev, name: newName } : prev);
        queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: [PROJECT_AUDIT_LOG_QUERY_KEY] });
        toast({ title: "案件名を変更しました" });
      }
    } finally {
      savingProjectNameRef.current = false;
    }
  }, [project, projectNameDraft, queryClient, toast]);

  const handleSaveProcessLabel = useCallback(async (procId: string) => {
    if (savingProcessLabelRef.current) return;
    savingProcessLabelRef.current = true;
    setEditingProcessId(null);
    try {
      const proc = processes.find(p => p.id === procId);
      if (!proc || !processLabelDraft.trim() || processLabelDraft.trim() === proc.process_label) return;
      const newLabel = processLabelDraft.trim();
      await updateProcess(procId, { process_label: newLabel });
      toast({ title: "工程名を変更しました" });
    } finally {
      savingProcessLabelRef.current = false;
    }
  }, [processes, processLabelDraft, updateProcess, toast]);

  // Auto-collapse completed processes AND processes where all root files are fixed
  useEffect(() => {
    if (processes.length > 0) {
      const shouldCollapseIds = new Set<string>();
      for (const proc of processes) {
        // Collapse if process status is completed
        if (proc.status === "completed") {
          shouldCollapseIds.add(proc.id);
          continue;
        }
        // Collapse if all root files in this process are fixed
        const procFiles = files.filter(f => f.process_type === proc.process_key);
        const rootFiles = procFiles.filter(f => !f.parent_file_id);
        if (rootFiles.length > 0 && rootFiles.every(f => f.status === "fixed")) {
          shouldCollapseIds.add(proc.id);
        }
      }
      if (shouldCollapseIds.size > 0) {
        setCollapsedProcesses(prev => {
          const next = new Set(prev);
          shouldCollapseIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [processes, files]);
  const handleBatchFix = async (processFiles: ProjectFile[], processKey: string) => {
    if (!id || !user) return;
    // All root files with check_result_id are targets for batch fix
    const allTargetFiles = processFiles.filter(f => 
      f.check_result_id && !f.parent_file_id
    );
    const unfixedFiles = allTargetFiles.filter(f => f.status !== "fixed");
    if (allTargetFiles.length === 0) {
      toast({ title: "FIX対象のファイルがありません", description: "チェック済みのファイルが必要です" });
      return;
    }
    if (unfixedFiles.length === 0) {
      toast({ title: "すべてのファイルは既にFIX済みです" });
      return;
    }
    const confirmed = window.confirm(
      `この工程の${unfixedFiles.length}件のチェック済みファイルを一括FIX（最終確定）しますか？\nFIXしたデータは他工程のAIチェック時に照合用として使用されます。`
    );
    if (!confirmed) return;

    setBatchFixing(true);
    try {
      // Fix all unfixed target files
      const now = new Date().toISOString();
      const fixBy = user.email || user.id || null;
      for (const f of unfixedFiles) {
        await supabase.from("project_files")
          .update({ status: "fixed", fixed_at: now, fixed_by: fixBy } as any)
          .eq("id", f.id);
      }

      toast({ title: `✅ ${unfixedFiles.length}件を一括FIXしました`, description: "他工程のAIチェック時にこれらのデータが照合用として使用されます" });
      fetchData();
    } catch (err) {
      console.error("[BatchFix] error:", err);
      toast({ title: "一括FIXに失敗しました", variant: "destructive" });
    } finally {
      setBatchFixing(false);
    }
  };

  const handleChangeSubmissionType = async (fileId: string) => {
    const { error } = await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", fileId);
    if (!handleSupabaseError(error, "submission_type")) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
      toast({ title: "クライアント提出に変更しました" });
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!newName.trim()) { setEditingFileId(null); return; }
    const { error } = await supabase.from("project_files").update({ file_name: newName.trim() }).eq("id", fileId);
    if (!handleSupabaseError(error, "rename")) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, file_name: newName.trim() } : f));
      toast({ title: "ファイル名を変更しました" });
    }
    setEditingFileId(null);
  };

  const handleBulkSubmitToClient = async () => {
    if (selectedFileIds.size === 0) return;
    const targetFiles = files.filter(f => selectedFileIds.has(f.id));
    // Only files with completed AI checks can be submitted
    const eligible = targetFiles.filter(f => f.check_result_id && f.submission_type !== "client");
    const ineligible = targetFiles.filter(f => !f.check_result_id);
    if (eligible.length === 0) {
      toast({
        title: "クライアント提出できるファイルがありません",
        description: ineligible.length > 0
          ? "AIチェックが完了しているファイルのみクライアント提出できます。"
          : "選択されたファイルは既にクライアント提出済みです。",
        variant: "destructive",
      });
      return;
    }
    if (ineligible.length > 0) {
      toast({
        title: `${ineligible.length}件はAIチェック未実行のため除外されます`,
        description: "AIチェック済みのファイルのみ提出されます。",
      });
    }
    const confirmed = window.confirm(
      `${eligible.length}件のファイルをクライアント提出済みに変更しますか？\nこの操作は品質レポートに反映されます。`
    );
    if (!confirmed) return;
    try {
      for (const f of eligible) {
        await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", f.id);
      }
      setFiles(prev => prev.map(f => eligible.some(e => e.id === f.id) ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
      toast({ title: `${eligible.length}件をクライアント提出済みに変更しました` });
      setSelectedFileIds(new Set());
      setSelectMode(false);
    } catch (err) {
      toast({ title: "提出変更エラー", description: err instanceof Error ? err.message : "変更に失敗しました", variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFileIds.size === 0) return;
    const targetFiles = files.filter(f => selectedFileIds.has(f.id));
    const hasChecked = targetFiles.some(f => f.check_result_id);
    const confirmed = window.confirm(
      `${targetFiles.length}件のファイルを削除しますか？この操作は元に戻せません。${hasChecked ? "\n⚠️ チェック結果も同時に削除されます。" : ""}`
    );
    if (!confirmed) return;
    try {
      for (const f of targetFiles) {
        // Delete from storage if applicable
        await removeStorageFileFromPublicUrl(f.file_data);
        // Manual cascade: unlink check_result, delete children, delete check_result, then delete file
        const checkResultId = f.check_result_id;
        if (checkResultId) {
          await supabase.from("project_files").update({ check_result_id: null }).eq("id", f.id);
        }
        await supabase.from("project_files").delete().eq("parent_file_id", f.id);
        if (checkResultId) {
          await supabase.from("check_results").delete().eq("id", checkResultId);
        }
        const { error } = await supabase.from("project_files").delete().eq("id", f.id);
        if (error) throw error;
      }
      toast({ title: `${targetFiles.length}件のファイルを削除しました` });
      setSelectedFileIds(new Set());
      setSelectMode(false);
      fetchData();
    } catch (err) {
      toast({ title: "削除エラー", description: err instanceof Error ? err.message : "削除に失敗しました", variant: "destructive" });
    }
  };

  // Drag state for process sections
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const fetchData = useCallback(async (cancelled = false) => {
    if (!id) return;
    const { data: proj, error: projErr } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (cancelled) return;
    if (handleSupabaseError(projErr, "project")) { setLoading(false); return; }
    if (!proj) { setLoading(false); return; }
    setProject(proj);

    const [prodRes, fileRes] = await Promise.all([
      supabase.from("products_with_check_settings").select("*").eq("id", proj.product_id!).maybeSingle(),
      supabase.from("project_files").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    ]);
    if (cancelled) return;
    handleSupabaseError(prodRes.error, "product");
    handleSupabaseError(fileRes.error, "project_files");

    setProduct(prodRes.data);
    const fileData = fileRes.data ?? [];
    setFiles(fileData);

    if (prodRes.data?.client_id) {
      const { data: cl, error: clErr } = await supabase.from("clients").select("*").eq("id", prodRes.data.client_id).maybeSingle();
      if (cancelled) return;
      handleSupabaseError(clErr, "client");
      setClient(cl);
    }

    const checkResultIds = fileData.filter((f) => f.check_result_id).map((f) => f.check_result_id!);
    if (checkResultIds.length > 0) {
      const { data: results, error: crErr } = await supabase
        .from("check_results")
        .select("id, overall_status, ng_count, warning_count, created_at, user_id, check_type, comparison_round, resolved_items, check_items")
        .in("id", checkResultIds);
      if (cancelled) return;
      handleSupabaseError(crErr, "check_results");
      const map: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }> = {};
      (results ?? []).forEach((r) => { map[r.id] = r; });
      setCheckResults(map);
    }

    if (!cancelled) setLoading(false);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetchData(cancelled);
    return () => { cancelled = true; };
  }, [fetchData]);

  // Realtime subscription: update files & check results when project_files change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`project-files:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${id}`,
        },
        async (payload) => {
          console.log("[ProjectPage] Realtime project_files change:", payload.eventType);
          const newFile = payload.new as ProjectFile | undefined;
          const oldFile = payload.old as { id?: string; status?: string } | undefined;

          if (payload.eventType === "DELETE" && oldFile?.id) {
            setFiles(prev => prev.filter(f => f.id !== oldFile.id));
            return;
          }

          if (newFile) {
            setFiles(prev => {
              const idx = prev.findIndex(f => f.id === newFile.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = newFile;
                return updated;
              }
              return [...prev, newFile];
            });

            // If a check_result_id appeared/changed, fetch the check result
            if (newFile.check_result_id) {
              const { data: cr } = await supabase
                .from("check_results")
                .select("id, overall_status, ng_count, warning_count, created_at, user_id, check_type, comparison_round, resolved_items, check_items")
                .eq("id", newFile.check_result_id)
                .maybeSingle();
              if (cr) {
                setCheckResults(prev => ({ ...prev, [cr.id]: cr }));
              }
            }

          }
        }
      )
      .subscribe();

    // Also subscribe to check_results changes (resolved_items updates from review page)
    const crChannel = supabase
      .channel(`project-check-results:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "check_results",
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          setCheckResults(prev => {
            if (!prev[updated.id]) return prev;
            return { ...prev, [updated.id]: { ...prev[updated.id], ...updated } };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(crChannel);
    };
  }, [id]);

  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const fileCheckIds = files.filter(f => f.check_result_id).map(f => f.check_result_id!);
    if (fileCheckIds.length === 0) return;
    supabase.from("comments").select("check_result_id").in("check_result_id", fileCheckIds).then(({ data, error }) => {
      if (cancelled) return;
      if (handleSupabaseError(error, "comment counts")) return;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => { counts[c.check_result_id] = (counts[c.check_result_id] || 0) + 1; });
      setCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [files, id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!project || !id) return;

    // 案件完了バリデーション: 全ファイルがFIX済みでなければ完了不可
    if (newStatus === "completed") {
      const rootFiles = files.filter(f => !f.parent_file_id);
      const nonFixedFiles = rootFiles.filter(f => f.status !== "fixed");
      if (nonFixedFiles.length > 0) {
        toast({
          title: "完了にできません",
          description: `FIX済みでないファイルが${nonFixedFiles.length}件あります。全てのクリエイティブをFIXしてから完了にしてください。`,
          variant: "destructive",
        });
        return;
      }
    }

    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", id);
    if (!handleSupabaseError(error, "status update")) {
      setProject({ ...project, status: newStatus });
      toast({ title: "ステータスを更新しました" });
      queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: [PROJECT_AUDIT_LOG_QUERY_KEY] });
    }
  };

  const handleDeadlineChange = async (deadline: string | null) => {
    if (!project || !id) return;
    const { error } = await supabase.from("projects").update({ overall_deadline: deadline }).eq("id", id);
    if (!handleSupabaseError(error, "deadline update")) {
      setProject({ ...project, overall_deadline: deadline });
      toast({ title: "納期を更新しました" });
      void queryClient.invalidateQueries({ queryKey: [PROJECT_AUDIT_LOG_QUERY_KEY] });
    }
  };

  const handleProcessDeadlineChange = async (processId: string, field: "client_deadline", value: string | null) => {
    await updateProcess(processId, { [field]: value } as Partial<ProjectProcess>);
    toast({ title: "クライアント期限を更新しました" });
  };

  const handleProcessStatusChange = async (processId: string, status: string) => {
    // 工程完了バリデーション: クライアント提出済み or FIX済みでないファイルがあれば完了不可
    if (status === "completed") {
      const proc = processes.find(p => p.id === processId);
      if (proc) {
        const processFiles = files.filter(f => f.process_type === proc.process_key && !f.parent_file_id);
        const blockers = processFiles.filter(f => {
          // Must be either client-submitted or fixed
          const isClientSubmitted = f.submission_type === "client";
          const isFixed = f.status === "fixed";
          return !(isClientSubmitted || isFixed);
        });
        if (blockers.length > 0) {
          toast({
            title: "工程を完了にできません",
            description: `クライアント提出済みまたはFIX済みでないファイルが${blockers.length}件あります。`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    await updateProcess(processId, { status } as Partial<ProjectProcess>);
    toast({ title: "工程ステータスを更新しました" });
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    const { error } = await supabase.rpc("delete_project_cascade", { p_project_id: id });
    if (error) {
      toast({ title: "削除エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "プロジェクトを削除しました" });
      queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
      navigate("/dashboard");
    }
  };

  // Sanitize filename for storage paths (ASCII only for Supabase Storage compatibility)
  const sanitizeFileName = (name: string): string => {
    const lastDot = name.lastIndexOf(".");
    const ext = lastDot > 0 ? name.slice(lastDot) : "";
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const safeName = base
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    return (safeName || `file_${Date.now()}`) + ext;
  };

  // Validate deadlines before allowing upload
  const canUploadToProcess = (processKey: string): string | null => {
    const overallDeadline = (project as any)?.overall_deadline;
    if (!overallDeadline) return "案件の納期が設定されていません。先に納期を設定してください。";
    const proc = processes.find(p => p.process_key === processKey);
    if (!proc) return "工程が見つかりません。";
    if (!proc.client_deadline) return `「${proc.process_label}」のクライアント期限が設定されていません。先に期限を設定してください。`;
    return null;
  };

  // Wrapper to validate deadlines before opening upload modal
  const openUploadModal = (processKey: string, patternId?: string | null, patternMode?: "common" | "specific") => {
    const err = canUploadToProcess(processKey);
    if (err) {
      toast({ title: "アップロード不可", description: err, variant: "destructive" });
      return;
    }
    setUploadModal(processKey);
    setUploadPatternId(patternId ?? null);
    setUploadPatternMode(patternMode ?? "common");
    setUseTextInput(false);
    setSelectedFiles([]);
  };

  const handleChangePattern = async (fileId: string, newPatternId: string | null) => {
    const { error } = await supabase.from("project_files").update({ pattern_id: newPatternId } as any).eq("id", fileId);
    if (error) {
      toast({ title: "エラー", description: "パターンの変更に失敗しました", variant: "destructive" });
    } else {
      toast({ title: "パターンを変更しました" });
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, pattern_id: newPatternId } : f));
    }
    setChangePatternTarget(null);
  };

  const getFileFormatHint = (processType: string): string => {
    const hints: Record<string, string> = {
      script: "TXT / DOCX",
      na_script: "TXT / DOCX",
      narration: `MP3 / WAV / M4A（最大${MAX_UPLOAD_LABEL}）`,
      bgm: `MP3 / WAV / M4A（最大${MAX_UPLOAD_LABEL}）`,
      vcon: `MP4 / MOV / WebM（最大${getUploadLimitLabel("vcon")}）`,
      styleframe: "JPG / PNG / PSD / AI",
      storyboard: "JPG / PNG / WebP / PDF / PSD",
      video_horizontal: `MP4 / MOV / WebM（最大${getUploadLimitLabel("video_horizontal")}）`,
      video_vertical: `MP4 / MOV / WebM（最大${getUploadLimitLabel("video_vertical")}）`,
      banner_design: "JPG / PNG / PDF / PSD / AI",
    };
    if (hints[processType]) return hints[processType];
    if (getFileCategory(processType) === "image") {
      return `JPG / PNG / WebP / PDF / PSD など（最大${MAX_UPLOAD_LABEL}）`;
    }
    if (getFileCategory(processType) === "video") {
      return `MP4 / MOV / WebM（最大${getUploadLimitLabel(processType)}）`;
    }
    if (getFileCategory(processType) === "audio") {
      return `MP3 / WAV / M4A（最大${MAX_UPLOAD_LABEL}）`;
    }
    return "TXT / DOCX など";
  };

  const isImageProcess = (processType: string) => {
    if (["styleframe", "storyboard", "banner_design"].includes(processType)) return true;
    return getFileCategory(processType) === "image";
  };

  // Drag & drop handlers for upload area
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const accept = getProcessFileUploadConfig(uploadModal || "").accept;
      const exts = accept.split(",").map(x => x.trim().toLowerCase());
      const valid = Array.from(files).filter(f => {
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        return exts.length === 0 || exts.includes(ext);
      });
      if (valid.length === 0) {
        toast({ title: "エラー", description: "対応していないファイル形式です", variant: "destructive" });
        return;
      }
      if (valid.length < files.length) {
        toast({ title: "一部のファイルをスキップしました", description: `対応形式: ${accept}` });
      }
      setSelectedFiles(valid);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadModal || !id || !user) return;
    setUploading(true);
    setUploadProgress(2);

    const cfg = getProcessFileUploadConfig(uploadModal);
    const usePerFilePatterns = patterns.length > 0 && selectedFiles.length > 1 && Object.keys(filePatternAssignments).length > 0;
    const resolvedPatternId = (patterns.length > 0 && uploadPatternMode === "specific") ? uploadPatternId : null;
    let lastInsertedFileId: string | null = null;
    let showedCopyDialog = false;
    const uploadProcessType = uploadModal;
    let uploadedInBatch = 0;

    try {
      if (useTextInput && cfg?.allowTextInput) {
        const fileData = uploadTextInput;
        const fileSize = new Blob([uploadTextInput]).size;
        const fileName = `${cfg?.label || uploadModal}_${Date.now()}.txt`;
        setUploadProgress(50);

        const { data: inserted, error } = await supabase.from("project_files").insert({
          project_id: id, process_type: uploadModal, file_name: fileName,
          file_type: "text", file_data: fileData, file_size_bytes: fileSize,
          created_by: user.email || user.id, pattern_id: resolvedPatternId,
          submission_type: uploadSubmissionType,
        } as any).select("id").single();
        if (error) throw error;
        lastInsertedFileId = inserted?.id || null;
        uploadedInBatch = 1;
        setUploadProgress(100);
        toast({ title: "アップロード完了" });
      } else if (selectedFiles.length > 0) {
        const total = selectedFiles.length;
        let lastFileData = "";
        let lastFileName = "";
        let lastFileType = "";
        let lastFileSize = 0;

        for (let i = 0; i < total; i++) {
          const file = selectedFiles[i];
          const sizeError = validateFileSize(file, uploadModal);
          if (sizeError) {
            toast({ title: "エラー", description: `${file.name}: ${sizeError}`, variant: "destructive" });
            continue;
          }

          const fileName = sanitizeFileName(file.name);
          const prepared = await prepareFileForUpload({
            file,
            processType: uploadModal,
            projectId: id,
            onProgress: (pct) => {
              const fileProgress = pct / 100;
              setUploadProgress(Math.round(((i + fileProgress) / total) * 90));
            },
          });

          const filePatternId = usePerFilePatterns ? (filePatternAssignments[i] ?? null) : resolvedPatternId;
          const { data: inserted, error } = await supabase.from("project_files").insert({
            project_id: id, process_type: uploadModal, file_name: fileName,
            file_type: prepared.fileType, file_data: prepared.fileData, file_size_bytes: prepared.fileSizeBytes,
            created_by: user.email || user.id, pattern_id: filePatternId,
            submission_type: uploadSubmissionType,
          } as any).select("id").single();
          if (error) throw error;

          uploadedInBatch += 1;
          lastInsertedFileId = inserted?.id || null;
          lastFileData = prepared.fileData;
          lastFileName = fileName;
          lastFileType = prepared.fileType;
          lastFileSize = prepared.fileSizeBytes;
          setUploadProgress(Math.round(((i + 1) / total) * 95));
        }

        setUploadProgress(100);
        toast({ title: `${total}件アップロード完了` });

        // Offer to copy to other patterns (uses last file info for single, skips for multi)
        if (resolvedPatternId && patterns.length > 1 && total === 1) {
          showedCopyDialog = true;
          setCopyToPatternInfo({
            sourcePatternId: resolvedPatternId,
            processType: uploadModal,
            fileData: lastFileData,
            fileName: lastFileName,
            fileType: lastFileType,
            fileSizeBytes: lastFileSize,
          });
        }
      } else {
        setUploading(false);
        setUploadProgress(null);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "アップロードに失敗しました";
      toast({ title: "アップロードエラー", description: message, variant: "destructive" });
      lastInsertedFileId = null;
      uploadedInBatch = 0;
    } finally {
      setUploading(false);
      setUploadProgress(null);

      const navigateTargetId = lastInsertedFileId;
      const navigateOk = Boolean(navigateTargetId && !showedCopyDialog && uploadedInBatch <= 1);
      const navigateProcessKey = uploadProcessType;

      const clearUploadUiAndRefresh = () => {
        setUploadModal(null);
        setSelectedFiles([]);
        setFilePatternAssignments({});
        setUploadTextInput("");
        setUseTextInput(false);
        setUploadPatternId(null);
        setUploadPatternMode("common");
        setUploadSubmissionType("internal");
        void fetchData();

        if (navigateOk && navigateTargetId) {
          const aiCfg = AI_CHECK_CONFIG[navigateProcessKey || ""];
          if (aiCfg?.enabled) {
            toast({ title: "アップロード完了", description: "レビュー画面でAIチェックを実行できます。" });
            setTimeout(() => navigate(`/project/${id}/file/${navigateTargetId}`), 500);
          }
        }
      };

      // Dialog Portal のアンマウントと fetchData による大規模再レンダーを同一ティックに重ねると
      // 「removeChild … not a child」が発生することがあるため、閉じる処理を次のタスクにずらす
      window.setTimeout(clearUploadUiAndRefresh, 0);
    }
  };

  const getFilesForProcess = (processKey: string) =>
    files.filter((f) => f.process_type === processKey && !f.parent_file_id);

  const handleProcessDragStart = (index: number) => { dragItem.current = index; };
  const handleProcessDragEnter = (index: number) => { dragOver.current = index; setDragOverIdx(index); };
  const handleProcessDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      setDragOverIdx(null); return;
    }
    const activeProcesses = processes.filter(p => p.is_active);
    const reordered = [...activeProcesses];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    reorderProcesses(reordered);
    dragItem.current = null; dragOver.current = null; setDragOverIdx(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!project || !product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">プロジェクトが見つかりません</div>;

  const statusCfg = PROJECT_STATUS_CONFIG[project.status || "in_progress"] || PROJECT_STATUS_CONFIG.in_progress;
  const creativeType = project.creative_type ?? "video";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 md:px-6 py-3 bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">
              {client?.name} &gt; {product.name} &gt; {project.name}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {editingProjectName ? (
                <form
                  className="flex items-center gap-1 min-w-0 flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveProjectName();
                  }}
                >
                  <Input
                    autoFocus
                    value={projectNameDraft}
                    onChange={(e) => setProjectNameDraft(e.target.value)}
                    onBlur={handleSaveProjectName}
                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingProjectName(false); } }}
                    className="text-base md:text-lg font-bold h-8 px-1"
                  />
                </form>
              ) : (
                <h1
                  className="text-base md:text-lg font-bold truncate cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors group flex items-center gap-1 min-w-0"
                  onClick={() => { setProjectNameDraft(project.name); setEditingProjectName(true); }}
                  title="クリックして編集"
                >
                  {project.name}
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </h1>
              )}
              {creativeType === "banner" ? (
                <Badge
                  variant="outline"
                  className="text-xs font-medium gap-1 shrink-0 border-0 bg-[#7C7AFF]/10 text-[#7C7AFF]"
                >
                  <ImageIcon className="h-3 w-3" aria-hidden />
                  静止画バナー
                </Badge>
              ) : creativeType === "mixed" ? (
                <Badge
                  variant="outline"
                  className="text-xs font-medium gap-1 shrink-0 border-0 bg-amber-500/10 text-amber-600 dark:text-amber-500"
                >
                  <LayoutGrid className="h-3 w-3" aria-hidden />
                  混合
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs font-medium gap-1 shrink-0 border-0 bg-primary/10 text-primary"
                >
                  <Video className="h-3 w-3" aria-hidden />
                  動画
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Deadline compliance badge */}
            {(() => {
              const overallDeadline = (project as any).overall_deadline;
              if (project.status === "completed" && overallDeadline) {
                const dl = new Date(overallDeadline + "T23:59:59");
                const completedAt = new Date(project.updated_at || "");
                const isLate = completedAt > dl;
                return (
                  <Badge className={cn("text-xs font-bold gap-1", isLate ? "bg-status-ng/10 text-status-ng border-status-ng" : "bg-status-ok/10 text-status-ok border-status-ok")} variant="outline">
                    {isLate ? <AlertTriangle className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
                    {isLate ? "遅延" : "納期遵守OK"}
                  </Badge>
                );
              }
              if (overallDeadline && !["completed"].includes(project.status || "")) {
                const dl = new Date(overallDeadline + "T23:59:59");
                if (isPast(dl)) {
                  return (
                    <Badge className="text-xs font-bold gap-1 bg-status-ng/10 text-status-ng border-status-ng" variant="outline">
                      <AlertTriangle className="h-3 w-3" />遅延
                    </Badge>
                  );
                }
              }
              return null;
            })()}
            <DeadlinePicker
              deadline={(project as any).overall_deadline ?? null}
              onChange={handleDeadlineChange}
            />
            {isStaff && id ? <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setCreatorInviteOpen(true)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                クリエイター招待
              </Button> : null}
            <NotificationBell />
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1 transition-colors hover:opacity-80", statusCfg.badgeClass)}>
                  {statusCfg.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="end">
                {Object.entries(PROJECT_STATUS_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => handleStatusChange(key)}
                    className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2",
                      project.status === key ? "bg-muted" : "hover:bg-muted/50")}>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotClass)} />
                    {cfg.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>プロジェクトを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{project.name}」を削除します。関連するファイル・工程データも全て削除されます。この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="files">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="files">ファイル一覧</TabsTrigger>
            <TabsTrigger value="audit">変更履歴</TabsTrigger>
            <TabsTrigger value="history">チェック履歴</TabsTrigger>
            <TabsTrigger value="patterns">修正パターン</TabsTrigger>
            <TabsTrigger value="rules">チェックルール</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-6">

            {project ? <div className="glass-card p-6 text-center space-y-3">
                <div className="mx-auto w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">ナレッジ・チェックルール管理</p>
                  <p className="text-xs text-muted-foreground leading-tight">
                    ナレッジの追加・編集は Ad Brain で行います。
                    <br />
                    Ad Brain で登録したナレッジを元にチェックルールが生成され
                    <br />
                    自動的に本案件のAIチェックに反映されます。
                  </p>
                </div>
                <a
                  href={`${AD_BRAIN_URL}/projects/${project.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Ad Brain でナレッジを確認
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div> : null}

            {creativeType === "mixed" && (
              <Tabs
                value={mixedProcessTab}
                onValueChange={(v) => setMixedProcessTab(v as "banner" | "video")}
                className="w-full"
              >
                <TabsList className="w-full sm:w-auto h-auto p-0 bg-transparent rounded-none border-b border-border justify-start gap-0 mb-1">
                  <TabsTrigger
                    value="banner"
                    className="rounded-none border-b-2 border-transparent bg-transparent shadow-none px-4 py-2 gap-1.5 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    静止画バナー
                  </TabsTrigger>
                  <TabsTrigger
                    value="video"
                    className="rounded-none border-b-2 border-transparent bg-transparent shadow-none px-4 py-2 gap-1.5 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    動画
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {isStaff && id ? <ProjectCreatorCollaboratorsSection projectId={id} refreshKey={creatorCollabRefreshKey} /> : null}

            {/* Pattern management header – compact */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-muted-foreground">
                  ■ 進捗 {patterns.length > 0 && `(${patterns.length}パターン)`}
                </h2>
                <div className="flex items-center border border-border rounded h-6 overflow-hidden">
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn("px-1.5 h-full flex items-center transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                    title="リスト表示"
                  >
                    <List className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setViewMode("matrix")}
                    className={cn("px-1.5 h-full flex items-center transition-colors", viewMode === "matrix" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                    title="マトリクス表示"
                  >
                    <Grid3X3 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setAddPatternOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-2" />パターン追加
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBulkPatternOpen(true)}>
                    <Layers className="h-3.5 w-3.5 mr-2" />一括生成
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setProcessModalOpen(true)}>
                    <Settings className="h-3.5 w-3.5 mr-2" />工程管理
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Conditional: matrix view vs legacy list */}
            {patterns.length > 0 && viewMode === "matrix" ? (
              <PatternMatrix
                projectId={id!}
                patterns={patterns}
                processes={processesForPatternMatrix}
                files={files}
                checkResults={checkResults}
                renderProcessHeaderExtra={renderProcessAiExtra}
                onUpload={(processKey, patternId) => {
                  openUploadModal(processKey, patternId, patternId ? "specific" : "common");
                }}
                onUpdatePattern={updatePattern}
                onDeletePattern={deletePattern}
                onToggleProcessCommon={async (processId, isCommon) => {
                  const ok = await updateProcess(processId, { is_common: isCommon } as Partial<ProjectProcess>);
                  if (ok) toast({ title: isCommon ? "共通素材に移動しました" : "パターン別に移動しました" });
                  return !!ok;
                }}
                onChangeFilePattern={async (fileId, newPatternId) => {
                  await handleChangePattern(fileId, newPatternId);
                }}
              />
            ) : (
              /* Legacy list view (no patterns) */
              <>
                {displayActiveProcesses.map((proc, index) => {
                  const sectionFiles = getFilesForProcess(proc.process_key);
                  const psCfg = PROCESS_STATUS_CONFIG[proc.status] || PROCESS_STATUS_CONFIG.preparing;
                  const webhookAvailable = !!AI_CHECK_CONFIG[proc.process_key]?.enabled;

                  const isCollapsed = collapsedProcesses.has(proc.id);
                  const toggleCollapse = () => {
                    setCollapsedProcesses(prev => {
                      const next = new Set(prev);
                      if (next.has(proc.id)) next.delete(proc.id); else next.add(proc.id);
                      return next;
                    });
                  };
                  const fileCount = sectionFiles.filter(f => !f.parent_file_id).length;
                  const checkedCount = sectionFiles.filter(f => f.status === "checked" || f.status === "fixed").length;

                  const isProcessCompleted = proc.status === "completed";
                  // Also treat as "completed" if all root files are client-submitted or fixed
                  const rootFiles = sectionFiles.filter(f => !f.parent_file_id);
                  const allSubmittedOrFixed = rootFiles.length > 0 && rootFiles.every(f => f.status === "fixed" || (f as any).submission_type === "client");
                  const isDeadlineMet = isProcessCompleted || allSubmittedOrFixed;

                    return (
                    <div
                      key={proc.id}
                    className={cn("glass-card overflow-hidden transition-all relative",
                      (isProcessCompleted || (sectionFiles.length > 0 && sectionFiles.filter(f => !f.parent_file_id).every(f => f.status === "fixed"))) && "border-muted-foreground/30")}
                    >
                      {/* Completed / All-FIX overlay */}
                      {(() => {
                        const rootFiles = sectionFiles.filter(f => !f.parent_file_id);
                        const allFixed = rootFiles.length > 0 && rootFiles.every(f => f.status === "fixed");
                        if ((isProcessCompleted || allFixed) && isCollapsed) {
                          return (
                            <div className="absolute inset-0 bg-foreground/30 z-10 pointer-events-none rounded-lg flex items-center justify-center">
                              <span className="bg-muted-foreground/90 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 pointer-events-none">
                                <Lock className="h-3 w-3" /> 全FIX済
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <div className="px-4 py-3 border-b border-border cursor-pointer select-none"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button, [role='combobox'], [data-radix-popper-content-wrapper]")) return;
                          toggleCollapse();
                        }}>
                        {/* Row 1: collapse arrow + number + process name + deadline + FIX progress */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}>
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {String.fromCodePoint(0x2460 + index)}
                          </span>
                          {editingProcessId === proc.id ? (
                            <form
                              className="flex items-center"
                              onSubmit={(e) => { e.preventDefault(); handleSaveProcessLabel(proc.id); }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                autoFocus
                                value={processLabelDraft}
                                onChange={(e) => setProcessLabelDraft(e.target.value)}
                                onBlur={() => handleSaveProcessLabel(proc.id)}
                                onKeyDown={(e) => { if (e.key === "Escape") setEditingProcessId(null); }}
                                className="text-sm font-semibold h-7 w-32 px-1"
                              />
                            </form>
                          ) : (
                            <h2
                              className="text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors group/proc flex items-center gap-1"
                              onClick={(e) => { e.stopPropagation(); setProcessLabelDraft(proc.process_label); setEditingProcessId(proc.id); }}
                              title="クリックして編集"
                            >
                              {proc.process_label}
                              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/proc:opacity-100 transition-opacity shrink-0" />
                            </h2>
                          )}

                          <DeadlinePicker
                            deadline={proc.client_deadline}
                            onChange={(d) => handleProcessDeadlineChange(proc.id, "client_deadline", d)}
                            isCompleted={isDeadlineMet}
                            label="期限"
                          />

                          {/* FIX progress */}
                          {fileCount > 0 && (() => {
                            const fixedCount = sectionFiles.filter(f => !f.parent_file_id && f.status === "fixed").length;
                            const allFixed = fixedCount === fileCount;
                            return (
                              <div className="flex items-center gap-1.5 ml-auto">
                                <Progress value={(fixedCount / fileCount) * 100} className="w-16 h-1.5" />
                                <span className={cn("text-[10px] font-medium tabular-nums", allFixed ? "text-status-ok" : "text-muted-foreground")}>
                                  {fixedCount}/{fileCount} FIX
                                </span>
                              </div>
                            );
                          })()}

                          {renderProcessAiExtra(proc.process_key)}

                          {!webhookAvailable && (
                            <Badge variant="outline" className="text-[9px] ml-1 text-muted-foreground">準備中</Badge>
                          )}
                        </div>

                        {/* Row 2: action buttons (only when expanded) */}
                        {!isCollapsed && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                           {webhookAvailable && sectionFiles.filter(f => f.file_data && !f.parent_file_id).length > 0 ? (() => {
                            const allTargets = sectionFiles.filter(
                              (f) =>
                                f.file_data &&
                                !f.parent_file_id &&
                                f.project_id === id &&
                                (f.process_type || "script") === proc.process_key
                            );
                            // Sort by pattern order (left to right), then by created_at within same pattern
                            const patternOrderMap = new Map<string | null, number>();
                            patterns.forEach((p, idx) => patternOrderMap.set(p.id, idx));
                            const sortedTargets = [...allTargets].sort((a, b) => {
                              const aOrder = patternOrderMap.get(a.pattern_id ?? null) ?? -1;
                              const bOrder = patternOrderMap.get(b.pattern_id ?? null) ?? -1;
                              if (aOrder !== bOrder) return aOrder - bOrder;
                              return (a.created_at ?? "").localeCompare(b.created_at ?? "");
                            });
                            const selectedInSection = sortedTargets.filter(f => selectedFileIds.has(f.id));
                            const uncheckedTargets = sortedTargets.filter(f => f.status === "uploaded");
                            const selectedUploaded = selectedInSection.filter(f => f.status === "uploaded");
                            const hasSelection = selectedInSection.length > 0;
                            const actualTargets = hasSelection ? selectedUploaded : uncheckedTargets;
                            // Apply video limits
                            const VIDEO_LIMITS: Record<string, number> = { vcon: 3, video_horizontal: 1, video_vertical: 1 };
                            const videoLimit = VIDEO_LIMITS[proc.process_key];
                            const MAX_BATCH = videoLimit ? Math.min(5, videoLimit) : 5;
                            const overLimit = actualTargets.length > MAX_BATCH;
                            const label = hasSelection
                              ? `選択分AIチェック (${selectedUploaded.length}${overLimit ? `/最大${MAX_BATCH}` : ""})`
                              : `一括AIチェック (${Math.min(uncheckedTargets.length, MAX_BATCH)}/${uncheckedTargets.length})`;
                            const limitedTargets = actualTargets.slice(0, MAX_BATCH);
                            const sectionRootFiles = sectionFiles.filter(f => !f.parent_file_id);
                            const sectionIsChecking = sectionRootFiles.some((f) => f.status === "checking");
                            const currentFileInThisSection =
                              Boolean(bulkSequentialProgress?.currentFileId) &&
                              sectionRootFiles.some((f) => f.id === bulkSequentialProgress?.currentFileId);
                            const thisSectionBulkRunning =
                              bulkSequentialProgress?.status === "running" &&
                              bulkSequentialProgress.projectId === id &&
                              bulkSequentialProgress.processType === proc.process_key;
                            const isButtonLoading =
                              sectionIsChecking || currentFileInThisSection || thisSectionBulkRunning;
                            const isOtherBulkRunning =
                              bulkSequentialProgress?.status === "running" && !thisSectionBulkRunning;

                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1"
                                disabled={
                                  isOtherBulkRunning ||
                                  actualTargets.length === 0 ||
                                  (hasSelection && selectedUploaded.length === 0)
                                }
                                onClick={() => {
                                  if (!product || !id || !project) return;
                                  if (hasSelection && selectedUploaded.length === 0) {
                                    toast({
                                      title: "対象がありません",
                                      description: "未チェック（アップロード済み）のファイルのみ一括実行できます。",
                                    });
                                    return;
                                  }
                                  if (overLimit) {
                                    toast({ title: `最大${MAX_BATCH}件まで一括チェック可能です`, description: `先頭${MAX_BATCH}件をチェックします。`, variant: "default" });
                                  }
                                  const processLabel =
                                    processLabelByKey[proc.process_key] ?? proc.process_label ?? proc.process_key;
                                  runBatchCheck(
                                    limitedTargets,
                                    product,
                                    client,
                                    id,
                                    { projectName: project.name, processLabel, processType: proc.process_key },
                                    () => {
                                      void fetchData();
                                      setSelectedFileIds(new Set());
                                      setSelectMode(false);
                                    }
                                  );
                                }}
                              >
                                {isButtonLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Bot className="h-3 w-3" />
                                )}
                                {label}
                              </Button>
                            );
                          })() : null}
                          {sectionFiles.some(f => f.check_result_id && !f.parent_file_id && f.status !== "fixed") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-muted-foreground text-muted-foreground hover:bg-muted"
                              disabled={batchFixing}
                              onClick={() => handleBatchFix(sectionFiles, proc.process_key)}
                            >
                              {batchFixing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Lock className="h-3 w-3" />
                              )}
                              一括FIX ({sectionFiles.filter(f => f.check_result_id && !f.parent_file_id && f.status !== "fixed").length})
                            </Button>
                          )}
                          {(() => {
                            const eligibleForSubmit = sectionFiles.filter(f => f.check_result_id && !f.parent_file_id && f.submission_type !== "client" && f.status !== "fixed");
                            return eligibleForSubmit.length > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1 border-primary/50 text-primary hover:bg-primary/10"
                                onClick={async () => {
                                  const confirmed = window.confirm(
                                    `この工程のチェック済み${eligibleForSubmit.length}件をクライアント提出済みに変更しますか？\nこの操作は品質レポートに反映されます。`
                                  );
                                  if (!confirmed) return;
                                  try {
                                    for (const f of eligibleForSubmit) {
                                      await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", f.id);
                                    }
                                    setFiles(prev => prev.map(f => eligibleForSubmit.some(e => e.id === f.id) ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
                                    toast({ title: `${eligibleForSubmit.length}件をクライアント提出済みに変更しました` });
                                  } catch (err) {
                                    toast({ title: "提出変更エラー", variant: "destructive" });
                                  }
                                }}
                              >
                                <Send className="h-3 w-3" />
                                一括提出 ({eligibleForSubmit.length})
                              </Button>
                            ) : null;
                          })()}
                          {sectionFiles.length > 0 && (
                            <Button size="sm" variant={selectMode ? "default" : "outline"} className="text-xs h-7 gap-1"
                              onClick={() => {
                                setSelectMode(!selectMode);
                                setSelectedFileIds(new Set());
                              }}>
                              <CheckSquare className="h-3 w-3" />
                              {selectMode ? "選択解除" : "選択"}
                            </Button>
                          )}
                          {selectMode && selectedFileIds.size > 0 ? <>
                              {(() => {
                                const selectedInProc = sectionFiles.filter(f => selectedFileIds.has(f.id));
                                const eligibleCount = selectedInProc.filter(f => f.check_result_id && f.submission_type !== "client").length;
                                return eligibleCount > 0 ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-primary/50 text-primary hover:bg-primary/10"
                                    onClick={handleBulkSubmitToClient}>
                                    <Send className="h-3 w-3" />
                                    {eligibleCount}件提出
                                  </Button>
                                ) : null;
                              })()}
                              <Button size="sm" variant="destructive" className="text-xs h-7 gap-1"
                                onClick={handleBulkDelete}>
                                <Trash2 className="h-3 w-3" />
                                {selectedFileIds.size}件削除
                              </Button>
                            </> : null}
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openUploadModal(proc.process_key)}>
                            <Plus className="h-3 w-3 mr-1" />アップロード
                          </Button>
                          </div>
                        )}
                        {isCollapsed && fileCount === 0 ? <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => openUploadModal(proc.process_key)}>
                              <Plus className="h-3 w-3 mr-1" />アップロード
                            </Button>
                          </div> : null}
                      </div>
                      {!isCollapsed && (
                      <div className="p-4">
                        {sectionFiles.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic py-4 text-center">ファイルなし — アップロードしてください</p>
                        ) : (() => {
                          // Group files by pattern
                          const groupedFiles: { label: string; files: ProjectFile[] }[] = [];
                          if (patterns.length > 0) {
                            const patternMap = new Map<string | null, ProjectFile[]>();
                            for (const f of sectionFiles) {
                              const key = f.pattern_id || null;
                              if (!patternMap.has(key)) patternMap.set(key, []);
                              patternMap.get(key)!.push(f);
                            }
                            // Common files first
                            const commonFiles = patternMap.get(null);
                            if (commonFiles && commonFiles.length > 0) {
                              groupedFiles.push({ label: "共通", files: commonFiles });
                            }
                            // Then by pattern
                            for (const p of patterns) {
                              const pFiles = patternMap.get(p.id);
                              if (pFiles && pFiles.length > 0) {
                                groupedFiles.push({ label: p.name, files: pFiles });
                              }
                            }
                          } else {
                            groupedFiles.push({ label: "", files: sectionFiles });
                          }

                          return (
                            <div>
                              {patterns.length > 0 ? (
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                  {groupedFiles.map((group, gi) => (
                                    <div key={gi} className="min-w-[160px] max-w-[200px] flex-shrink-0">
                                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] font-bold">{group.label}</Badge>
                                        <span className="text-[9px] text-muted-foreground/60">{group.files.length}件</span>
                                      </h4>
                                      <div className="space-y-2">
                                    {group.files.map((file) => {
                                      const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                                      const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                                      const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                                      const childVersions = files.filter(f => f.parent_file_id === file.id);
                                      const thumbnailData = (childVersions.length > 0
                                        ? childVersions.sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]?.file_data
                                        : null) || file.file_data;
                                      const draftCount = 1 + childVersions.length;
                                      const draftLabel = draftCount === 1 ? "初稿" : `第${draftCount}稿`;
                                      const isSelected = selectedFileIds.has(file.id);

                                      return (
                                        <div key={file.id} className="relative group">
                                          {selectMode ? <div className="absolute top-1 left-1 z-20" onClick={(e) => e.stopPropagation()}>
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                  setSelectedFileIds(prev => {
                                                    const next = new Set(prev);
                                                    if (checked) next.add(file.id); else next.delete(file.id);
                                                    return next;
                                                  });
                                                }}
                                              />
                                            </div> : null}
                                          <button onClick={() => {
                                              if (selectMode) {
                                                setSelectedFileIds(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                                                  return next;
                                                });
                                              } else {
                                                navigate(`/project/${id}/file/${getLatestVersionId(file, files)}`);
                                              }
                                            }}
                                            className={cn("glass-card p-2 text-left w-full relative overflow-hidden thumbnail-hover",
                                              file.status === "fixed" && "border-muted-foreground/30 ring-1 ring-muted-foreground/20",
                                              isSelected && selectMode && "ring-2 ring-primary border-primary/50"
                                            )}>
                                            {file.status === "fixed" && (
                                              <>
                                                <div className="absolute inset-0 bg-foreground/50 rounded-lg z-[1] pointer-events-none" />
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 bg-muted-foreground/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                                                  <Lock className="h-2.5 w-2.5" /> FIX済
                                                </div>
                                              </>
                                            )}
                                            <FileRowThumbnail
                                              fileType={file.file_type}
                                              processKey={proc.process_key}
                                              thumbnailData={thumbnailData}
                                              className="mb-1.5"
                                            />
                                            {editingFileId === file.id ? (
                                              <form onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, editFileName); }}
                                                onClick={(e) => e.stopPropagation()}>
                                                <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                                                  className="h-5 text-xs w-full" autoFocus
                                                  onBlur={() => handleRenameFile(file.id, editFileName)}
                                                  onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                                              </form>
                                            ) : (
                                              <p className="text-xs font-medium truncate flex items-center gap-1 group/name">
                                                <span className="truncate">{file.file_name}</span>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingFileId(file.id); setEditFileName(file.file_name); }}
                                                  className="opacity-0 group-hover/name:opacity-100 shrink-0 text-muted-foreground/50 hover:text-primary transition-all">
                                                  <Pencil className="h-2.5 w-2.5" />
                                                </button>
                                              </p>
                                            )}
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                              <span className="text-[10px] text-muted-foreground">{draftLabel}</span>
                                              {cr && file.status !== "fixed" && hasFinalOverallStatus(cr.overall_status) ? <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-sm", getSubmitBadgeClass(cr.overall_status))}>
                                                  {getSubmitLabel(cr.overall_status).label}
                                                </span> : null}
                                              {cc > 0 && (
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                                                  <MessageCircle className="h-2.5 w-2.5" />{cc}
                                                </span>
                                              )}
                                            </div>
                                          </button>
                                          {!selectMode && (
                                            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <button className="w-6 h-6 rounded-full bg-muted/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-muted">
                                                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                                  </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40">
                                                  {patterns.length > 0 && (
                                                    <>
                                                      <DropdownMenuItem onClick={() => setChangePatternTarget(file)}>
                                                        <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />パターン変更
                                                      </DropdownMenuItem>
                                                      <DropdownMenuSeparator />
                                                    </>
                                                  )}
                                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ file, hasCheck: !!cr })}>
                                                    <Trash2 className="h-3.5 w-3.5 mr-2" />削除
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                  {groupedFiles[0]?.files.map((file) => {
                                    const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                                    const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                                    const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                                    const childVersions = files.filter(f => f.parent_file_id === file.id);
                                    const thumbnailData = (childVersions.length > 0
                                      ? childVersions.sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]?.file_data
                                      : null) || file.file_data;
                                    const draftCount = 1 + childVersions.length;
                                    const draftLabel = draftCount === 1 ? "初稿" : `第${draftCount}稿`;
                                    const isSelected = selectedFileIds.has(file.id);

                                    return (
                                      <div key={file.id} className="relative group">
                                        {selectMode ? <div className="absolute top-1 left-1 z-20" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={(checked) => {
                                                setSelectedFileIds(prev => {
                                                  const next = new Set(prev);
                                                  if (checked) next.add(file.id); else next.delete(file.id);
                                                  return next;
                                                });
                                              }}
                                            />
                                          </div> : null}
                                        <button onClick={() => {
                                            if (selectMode) {
                                              setSelectedFileIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                                                return next;
                                              });
                                            } else {
                                              navigate(`/project/${id}/file/${getLatestVersionId(file, files)}`);
                                            }
                                          }}
                                          className={cn("glass-card p-2 text-left w-full relative overflow-hidden thumbnail-hover",
                                            file.status === "fixed" && "border-muted-foreground/30 ring-1 ring-muted-foreground/20",
                                            isSelected && selectMode && "ring-2 ring-primary border-primary/50"
                                          )}>
                                          {file.status === "fixed" && (
                                            <>
                                              <div className="absolute inset-0 bg-foreground/50 rounded-lg z-[1] pointer-events-none" />
                                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 bg-muted-foreground/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                                                <Lock className="h-2.5 w-2.5" /> FIX済
                                              </div>
                                            </>
                                          )}
                                          <FileRowThumbnail
                                            fileType={file.file_type}
                                            processKey={proc.process_key}
                                            thumbnailData={thumbnailData}
                                            className="mb-1.5"
                                          />
                                          {editingFileId === file.id ? (
                                            <form onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, editFileName); }}
                                              onClick={(e) => e.stopPropagation()}>
                                              <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                                                className="h-5 text-xs w-full" autoFocus
                                                onBlur={() => handleRenameFile(file.id, editFileName)}
                                                onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                                            </form>
                                          ) : (
                                            <p className="text-xs font-medium truncate flex items-center gap-1 group/name">
                                              <span className="truncate">{file.file_name}</span>
                                              <button onClick={(e) => { e.stopPropagation(); setEditingFileId(file.id); setEditFileName(file.file_name); }}
                                                className="opacity-0 group-hover/name:opacity-100 shrink-0 text-muted-foreground/50 hover:text-primary transition-all">
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            </p>
                                          )}
                                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                                            <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                            <span className="text-[10px] text-muted-foreground">{draftLabel}</span>
                                            {cr && file.status !== "fixed" && hasFinalOverallStatus(cr.overall_status) ? <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-sm", getSubmitBadgeClass(cr.overall_status))}>
                                                {getSubmitLabel(cr.overall_status).label}
                                              </span> : null}
                                            {cc > 0 && (
                                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                                                <MessageCircle className="h-2.5 w-2.5" />{cc}
                                              </span>
                                            )}
                                          </div>
                                        </button>
                                        {!selectMode && (
                                          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <button className="w-6 h-6 rounded-full bg-muted/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-muted">
                                                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" className="w-40">
                                                {patterns.length > 0 && (
                                                  <>
                                                    <DropdownMenuItem onClick={() => setChangePatternTarget(file)}>
                                                      <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />パターン変更
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                  </>
                                                )}
                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ file, hasCheck: !!cr })}>
                                                  <Trash2 className="h-3.5 w-3.5 mr-2" />削除
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </TabsContent>

          <TabsContent value="audit">
            {id ? <ProjectAuditLog projectId={id} /> : null}
          </TabsContent>

          <TabsContent value="history">
            <CheckHistory projectId={id!} files={files} checkResults={checkResults} onRenameFile={handleRenameFile} patterns={patterns} processLabelByKey={processLabelByKey} />
          </TabsContent>

          <TabsContent value="patterns">
            <TopCorrectionPatterns productCode={product.code} limit={10} />
          </TabsContent>

          <TabsContent value="rules">
            {product ? <CheckRulesTab productId={product.id} /> : null}
          </TabsContent>

        </Tabs>
      </div>

      {/* File delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ファイルを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.file.file_name}」を削除します。この操作は元に戻せません。
              {deleteTarget?.hasCheck ? <span className="block mt-2 text-status-warning font-medium">
                  ⚠️ チェック結果も同時に削除されます。
                </span> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
               onClick={async () => {
                if (!deleteTarget) return;
                const f = deleteTarget.file;
                try {
                  // Delete from storage if applicable
                  await removeStorageFileFromPublicUrl(f.file_data);
                  // Manual cascade: unlink check_result, delete children, then delete file
                  const checkResultId = f.check_result_id;
                  if (checkResultId) {
                    // Unlink check_result from file first to avoid trigger conflict
                    await supabase.from("project_files").update({ check_result_id: null }).eq("id", f.id);
                  }
                  // Delete child files (versions)
                  await supabase.from("project_files").delete().eq("parent_file_id", f.id);
                  // Delete check_result (cascade trigger handles comments, share_links, etc.)
                  if (checkResultId) {
                    await supabase.from("check_results").delete().eq("id", checkResultId);
                  }
                  // Finally delete the file itself
                  const { error } = await supabase.from("project_files").delete().eq("id", f.id);
                  if (error) throw error;
                  toast({ title: "ファイルを削除しました" });
                  setFiles(prev => prev.filter(pf => pf.id !== f.id && pf.parent_file_id !== f.id));
                } catch (err) {
                  toast({ title: "削除エラー", description: err instanceof Error ? err.message : "削除に失敗しました", variant: "destructive" });
                }
                setDeleteTarget(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change pattern dialog */}
      <Dialog open={!!changePatternTarget} onOpenChange={(o) => !o && setChangePatternTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>パターン変更</DialogTitle></DialogHeader>
          {changePatternTarget ? <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                「{changePatternTarget.file_name}」の所属パターンを変更します
              </p>
              <div className="space-y-1.5">
                <Button
                  variant={!changePatternTarget.pattern_id ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleChangePattern(changePatternTarget.id, null)}
                >
                  全パターン共通
                  {!changePatternTarget.pattern_id && <span className="ml-auto text-[10px] text-muted-foreground">（現在）</span>}
                </Button>
                {patterns.map(p => (
                  <Button
                    key={p.id}
                    variant={changePatternTarget.pattern_id === p.id ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => handleChangePattern(changePatternTarget.id, p.id)}
                  >
                    {p.name}{p.description ? ` — ${p.description}` : ""}
                    {changePatternTarget.pattern_id === p.id && <span className="ml-auto text-[10px] text-muted-foreground">（現在）</span>}
                  </Button>
                ))}
              </div>
            </div> : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!submissionChangeTarget} onOpenChange={(o) => !o && setSubmissionChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>クライアント提出に変更</AlertDialogTitle>
            <AlertDialogDescription>
              このファイルを「クライアント提出」としてマークします。このファイルを「クライアント提出」としてマークします。品質レポートに反映されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (submissionChangeTarget) {
                handleChangeSubmissionType(submissionChangeTarget);
                setSubmissionChangeTarget(null);
              }
            }}>
              変更する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload modal */}
      <Dialog open={!!uploadModal} onOpenChange={(o) => !o && setUploadModal(null)}>
        <DialogContent className={cn("max-w-md", patterns.length > 0 && selectedFiles.length > 1 && "max-w-lg")}>
          <DialogHeader><DialogTitle>ファイルアップロード</DialogTitle></DialogHeader>
          <div className="space-y-4">

            <div className="space-y-2">
              <Label className="text-xs font-medium">工程</Label>
              <Select
                value={uploadModal || ""}
                onValueChange={(v) => {
                  setUploadModal(v);
                  setSelectedFiles([]);
                  setUploadTextInput("");
                  setFilePatternAssignments({});
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="工程を選択" />
                </SelectTrigger>
                <SelectContent>
                  {uploadProcessOptions.map((p) => (
                    <SelectItem key={p.id} value={p.process_key} className="text-xs">
                      {p.process_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>



            {/* Pattern selection (only when patterns exist) */}
            {patterns.length > 0 && selectedFiles.length <= 1 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">対象</Label>
                <RadioGroup value={uploadPatternMode} onValueChange={(v) => setUploadPatternMode(v as "common" | "specific")} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="common" id="pattern-common" />
                    <Label htmlFor="pattern-common" className="text-xs">全パターン共通</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="pattern-specific" />
                    <Label htmlFor="pattern-specific" className="text-xs">特定パターン</Label>
                  </div>
                </RadioGroup>
                {uploadPatternMode === "specific" && (
                  <Select value={uploadPatternId || ""} onValueChange={setUploadPatternId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="パターンを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {patterns.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}{p.description ? ` — ${p.description}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Per-file pattern assignment (when patterns exist and multiple files selected) */}
            {patterns.length > 0 && selectedFiles.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">パターン割り当て</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                      onClick={() => {
                        const assignments: Record<number, string | null> = {};
                        selectedFiles.forEach((_, i) => { assignments[i] = null; });
                        setFilePatternAssignments(assignments);
                      }}>全て共通</Button>
                    {patterns.map(p => (
                      <Button key={p.id} size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                        onClick={() => {
                          const assignments: Record<number, string | null> = {};
                          selectedFiles.forEach((_, i) => { assignments[i] = p.id; });
                          setFilePatternAssignments(assignments);
                        }}>全て{p.name}</Button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-xs truncate flex-1 min-w-0" title={file.name}>{file.name}</span>
                      <Select value={filePatternAssignments[i] ?? "__common__"} onValueChange={(v) => {
                        setFilePatternAssignments(prev => ({ ...prev, [i]: v === "__common__" ? null : v }));
                      }}>
                        <SelectTrigger className="h-7 text-xs w-[140px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__common__" className="text-xs">共通</SelectItem>
                          {patterns.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {getProcessFileUploadConfig(uploadModal || "").allowTextInput ? <div className="flex gap-2">
                <Button size="sm" variant={useTextInput ? "outline" : "default"} onClick={() => setUseTextInput(false)} className="text-xs">ファイル選択</Button>
                <Button size="sm" variant={useTextInput ? "default" : "outline"} onClick={() => setUseTextInput(true)} className="text-xs">テキスト直接入力</Button>
              </div> : null}
            {useTextInput && getProcessFileUploadConfig(uploadModal || "").allowTextInput ? (
              <Textarea value={uploadTextInput} onChange={(e) => setUploadTextInput(e.target.value)}
                placeholder="テキストを入力..." className="min-h-[150px] text-sm font-mono" />
            ) : (
              <div onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                className={cn("border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                  isDragOver ? "border-primary bg-primary/5" : "border-border",
                  uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50")}>
                <Upload className={cn("h-8 w-8 mx-auto mb-2", isDragOver ? "text-primary" : "text-muted-foreground")} />
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length > 0 ? (
                    selectedFiles.length === 1
                      ? <span>{selectedFiles[0].name} <span className="text-muted-foreground/60">({formatFileSize(selectedFiles[0].size)})</span></span>
                      : <span>{selectedFiles.length}件のファイルを選択中</span>
                  ) : (
                    isDragOver ? "ドロップしてアップロード" : "クリックまたはドラッグ＆ドロップ（複数可）"
                  )}
                </p>
                {selectedFiles.length > 1 && (
                  <div className="mt-2 text-xs text-muted-foreground/60 space-y-0.5">
                    {selectedFiles.map((f, i) => (
                      <p key={i}>{f.name} ({formatFileSize(f.size)})</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">{getFileFormatHint(uploadModal || "")}</p>
                <input ref={fileInputRef} type="file" className="hidden"
                  accept={getProcessFileUploadConfig(uploadModal || "").accept}
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) setSelectedFiles(Array.from(files));
                  }} />
              </div>
            )}
            {uploading && uploadProgress !== null ? <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>アップロード中...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div> : null}
            <Button onClick={handleFileUpload} disabled={uploading || (selectedFiles.length === 0 && !uploadTextInput.trim())} className="w-full">
              {uploading ? "アップロード中..." : "アップロード"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pattern dialogs */}
      <AddPatternDialog open={addPatternOpen} onOpenChange={setAddPatternOpen} onAdd={addPattern} />
      <BulkPatternDialog open={bulkPatternOpen} onOpenChange={setBulkPatternOpen} onGenerate={addPatternsBulk} />

      {/* Process management modal */}
      <ProcessManagementModal
        open={processModalOpen}
        onOpenChange={setProcessModalOpen}
        processes={processesForManagementModal}
        onUpdate={updateProcess}
        onReorder={handleProcessManagementReorder}
        onAdd={handleProcessManagementAdd}
        onDelete={deleteProcess}
        onReset={resetToDefaults}
      />

      {/* Copy to other patterns dialog */}
      {copyToPatternInfo ? <CopyToPatternDialog
          open={!!copyToPatternInfo}
          onOpenChange={(o) => { if (!o) setCopyToPatternInfo(null); }}
          sourcePattern={patterns.find(p => p.id === copyToPatternInfo.sourcePatternId)!}
          allPatterns={patterns}
          processLabel={
            dedupedProcesses.find(p => p.process_key === copyToPatternInfo.processType)?.process_label || copyToPatternInfo.processType
          }
          onConfirm={async (targetIds) => {
            if (!id || !user) return;
            const rows = targetIds.map(patId => ({
              project_id: id,
              process_type: copyToPatternInfo.processType,
              file_name: copyToPatternInfo.fileName,
              file_type: copyToPatternInfo.fileType,
              file_data: copyToPatternInfo.fileData,
              file_size_bytes: copyToPatternInfo.fileSizeBytes,
              created_by: user.email || user.id,
              pattern_id: patId,
            }));
            const { error } = await supabase.from("project_files").insert(rows as any);
            if (error) {
              toast({ title: "コピーエラー", description: error.message, variant: "destructive" });
            } else {
              toast({ title: `${targetIds.length}件のパターンにコピーしました` });
              fetchData();
            }
            setCopyToPatternInfo(null);
          }}
        /> : null}

      {isStaff && id ? <CreatorInviteModal
          projectId={id}
          open={creatorInviteOpen}
          onOpenChange={setCreatorInviteOpen}
          onInvitesChanged={() => setCreatorCollabRefreshKey((k) => k + 1)}
        /> : null}
    </div>
  );
}

function CheckHistory({ projectId, files, checkResults, onRenameFile, patterns, processLabelByKey }: {
  projectId: string;
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }>;
  onRenameFile: (fileId: string, newName: string) => Promise<void>;
  patterns: { id: string; name: string }[];
  processLabelByKey: Record<string, string>;
}) {
  const navigate = useNavigate();
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const filesWithChecks = files.filter(f => f.check_result_id && checkResults[f.check_result_id]);

  useEffect(() => {
    const userIds = [...new Set(filesWithChecks.map(f => checkResults[f.check_result_id!]?.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) return;
    supabase.rpc("get_profiles_by_ids", { p_ids: userIds }).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p: { id: string; display_name: string; email: string }) => {
          map[p.id] = p.display_name || p.email?.split("@")[0] || "不明";
        });
        setProfileMap(map);
      }
    });
  }, [filesWithChecks.length]);

  if (filesWithChecks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">チェック履歴はまだありません</p>;
  }

  const sorted = [...filesWithChecks].sort((a, b) => {
    const aDate = checkResults[a.check_result_id!]?.created_at || "";
    const bDate = checkResults[b.check_result_id!]?.created_at || "";
    return bDate.localeCompare(aDate);
  });

  const patternMap = new Map(patterns.map(p => [p.id, p.name]));

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-4 py-2.5 font-medium">チェック日時</th>
            <th className="px-4 py-2.5 font-medium">実行者</th>
            <th className="px-4 py-2.5 font-medium">工程</th>
            {patterns.length > 0 && <th className="px-4 py-2.5 font-medium">パターン</th>}
            <th className="px-4 py-2.5 font-medium">ファイル名</th>
            <th className="px-4 py-2.5 font-medium text-center">稿数</th>
            <th className="px-4 py-2.5 font-medium text-center">Grade</th>
            <th className="px-4 py-2.5 font-medium text-center">NG</th>
            <th className="px-4 py-2.5 font-medium text-center">WARN</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const cr = checkResults[f.check_result_id!];
            const userName = cr?.user_id ? (profileMap[cr.user_id] || "...") : "—";
            const checkDate = cr?.created_at ? format(new Date(cr.created_at), "MM/dd HH:mm") : "—";
            const processLabel = processLabelByKey[f.process_type] || f.process_type;
            const isComparison = cr?.check_type === "comparison";
            const draftLabel = isComparison ? `第${(cr?.comparison_round ?? 0) + 1}稿` : "初稿";
            const patternName = f.pattern_id ? patternMap.get(f.pattern_id) || "—" : "共通";
            const fileSt = FILE_STATUS_CONFIG[f.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;

            return (
              <tr key={f.id} onClick={() => navigate(`/project/${projectId}/file/${getLatestVersionId(f, files)}`)} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{checkDate}</td>
                <td className="px-4 py-2.5">{userName}</td>
                <td className="px-4 py-2.5">
                  <Badge variant="outline" className="text-[10px] font-normal">{processLabel}</Badge>
                </td>
                {patterns.length > 0 && (
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{patternName}</td>
                )}
                <td className="px-4 py-2.5 font-medium">
                  {editingFileId === f.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); onRenameFile(f.id, editFileName).then(() => setEditingFileId(null)); }}
                      onClick={(e) => e.stopPropagation()}>
                      <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                        className="h-6 text-sm w-48" autoFocus
                        onBlur={() => onRenameFile(f.id, editFileName).then(() => setEditingFileId(null))}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                    </form>
                  ) : (
                    <span className="flex items-center gap-1 group/name">
                      <span>{f.file_name}</span>
                      <button onClick={(e) => { e.stopPropagation(); setEditingFileId(f.id); setEditFileName(f.file_name); }}
                        className="opacity-0 group-hover/name:opacity-100 text-muted-foreground/50 hover:text-primary transition-all">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge variant={isComparison ? "secondary" : "outline"} className="text-[10px]">{draftLabel}</Badge>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge variant="outline" className={cn("text-[10px] font-bold", fileSt.class)}>{fileSt.label}</Badge>
                </td>
                <td className="px-4 py-2.5 text-center text-status-ng font-bold">{cr?.ng_count ?? 0}</td>
                <td className="px-4 py-2.5 text-center text-status-warning font-bold">{cr?.warning_count ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
