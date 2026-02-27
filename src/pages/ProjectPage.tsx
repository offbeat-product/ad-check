import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";
import { validateFileSize, formatFileSize } from "@/lib/file-validation";
import { tusUpload } from "@/lib/tus-upload";
import type { Project, Product, Client, ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { useProjectProcesses, type ProjectProcess } from "@/hooks/useProjectProcesses";
import { PROJECT_STATUS_CONFIG, PROCESS_STATUS_CONFIG, PROCESS_FILE_CONFIG, getProcessWebhookPath, AI_CHECK_CONFIG } from "@/lib/process-config";
import { PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { usePatterns } from "@/hooks/usePatterns";
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
import ReferenceMaterialsSection from "@/components/reference/ReferenceMaterialsSection";
import {
  Upload, FileText, Image, Film, MessageCircle, Plus, Settings, GripVertical,
  ChevronDown, CalendarIcon, AlertTriangle, Trash2, Grid3X3, List, Bot, Loader2, Pencil, Lock,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isPast } from "date-fns";
import { useBatchCheck } from "@/hooks/useBatchCheck";

import { getSubmitBadgeClass, getSubmitLabel } from "@/lib/check-display";

function DeadlineDisplay({ deadline, className }: { deadline: string | null; className?: string }) {
  if (!deadline) return <span className={cn("text-xs text-muted-foreground/50", className)}>納期未設定</span>;
  const d = new Date(deadline);
  const daysUntil = differenceInDays(d, new Date());
  const past = isPast(d) && daysUntil < 0;
  const soon = daysUntil >= 0 && daysUntil <= 3;

  return (
    <span className={cn("text-xs flex items-center gap-1", className,
      past ? "text-status-ng font-medium" : soon ? "text-status-warning font-medium" : "text-muted-foreground"
    )}>
      {(past || soon) && <AlertTriangle className="h-3 w-3" />}
      {past ? "期限超過" : `納期: ${format(d, "MM/dd")}`}
    </span>
  );
}

function DeadlinePicker({ deadline, onChange }: { deadline: string | null; onChange: (d: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const selected = deadline ? new Date(deadline) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="hover:bg-muted/50 rounded px-1 py-0.5 transition-colors">
          <DeadlineDisplay deadline={deadline} />
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
        {deadline && (
          <div className="px-3 pb-3">
            <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => { onChange(null); setOpen(false); }}>
              納期をクリア
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [uploadTextInput, setUploadTextInput] = useState("");
  const [useTextInput, setUseTextInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ file: ProjectFile; hasCheck: boolean } | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [addPatternOpen, setAddPatternOpen] = useState(false);
  const [bulkPatternOpen, setBulkPatternOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"matrix" | "list">("list");
  const [copyToPatternInfo, setCopyToPatternInfo] = useState<{
    sourcePatternId: string;
    processType: string;
    fileData: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  } | null>(null);

  const { patterns, addPattern, addPatternsBulk, deletePattern, updatePattern, refetch: refetchPatterns } = usePatterns(id);

  const { processes, updateProcess, reorderProcesses, addProcess, deleteProcess, resetToDefaults } = useProjectProcesses(id);

  const { progress: batchProgress, runBatchCheck, resetProgress: resetBatchProgress } = useBatchCheck();
  const [batchFixing, setBatchFixing] = useState(false);

  const handleBatchFix = async (processFiles: ProjectFile[], processKey: string) => {
    if (!id || !user) return;
    // Only fix files that are checked and have check_result_id
    const fixableFiles = processFiles.filter(f => 
      f.check_result_id && !f.parent_file_id && f.status !== "fixed"
    );
    if (fixableFiles.length === 0) {
      toast({ title: "FIX対象のファイルがありません", description: "チェック済みのファイルが必要です" });
      return;
    }
    const confirmed = window.confirm(
      `この工程の${fixableFiles.length}件のチェック済みファイルを一括FIX（最終確定）しますか？\nFIXしたデータは他工程のAIチェック時に照合用として使用されます。`
    );
    if (!confirmed) return;

    setBatchFixing(true);
    try {
      // Unfix any currently fixed files in this process
      await supabase.from("project_files")
        .update({ status: "checked", fixed_at: null, fixed_by: null } as any)
        .eq("project_id", id)
        .eq("process_type", processKey)
        .eq("status", "fixed");

      // Fix all target files
      const now = new Date().toISOString();
      const fixBy = user.email || user.id || null;
      for (const f of fixableFiles) {
        await supabase.from("project_files")
          .update({ status: "fixed", fixed_at: now, fixed_by: fixBy } as any)
          .eq("id", f.id);
      }

      toast({ title: `✅ ${fixableFiles.length}件を一括FIXしました`, description: "他工程のAIチェック時にこれらのデータが照合用として使用されます" });
      fetchData();
    } catch (err) {
      console.error("[BatchFix] error:", err);
      toast({ title: "一括FIXに失敗しました", variant: "destructive" });
    } finally {
      setBatchFixing(false);
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
      supabase.from("products").select("*").eq("id", proj.product_id!).maybeSingle(),
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
        .select("id, overall_status, ng_count, warning_count")
        .in("id", checkResultIds);
      if (cancelled) return;
      handleSupabaseError(crErr, "check_results");
      const map: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">> = {};
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
    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", id);
    if (!handleSupabaseError(error, "status update")) {
      setProject({ ...project, status: newStatus });
      toast({ title: "ステータスを更新しました" });
      queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
    }
  };

  const handleDeadlineChange = async (deadline: string | null) => {
    if (!project || !id) return;
    const { error } = await supabase.from("projects").update({ overall_deadline: deadline }).eq("id", id);
    if (!handleSupabaseError(error, "deadline update")) {
      setProject({ ...project, overall_deadline: deadline });
      toast({ title: "納期を更新しました" });
    }
  };

  const handleProcessDeadlineChange = async (processId: string, deadline: string | null) => {
    await updateProcess(processId, { deadline } as Partial<ProjectProcess>);
    toast({ title: "工程の納期を更新しました" });
  };

  const handleProcessStatusChange = async (processId: string, status: string) => {
    await updateProcess(processId, { status } as Partial<ProjectProcess>);
    toast({ title: "工程ステータスを更新しました" });
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    // Delete related data first
    await Promise.all([
      supabase.from("project_files").delete().eq("project_id", id),
      supabase.from("project_processes").delete().eq("project_id", id),
      supabase.from("project_members").delete().eq("project_id", id),
    ]);
    const { error } = await supabase.from("projects").delete().eq("id", id);
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
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    return (safeName || `file_${Date.now()}`) + ext;
  };

  // Determine storage bucket by process type
  const getStorageBucket = (processType: string): string | null => {
    const audioProcesses = ["narration", "bgm"];
    const videoProcesses = ["vcon", "video_horizontal", "video_vertical"];
    if (audioProcesses.includes(processType)) return "audios";
    if (videoProcesses.includes(processType)) return "videos";
    return null; // images & text stay in DB
  };

  const getFileFormatHint = (processType: string): string => {
    const hints: Record<string, string> = {
      script: "TXT / DOCX",
      na_script: "TXT / DOCX",
      narration: "MP3 / WAV / M4A（最大500MB）",
      bgm: "MP3 / WAV / M4A（最大500MB）",
      vcon: "MP4 / MOV / WebM（最大500MB）",
      styleframe: "JPG / PNG / PSD / AI",
      storyboard: "JPG / PNG / PDF / PSD",
      video_horizontal: "MP4 / MOV / WebM（最大500MB）",
      video_vertical: "MP4 / MOV / WebM（最大500MB）",
    };
    return hints[processType] || "";
  };

  const isImageProcess = (processType: string) => ["styleframe", "storyboard"].includes(processType);

  const handleFileUpload = async () => {
    if (!uploadModal || !id || !user) return;
    setUploading(true);
    setUploadProgress(0);

    const cfg = PROCESS_FILE_CONFIG[uploadModal];
    const resolvedPatternId = (patterns.length > 0 && uploadPatternMode === "specific") ? uploadPatternId : null;

    try {
      if (useTextInput && cfg?.allowTextInput) {
        const fileData = uploadTextInput;
        const fileSize = new Blob([uploadTextInput]).size;
        const fileName = `${cfg?.label || uploadModal}_${Date.now()}.txt`;
        setUploadProgress(50);

        const { error } = await supabase.from("project_files").insert({
          project_id: id, process_type: uploadModal, file_name: fileName,
          file_type: "text", file_data: fileData, file_size_bytes: fileSize,
          created_by: user.email || user.id, pattern_id: resolvedPatternId,
        } as any);
        if (error) throw error;
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
          const fileSize = file.size;
          let fileData = "";
          let fileType = "text";
          const bucket = getStorageBucket(uploadModal);

          if (bucket) {
            fileType = file.type.startsWith("audio/") ? "audio" : "video";
            const storagePath = `${id}/${Date.now()}_${i}_${fileName}`;

            const result = await tusUpload({
              bucketName: bucket,
              path: storagePath,
              file,
              contentType: file.type,
              onProgress: (pct) => {
                const fileProgress = pct / 100;
                setUploadProgress(Math.round(((i + fileProgress) / total) * 90));
              },
            });
            fileData = result.publicUrl;
          } else if (file.type.startsWith("image/")) {
            fileType = "image";
            const compressed = await compressImage(file);
            fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
          } else {
            fileType = "text";
            fileData = await file.text();
          }

          const { error } = await supabase.from("project_files").insert({
            project_id: id, process_type: uploadModal, file_name: fileName,
            file_type: fileType, file_data: fileData, file_size_bytes: fileSize,
            created_by: user.email || user.id, pattern_id: resolvedPatternId,
          } as any);
          if (error) throw error;

          lastFileData = fileData;
          lastFileName = fileName;
          lastFileType = fileType;
          lastFileSize = fileSize;
          setUploadProgress(Math.round(((i + 1) / total) * 95));
        }

        setUploadProgress(100);
        toast({ title: `${total}件アップロード完了` });

        // Offer to copy to other patterns (uses last file info for single, skips for multi)
        if (resolvedPatternId && patterns.length > 1 && total === 1) {
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
    } finally {
      setUploadModal(null);
      setSelectedFiles([]);
      setUploadTextInput("");
      setUseTextInput(false);
      setUploading(false);
      setUploadProgress(null);
      setUploadPatternId(null);
      setUploadPatternMode("common");
      fetchData();
    }
  };

  const getFilesForProcess = (processKey: string) =>
    files.filter((f) => f.process_type === processKey);

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
  const activeProcesses = processes.filter(p => p.is_active);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <div className="text-xs text-muted-foreground">
            {client?.name} &gt; {product.name} &gt; {project.name}
          </div>
          <h1 className="text-lg font-bold mt-0.5">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <DeadlinePicker
            deadline={(project as any).overall_deadline ?? null}
            onChange={handleDeadlineChange}
          />
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
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="files">
          <TabsList className="mb-6">
            <TabsTrigger value="files">ファイル</TabsTrigger>
            <TabsTrigger value="history">チェック履歴</TabsTrigger>
            <TabsTrigger value="patterns">修正パターン</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-6">
            <ProcessTimeline processes={processes} />

            {product && (
              <ReferenceMaterialsSection
                projectId={id!}
                productId={product.id}
                productName={product.name}
                projectName={project.name}
              />
            )}

            {/* Pattern management section */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">パターン管理</h2>
                {patterns.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {patterns.length}パターン
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {patterns.length > 0 && (
                  <div className="flex items-center border border-border rounded-md h-7 overflow-hidden">
                    <button
                      onClick={() => setViewMode("list")}
                      className={cn("px-2 h-full flex items-center text-xs transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      title="リスト表示"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode("matrix")}
                      className={cn("px-2 h-full flex items-center text-xs transition-colors", viewMode === "matrix" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      title="パターン管理"
                    >
                      <Grid3X3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setBulkPatternOpen(true)}>
                  一括生成
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAddPatternOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />パターン追加
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setProcessModalOpen(true)}>
                  <Settings className="h-3 w-3 mr-1" />工程管理
                </Button>
              </div>
            </div>

            {/* Conditional: matrix view vs legacy list */}
            {patterns.length > 0 && viewMode === "matrix" ? (
              <PatternMatrix
                projectId={id!}
                patterns={patterns}
                processes={processes}
                files={files}
                checkResults={checkResults}
                onUpload={(processKey, patternId) => {
                  setUploadModal(processKey);
                  setUploadPatternId(patternId);
                  setUploadPatternMode(patternId ? "specific" : "common");
                  setUseTextInput(false);
                  setSelectedFiles([]);
                }}
                onUpdatePattern={updatePattern}
                onDeletePattern={deletePattern}
                onToggleProcessCommon={async (processId, isCommon) => {
                  const ok = await updateProcess(processId, { is_common: isCommon } as Partial<ProjectProcess>);
                  if (ok) toast({ title: isCommon ? "共通素材に移動しました" : "パターン別に移動しました" });
                  return !!ok;
                }}
              />
            ) : (
              /* Legacy list view (no patterns) */
              <>
                {activeProcesses.map((proc, index) => {
                  const sectionFiles = getFilesForProcess(proc.process_key);
                  const psCfg = PROCESS_STATUS_CONFIG[proc.status] || PROCESS_STATUS_CONFIG.preparing;
                  const cfg = PROCESS_FILE_CONFIG[proc.process_key];
                  const webhookAvailable = !!AI_CHECK_CONFIG[proc.process_key]?.enabled;

                  return (
                    <div
                      key={proc.id}
                      draggable
                      onDragStart={() => handleProcessDragStart(index)}
                      onDragEnter={() => handleProcessDragEnter(index)}
                      onDragEnd={handleProcessDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={cn("glass-card overflow-hidden transition-all",
                        dragOverIdx === index && "ring-2 ring-primary/30")}
                    >
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {String.fromCodePoint(0x2460 + index)}
                        </span>
                        <h2 className="text-sm font-semibold">{proc.process_label}</h2>

                        <DeadlinePicker
                          deadline={proc.deadline}
                          onChange={(d) => handleProcessDeadlineChange(proc.id, d)}
                        />

                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1", psCfg.badgeClass)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", psCfg.dotClass)} />
                              {psCfg.label}
                              <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-36 p-1.5" align="start">
                            {Object.entries(PROCESS_STATUS_CONFIG).map(([key, c]) => (
                              <button key={key} onClick={() => handleProcessStatusChange(proc.id, key)}
                                className={cn("w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5",
                                  proc.status === key ? "bg-muted" : "hover:bg-muted/50")}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", c.dotClass)} />
                                {c.label}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>

                        {!webhookAvailable && (
                          <Badge variant="outline" className="text-[9px] ml-1 text-muted-foreground">準備中</Badge>
                        )}
                        {sectionFiles.some(f => f.status === "fixed") && (
                          <Badge variant="outline" className="text-[9px] ml-1 border-status-ok text-status-ok bg-status-ok/10 font-bold gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> FIX済 ({sectionFiles.filter(f => f.status === "fixed").length})
                          </Badge>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          {webhookAvailable && sectionFiles.filter(f => f.file_data && !f.parent_file_id).length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1"
                              disabled={batchProgress.status === "running"}
                              onClick={() => {
                                if (!product || !id) return;
                                const targetFiles = sectionFiles.filter(f => f.file_data && !f.parent_file_id);
                                runBatchCheck(targetFiles, product, client, id, () => fetchData());
                              }}
                            >
                              {batchProgress.status === "running" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Bot className="h-3 w-3" />
                              )}
                              一括AIチェック ({sectionFiles.filter(f => f.file_data && !f.parent_file_id).length})
                            </Button>
                          )}
                          {sectionFiles.some(f => f.check_result_id && !f.parent_file_id && f.status !== "fixed") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-status-ok text-status-ok hover:bg-status-ok/10"
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
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => {
                              setUploadModal(proc.process_key);
                              setUploadPatternId(null);
                              setUploadPatternMode("common");
                              setUseTextInput(false);
                              setSelectedFiles([]);
                            }}>
                            <Plus className="h-3 w-3 mr-1" />アップロード
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        {sectionFiles.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic py-4 text-center">ファイルなし — アップロードしてください</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {sectionFiles.map((file) => {
                              const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                              const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                              const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                              const isImageFile = file.file_type === "image";
                              const childVersions = files.filter(f => f.parent_file_id === file.id);
                              const versionLabel = file.parent_file_id ? `v${file.version_number}` : childVersions.length > 0 ? "v1" : null;

                              return (
                                <div key={file.id} className="relative group">
                                  <button onClick={() => navigate(`/project/${id}/file/${file.id}`)}
                                    className={cn("glass-card p-3 text-left hover:border-primary/30 transition-colors w-full", file.status === "fixed" && "border-status-ok/50 ring-1 ring-status-ok/20")}>
                                    {file.status === "fixed" && (
                                      <div className="absolute top-1.5 right-1.5 z-10 bg-status-ok text-white rounded-full p-0.5">
                                        <Lock className="h-3 w-3" />
                                      </div>
                                    )}
                                    <div className="h-20 rounded-md bg-muted/50 flex items-center justify-center mb-2 overflow-hidden">
                                      {isImageFile && file.file_data ? (
                                        <img src={file.file_data} alt="" className="w-full h-full object-cover" />
                                      ) : proc.process_key.includes("video") || proc.process_key === "vcon" ? (
                                        <Film className="h-8 w-8 text-muted-foreground/30" />
                                      ) : proc.process_key.includes("script") || proc.process_key === "na_script" ? (
                                        <FileText className="h-8 w-8 text-muted-foreground/30" />
                                      ) : (
                                        <Image className="h-8 w-8 text-muted-foreground/30" />
                                      )}
                                    </div>
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
                                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                      {file.created_at && <span>{format(new Date(file.created_at), "MM/dd HH:mm")}</span>}
                                      {file.created_by && <span>/ {(file.created_by as string).includes("@") ? (file.created_by as string).split("@")[0] : file.created_by}</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                      {cr && (
                                        <Badge className={cn("text-[10px] h-4 px-1.5", getSubmitBadgeClass(cr.overall_status))}>
                                          {getSubmitLabel(cr.overall_status).isOk ? "OK" : "NG"}
                                        </Badge>
                                      )}
                                      {versionLabel && <span className="text-[10px] text-muted-foreground">{versionLabel}</span>}
                                    </div>
                                    {cc > 0 && (
                                      <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                        <MessageCircle className="h-3 w-3" />{cc}
                                      </div>
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget({ file, hasCheck: !!cr });
                                    }}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 z-10"
                                    title="削除"
                                  >
                                    <span className="text-xs font-bold leading-none">×</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </TabsContent>

          <TabsContent value="history">
            <CheckHistory projectId={id!} files={files} checkResults={checkResults} onRenameFile={handleRenameFile} />
          </TabsContent>

          <TabsContent value="patterns">
            <TopCorrectionPatterns productCode={product.code} limit={10} />
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
              {deleteTarget?.hasCheck && (
                <span className="block mt-2 text-status-warning font-medium">
                  ⚠️ チェック結果も同時に削除されます。
                </span>
              )}
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
                  const bucket = getStorageBucket(f.process_type);
                  if (bucket && f.file_data && !f.file_data.startsWith("data:")) {
                    // Extract path from public URL
                    const url = new URL(f.file_data);
                    const pathMatch = url.pathname.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`));
                    if (pathMatch) {
                      await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[1])]);
                    }
                  }
                  // Delete related check results, comments, etc.
                  if (f.check_result_id) {
                    await supabase.from("comments").delete().eq("check_result_id", f.check_result_id);
                    await supabase.from("file_versions").delete().eq("check_result_id", f.check_result_id);
                    await supabase.from("check_results").delete().eq("id", f.check_result_id);
                  }
                  // Delete child versions
                  const childFiles = files.filter(cf => cf.parent_file_id === f.id);
                  for (const child of childFiles) {
                    if (child.check_result_id) {
                      await supabase.from("comments").delete().eq("check_result_id", child.check_result_id);
                      await supabase.from("file_versions").delete().eq("check_result_id", child.check_result_id);
                      await supabase.from("check_results").delete().eq("id", child.check_result_id);
                    }
                    await supabase.from("project_files").delete().eq("id", child.id);
                  }
                  // Delete the file itself
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

      {/* Upload modal */}
      <Dialog open={!!uploadModal} onOpenChange={(o) => !o && setUploadModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ファイルアップロード</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Pattern selection (only when patterns exist) */}
            {patterns.length > 0 && (
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

            {PROCESS_FILE_CONFIG[uploadModal || ""]?.allowTextInput && (
              <div className="flex gap-2">
                <Button size="sm" variant={useTextInput ? "outline" : "default"} onClick={() => setUseTextInput(false)} className="text-xs">ファイル選択</Button>
                <Button size="sm" variant={useTextInput ? "default" : "outline"} onClick={() => setUseTextInput(true)} className="text-xs">テキスト直接入力</Button>
              </div>
            )}
            {useTextInput && PROCESS_FILE_CONFIG[uploadModal || ""]?.allowTextInput ? (
              <Textarea value={uploadTextInput} onChange={(e) => setUploadTextInput(e.target.value)}
                placeholder="テキストを入力..." className="min-h-[150px] text-sm font-mono" />
            ) : (
              <div onClick={() => !uploading && fileInputRef.current?.click()}
                className={cn("border-2 border-dashed border-border rounded-xl p-8 text-center transition-colors",
                  uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50")}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length > 0 ? (
                    selectedFiles.length === 1
                      ? <span>{selectedFiles[0].name} <span className="text-muted-foreground/60">({formatFileSize(selectedFiles[0].size)})</span></span>
                      : <span>{selectedFiles.length}件のファイルを選択中</span>
                  ) : (
                    isImageProcess(uploadModal || "") ? "クリックしてファイルを選択（複数可）" : "クリックしてファイルを選択"
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
                  accept={PROCESS_FILE_CONFIG[uploadModal || ""]?.accept}
                  multiple={isImageProcess(uploadModal || "")}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) setSelectedFiles(Array.from(files));
                  }} />
              </div>
            )}
            {uploading && uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>アップロード中...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
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
        processes={processes}
        onUpdate={updateProcess}
        onReorder={reorderProcesses}
        onAdd={addProcess}
        onDelete={deleteProcess}
        onReset={resetToDefaults}
      />

      {/* Batch check progress dialog */}
      <Dialog open={batchProgress.status === "running" || batchProgress.status === "done"} onOpenChange={(o) => { if (!o) resetBatchProgress(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {batchProgress.status === "running" ? "一括AIチェック実行中..." : "一括AIチェック完了"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {batchProgress.status === "running" && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    {batchProgress.current} / {batchProgress.total} — {batchProgress.currentFileName}
                  </span>
                </div>
                <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
              </>
            )}
            {batchProgress.results.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {batchProgress.results.map((r, i) => (
                  <div key={i} className={cn("flex items-center justify-between text-xs px-2 py-1.5 rounded",
                    r.success ? "bg-status-ok/10" : "bg-destructive/10"
                  )}>
                    <span className="truncate mr-2">{r.fileName}</span>
                    {r.success ? (
                      <Badge className={cn("text-[10px] shrink-0", getSubmitBadgeClass(r.grade))}>
                        {getSubmitLabel(r.grade).label}
                      </Badge>
                    ) : (
                      <span className="text-destructive text-[10px] shrink-0">エラー</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {batchProgress.status === "done" && (
              <Button onClick={resetBatchProgress} className="w-full">閉じる</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy to other patterns dialog */}
      {copyToPatternInfo && (
        <CopyToPatternDialog
          open={!!copyToPatternInfo}
          onOpenChange={(o) => { if (!o) setCopyToPatternInfo(null); }}
          sourcePattern={patterns.find(p => p.id === copyToPatternInfo.sourcePatternId)!}
          allPatterns={patterns}
          processLabel={
            processes.find(p => p.process_key === copyToPatternInfo.processType)?.process_label || copyToPatternInfo.processType
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
        />
      )}
    </div>
  );
}

function CheckHistory({ projectId, files, checkResults, onRenameFile }: {
  projectId: string;
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>;
  onRenameFile: (fileId: string, newName: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const filesWithChecks = files.filter(f => f.check_result_id && checkResults[f.check_result_id]);

  if (filesWithChecks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">チェック履歴はまだありません</p>;
  }

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-4 py-2.5 font-medium">ファイル名</th>
            <th className="px-4 py-2.5 font-medium">工程</th>
            <th className="px-4 py-2.5 font-medium text-center">Grade</th>
            <th className="px-4 py-2.5 font-medium text-center">NG</th>
            <th className="px-4 py-2.5 font-medium text-center">WARN</th>
          </tr>
        </thead>
        <tbody>
          {filesWithChecks.map((f) => {
            const cr = checkResults[f.check_result_id!];
            return (
              <tr key={f.id} onClick={() => navigate(`/project/${projectId}/file/${f.id}`)} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer">
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
                <td className="px-4 py-2.5">{f.process_type}</td>
                <td className="px-4 py-2.5 text-center">
                  <Badge className={cn("text-[10px] font-bold", getSubmitBadgeClass(cr?.overall_status))}>
                    {getSubmitLabel(cr?.overall_status).label}
                  </Badge>
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
